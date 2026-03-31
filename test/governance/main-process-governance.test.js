import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { access } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  DEFAULT_GOVERNANCE_CONFIG,
  createGovernanceRuntime,
} from '../../electron/governance/index.js'

function withRuntime(run, options = {}) {
  const baseDir = mkdtempSync(path.join(os.tmpdir(), 'easysql-governance-runtime-'))
  const runtime = createGovernanceRuntime({
    baseDir,
    appVersion: '2.0.15',
    createId: createIncrementingId(),
    config: options.config ?? DEFAULT_GOVERNANCE_CONFIG,
  })

  return Promise.resolve()
    .then(() => run(runtime, baseDir))
    .finally(() => {
      rmSync(baseDir, { recursive: true, force: true })
    })
}

function createIncrementingId() {
  let counter = 0
  return () => `id_${++counter}`
}

test('query governance returns confirm decision for unknown multi-statement SQL', async () => {
  await withRuntime(async (runtime) => {
    const result = await runtime.beginRawSqlOperation({
      connectionId: 'c1',
      connectionName: 'demo',
      databaseType: 'mysql',
      source: 'sql-editor',
      sqlText: 'SELECT 1; DELETE FROM users',
    })

    assert.equal(result.allowExecution, false)
    assert.equal(result.decision.decision, 'confirm')
    assert.equal(result.response.governance.classification, 'UNKNOWN')
    assert.equal(result.response.governance.riskLevel, 'high')
    assert.equal(Boolean(result.response.governance.approvalRequest?.requestId), true)
    assert.equal(Boolean(result.response.governance.approvalRequest?.token), true)
  })
})

test('successful DQL query is masked and appended as a complete audit record', async () => {
  await withRuntime(async (runtime) => {
    runtime.setConfig({
      ...DEFAULT_GOVERNANCE_CONFIG,
      maskRules: [
        {
          id: 'phone',
          enabled: true,
          matchMode: 'keyword',
          pattern: 'phone',
          maskType: 'phone',
        },
      ],
    })

    const started = await runtime.beginRawSqlOperation({
      connectionId: 'c1',
      connectionName: 'demo',
      databaseType: 'mysql',
      source: 'sql-editor',
      sqlText: 'SELECT phone FROM users',
    })

    assert.equal(started.allowExecution, true)

    const completed = await runtime.completeRawSqlOperation({
      auditRecord: started.auditRecord,
      durationMs: 12,
      result: {
        columns: ['phone'],
        rows: [['13812345678']],
      },
    })

    assert.equal(completed.result.rows[0][0], '138****5678')
    assert.equal(completed.result.governance.maskingApplied, true)

    const auditRecords = await runtime.listAuditRecords()
    assert.equal(auditRecords.length, 1)
    assert.equal(auditRecords[0].classification, 'DQL')
    assert.equal(auditRecords[0].statementType, 'SELECT')
    assert.equal(auditRecords[0].result.success, true)
    assert.equal(auditRecords[0].maskingApplied, true)
  })
})

test('row update audit record can include available flashback metadata', async () => {
  await withRuntime(async (runtime) => {
    const flashback = runtime.buildRowUpdateFlashback({
      databaseName: 'app_db',
      tableName: 'users',
      primaryKey: 'id',
      beforeImage: { id: 1, name: 'Alice' },
    })

    const record = await runtime.recordMutationOperation({
      operationKind: 'row-update',
      source: 'table-editor',
      connectionId: 'c1',
      connectionName: 'demo',
      databaseType: 'mysql',
      databaseName: 'app_db',
      tableName: 'users',
      primaryKey: { column: 'id', value: 1 },
      classification: 'DML',
      statementType: 'UPDATE',
      riskLevel: 'medium',
      success: true,
      affectedRows: 1,
      flashback,
    })

    assert.equal(record.flashback.available, true)
    assert.match(record.flashback.recoverySql, /UPDATE `users` SET/)

    const auditRecords = await runtime.listAuditRecords()
    assert.equal(auditRecords.length, 1)
    assert.equal(auditRecords[0].flashback.available, true)
  })
})

