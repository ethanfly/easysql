import test from 'node:test'
import assert from 'node:assert/strict'

import { maskRows } from '../../electron/governance/masking-engine.js'

test('masks phone values when the column name matches by keyword', () => {
  const result = maskRows({
    rows: [
      {
        mobile_PHONE: '13812345678',
        name: 'Alice',
      },
    ],
    rules: [
      {
        columnName: 'PhOnE',
        matchMode: 'keyword',
        maskType: 'phone',
      },
    ],
  })

  assert.equal(result.maskingApplied, true)
  assert.equal(result.rows[0].mobile_PHONE, '138****5678')
  assert.equal(result.rows[0].name, 'Alice')
})

test('masks email values by exact column-name match', () => {
  const result = maskRows({
    rows: [
      {
        Email: 'alice@example.com',
        status: 'active',
      },
    ],
    rules: [
      {
        columnName: 'EMAIL',
        matchMode: 'exact',
        maskType: 'email',
      },
    ],
  })

  assert.equal(result.maskingApplied, true)
  assert.equal(result.rows[0].Email, 'a****@example.com')
  assert.equal(result.rows[0].status, 'active')
})

test('exact matches do not affect unrelated columns', () => {
  const result = maskRows({
    rows: [
      {
        idNumber: '110101199003074321',
        idNumberSuffix: 'keep-me',
      },
    ],
    rules: [
      {
        columnName: 'idNumber',
        matchMode: 'exact',
        maskType: 'id-card',
      },
    ],
  })

  assert.equal(result.maskingApplied, true)
  assert.equal(result.rows[0].idNumber, '110101********4321')
  assert.equal(result.rows[0].idNumberSuffix, 'keep-me')
})

test('null values stay safe and do not change masking state', () => {
  const result = maskRows({
    rows: [
      {
        phone: null,
        email: undefined,
        note: 'unchanged',
      },
    ],
    rules: [
      {
        columnName: 'phone',
        matchMode: 'exact',
        maskType: 'phone',
      },
      {
        columnName: 'email',
        matchMode: 'exact',
        maskType: 'email',
      },
    ],
  })

  assert.equal(result.maskingApplied, false)
  assert.equal(result.rows[0].phone, null)
  assert.equal(result.rows[0].email, undefined)
  assert.equal(result.rows[0].note, 'unchanged')
})

test('short values do not throw for custom partial masking', () => {
  const result = maskRows({
    rows: [
      {
        secret: 'abc',
      },
    ],
    rules: [
      {
        columnName: 'secret',
        matchMode: 'exact',
        maskType: 'custom-partial',
        prefix: 2,
        suffix: 2,
      },
    ],
  })

  assert.equal(result.maskingApplied, true)
  assert.equal(result.rows[0].secret, '***')
})
