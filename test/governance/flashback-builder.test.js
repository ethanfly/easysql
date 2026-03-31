import test from 'node:test'
import assert from 'node:assert/strict'

import { createFlashbackBuilder } from '../../electron/governance/flashback-builder.js'

test('builds rollback SQL for UI row updates', () => {
  const builder = createFlashbackBuilder({ rowCap: 200 })
  const result = builder.buildRowUpdateFlashback({
    databaseName: 'app_db',
    tableName: 'users',
    primaryKey: 'id',
    beforeImage: { id: 1, name: 'Alice', phone: '13800000000' },
  })

  assert.equal(result.eligible, true)
  assert.equal(result.available, true)
  assert.match(result.recoverySql, /UPDATE `users` SET/)
  assert.deepEqual(result.reasonCodes, [])
})

test('builds insert rollback SQL for UI row deletes', () => {
  const builder = createFlashbackBuilder({ rowCap: 200 })
  const result = builder.buildRowDeleteFlashback({
    databaseName: 'app_db',
    tableName: 'users',
    primaryKey: 'id',
    beforeImage: { id: 1, name: 'Alice' },
  })

  assert.equal(result.eligible, true)
  assert.equal(result.available, true)
  assert.match(result.recoverySql, /INSERT INTO `users`/)
})

test('rejects raw SQL flashback for multi-statement or CTE writes', () => {
  const builder = createFlashbackBuilder({ rowCap: 200 })
  const multi = builder.buildRawSqlFlashback({
    sqlText: 'UPDATE users SET name = "A"; DELETE FROM users WHERE id = 1',
    classification: 'UNKNOWN',
    statementType: 'UNKNOWN_STATEMENT',
    statementCount: 2,
  })
  const cte = builder.buildRawSqlFlashback({
    sqlText: 'WITH x AS (SELECT 1) UPDATE users SET name = "A" WHERE id = 1',
    classification: 'DML',
    statementType: 'UPDATE',
    statementCount: 1,
    tableName: 'users',
    primaryKey: 'id',
    whereClause: 'id = 1',
    hasCTE: true,
  })

  assert.equal(multi.eligible, false)
  assert.ok(multi.reasonCodes.includes('multi-statement'))
  assert.equal(cte.eligible, false)
  assert.ok(cte.reasonCodes.includes('cte-not-supported'))
})

test('rejects raw SQL delete without where and missing primary key certainty', () => {
  const builder = createFlashbackBuilder({ rowCap: 200 })
  const result = builder.buildRawSqlFlashback({
    sqlText: 'DELETE FROM users',
    classification: 'DML',
    statementType: 'DELETE',
    statementCount: 1,
    tableName: 'users',
    primaryKey: null,
  })

  assert.equal(result.eligible, false)
  assert.ok(result.reasonCodes.includes('missing-where'))
  assert.ok(result.reasonCodes.includes('missing-primary-key'))
})

test('supports bounded raw SQL update when the target is identifiable', () => {
  const builder = createFlashbackBuilder({ rowCap: 200 })
  const result = builder.buildRawSqlFlashback({
    sqlText: 'UPDATE users SET name = "Alice" WHERE id = 1',
    classification: 'DML',
    statementType: 'UPDATE',
    statementCount: 1,
    databaseName: 'app_db',
    tableName: 'users',
    primaryKey: 'id',
    whereClause: 'id = 1',
    beforeImage: { id: 1, name: 'Alice' },
  })

  assert.equal(result.eligible, true)
  assert.equal(result.available, true)
  assert.equal(result.beforeImageQuery, 'SELECT * FROM `app_db`.`users` WHERE `id` = 1 LIMIT 201')
  assert.match(result.recoverySql, /UPDATE `users` SET/)
})
