const DEFAULT_ROW_CAP = 200

export function createFlashbackBuilder(options = {}) {
  const rowCap = normalizeRowCap(options.rowCap, DEFAULT_ROW_CAP)
  const createId = typeof options.createId === 'function' ? options.createId : defaultCreateId

  return {
    buildRowUpdateFlashback: (input = {}) => buildRowOperationFlashback('ui-row-update', input, rowCap, createId),
    buildRowDeleteFlashback: (input = {}) => buildRowOperationFlashback('ui-row-delete', input, rowCap, createId),
    buildRawSqlFlashback: (input = {}) => buildRawSqlFlashback(input, rowCap, createId),
  }
}

function buildRowOperationFlashback(operationKind, input, rowCap, createId) {
  const tableName = normalizeIdentifier(input.tableName)
  const primaryKey = normalizeIdentifier(input.primaryKey)
  const beforeImage = input.beforeImage

  const reasonCodes = []
  if (!tableName) {
    reasonCodes.push('missing-table')
  }
  if (!primaryKey) {
    reasonCodes.push('missing-primary-key')
  }
  if (!isPlainObject(beforeImage)) {
    reasonCodes.push('missing-before-image')
  }

  if (reasonCodes.length > 0) {
    return unsupportedFlashback(operationKind, reasonCodes)
  }

  const primaryKeyValue = beforeImage[primaryKey]
  if (primaryKeyValue === undefined) {
    return unsupportedFlashback(operationKind, ['missing-primary-key-value'])
  }

  if (operationKind === 'ui-row-update') {
    const setEntries = Object.entries(beforeImage).filter(([columnName]) => columnName !== primaryKey)
    if (setEntries.length === 0) {
      return unsupportedFlashback(operationKind, ['insufficient-before-image'])
    }

    return supportedFlashback({
      operationKind,
      createId,
      tableName,
      primaryKey,
      recoverySql: buildUpdateRecoverySql(tableName, primaryKey, primaryKeyValue, setEntries),
      beforeImageQuery: null,
      targetRowCount: 1,
      rowCap,
    })
  }

  const insertEntries = Object.entries(beforeImage)
  if (insertEntries.length === 0) {
    return unsupportedFlashback(operationKind, ['insufficient-before-image'])
  }

  return supportedFlashback({
    operationKind,
    createId,
    tableName,
    primaryKey,
    recoverySql: buildInsertRecoverySql(tableName, insertEntries),
    beforeImageQuery: null,
    targetRowCount: 1,
    rowCap,
  })
}

function buildRawSqlFlashback(input, rowCap, createId) {
  const sqlText = normalizeText(input.sqlText)
  const classification = normalizeClassification(input.classification)
  const statementType = normalizeStatementType(input.statementType)
  const statementCount = normalizeStatementCount(input.statementCount)
  const databaseName = normalizeIdentifier(input.databaseName)
  const tableName = normalizeIdentifier(input.tableName)
  const primaryKey = normalizeIdentifier(input.primaryKey)
  const whereClause = normalizeWhereClause(input.whereClause)
  const estimatedRowCount = normalizeCount(input.estimatedRowCount ?? input.affectedRows ?? input.targetRowCount)

  const reasonCodes = []

  if (statementCount !== 1) {
    reasonCodes.push('multi-statement')
    return unsupportedFlashback('raw-sql', reasonCodes, {
      target: buildTarget(databaseName, tableName, primaryKey),
    })
  }

  if (classification !== 'DML') {
    reasonCodes.push('classification-not-dml')
  }

  if (statementType !== 'UPDATE' && statementType !== 'DELETE') {
    reasonCodes.push('statement-type-not-supported')
  }

  if (!databaseName) {
    reasonCodes.push('missing-database-name')
  }

  if (!tableName) {
    reasonCodes.push('missing-table')
  }

  if (!primaryKey) {
    reasonCodes.push('missing-primary-key')
  }

  if (hasLeadingCte(sqlText) || input.hasCTE === true) {
    reasonCodes.push('cte-not-supported')
  }

  if (input.hasJoin === true || hasJoinLikeShape(sqlText)) {
    reasonCodes.push('join-not-supported')
  }

  if (statementCount === 1 && !whereClause) {
    reasonCodes.push('missing-where')
  }

  if (whereClause && primaryKey && !isSimplePrimaryKeyPredicate(whereClause, primaryKey)) {
    reasonCodes.push('where-not-simple')
  }

  if (estimatedRowCount !== null && estimatedRowCount > rowCap) {
    reasonCodes.push('row-cap-exceeded')
  }

  if (reasonCodes.length > 0) {
    return unsupportedFlashback('raw-sql', dedupe(reasonCodes), {
      target: buildTarget(databaseName, tableName, primaryKey),
    })
  }

  const target = buildTarget(databaseName, tableName, primaryKey)
  const beforeImageQuery = `SELECT * FROM ${quoteQualifiedName(databaseName, tableName)} WHERE ${formatWhereClause(whereClause, primaryKey)} LIMIT ${rowCap + 1}`
  const recoverySql = buildRawSqlRecoverySql({
    statementType,
    tableName,
    primaryKey,
    beforeImage: isPlainObject(input.beforeImage) ? input.beforeImage : null,
  })

  return supportedFlashback({
    operationKind: 'raw-sql',
    createId,
    tableName,
    primaryKey,
    recoverySql,
    beforeImageQuery,
    targetRowCount: 1,
    rowCap,
    target,
  })
}

