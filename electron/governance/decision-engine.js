const VALID_DECISIONS = new Set(['allow', 'confirm', 'block'])

export function decideGovernance(input = {}) {
  const {
    governanceEnabled = true,
    config = {},
    classification = 'UNKNOWN',
    riskLevel = 'medium',
    isMultiStatement = false,
  } = input

  const normalizedClassification = String(classification || 'UNKNOWN').toUpperCase()
  const normalizedRiskLevel = String(riskLevel || 'medium').toLowerCase()

  if (!governanceEnabled) {
    return buildDecision('allow', ['governance-disabled'])
  }

  const decisionPolicy = config.decisionPolicy ?? {}
  const defaultUnknownDecision = normalizeDecision(config.defaultUnknownDecision, 'confirm')
  const highRiskMode = normalizeDecision(config.highRiskMode, 'confirm')

  const notes = []
  let decision

  if (normalizedRiskLevel === 'high') {
    decision = highRiskMode
    notes.push('high-risk-mode')
    if (normalizedClassification === 'UNKNOWN') {
      notes.push('default-unknown-decision')
    }
  } else if (normalizedClassification === 'UNKNOWN') {
    decision = defaultUnknownDecision
    notes.push('default-unknown-decision')
  } else {
    decision = normalizeDecision(decisionPolicy[normalizedClassification], 'confirm')
    notes.push(`decision-policy:${normalizedClassification}`)
  }

  if (normalizedClassification === 'DDL' && normalizedRiskLevel === 'high') {
    notes.push('destructive-ddl-default')
  }

  if (isMultiStatement) {
    notes.push('multi-statement-must-not-auto-allow')
  }

  if (normalizedClassification === 'UNKNOWN' && decision === 'allow') {
    decision = 'confirm'
    notes.push('unknown-must-not-auto-allow')
  }

  if (isMultiStatement && decision === 'allow') {
    decision = 'confirm'
  }

  if (normalizedClassification === 'DDL' && normalizedRiskLevel === 'high' && decision === 'allow') {
    decision = 'confirm'
  }

  return buildDecision(decision, notes)
}

function buildDecision(decision, notes) {
  return {
    decision,
    reasons: [...notes],
    notes: [...notes],
  }
}

function normalizeDecision(value, fallback) {
  if (VALID_DECISIONS.has(value)) {
    return value
  }

  return fallback
}
