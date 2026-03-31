import crypto from 'node:crypto'
import { createAuditStore } from './audit-store.js'
import { createApprovalStore } from './approval-store.js'
import { decideGovernance } from './decision-engine.js'
import { createFlashbackBuilder } from './flashback-builder.js'
import { maskRows } from './masking-engine.js'
import { analyzeRisk } from './risk-analyzer.js'
import { classifySql } from './sql-classifier.js'

export const DEFAULT_GOVERNANCE_CONFIG = {
  enabled: true,
  maskingEnabled: true,
  auditEnabled: true,
  defaultUnknownDecision: 'confirm',
  highRiskMode: 'confirm',
  decisionPolicy: {
    DQL: 'allow',
    DML: 'allow',
    DDL: 'confirm',
    TCL: 'allow',
    UNKNOWN: 'confirm',
  },
  maskRules: [],
}

export function createGovernanceRuntime(options = {}) {
  const auditStore = options.auditStore ?? createAuditStore({ baseDir: options.baseDir })
  const approvalStore = options.approvalStore ?? createApprovalStore(options.approvalOptions)
  const flashbackBuilder = options.flashbackBuilder ?? createFlashbackBuilder(options.flashbackOptions)
  const createId = typeof options.createId === 'function' ? options.createId : defaultCreateId
  const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString()
  const appVersion = normalizeText(options.appVersion) || 'unknown'
  let currentConfig = normalizeConfig(options.config)

  return {
    getConfig() {
      return cloneConfig(currentConfig)
    },

    setConfig(nextConfig = {}) {
      currentConfig = normalizeConfig(nextConfig)
      return cloneConfig(currentConfig)
    },

    async beginRawSqlOperation(input = {}) {
      const operationHash = hashOperation({
        source: input.source,
        connectionId: input.connectionId,
        sqlText: input.sqlText,
      })
      const config = normalizeConfig(input.config ?? currentConfig)
      const classificationResult = classifySql(input.sqlText)
      const risk = analyzeRisk({
        sqlText: input.sqlText,
        classification: classificationResult.classification,
        statementType: classificationResult.statementType,
        isMultiStatement: classificationResult.isMultiStatement,
      })
      const decision = decideGovernance({
        governanceEnabled: config.enabled !== false,
        config,
        classification: classificationResult.classification,
        riskLevel: risk.riskLevel,
        isMultiStatement: classificationResult.isMultiStatement,
      })

      const baseRecord = buildAuditRecord({
        id: createAuditId(createId),
        timestamp: now(),
        appVersion,
        operationKind: 'raw-sql',
        source: input.source ?? 'sql-editor',
        connectionId: input.connectionId,
        connectionName: input.connectionName,
        databaseType: input.databaseType,
        databaseName: input.databaseName,
        classification: classificationResult.classification,
        statementType: classificationResult.statementType,
        riskLevel: risk.riskLevel,
        decision: decision.decision,
        approvedByUser: false,
        sqlText: input.sqlText,
        statementCount: classificationResult.isMultiStatement ? 2 : 1,
        isMultiStatement: classificationResult.isMultiStatement,
        target: buildSqlTarget(input.sqlText, classificationResult.statementType, input.databaseName),
        maskingApplied: false,
        flashback: unavailableFlashbackRecord(),
        metadata: {
          highRiskReasons: [...risk.reasons],
          classifierNotes: [...classificationResult.classifierNotes],
          decisionNotes: [...decision.notes],
          operationHash,
          clientVersion: appVersion,
        },
      })

      const approval = normalizeApprovalInput(input.approval)
      if (decision.decision === 'confirm') {
        const consumeResult = approval.requestId
          ? approvalStore.consumeApproval({
              requestId: approval.requestId,
              token: approval.token,
              connectionId: input.connectionId,
              source: input.source ?? 'sql-editor',
              operationHash,
            })
          : null

        if (consumeResult?.ok) {
          baseRecord.approvedByUser = true
          baseRecord.metadata.approval = {
            requestId: consumeResult.consumed.requestId,
            consumedAt: consumeResult.consumed.consumedAt,
          }
          return {
            allowExecution: true,
            classification: classificationResult,
            risk,
            decision: {
              ...decision,
              decision: 'allow',
              notes: [...decision.notes, 'approval-consumed'],
              reasons: [...decision.reasons, 'approval-consumed'],
            },
            operationHash,
            auditRecord: baseRecord,
          }
        }

        const issued = approvalStore.issueApproval({
          connectionId: input.connectionId,
          source: input.source ?? 'sql-editor',
          operationHash,
        })

        if (!issued.ok) {
          baseRecord.result = failureResult('approval issuance failed')
          await appendAuditIfEnabled(auditStore, config, baseRecord)
          return {
            allowExecution: false,
            classification: classificationResult,
            risk,
            decision: {
              decision: 'block',
              reasons: ['approval-store-error'],
              notes: ['approval-store-error'],
            },
            operationHash,
            auditRecord: baseRecord,
            response: buildGovernanceQueryResponse({
              error: 'Governance approval could not be issued',
              classification: classificationResult,
              risk,
              decision: { decision: 'block', reasons: ['approval-store-error'], notes: ['approval-store-error'] },
            }),
          }
        }

        return {
          allowExecution: false,
          classification: classificationResult,
          risk,
          decision,
          operationHash,
          auditRecord: baseRecord,
          response: buildGovernanceQueryResponse({
            error: 'Governance confirmation required',
            classification: classificationResult,
            risk,
            decision,
            approvalRequest: issued.request,
          }),
        }
      }

      if (decision.decision === 'block') {
        baseRecord.result = failureResult('governance blocked operation')
        await appendAuditIfEnabled(auditStore, config, baseRecord)
        return {
          allowExecution: false,
          classification: classificationResult,
          risk,
          decision,
          operationHash,
          auditRecord: baseRecord,
          response: buildGovernanceQueryResponse({
            error: 'Governance blocked operation',
            classification: classificationResult,
            risk,
            decision,
          }),
        }
      }

      return {
        allowExecution: true,
        classification: classificationResult,
        risk,
        decision,
        operationHash,
        auditRecord: baseRecord,
      }
    },

    async completeRawSqlOperation(input = {}) {
      const config = normalizeConfig(input.config ?? currentConfig)
      const auditRecord = cloneRecord(input.auditRecord)
      const result = input.result ?? { columns: [], rows: [] }
      const durationMs = normalizeDuration(input.durationMs)
      const masked = shouldMaskClassification(auditRecord.classification) && config.maskingEnabled !== false
        ? applyMaskingToQueryResult(result, config.maskRules)
        : { result, maskingApplied: false }
      auditRecord.maskingApplied = masked.maskingApplied
      auditRecord.result = {
        success: true,
        affectedRows: normalizeAffectedRows(masked.result.affectedRows),
        errorCode: null,
        errorMessage: null,
        durationMs,
      }

      await appendAuditIfEnabled(auditStore, config, auditRecord)
      return {
        result: {
          ...masked.result,
          governance: buildGovernanceEnvelope(auditRecord),
        },
        auditRecord,
      }
    },

    async failRawSqlOperation(input = {}) {
      const config = normalizeConfig(input.config ?? currentConfig)
      const auditRecord = cloneRecord(input.auditRecord)
      auditRecord.result = {
        success: false,
        affectedRows: null,
        errorCode: normalizeText(input.errorCode) || null,
        errorMessage: normalizeErrorMessage(input.error),
        durationMs: normalizeDuration(input.durationMs),
      }

      await appendAuditIfEnabled(auditStore, config, auditRecord)
      return {
        result: buildGovernanceQueryResponse({
          error: normalizeErrorMessage(input.error),
          classification: {
            classification: auditRecord.classification,
            statementType: auditRecord.statementType,
            isMultiStatement: auditRecord.isMultiStatement,
            classifierNotes: auditRecord.metadata?.classifierNotes ?? [],
          },
          risk: {
            riskLevel: auditRecord.riskLevel,
            reasons: auditRecord.metadata?.highRiskReasons ?? [],
            notes: auditRecord.metadata?.highRiskReasons ?? [],
          },
          decision: {
            decision: auditRecord.decision,
            reasons: auditRecord.metadata?.decisionNotes ?? [],
            notes: auditRecord.metadata?.decisionNotes ?? [],
          },
        }),
        auditRecord,
      }
    },

    applyMaskingToTableData(input = {}) {
      const config = normalizeConfig(input.config ?? currentConfig)
      const tableData = isTableDataShape(input.tableData) ? input.tableData : input
      if (config.maskingEnabled === false) {
        return {
          ...tableData,
          governance: null,
          maskingApplied: false,
        }
      }

      const masked = applyMaskingToTableData(tableData ?? {}, config.maskRules)
      return {
        ...masked,
        governance: {
          maskingApplied: masked.maskingApplied,
        },
      }
    },

    async recordMutationOperation(input = {}) {
      const config = normalizeConfig(input.config ?? currentConfig)
      const flashback = input.flashback ?? unavailableFlashbackRecord(input.flashbackReasonCodes)
      const record = buildAuditRecord({
        id: createAuditId(createId),
        timestamp: now(),
        appVersion,
        operationKind: input.operationKind,
        source: input.source ?? 'table-editor',
        connectionId: input.connectionId,
        connectionName: input.connectionName,
        databaseType: input.databaseType,
        databaseName: input.databaseName,
        classification: input.classification,
        statementType: input.statementType,
        riskLevel: input.riskLevel,
        decision: input.decision ?? 'allow',
        approvedByUser: input.approvedByUser === true,
        sqlText: input.sqlText ?? null,
        statementCount: 1,
        isMultiStatement: false,
        target: {
          schema: input.databaseName ?? null,
          table: input.tableName ?? null,
          primaryKey: input.primaryKey?.column ?? input.primaryKey ?? null,
        },
        maskingApplied: false,
        flashback,
        result: {
          success: input.success === true,
          affectedRows: normalizeAffectedRows(input.affectedRows),
          errorCode: null,
          errorMessage: input.success === true ? null : normalizeErrorMessage(input.error),
          durationMs: normalizeDuration(input.durationMs),
        },
        metadata: {
          highRiskReasons: Array.isArray(input.highRiskReasons) ? [...input.highRiskReasons] : [],
          classifierNotes: Array.isArray(input.classifierNotes) ? [...input.classifierNotes] : [],
          decisionNotes: Array.isArray(input.decisionNotes) ? [...input.decisionNotes] : [],
          clientVersion: appVersion,
        },
      })

      await appendAuditIfEnabled(auditStore, config, record)
      return record
    },

    buildRowUpdateFlashback(input = {}) {
      return flashbackBuilder.buildRowUpdateFlashback(input)
    },

    buildRowDeleteFlashback(input = {}) {
      return flashbackBuilder.buildRowDeleteFlashback(input)
    },

    buildRawSqlFlashback(input = {}) {
      return flashbackBuilder.buildRawSqlFlashback(input)
    },

    listAuditRecords(input = {}) {
      return auditStore.listRecentRecords(input)
    },
  }
}

