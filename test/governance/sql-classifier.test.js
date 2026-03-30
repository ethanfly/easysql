import test from 'node:test'
import assert from 'node:assert/strict'

import { classifySql } from '../../electron/governance/sql-classifier.js'

test('classifies a plain SELECT as DQL with SELECT statementType', () => {
  const result = classifySql('SELECT * FROM users')

  assert.deepEqual(result, {
    classification: 'DQL',
    statementType: 'SELECT',
    isMultiStatement: false,
    classifierNotes: [],
  })
})

test('classifies INSERT as DML with INSERT statementType', () => {
  const result = classifySql('INSERT INTO users(id) VALUES (1)')

  assert.equal(result.classification, 'DML')
  assert.equal(result.statementType, 'INSERT')
})

test('classifies UPDATE as DML with UPDATE statementType', () => {
  const result = classifySql('UPDATE users SET active = 1 WHERE id = 1')

  assert.equal(result.classification, 'DML')
  assert.equal(result.statementType, 'UPDATE')
})

test('classifies DELETE as DML with DELETE statementType', () => {
  const result = classifySql('DELETE FROM users WHERE id = 1')

  assert.equal(result.classification, 'DML')
  assert.equal(result.statementType, 'DELETE')
})

test('classifies CREATE as DDL with CREATE statementType', () => {
  const result = classifySql('CREATE TABLE users(id INT)')

  assert.equal(result.classification, 'DDL')
  assert.equal(result.statementType, 'CREATE')
})

test('classifies PostgreSQL CREATE FUNCTION with dollar-quoted body as DDL', () => {
  const result = classifySql(`
    CREATE FUNCTION demo() RETURNS void AS $$
    BEGIN
      PERFORM 1;
    END;
    $$ LANGUAGE plpgsql
  `)

  assert.equal(result.classification, 'DDL')
  assert.equal(result.statementType, 'CREATE')
  assert.equal(result.isMultiStatement, false)
})

test('classifies ALTER as DDL with ALTER statementType', () => {
  const result = classifySql('ALTER TABLE users ADD COLUMN active INT')

  assert.equal(result.classification, 'DDL')
  assert.equal(result.statementType, 'ALTER')
})

test('classifies DROP as DDL with DROP statementType', () => {
  const result = classifySql('DROP TABLE users')

  assert.equal(result.classification, 'DDL')
  assert.equal(result.statementType, 'DROP')
})

test('classifies TRUNCATE as DDL with TRUNCATE statementType', () => {
  const result = classifySql('TRUNCATE TABLE users')

  assert.equal(result.classification, 'DDL')
  assert.equal(result.statementType, 'TRUNCATE')
})

test('classifies BEGIN as TCL with BEGIN statementType', () => {
  const result = classifySql('BEGIN')

  assert.equal(result.classification, 'TCL')
  assert.equal(result.statementType, 'BEGIN')
})

test('classifies COMMIT as TCL with COMMIT statementType', () => {
  const result = classifySql('COMMIT')

  assert.equal(result.classification, 'TCL')
  assert.equal(result.statementType, 'COMMIT')
})

test('classifies ROLLBACK as TCL with ROLLBACK statementType', () => {
  const result = classifySql('ROLLBACK')

  assert.equal(result.classification, 'TCL')
  assert.equal(result.statementType, 'ROLLBACK')
})

test('classifies START TRANSACTION across newlines as TCL', () => {
  const result = classifySql('START\nTRANSACTION')

  assert.equal(result.classification, 'TCL')
  assert.equal(result.statementType, 'START_TRANSACTION')
})

test('classifies START TRANSACTION across comments as TCL', () => {
  const result = classifySql('START /* governance */ TRANSACTION')

  assert.equal(result.classification, 'TCL')
  assert.equal(result.statementType, 'START_TRANSACTION')
})

test('preserves a token boundary when a block comment appears inside a SELECT', () => {
  const result = classifySql('SELECT/*x*/1')

  assert.deepEqual(result, {
    classification: 'DQL',
    statementType: 'SELECT',
    isMultiStatement: false,
    classifierNotes: [],
  })
})

test('ignores leading comments and whitespace before classification', () => {
  const result = classifySql(`
    -- read active users
    /* dashboard query */

    SELECT id FROM users
  `)

  assert.equal(result.classification, 'DQL')
  assert.equal(result.statementType, 'SELECT')
  assert.equal(result.isMultiStatement, false)
})

test('classifies a WITH SELECT as DQL with SELECT statementType', () => {
  const result = classifySql(`
    WITH recent_users AS (
      SELECT id FROM users WHERE active = 1
    )
    SELECT * FROM recent_users
  `)

  assert.equal(result.classification, 'DQL')
  assert.equal(result.statementType, 'SELECT')
  assert.equal(result.isMultiStatement, false)
})

test('preserves a token boundary when a block comment follows WITH', () => {
  const result = classifySql('WITH/*x*/cte AS (SELECT 1) SELECT 2')

  assert.deepEqual(result, {
    classification: 'DQL',
    statementType: 'SELECT',
    isMultiStatement: false,
    classifierNotes: [],
  })
})

