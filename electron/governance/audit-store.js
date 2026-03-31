import { mkdir, appendFile, readFile } from 'node:fs/promises'
import path from 'node:path'

const DEFAULT_FILE_NAME = 'audit-log.jsonl'
const VALID_CLASSIFICATIONS = new Set(['DQL', 'DML', 'DDL', 'TCL', 'UNKNOWN'])
const VALID_RISK_LEVELS = new Set(['low', 'medium', 'high'])
const VALID_DECISIONS = new Set(['allow', 'confirm', 'block'])

export function createAuditStore(options = {}) {
  const baseDir = normalizeBaseDir(options.baseDir)
  const fileName = normalizeFileName(options.fileName)
  const filePath = path.join(baseDir, fileName)

  return {
    filePath,
    append: async (record) => appendRecord(filePath, record),
    listRecentRecords: async (input = {}) => listRecentRecords(filePath, input.limit),
  }
}

async function appendRecord(filePath, record) {
  const validation = validateAuditRecord(record)
  if (!validation.ok) {
    return failure('audit-invalid-record', validation.message, validation.reasons)
  }

  await mkdir(path.dirname(filePath), { recursive: true })
  await appendFile(filePath, `${JSON.stringify(validation.record)}\n`, 'utf8')

  return {
    ok: true,
    record: validation.record,
  }
}

async function listRecentRecords(filePath, limit) {
  let content
  try {
    content = await readFile(filePath, 'utf8')
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return []
    }
    throw error
  }

  const records = []
  const lines = content.split(/\r?\n/)
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) {
      continue
    }

    try {
      const parsed = JSON.parse(line)
      if (isPlainObject(parsed)) {
        records.push(parsed)
      }
    } catch (error) {
      const parseError = new Error(`Failed to parse audit log line ${index + 1}`)
      parseError.cause = error
      throw parseError
    }
  }

  const normalizedLimit = normalizeLimit(limit)
  const newestFirst = records.reverse()
  if (normalizedLimit === null) {
    return newestFirst
  }

  return newestFirst.slice(0, normalizedLimit)
}

function validateAuditRecord(record) {
  if (!isPlainObject(record)) {
    return invalid(['record must be a plain object'])
  }

  const reasons = []
  const requiredStrings = [
    'id',
    'timestamp',
    'connectionId',
    'connectionName',
    'databaseType',
    'source',
    'operationKind',
    'classification',
    'statementType',
    'riskLevel',
    'decision',
  ]

  for (const field of requiredStrings) {
    if (!hasText(record[field])) {
      reasons.push(`${field} is required`)
    }
  }

  if (typeof record.approvedByUser !== 'boolean') {
    reasons.push('approvedByUser must be boolean')
  }

  if (!Number.isInteger(record.statementCount) || record.statementCount < 0) {
    reasons.push('statementCount must be a non-negative integer')
  }

  if (typeof record.isMultiStatement !== 'boolean') {
    reasons.push('isMultiStatement must be boolean')
  }

  if (!isKnownClassification(record.classification)) {
    reasons.push('classification is invalid')
  }

  if (!isKnownRiskLevel(record.riskLevel)) {
    reasons.push('riskLevel is invalid')
  }

  if (!isKnownDecision(record.decision)) {
    reasons.push('decision is invalid')
  }

  if (!isPlainObject(record.result)) {
    reasons.push('result must be a plain object')
  } else if (typeof record.result.success !== 'boolean') {
    reasons.push('result.success is required')
  }

  if (reasons.length > 0) {
    return invalid(reasons)
  }

  return {
    ok: true,
    record,
  }
}

function normalizeBaseDir(baseDir) {
  if (!hasText(baseDir)) {
    return process.cwd()
  }

  return String(baseDir).trim()
}

function normalizeFileName(fileName) {
  if (!hasText(fileName)) {
    return DEFAULT_FILE_NAME
  }

  return String(fileName).trim()
}

function normalizeLimit(limit) {
  if (limit === undefined || limit === null) {
    return null
  }

  const parsed = Number.parseInt(limit, 10)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null
  }

  return parsed
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function isKnownClassification(value) {
  return VALID_CLASSIFICATIONS.has(String(value || '').trim().toUpperCase())
}

function isKnownRiskLevel(value) {
  return VALID_RISK_LEVELS.has(String(value || '').trim().toLowerCase())
}

function isKnownDecision(value) {
  return VALID_DECISIONS.has(String(value || '').trim().toLowerCase())
}

function invalid(reasons) {
  return {
    ok: false,
    message: 'audit record is incomplete or invalid',
    reasons: [...reasons],
  }
}

function failure(code, message, reasons = []) {
  return {
    ok: false,
    error: {
      code,
      message,
      reasons: [...reasons],
    },
  }
}