export async function evaluateRawSqlOperation(input = {}) {
  const runtime = input.runtime ?? createGovernanceRuntime(input)
  return runtime.beginRawSqlOperation(input)
}

export function evaluateStructuredOperation(input = {}) {
  const operationHash = hashOperation({
    connectionId: input.connectionId,
    source: input.source,
    sqlText: input.sqlText ?? `${input.operationKind}:${input.tableName ?? ''}:${input.statementType ?? ''}`,
  })
  const config = normalizeConfig(input.config)
  const riskLevel = normalizeText(input.riskLevel).toLowerCase() || 'medium'
  const decision = decideGovernance({
    governanceEnabled: config.enabled !== false,
    config,
    classification: input.classification,
    riskLevel,
    isMultiStatement: false,
  })

  return {
    operationHash,
    riskLevel,
    decision,
  }
}

export async function appendAuditRecord(input = {}) {
  const runtime = input.runtime ?? createGovernanceRuntime(input)
  return runtime.recordMutationOperation({
    ...input.record,
  })
}

export async function appendFlashbackRecord(input = {}) {
  return {
    ok: true,
    flashback: input.flashback ?? unavailableFlashbackRecord(),
  }
}

export function applyMaskingToResult(input = {}) {
  return applyMaskingToQueryResult(input.result ?? input, input.rules ?? [])
}

