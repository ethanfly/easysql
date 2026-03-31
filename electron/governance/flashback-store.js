import { mkdir, appendFile, readFile } from 'node:fs/promises'
import path from 'node:path'

const DEFAULT_FILE_NAME = 'flashback-log.jsonl'

export function createFlashbackStore(options = {}) {
  const baseDir = normalizeBaseDir(options.baseDir)
  const fileName = normalizeFileName(options.fileName)
  const filePath = path.join(baseDir, fileName)

  return {
    filePath,
    append: async (record) => appendRecord(filePath, record),
    listRecentRecords: async (input = {}) => listRecentRecords(filePath, input.limit),
    getRecord: async (flashbackId) => getRecord(filePath, flashbackId),
  }
}

async function appendRecord(filePath, record) {
  if (!isPlainObject(record) || !hasText(record.flashbackId)) {
    return {
      ok: false,
      error: {
        code: 'flashback-invalid-record',
        message: 'flashback record is incomplete or invalid',
      },
    }
  }

  await mkdir(path.dirname(filePath), { recursive: true })
  await appendFile(filePath, `${JSON.stringify(record)}\n`, 'utf8')

  return {
    ok: true,
    record,
  }
}

async function listRecentRecords(filePath, limit) {
  const records = await readRecords(filePath)
  const normalizedLimit = normalizeLimit(limit)
  const newestFirst = records.reverse()
  if (normalizedLimit === null) {
    return newestFirst
  }
  return newestFirst.slice(0, normalizedLimit)
}

async function getRecord(filePath, flashbackId) {
  const records = await readRecords(filePath)
  const normalizedId = String(flashbackId || '').trim()
  if (!normalizedId) {
    return null
  }
  return records.find((record) => record.flashbackId === normalizedId) ?? null
}

async function readRecords(filePath) {
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
  for (const line of lines) {
    if (!line.trim()) {
      continue
    }

    const parsed = JSON.parse(line)
    if (isPlainObject(parsed)) {
      records.push(parsed)
    }
  }

  return records
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
