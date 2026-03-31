const DEFAULT_MASK_CHAR = '*'

export function maskRows(input = {}) {
  const rows = Array.isArray(input.rows) ? input.rows : []
  const rules = Array.isArray(input.rules) ? input.rules : []

  let maskingApplied = false
  const maskedRows = rows.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return row
    }

    const nextRow = {}
    for (const [columnName, value] of Object.entries(row)) {
      const rule = findMatchingRule(columnName, rules)
      if (!rule) {
        nextRow[columnName] = value
        continue
      }

      const maskedValue = maskValue(value, rule)
      nextRow[columnName] = maskedValue
      if (maskedValue !== value) {
        maskingApplied = true
      }
    }

    return nextRow
  })

  return {
    rows: maskedRows,
    maskingApplied,
  }
}

function findMatchingRule(columnName, rules) {
  const normalizedColumnName = normalizeText(columnName)
  for (const rule of rules) {
    if (!rule || typeof rule !== 'object') {
      continue
    }

    const ruleColumnName = normalizeText(rule.columnName)
    if (!ruleColumnName) {
      continue
    }

    const matchMode = normalizeText(rule.matchMode) || 'exact'
    if (matchMode === 'exact' && normalizedColumnName === ruleColumnName) {
      return rule
    }

    if (matchMode === 'keyword' && normalizedColumnName.includes(ruleColumnName)) {
      return rule
    }
  }

  return null
}

function maskValue(value, rule) {
  if (value == null) {
    return value
  }

  const text = String(value)
  const maskType = normalizeText(rule.maskType)

  switch (maskType) {
    case 'phone':
      return maskWithPrefixSuffix(text, 3, 4)
    case 'email':
      return maskEmail(text)
    case 'id-card':
      return maskWithPrefixSuffix(text, 6, 4)
    case 'bank-card':
      return maskWithPrefixSuffix(text, 6, 4)
    case 'name':
      return maskName(text)
    case 'custom-partial':
      return maskWithPrefixSuffix(
        text,
        toNonNegativeInteger(rule.prefix, 0),
        toNonNegativeInteger(rule.suffix, 0),
        normalizeMaskChar(rule.maskChar)
      )
    default:
      return text
  }
}

function maskEmail(value) {
  const atIndex = value.indexOf('@')
  if (atIndex <= 0) {
    return maskEntireValue(value)
  }

  const localPart = value.slice(0, atIndex)
  const domainPart = value.slice(atIndex + 1)
  if (localPart.length <= 1) {
    return `${DEFAULT_MASK_CHAR.repeat(localPart.length)}@${domainPart}`
  }

  return `${localPart[0]}${DEFAULT_MASK_CHAR.repeat(localPart.length - 1)}@${domainPart}`
}

function maskName(value) {
  if (value.length <= 1) {
    return maskEntireValue(value)
  }

  return `${value[0]}${DEFAULT_MASK_CHAR.repeat(value.length - 1)}`
}

function maskWithPrefixSuffix(value, prefix, suffix, maskChar = DEFAULT_MASK_CHAR) {
  const safePrefix = Math.max(0, prefix)
  const safeSuffix = Math.max(0, suffix)
  const safeMaskChar = normalizeMaskChar(maskChar)

  if (value.length <= safePrefix + safeSuffix) {
    return maskEntireValue(value, safeMaskChar)
  }

  const middleLength = value.length - safePrefix - safeSuffix
  return `${value.slice(0, safePrefix)}${safeMaskChar.repeat(middleLength)}${value.slice(value.length - safeSuffix)}`
}

function maskEntireValue(value, maskChar = DEFAULT_MASK_CHAR) {
  return normalizeMaskChar(maskChar).repeat(value.length)
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeMaskChar(value) {
  const text = String(value || '').trim()
  return text.length > 0 ? text[0] : DEFAULT_MASK_CHAR
}

function toNonNegativeInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed
  }

  return fallback
}