export { buildAuditRecord }

function applyMaskingToQueryResult(result = {}, rules = []) {
  const columns = Array.isArray(result.columns) ? result.columns : []
  const rows = Array.isArray(result.rows) ? result.rows : []
  const objectRows = rows.map((row) => {
    if (!Array.isArray(row)) {
      return row
    }

    const nextRow = {}
    columns.forEach((columnName, index) => {
      nextRow[columnName] = row[index]
    })
    return nextRow
  })

  const masked = maskRows({
    rows: objectRows,
    rules: normalizeMaskRules(rules),
  })

  return {
    maskingApplied: masked.maskingApplied,
    result: {
      ...result,
      rows: masked.rows.map((row) => {
        if (!row || typeof row !== 'object' || Array.isArray(row)) {
          return row
        }
        return columns.map((columnName) => row[columnName])
      }),
    },
  }
}

function applyMaskingToTableData(tableData = {}, rules = []) {
  const columns = Array.isArray(tableData.columns) ? tableData.columns : []
  const columnNames = columns.map((column) => column?.name).filter(Boolean)
  const rows = Array.isArray(tableData.rows) ? tableData.rows : []
  const objectRows = rows.map((row) => {
    if (!Array.isArray(row)) {
      return row
    }

    const nextRow = {}
    columnNames.forEach((columnName, index) => {
      nextRow[columnName] = row[index]
    })
    return nextRow
  })

  const masked = maskRows({
    rows: objectRows,
    rules: normalizeMaskRules(rules),
  })

  return {
    ...tableData,
    rows: masked.rows.map((row) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        return row
      }
      return columnNames.map((columnName) => row[columnName])
    }),
    maskingApplied: masked.maskingApplied,
  }
}

