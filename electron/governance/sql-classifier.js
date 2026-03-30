const UNKNOWN_RESULT = {
  classification: 'UNKNOWN',
  statementType: 'UNKNOWN_STATEMENT',
  isMultiStatement: false,
  classifierNotes: [],
}

export function classifySql(sql) {
  if (typeof sql !== 'string') {
    return { ...UNKNOWN_RESULT, classifierNotes: ['invalid-input'] }
  }

  const scan = scanSql(sql)
  if (scan.parseFailure) {
    return {
      ...UNKNOWN_RESULT,
      classifierNotes: ['parse-failure'],
    }
  }

  const statements = scan.statements.filter((statement) => statement.trim().length > 0)
  if (statements.length === 0) {
    return {
      ...UNKNOWN_RESULT,
      classifierNotes: ['empty-after-comments'],
    }
  }

  if (statements.length > 1) {
    return {
      ...UNKNOWN_RESULT,
      isMultiStatement: true,
      classifierNotes: ['multi-statement-detected'],
    }
  }

  return classifySingleStatement(statements[0])
}

function classifySingleStatement(statement) {
  const trimmed = statement.trimStart()
  if (trimmed.length === 0) {
    return {
      ...UNKNOWN_RESULT,
      classifierNotes: ['empty-after-comments'],
    }
  }

  const withResult = extractExecutableAfterWith(trimmed)
  if (withResult.parseFailure) {
    return {
      ...UNKNOWN_RESULT,
      classifierNotes: ['parse-failure'],
    }
  }

  const executableSql = withResult.sql
  const keyword = getLeadingKeyword(executableSql)
  if (!keyword) {
    return {
      ...UNKNOWN_RESULT,
      classifierNotes: ['statement-type-unknown'],
    }
  }

  const classification = classifyKeyword(keyword)
  const statementType = getStatementType(keyword)
  return {
    classification,
    statementType,
    isMultiStatement: false,
    classifierNotes: [],
  }
}

function classifyKeyword(keyword) {
  switch (keyword) {
    case 'SELECT':
    case 'SHOW':
    case 'DESCRIBE':
    case 'DESC':
    case 'EXPLAIN':
      return 'DQL'
    case 'INSERT':
    case 'UPDATE':
    case 'DELETE':
    case 'REPLACE':
    case 'MERGE':
      return 'DML'
    case 'CREATE':
    case 'ALTER':
    case 'DROP':
    case 'TRUNCATE':
    case 'RENAME':
      return 'DDL'
    case 'BEGIN':
    case 'COMMIT':
    case 'ROLLBACK':
    case 'SAVEPOINT':
    case 'START TRANSACTION':
      return 'TCL'
    default:
      return 'UNKNOWN'
  }
}

function getStatementType(keyword) {
  switch (keyword) {
    case 'START TRANSACTION':
      return 'START_TRANSACTION'
    case 'DESC':
      return 'DESCRIBE'
    default:
      return classifyKeyword(keyword) === 'UNKNOWN' ? 'UNKNOWN_STATEMENT' : keyword
  }
}

function extractExecutableAfterWith(sql) {
  if (!startsWithKeywordToken(sql, 'WITH')) {
    return { sql, parseFailure: false }
  }

  let index = 4
  index = skipTrivia(sql, index)

  if (startsWithKeywordToken(sql.slice(index), 'RECURSIVE')) {
    index += 'RECURSIVE'.length
    index = skipTrivia(sql, index)
  }

  while (index < sql.length) {
    index = skipTrivia(sql, index)
    if (index >= sql.length) {
      return { sql: '', parseFailure: true }
    }

    const nameResult = readCteName(sql, index)
    if (!nameResult.ok) {
      return { sql: '', parseFailure: true }
    }
    index = nameResult.nextIndex

    index = skipTrivia(sql, index)
    if (sql[index] === '(') {
      index = skipBalancedParens(sql, index)
      if (index < 0) {
        return { sql: '', parseFailure: true }
      }
      index = skipTrivia(sql, index)
    }

    if (!startsWithKeywordToken(sql.slice(index), 'AS')) {
      return { sql: '', parseFailure: true }
    }
    index += 2
    index = skipTrivia(sql, index)
    if (sql[index] !== '(') {
      return { sql: '', parseFailure: true }
    }

    index = skipBalancedParens(sql, index)
    if (index < 0) {
      return { sql: '', parseFailure: true }
    }

    index = skipTrivia(sql, index)
    if (sql[index] === ',') {
      index += 1
      continue
    }

    if (index >= sql.length) {
      return { sql: '', parseFailure: true }
    }

    return { sql: sql.slice(index), parseFailure: false }
  }

  return { sql: '', parseFailure: true }
}

