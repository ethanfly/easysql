import test from 'node:test'
import assert from 'node:assert/strict'

import { decideGovernance } from '../../electron/governance/decision-engine.js'

test('governance disabled always allows', () => {
  const result = decideGovernance({
    governanceEnabled: false,
    config: {
      defaultUnknownDecision: 'confirm',
      highRiskMode: 'block',
      decisionPolicy: {
        DQL: 'allow',
        DML: 'allow',
        DDL: 'confirm',
        TCL: 'allow',
        UNKNOWN: 'confirm',
      },
    },
    classification: 'DDL',
    riskLevel: 'high',
    isMultiStatement: false,
  })

  assert.equal(result.decision, 'allow')
  assert.deepEqual(result.reasons, ['governance-disabled'])
  assert.ok(result.notes.includes('governance-disabled'))
})

test('unknown classification uses defaultUnknownDecision', () => {
  const result = decideGovernance({
    governanceEnabled: true,
    config: {
      defaultUnknownDecision: 'block',
      highRiskMode: 'confirm',
      decisionPolicy: {
        DQL: 'allow',
        DML: 'allow',
        DDL: 'confirm',
        TCL: 'allow',
        UNKNOWN: 'confirm',
      },
    },
    classification: 'UNKNOWN',
    riskLevel: 'medium',
    isMultiStatement: false,
  })

  assert.equal(result.decision, 'block')
  assert.ok(result.notes.includes('default-unknown-decision'))
})

test('unknown classification cannot resolve to allow when config is permissive', () => {
  const result = decideGovernance({
    governanceEnabled: true,
    config: {
      defaultUnknownDecision: 'allow',
      highRiskMode: 'allow',
      decisionPolicy: {
        DQL: 'allow',
        DML: 'allow',
        DDL: 'allow',
        TCL: 'allow',
        UNKNOWN: 'allow',
      },
    },
    classification: 'UNKNOWN',
    riskLevel: 'medium',
    isMultiStatement: false,
  })

  assert.notEqual(result.decision, 'allow')
  assert.ok(['confirm', 'block'].includes(result.decision))
  assert.ok(result.notes.includes('unknown-must-not-auto-allow'))
})

test('highRiskMode overrides classification policy', () => {
  const result = decideGovernance({
    governanceEnabled: true,
    config: {
      defaultUnknownDecision: 'confirm',
      highRiskMode: 'block',
      decisionPolicy: {
        DQL: 'allow',
        DML: 'allow',
        DDL: 'confirm',
        TCL: 'allow',
        UNKNOWN: 'confirm',
      },
    },
    classification: 'DML',
    riskLevel: 'high',
    isMultiStatement: false,
  })

  assert.equal(result.decision, 'block')
  assert.ok(result.notes.includes('high-risk-mode'))
})

test('high-risk unknown classification still respects highRiskMode', () => {
  const result = decideGovernance({
    governanceEnabled: true,
    config: {
      defaultUnknownDecision: 'confirm',
      highRiskMode: 'block',
      decisionPolicy: {
        DQL: 'allow',
        DML: 'allow',
        DDL: 'confirm',
        TCL: 'allow',
        UNKNOWN: 'confirm',
      },
    },
    classification: 'UNKNOWN',
    riskLevel: 'high',
    isMultiStatement: false,
  })

  assert.equal(result.decision, 'block')
  assert.ok(result.notes.includes('high-risk-mode'))
})

test('case-insensitive unknown classification and high risk still stay conservative', () => {
  const result = decideGovernance({
    governanceEnabled: true,
    config: {
      defaultUnknownDecision: 'allow',
      highRiskMode: 'block',
      decisionPolicy: {
        DQL: 'allow',
        DML: 'allow',
        DDL: 'confirm',
        TCL: 'allow',
        UNKNOWN: 'confirm',
      },
    },
    classification: 'unknown',
    riskLevel: 'HIGH',
    isMultiStatement: false,
  })

  assert.equal(result.decision, 'block')
  assert.ok(result.notes.includes('high-risk-mode'))
})

test('multi-statement raw SQL cannot become allow even with permissive config', () => {
  const result = decideGovernance({
    governanceEnabled: true,
    config: {
      defaultUnknownDecision: 'allow',
      highRiskMode: 'allow',
      decisionPolicy: {
        DQL: 'allow',
        DML: 'allow',
        DDL: 'allow',
        TCL: 'allow',
        UNKNOWN: 'allow',
      },
    },
    classification: 'UNKNOWN',
    riskLevel: 'high',
    isMultiStatement: true,
  })

  assert.notEqual(result.decision, 'allow')
  assert.ok(['confirm', 'block'].includes(result.decision))
  assert.ok(result.notes.includes('multi-statement-must-not-auto-allow'))
})

test('destructive DDL defaults to confirm when highRiskMode says confirm', () => {
  const result = decideGovernance({
    governanceEnabled: true,
    config: {
      defaultUnknownDecision: 'confirm',
      highRiskMode: 'confirm',
      decisionPolicy: {
        DQL: 'allow',
        DML: 'allow',
        DDL: 'allow',
        TCL: 'allow',
        UNKNOWN: 'confirm',
      },
    },
    classification: 'DDL',
    riskLevel: 'high',
    isMultiStatement: false,
  })

  assert.equal(result.decision, 'confirm')
  assert.ok(result.notes.includes('destructive-ddl-default'))
})