test('classifies a WITH UPDATE by the first executable statement after the CTE', () => {
  const result = classifySql(`
    WITH target_users AS (
      SELECT id FROM users WHERE active = 0
    )
    UPDATE users SET active = 1 WHERE id IN (SELECT id FROM target_users)
  `)

  assert.equal(result.classification, 'DML')
  assert.equal(result.statementType, 'UPDATE')
  assert.equal(result.isMultiStatement, false)
})

test('returns UNKNOWN for empty SQL after comments are removed', () => {
  const result = classifySql(`
    -- nothing to see here
    /* still nothing */
  `)

  assert.deepEqual(result, {
    classification: 'UNKNOWN',
    statementType: 'UNKNOWN_STATEMENT',
    isMultiStatement: false,
    classifierNotes: ['empty-after-comments'],
  })
})

test('returns UNKNOWN and marks multi-statement input conservatively', () => {
  const result = classifySql('SELECT 1; DELETE FROM users')

  assert.equal(result.classification, 'UNKNOWN')
  assert.equal(result.statementType, 'UNKNOWN_STATEMENT')
  assert.equal(result.isMultiStatement, true)
})

test('returns UNKNOWN for malformed SQL parse failure', () => {
  const result = classifySql('WITH cte AS (SELECT 1 SELECT 2')

  assert.equal(result.classification, 'UNKNOWN')
  assert.equal(result.statementType, 'UNKNOWN_STATEMENT')
  assert.equal(result.isMultiStatement, false)
  assert.ok(result.classifierNotes.includes('parse-failure'))
})

test('returns UNKNOWN with parse-failure when a WITH clause has no executable statement', () => {
  const result = classifySql('WITH cte AS (SELECT 1)')

  assert.equal(result.classification, 'UNKNOWN')
  assert.equal(result.statementType, 'UNKNOWN_STATEMENT')
  assert.equal(result.isMultiStatement, false)
  assert.ok(result.classifierNotes.includes('parse-failure'))
})

test('does not treat WITHDRAW as a WITH clause', () => {
  const result = classifySql('WITHDRAW 1000 FROM accounts')

  assert.equal(result.classification, 'UNKNOWN')
  assert.equal(result.statementType, 'UNKNOWN_STATEMENT')
})

test('does not treat START TRANSACTIONAL as START TRANSACTION', () => {
  const result = classifySql('START TRANSACTIONAL audit_mode = 1')

  assert.equal(result.classification, 'UNKNOWN')
  assert.equal(result.statementType, 'UNKNOWN_STATEMENT')
})

test('classifies SHOW as DQL with SHOW statementType', () => {
  const result = classifySql('SHOW TABLES')

  assert.equal(result.classification, 'DQL')
  assert.equal(result.statementType, 'SHOW')
})

test('classifies DESCRIBE as DQL with DESCRIBE statementType', () => {
  const result = classifySql('DESCRIBE users')

  assert.equal(result.classification, 'DQL')
  assert.equal(result.statementType, 'DESCRIBE')
})

test('classifies DESC as DQL with DESCRIBE statementType', () => {
  const result = classifySql('DESC users')

  assert.equal(result.classification, 'DQL')
  assert.equal(result.statementType, 'DESCRIBE')
})

test('classifies EXPLAIN as DQL with EXPLAIN statementType', () => {
  const result = classifySql('EXPLAIN SELECT * FROM users')

  assert.equal(result.classification, 'DQL')
  assert.equal(result.statementType, 'EXPLAIN')
})

test('supports quoted CTE names conservatively', () => {
  const result = classifySql(`
    WITH "recent_users" AS (
      SELECT id FROM users
    )
    SELECT * FROM recent_users
  `)

  assert.equal(result.classification, 'DQL')
  assert.equal(result.statementType, 'SELECT')
  assert.equal(result.isMultiStatement, false)
})

test('supports CTE column lists conservatively', () => {
  const result = classifySql(`
    WITH cte("id") AS (
      SELECT id FROM users
    )
    SELECT * FROM cte
  `)

  assert.equal(result.classification, 'DQL')
  assert.equal(result.statementType, 'SELECT')
  assert.equal(result.isMultiStatement, false)
})

test('skips comments between the CTE body and executable statement', () => {
  const result = classifySql(`
    WITH cte AS (SELECT 1) /*comment*/ SELECT 1
  `)

  assert.equal(result.classification, 'DQL')
  assert.equal(result.statementType, 'SELECT')
  assert.equal(result.isMultiStatement, false)
})

test('treats a WITH clause without a trailing executable statement as parse failure', () => {
  const result = classifySql('WITH cte AS (SELECT 1)')

  assert.equal(result.classification, 'UNKNOWN')
  assert.equal(result.statementType, 'UNKNOWN_STATEMENT')
  assert.ok(result.classifierNotes.includes('parse-failure'))
})