function getLeadingKeyword(sql) {
  const trimmed = sql.trimStart()
  if (trimmed.length === 0) return ''

  const startTransactionKeyword = readStartTransactionKeyword(trimmed)
  if (startTransactionKeyword) {
    return 'START TRANSACTION'
  }

  const match = /^[A-Z_][A-Z0-9_$]*/i.exec(trimmed)
  if (!match) {
    return ''
  }

  return match[0].toUpperCase()
}

function readStartTransactionKeyword(sql) {
  if (!startsWithKeywordToken(sql, 'START')) {
    return false
  }

  const trimmed = sql.trimStart()
  let index = 5
  index = skipTrivia(trimmed, index)

  return startsWithKeywordToken(trimmed.slice(index), 'TRANSACTION')
}

function scanSql(sql) {
  const statements = []
  let current = ''
  let index = 0
  let parseFailure = false

  while (index < sql.length) {
    const char = sql[index]
    const next = sql[index + 1]

    if (char === '-' && next === '-') {
      index = skipLineComment(sql, index + 2)
      if (index < 0) {
        parseFailure = true
        break
      }
      current = appendCommentSeparator(current)
      continue
    }

    if (char === '/' && next === '*') {
      if (current.length > 0 && !/\s/.test(current[current.length - 1])) {
        current += ' '
      }
      index = skipBlockComment(sql, index + 2)
      if (index < 0) {
        parseFailure = true
        break
      }
      current = appendCommentSeparator(current)
      continue
    }

    if (char === '\'' || char === '"' || char === '`') {
      const quoted = readQuoted(sql, index, char)
      if (!quoted.ok) {
        parseFailure = true
        break
      }
      current += quoted.text
      index = quoted.nextIndex
      continue
    }

    if (char === '$') {
      const dollarQuoted = readDollarQuoted(sql, index)
      if (dollarQuoted.ok) {
        current += dollarQuoted.text
        index = dollarQuoted.nextIndex
        continue
      }
    }

    if (char === ';') {
      statements.push(current)
      current = ''
      index += 1
      continue
    }

    current += char
    index += 1
  }

  if (!parseFailure) {
    statements.push(current)
    const balanceCheck = validateParentheses(statements.join(' '))
    parseFailure = !balanceCheck.ok
  }

  return { statements, parseFailure }
}

function appendCommentSeparator(current) {
  if (current.length === 0) {
    return current
  }

  const last = current[current.length - 1]
  if (/\s/.test(last)) {
    return current
  }

  return `${current} `
}

function validateParentheses(sql) {
  let depth = 0
  let index = 0
  while (index < sql.length) {
    const char = sql[index]
    if (char === '\'' || char === '"' || char === '`') {
      const quoted = readQuoted(sql, index, char)
      if (!quoted.ok) return { ok: false }
      index = quoted.nextIndex
      continue
    }
    if (char === '$') {
      const dollarQuoted = readDollarQuoted(sql, index)
      if (dollarQuoted.ok) {
        index = dollarQuoted.nextIndex
        continue
      }
    }
    if (char === '(') depth += 1
    if (char === ')') depth -= 1
    if (depth < 0) return { ok: false }
    index += 1
  }
  return { ok: depth === 0 }
}

