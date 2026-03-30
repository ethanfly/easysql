const HIGH = 'high'
const MEDIUM = 'medium'
const LOW = 'low'

export function analyzeRisk(input = {}) {
  const {
    sqlText = '',
    classification = 'UNKNOWN',
    statementType = 'UNKNOWN_STATEMENT',
    isMultiStatement = false,
  } = input

  const normalizedClassification = String(classification || 'UNKNOWN').toUpperCase()
  const reasons = []
  const normalizedSql = normalizeSql(sqlText)
  const upperSql = normalizedSql.toUpperCase()
  const normalizedStatementType = String(statementType || 'UNKNOWN_STATEMENT').toUpperCase()

  if (isMultiStatement) {
    reasons.push('multi-statement')
  }

  if (normalizedClassification === 'UNKNOWN') {
    reasons.push('unknown-classification')
  }

  if ((normalizedStatementType === 'DELETE' || normalizedStatementType === 'UNKNOWN_STATEMENT') && isDeleteWithoutWhere(upperSql)) {
    reasons.push('delete-without-where')
  }

  if ((normalizedStatementType === 'UPDATE' || normalizedStatementType === 'UNKNOWN_STATEMENT') && isUpdateWithoutWhere(upperSql)) {
    reasons.push('update-without-where')
  }

  if (isDropDatabase(upperSql)) {
    reasons.push('drop-database')
  }

  if (isDropTable(upperSql)) {
    reasons.push('drop-table')
  }

  if (isTruncateTable(upperSql)) {
    reasons.push('truncate-table')
  }

  const riskLevel = determineRiskLevel({ classification: normalizedClassification, isMultiStatement, reasons })
  const notes = [...reasons]

  return {
    riskLevel,
    reasons,
    notes,
  }
}

function determineRiskLevel({ classification, isMultiStatement, reasons }) {
  if (classification === 'UNKNOWN' || isMultiStatement || reasons.length > 0) {
    return HIGH
  }

  if (classification === 'DDL') {
    return MEDIUM
  }

  if (classification === 'DML') {
    return MEDIUM
  }

  if (classification === 'DQL' || classification === 'TCL') {
    return LOW
  }

  return MEDIUM
}

function isDeleteWithoutWhere(sql) {
  return /^\s*DELETE\b/.test(sql) && !containsWord(sql, 'WHERE')
}

function isUpdateWithoutWhere(sql) {
  return /^\s*UPDATE\b/.test(sql) && !containsWord(sql, 'WHERE')
}

function isDropDatabase(sql) {
  return /^\s*DROP\s+DATABASE\b/.test(sql)
}

function isDropTable(sql) {
  return /^\s*DROP\s+TABLE\b/.test(sql)
}

function isTruncateTable(sql) {
  return /^\s*TRUNCATE(?:\s+TABLE)?\b/.test(sql)
}

function containsWord(sql, word) {
  return new RegExp(`\\b${word}\\b`, 'i').test(sql)
}

function normalizeSql(sqlText) {
  if (typeof sqlText !== 'string') {
    return ''
  }

  let result = ''
  let index = 0
  while (index < sqlText.length) {
    const char = sqlText[index]
    const next = sqlText[index + 1]

    if (char === '-' && next === '-') {
      index = skipLineComment(sqlText, index + 2)
      result += ' '
      continue
    }

    if (char === '/' && next === '*') {
      index = skipBlockComment(sqlText, index + 2)
      result += ' '
      continue
    }

    if (char === '\'' || char === '"' || char === '`') {
      const quoted = skipQuoted(sqlText, index, char)
      if (quoted < 0) {
        return result
      }
      result += ' '
      index = quoted
      continue
    }

    result += char
    index += 1
  }

  return result
}

function skipLineComment(sql, startIndex) {
  let index = startIndex
  while (index < sql.length && sql[index] !== '\n' && sql[index] !== '\r') {
    index += 1
  }
  return index
}

function skipBlockComment(sql, startIndex) {
  const endIndex = sql.indexOf('*/', startIndex)
  if (endIndex === -1) {
    return sql.length
  }
  return endIndex + 2
}

function skipQuoted(sql, startIndex, quote) {
  let index = startIndex + 1
  while (index < sql.length) {
    const char = sql[index]
    if (char === quote) {
      if (sql[index + 1] === quote) {
        index += 2
        continue
      }
      return index + 1
    }
    if (char === '\\') {
      index += 2
      continue
    }
    index += 1
  }
  return -1
}