function buildRawSqlRecoverySql(input) {
  const { statementType, tableName, primaryKey, beforeImage } = input
  if (!beforeImage) {
    return null
  }

  if (statementType === 'UPDATE') {
    const setEntries = Object.entries(beforeImage).filter(([columnName]) => columnName !== primaryKey)
    if (setEntries.length === 0) {
      return null
    }
    const primaryKeyValue = beforeImage[primaryKey]
    if (primaryKeyValue === undefined) {
      return null
    }
    return buildUpdateRecoverySql(tableName, primaryKey, primaryKeyValue, setEntries)
  }

  if (statementType === 'DELETE') {
    const insertEntries = Object.entries(beforeImage)
    if (insertEntries.length === 0) {
      return null
    }
    return buildInsertRecoverySql(tableName, insertEntries)
  }

  return null
}

function supportedFlashback(input) {
  const flashbackId = input.createId()
  return {
    eligible: true,
    available: true,
    flashbackId,
    operationKind: input.operationKind,
    target: input.target ?? buildTarget(null, input.tableName, input.primaryKey),
    recoverySql: input.recoverySql ?? null,
    beforeImageQuery: input.beforeImageQuery ?? null,
    reasonCodes: [],
    rowCap: input.rowCap,
    targetRowCount: input.targetRowCount,
  }
}

function unsupportedFlashback(operationKind, reasonCodes, extra = {}) {
  return {
    eligible: false,
    available: false,
    flashbackId: null,
    operationKind,
    target: extra.target ?? null,
    recoverySql: null,
    beforeImageQuery: null,
    reasonCodes: [...reasonCodes],
  }
}

function buildTarget(databaseName, tableName, primaryKey) {
  return {
    databaseName: databaseName || null,
    tableName: tableName || null,
    primaryKey: primaryKey || null,
  }
}

function buildUpdateRecoverySql(tableName, primaryKey, primaryKeyValue, setEntries) {
  const setClause = setEntries
    .map(([columnName, value]) => `${quoteIdentifier(columnName)} = ${serializeSqlValue(value)}`)
    .join(', ')

  return `UPDATE ${quoteIdentifier(tableName)} SET ${setClause} WHERE ${quoteIdentifier(primaryKey)} = ${serializeSqlValue(primaryKeyValue)}`
}

function buildInsertRecoverySql(tableName, insertEntries) {
  const columns = insertEntries.map(([columnName]) => quoteIdentifier(columnName)).join(', ')
  const values = insertEntries.map(([, value]) => serializeSqlValue(value)).join(', ')
  return `INSERT INTO ${quoteIdentifier(tableName)} (${columns}) VALUES (${values})`
}