function readQuoted(sql, startIndex, quote) {
  let index = startIndex + 1
  while (index < sql.length) {
    const char = sql[index]
    if (char === quote) {
      if (sql[index + 1] === quote) {
        index += 2
        continue
      }
      return {
        ok: true,
        text: sql.slice(startIndex, index + 1),
        nextIndex: index + 1,
      }
    }
    if (char === '\\') {
      index += 2
      continue
    }
    index += 1
  }

  return { ok: false, text: '', nextIndex: -1 }
}

function readDollarQuoted(sql, startIndex) {
  const openMatch = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(startIndex))
  if (!openMatch) {
    return { ok: false, text: '', nextIndex: -1 }
  }

  const delimiter = openMatch[0]
  const contentStart = startIndex + delimiter.length
  const closeIndex = sql.indexOf(delimiter, contentStart)
  if (closeIndex === -1) {
    return { ok: false, text: '', nextIndex: -1 }
  }

  return {
    ok: true,
    text: sql.slice(startIndex, closeIndex + delimiter.length),
    nextIndex: closeIndex + delimiter.length,
  }
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
    return -1
  }
  return endIndex + 2
}

function skipBalancedParens(sql, startIndex) {
  if (sql[startIndex] !== '(') {
    return -1
  }

  let depth = 1
  let index = startIndex + 1
  while (index < sql.length) {
    const char = sql[index]
    const next = sql[index + 1]

    if (char === '-' && next === '-') {
      index = skipLineComment(sql, index + 2)
      continue
    }
    if (char === '/' && next === '*') {
      index = skipBlockComment(sql, index + 2)
      if (index < 0) return -1
      continue
    }
    if (char === '\'' || char === '"' || char === '`') {
      const quoted = readQuoted(sql, index, char)
      if (!quoted.ok) return -1
      index = quoted.nextIndex
      continue
    }
    if (char === '$') {
      const dollarQuoted = readDollarQuoted(sql, index)
      if (dollarQuoted.ok) {
        index = dollarQuoted.nextIndex
        continue
      }
    }
    if (char === '(') depth += 1
    if (char === ')') {
      depth -= 1
      if (depth === 0) {
        return index + 1
      }
    }
    index += 1
  }

  return -1
}

function startsWithKeywordToken(sql, keyword) {
  const trimmed = sql.trimStart()
  const upperKeyword = keyword.toUpperCase()
  if (!trimmed.toUpperCase().startsWith(upperKeyword)) {
    return false
  }

  const nextChar = trimmed[upperKeyword.length]
  return !nextChar || !isIdentifierPart(nextChar)
}

function readCteName(sql, index) {
  if (index >= sql.length) {
    return { ok: false, nextIndex: -1 }
  }

  const char = sql[index]
  if (char === '"' || char === '`') {
    const quoted = readQuoted(sql, index, char)
    if (!quoted.ok) {
      return { ok: false, nextIndex: -1 }
    }
    return { ok: true, nextIndex: quoted.nextIndex }
  }

  if (!isIdentifierStart(char)) {
    return { ok: false, nextIndex: -1 }
  }

  let cursor = index + 1
  while (cursor < sql.length && isIdentifierPart(sql[cursor])) {
    cursor += 1
  }

  return { ok: true, nextIndex: cursor }
}

function skipWhitespace(sql, index) {
  let cursor = index
  while (cursor < sql.length && /\s/.test(sql[cursor])) {
    cursor += 1
  }
  return cursor
}

function skipTrivia(sql, index) {
  let cursor = index
  while (cursor < sql.length) {
    const next = skipWhitespace(sql, cursor)
    if (next !== cursor) {
      cursor = next
      continue
    }

    if (sql[cursor] === '-' && sql[cursor + 1] === '-') {
      cursor = skipLineComment(sql, cursor + 2)
      continue
    }

    if (sql[cursor] === '/' && sql[cursor + 1] === '*') {
      cursor = skipBlockComment(sql, cursor + 2)
      if (cursor < 0) {
        return cursor
      }
      continue
    }

    return cursor
  }

  return cursor
}

function isIdentifierStart(char) {
  return /[A-Za-z_]/.test(char)
}

function isIdentifierPart(char) {
  return /[A-Za-z0-9_$]/.test(char)
}