test('table data masking uses configured global rules', async () => {
  await withRuntime(async (runtime) => {
    runtime.setConfig({
      ...DEFAULT_GOVERNANCE_CONFIG,
      maskRules: [
        {
          id: 'email',
          enabled: true,
          matchMode: 'exact',
          pattern: 'email',
          maskType: 'email',
        },
      ],
    })

    const result = runtime.applyMaskingToTableData({
      columns: [{ name: 'email' }, { name: 'status' }],
      rows: [['alice@example.com', 'active']],
      total: 1,
      page: 1,
      pageSize: 100,
    })

    assert.equal(result.rows[0][0], 'a****@example.com')
    assert.equal(result.rows[0][1], 'active')
    assert.equal(result.maskingApplied, true)
  })
})

test('governance approval can be consumed for the original raw SQL operation', async () => {
  await withRuntime(async (runtime) => {
    const started = await runtime.beginRawSqlOperation({
      connectionId: 'c1',
      connectionName: 'demo',
      databaseType: 'mysql',
      source: 'sql-editor',
      sqlText: 'SELECT 1; DELETE FROM users',
    })

    assert.equal(started.allowExecution, false)
    assert.equal(started.decision.decision, 'confirm')

    const approval = runtime.approveDecision(started.response.governance.approvalRequest)
    assert.equal(approval.success, true)
    assert.equal(approval.approved, true)

    const retried = await runtime.beginRawSqlOperation({
      connectionId: 'c1',
      connectionName: 'demo',
      databaseType: 'mysql',
      source: 'sql-editor',
      sqlText: 'SELECT 1; DELETE FROM users',
      approval,
    })

    assert.equal(retried.allowExecution, true)
    assert.equal(retried.auditRecord.approvedByUser, true)
  })
})

test('flashback records are persisted and queryable by runtime', async () => {
  await withRuntime(async (runtime) => {
    const flashback = runtime.buildRowDeleteFlashback({
      databaseName: 'app_db',
      tableName: 'users',
      primaryKey: 'id',
      beforeImage: { id: 7, email: 'alice@example.com' },
    })

    const record = await runtime.recordMutationOperation({
      operationKind: 'row-delete',
      source: 'table-editor',
      connectionId: 'c1',
      connectionName: 'demo',
      databaseType: 'mysql',
      databaseName: 'app_db',
      tableName: 'users',
      primaryKey: { column: 'id', value: 7 },
      classification: 'DML',
      statementType: 'DELETE',
      riskLevel: 'medium',
      success: true,
      affectedRows: 1,
      flashback,
    })

    const flashbackLogs = await runtime.listFlashbackRecords()
    assert.equal(flashbackLogs.length, 1)
    assert.equal(flashbackLogs[0].flashbackId, record.flashback.flashbackId)

    const persisted = await runtime.getFlashbackRecord(record.flashback.flashbackId)
    assert.equal(persisted?.flashbackId, record.flashback.flashbackId)
    assert.match(persisted?.recoverySql || '', /INSERT INTO `users`/)
  })
})

test('userDataPath is used as the governance storage base directory', async () => {
  const baseDir = mkdtempSync(path.join(os.tmpdir(), 'easysql-governance-userdata-'))
  const runtime = createGovernanceRuntime({
    userDataPath: baseDir,
    appVersion: '2.0.15',
    createId: createIncrementingId(),
    config: DEFAULT_GOVERNANCE_CONFIG,
  })

  try {
    const started = await runtime.beginRawSqlOperation({
      connectionId: 'c1',
      connectionName: 'demo',
      databaseType: 'mysql',
      source: 'sql-editor',
      sqlText: 'SELECT 1',
    })

    await runtime.completeRawSqlOperation({
      auditRecord: started.auditRecord,
      durationMs: 5,
      result: {
        columns: ['value'],
        rows: [[1]],
      },
    })

    await access(path.join(baseDir, 'audit-log.jsonl'))
  } finally {
    rmSync(baseDir, { recursive: true, force: true })
  }
})
