import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { createAuditStore } from '../../electron/governance/audit-store.js'

function makeRecord(overrides = {}) {
  return {
    id: 'audit_1',
    timestamp: '2026-03-30T10:15:30.123Z',
    connectionId: 'conn_123',
    connectionName: 'Production MySQL',
    databaseType: 'mysql',
    source: 'sql-editor',
    operationKind: 'raw-sql',
    classification: 'DML',
    statementType: 'UPDATE',
    riskLevel: 'medium',
    decision: 'allow',
    approvedByUser: false,
    statementCount: 1,
    isMultiStatement: false,
    result: { success: true },
    ...overrides,
  }
}

function withTempAuditStore(run) {
  const baseDir = mkdtempSync(path.join(os.tmpdir(), 'easysql-audit-store-'))
  const store = createAuditStore({ baseDir })

  return Promise.resolve()
    .then(() => run(store))
    .finally(() => {
      rmSync(baseDir, { recursive: true, force: true })
    })
}

test('rejects incomplete audit records before append', async () => {
  await withTempAuditStore(async (store) => {
    const result = await store.append(makeRecord({ connectionId: '' }))

    assert.equal(result.ok, false)
    assert.equal(result.error.code, 'audit-invalid-record')
    const listed = await store.listRecentRecords()
    assert.equal(listed.length, 0)
  })
})

test('appends complete audit records and lists recent records from jsonl', async () => {
  await withTempAuditStore(async (store) => {
    const first = await store.append(makeRecord({ id: 'audit_1' }))
    const second = await store.append(makeRecord({ id: 'audit_2', classification: 'DQL', statementType: 'SELECT' }))

    assert.equal(first.ok, true)
    assert.equal(second.ok, true)

    const recent = await store.listRecentRecords({ limit: 1 })
    assert.equal(recent.length, 1)
    assert.equal(recent[0].id, 'audit_2')
    assert.equal(recent[0].statementType, 'SELECT')
  })
})

test('requires nested result.success and keeps schema self-contained', async () => {
  await withTempAuditStore(async (store) => {
    const result = await store.append(makeRecord({ result: { affectedRows: 1 } }))

    assert.equal(result.ok, false)
    assert.equal(result.error.code, 'audit-invalid-record')
  })
})
