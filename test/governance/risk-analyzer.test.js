import test from 'node:test'
import assert from 'node:assert/strict'

import { analyzeRisk } from '../../electron/governance/risk-analyzer.js'

test('DELETE FROM users without WHERE is high risk', () => {
  const result = analyzeRisk({
    sqlText: 'DELETE FROM users',
    classification: 'DML',
    statementType: 'DELETE',
    isMultiStatement: false,
  })

  assert.equal(result.riskLevel, 'high')
  assert.ok(result.reasons.includes('delete-without-where'))
  assert.ok(result.notes.includes('delete-without-where'))
})

test('UPDATE users SET name = "" without WHERE is high risk', () => {
  const result = analyzeRisk({
    sqlText: "UPDATE users SET name = ''",
    classification: 'DML',
    statementType: 'UPDATE',
    isMultiStatement: false,
  })

  assert.equal(result.riskLevel, 'high')
  assert.ok(result.reasons.includes('update-without-where'))
  assert.ok(result.notes.includes('update-without-where'))
})

test('lowercase delete without WHERE is still high risk', () => {
  const result = analyzeRisk({
    sqlText: 'delete from users',
    classification: 'DML',
    statementType: 'delete',
    isMultiStatement: false,
  })

  assert.equal(result.riskLevel, 'high')
  assert.ok(result.reasons.includes('delete-without-where'))
})

test('raw SQL update without WHERE is still high risk when statementType is unknown', () => {
  const result = analyzeRisk({
    sqlText: "UPDATE users SET name = 'x'",
    classification: 'DML',
    statementType: 'UNKNOWN_STATEMENT',
    isMultiStatement: false,
  })

  assert.equal(result.riskLevel, 'high')
  assert.ok(result.reasons.includes('update-without-where'))
})

test('DROP TABLE users is high risk', () => {
  const result = analyzeRisk({
    sqlText: 'DROP TABLE users',
    classification: 'DDL',
    statementType: 'DROP',
    isMultiStatement: false,
  })

  assert.equal(result.riskLevel, 'high')
  assert.ok(result.reasons.includes('drop-table'))
  assert.ok(result.notes.includes('drop-table'))
})

test('DROP DATABASE app_db is high risk', () => {
  const result = analyzeRisk({
    sqlText: 'DROP DATABASE app_db',
    classification: 'DDL',
    statementType: 'DROP',
    isMultiStatement: false,
  })

  assert.equal(result.riskLevel, 'high')
  assert.ok(result.reasons.includes('drop-database'))
  assert.ok(result.notes.includes('drop-database'))
})

test('TRUNCATE TABLE users is high risk', () => {
  const result = analyzeRisk({
    sqlText: 'TRUNCATE TABLE users',
    classification: 'DDL',
    statementType: 'TRUNCATE',
    isMultiStatement: false,
  })

  assert.equal(result.riskLevel, 'high')
  assert.ok(result.reasons.includes('truncate-table'))
})

test('TRUNCATE users without TABLE keyword is high risk', () => {
  const result = analyzeRisk({
    sqlText: 'TRUNCATE users',
    classification: 'DDL',
    statementType: 'TRUNCATE',
    isMultiStatement: false,
  })

  assert.equal(result.riskLevel, 'high')
  assert.ok(result.reasons.includes('truncate-table'))
})

test('multi-statement raw SQL is high risk', () => {
  const result = analyzeRisk({
    sqlText: 'SELECT 1; DELETE FROM users',
    classification: 'UNKNOWN',
    statementType: 'UNKNOWN_STATEMENT',
    isMultiStatement: true,
  })

  assert.equal(result.riskLevel, 'high')
  assert.ok(result.reasons.includes('multi-statement'))
  assert.ok(result.notes.includes('multi-statement'))
})

test('UNKNOWN raw SQL is high risk', () => {
  const result = analyzeRisk({
    sqlText: 'SHOW TABLES',
    classification: 'UNKNOWN',
    statementType: 'UNKNOWN_STATEMENT',
    isMultiStatement: false,
  })

  assert.equal(result.riskLevel, 'high')
  assert.ok(result.reasons.includes('unknown-classification'))
  assert.ok(result.notes.includes('unknown-classification'))
})

test('lowercase unknown classification is still high risk', () => {
  const result = analyzeRisk({
    sqlText: 'SHOW TABLES',
    classification: 'unknown',
    statementType: 'UNKNOWN_STATEMENT',
    isMultiStatement: false,
  })

  assert.equal(result.riskLevel, 'high')
  assert.ok(result.reasons.includes('unknown-classification'))
})