function buildGovernanceQueryResponse(input = {}) {
  return {
    columns: [],
    rows: [],
    error: input.error ?? null,
    governance: {
      classification: input.classification?.classification ?? 'UNKNOWN',
      statementType: input.classification?.statementType ?? 'UNKNOWN_STATEMENT',
      isMultiStatement: input.classification?.isMultiStatement === true,
      classifierNotes: input.classification?.classifierNotes ?? [],
      riskLevel: input.risk?.riskLevel ?? 'high',
      highRiskReasons: input.risk?.reasons ?? [],
      decision: input.decision?.decision ?? 'confirm',
      decisionNotes: input.decision?.notes ?? [],
      approvalRequest: input.approvalRequest ?? null,
    },
  }
}

function buildGovernanceEnvelope(record = {}) {
  return {
    classification: record.classification,
    statementType: record.statementType,
    riskLevel: record.riskLevel,
    decision: record.decision,
    maskingApplied: record.maskingApplied === true,
    highRiskReasons: record.metadata?.highRiskReasons ?? [],
    classifierNotes: record.metadata?.classifierNotes ?? [],
  }
}

function buildSqlTarget(sqlText, statementType, databaseName) {
  const tableName = extractTableName(sqlText, statementType)
  return {
    schema: databaseName ?? null,
    table: tableName,
    primaryKey: null,
  }
}