function formatWhereClause(whereClause, primaryKey) {
  const normalized = collapseWhitespace(stripOuterParentheses(whereClause))
  if (!normalized) {
    return `${quoteIdentifier(primaryKey)} = ?`
  }

  const simplePredicate = extractSimplePrimaryKeyPredicate(normalized, primaryKey)
  if (simplePredicate) {
    return `${quoteIdentifier(primaryKey)} = ${simplePredicate.right}`
  }

  return normalized
}

function hasLeadingCte(sqlText) {
  return /^\s*WITH\b/i.test(sqlText)
}

function hasJoinLikeShape(sqlText) {
  return /\bJOIN\b|\bUSING\b/i.test(sqlText)
}

function normalizeIdentifier(value) {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim()
}

function normalizeText(value) {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim()
}

function normalizeClassification(value) {
  return String(value || 'UNKNOWN').trim().toUpperCase()
}

function normalizeStatementType(value) {
  return String(value || 'UNKNOWN_STATEMENT').trim().toUpperCase()
}

function normalizeStatementCount(value) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeWhereClause(value) {
  return normalizeText(value)
}

function normalizeCount(value) {
  if (value === null || value === undefined) {
    return null
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null
  }

  return parsed
}

function normalizeRowCap(value, fallback) {
  const parsed = normalizeCount(value)
  return parsed === null ? fallback : parsed
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isSimplePrimaryKeyPredicate(whereClause, primaryKey) {
  return Boolean(extractSimplePrimaryKeyPredicate(whereClause, primaryKey))
}

function extractSimplePrimaryKeyPredicate(whereClause, primaryKey) {
  const normalized = collapseWhitespace(stripOuterParentheses(whereClause))
  if (!normalized) {
    return null
  }

  if (/\b(AND|OR|JOIN|USING|UNION|INTERSECT|EXCEPT|SELECT|FROM)\b/i.test(normalized)) {
    return null
  }

  const key = escapeRegExp(unquoteIdentifier(primaryKey))
  const left = `(?:[A-Za-z_][\\w$]*\\.)?(?:\`)?${key}(?:\`)?`
  const right = `(?:\\?|:\\w+|@\\w+|NULL|TRUE|FALSE|[-+]?\\d+(?:\\.\\d+)?|'(?:''|[^'])*'|"(?:""|[^"])*"|[A-Za-z_][\\w$]*)`
  const pattern = new RegExp(`^(${left})\\s*=\\s*(${right})$`, 'i')
  const match = pattern.exec(normalized)
  if (!match) {
    return null
  }

  return {
    left: quoteIdentifier(primaryKey),
    right: match[2],
  }
}

function stripOuterParentheses(value) {
  let text = normalizeText(value)
  while (text.startsWith('(') && text.endsWith(')')) {
    const inner = text.slice(1, -1).trim()
    if (!inner) {
      return ''
    }
    text = inner
  }
  return text
}

function collapseWhitespace(value) {
  return normalizeText(value).replace(/\s+/g, ' ')
}

function unquoteIdentifier(value) {
  return normalizeIdentifier(value).replace(/^`(.+)`$/, '$1').replace(/^"(.+)"$/, '$1')
}

function quoteIdentifier(value) {
  return `\`${String(value).replace(/`/g, '``')}\``
}

function quoteQualifiedName(databaseName, tableName) {
  if (databaseName) {
    return `${quoteIdentifier(databaseName)}.${quoteIdentifier(tableName)}`
  }

  return quoteIdentifier(tableName)
}

function serializeSqlValue(value) {
  if (value === null || value === undefined) {
    return 'NULL'
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'NULL'
  }

  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE'
  }

  if (value instanceof Date) {
    return `'${value.toISOString().replace(/'/g, "''")}'`
  }

  if (typeof value === 'object') {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`
  }

  return `'${String(value).replace(/'/g, "''")}'`
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function dedupe(values) {
  return [...new Set(values)]
}

function defaultCreateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}