function extractTableName(sqlText, statementType) {
  const normalized = normalizeText(sqlText)
  if (!normalized) {
    return null
  }

  switch (String(statementType || '').toUpperCase()) {
    case 'UPDATE': {
      const match = /^\s*UPDATE\s+([`"\w.]+)/i.exec(normalized)
      return match ? sanitizeQualifiedIdentifier(match[1]) : null
    }
    case 'DELETE': {
      const match = /^\s*DELETE\s+FROM\s+([`"\w.]+)/i.exec(normalized)
      return match ? sanitizeQualifiedIdentifier(match[1]) : null
    }
    case 'SELECT': {
      const match = /\bFROM\s+([`"\w.]+)/i.exec(normalized)
      return match ? sanitizeQualifiedIdentifier(match[1]) : null
    }
    case 'DROP':
    case 'TRUNCATE':
    case 'ALTER':
    case 'CREATE':
    case 'RENAME': {
      const match = /\b(TABLE|VIEW)\s+([`"\w.]+)/i.exec(normalized)
      return match ? sanitizeQualifiedIdentifier(match[2]) : null
    }
    default:
      return null
  }
}

function sanitizeQualifiedIdentifier(value) {
  const text = normalizeText(value)
  if (!text) {
    return null
  }

  const segments = text.split('.')
  return segments[segments.length - 1].replace(/^[`"]|[`"]$/g, '')
}

function unavailableFlashbackRecord(reasonCodes = ['flashback-not-supported']) {
  return {
    eligible: false,
    available: false,
    flashbackId: null,
    reasonCodes: Array.isArray(reasonCodes) ? [...reasonCodes] : ['flashback-not-supported'],
  }
}

function appendAuditIfEnabled(auditStore, config, record) {
  if (config.auditEnabled === false) {
    return Promise.resolve({ ok: true, skipped: true })
  }

  return auditStore.append(record)
}

function buildAuditRecord(input = {}) {
  return {
    id: input.id,
    timestamp: input.timestamp,
    connectionId: normalizeText(input.connectionId),
    connectionName: normalizeText(input.connectionName),
    databaseType: normalizeText(input.databaseType),
    databaseName: normalizeNullableText(input.databaseName),
    source: normalizeText(input.source),
    operationKind: normalizeText(input.operationKind),
    classification: normalizeText(input.classification).toUpperCase(),
    statementType: normalizeText(input.statementType).toUpperCase(),
    riskLevel: normalizeText(input.riskLevel).toLowerCase(),
    decision: normalizeText(input.decision).toLowerCase(),
    approvedByUser: input.approvedByUser === true,
    sqlText: normalizeNullableText(input.sqlText),
    statementCount: Number.isInteger(input.statementCount) ? input.statementCount : 1,
    isMultiStatement: input.isMultiStatement === true,
    target: input.target ?? null,
    maskingApplied: input.maskingApplied === true,
    flashback: input.flashback ?? unavailableFlashbackRecord(),
    result: input.result ?? {
      success: false,
      affectedRows: null,
      errorCode: null,
      errorMessage: null,
      durationMs: null,
    },
    metadata: input.metadata ?? {},
  }
}

function normalizeConfig(input = {}) {
  return {
    ...DEFAULT_GOVERNANCE_CONFIG,
    ...input,
    decisionPolicy: {
      ...DEFAULT_GOVERNANCE_CONFIG.decisionPolicy,
      ...(input.decisionPolicy ?? {}),
    },
    maskRules: Array.isArray(input.maskRules) ? [...input.maskRules] : [...DEFAULT_GOVERNANCE_CONFIG.maskRules],
  }
}

function cloneConfig(config) {
  return JSON.parse(JSON.stringify(config))
}

function cloneRecord(record) {
  return JSON.parse(JSON.stringify(record))
}

function normalizeMaskRules(rules = []) {
  return rules
    .filter((rule) => rule && rule.enabled !== false)
    .map((rule) => ({
      columnName: normalizeText(rule.columnName ?? rule.pattern),
      matchMode: normalizeText(rule.matchMode) || 'exact',
      maskType: normalizeText(rule.maskType),
      prefix: rule.prefix,
      suffix: rule.suffix,
      maskChar: rule.maskChar,
    }))
}

function normalizeApprovalInput(input = {}) {
  if (!input || typeof input !== 'object') {
    return {}
  }

  return {
    requestId: normalizeText(input.requestId),
    token: normalizeText(input.token),
  }
}

function hashOperation(input = {}) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({
      connectionId: normalizeText(input.connectionId),
      source: normalizeText(input.source),
      sqlText: normalizeText(input.sqlText),
    }))
    .digest('hex')
}

function createAuditId(createId) {
  return `audit_${createId()}`
}

function defaultCreateId() {
  return crypto.randomUUID()
}

function shouldMaskClassification(classification) {
  return String(classification || '').toUpperCase() === 'DQL'
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeNullableText(value) {
  const text = normalizeText(value)
  return text || null
}

function normalizeErrorMessage(error) {
  if (error instanceof Error) {
    return error.message
  }

  return normalizeText(error) || 'Unknown error'
}

function normalizeDuration(value) {
  return Number.isFinite(value) ? Math.max(0, Number(value)) : null
}

function normalizeAffectedRows(value) {
  return Number.isFinite(value) ? Number(value) : null
}

function failureResult(errorMessage) {
  return {
    success: false,
    affectedRows: null,
    errorCode: null,
    errorMessage,
    durationMs: null,
  }
}

function isTableDataShape(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
