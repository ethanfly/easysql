import test from 'node:test'
import assert from 'node:assert/strict'

import { createApprovalStore } from '../../electron/governance/approval-store.js'

function createDeterministicStore(nowValue = 1000, ttlMs = 5000) {
  let requestCounter = 0
  let tokenCounter = 0
  return createApprovalStore({
    now: () => nowValue,
    ttlMs,
    createId: () => `req-${++requestCounter}`,
    createToken: () => `token-${++tokenCounter}`,
  })
}

test('happy path consume succeeds once', () => {
  const store = createDeterministicStore()

  const issued = store.issueApproval({
    connectionId: 'conn-1',
    source: 'renderer',
    operationHash: 'op-123',
  })

  assert.equal(issued.ok, true)
  assert.equal(issued.request.requestId, 'req-1')
  assert.notEqual(issued.request.token, issued.request.requestId)
  assert.equal(issued.request.expiresAt, 6000)

  const consumed = store.consumeApproval({
    requestId: issued.request.requestId,
    token: issued.request.token,
    connectionId: 'conn-1',
    source: 'renderer',
    operationHash: 'op-123',
  })

  assert.equal(consumed.ok, true)
  assert.equal(consumed.consumed.requestId, 'req-1')
  assert.equal(consumed.consumed.singleUse, true)
})

test('second consume fails', () => {
  const store = createDeterministicStore()

  const issued = store.issueApproval({
    connectionId: 'conn-1',
    source: 'renderer',
    operationHash: 'op-123',
  })

  const first = store.consumeApproval({
    requestId: issued.request.requestId,
    token: issued.request.token,
    connectionId: 'conn-1',
    source: 'renderer',
    operationHash: 'op-123',
  })
  const second = store.consumeApproval({
    requestId: issued.request.requestId,
    token: issued.request.token,
    connectionId: 'conn-1',
    source: 'renderer',
    operationHash: 'op-123',
  })

  assert.equal(first.ok, true)
  assert.equal(second.ok, false)
  assert.equal(second.error.code, 'approval-already-consumed')
})

test('mismatched fingerprint fails', () => {
  const store = createDeterministicStore()

  const issued = store.issueApproval({
    connectionId: 'conn-1',
    source: 'renderer',
    operationHash: 'op-123',
  })

  const consumed = store.consumeApproval({
    requestId: issued.request.requestId,
    token: issued.request.token,
    connectionId: 'conn-2',
    source: 'renderer',
    operationHash: 'op-123',
  })

  assert.equal(consumed.ok, false)
  assert.equal(consumed.error.code, 'approval-fingerprint-mismatch')
})

test('same connection and source cannot replay approval for a different operation hash', () => {
  const store = createDeterministicStore()

  const issued = store.issueApproval({
    connectionId: 'conn-1',
    source: 'renderer',
    operationHash: 'op-123',
  })

  const consumed = store.consumeApproval({
    requestId: issued.request.requestId,
    token: issued.request.token,
    connectionId: 'conn-1',
    source: 'renderer',
    operationHash: 'op-456',
  })

  assert.equal(consumed.ok, false)
  assert.equal(consumed.error.code, 'approval-fingerprint-mismatch')
})

test('expired token fails', () => {
  let currentTime = 1000
  const store = createApprovalStore({
    now: () => currentTime,
    ttlMs: 500,
    createId: (() => {
      let counter = 0
      return () => `req-${++counter}`
    })(),
    createToken: (() => {
      let counter = 0
      return () => `token-${++counter}`
    })(),
  })

  const issued = store.issueApproval({
    connectionId: 'conn-1',
    source: 'renderer',
    operationHash: 'op-123',
  })

  currentTime = 1601

  const consumed = store.consumeApproval({
    requestId: issued.request.requestId,
    token: issued.request.token,
    connectionId: 'conn-1',
    source: 'renderer',
    operationHash: 'op-123',
  })

  assert.equal(consumed.ok, false)
  assert.equal(consumed.error.code, 'approval-expired')
})

test('missing or wrong token fails', () => {
  const store = createDeterministicStore()

  const issued = store.issueApproval({
    connectionId: 'conn-1',
    source: 'renderer',
    operationHash: 'op-123',
  })

  const missingToken = store.consumeApproval({
    requestId: issued.request.requestId,
    connectionId: 'conn-1',
    source: 'renderer',
    operationHash: 'op-123',
  })

  const wrongToken = store.consumeApproval({
    requestId: issued.request.requestId,
    token: 'wrong-token',
    connectionId: 'conn-1',
    source: 'renderer',
    operationHash: 'op-123',
  })

  assert.equal(missingToken.ok, false)
  assert.equal(missingToken.error.code, 'approval-token-mismatch')
  assert.equal(wrongToken.ok, false)
  assert.equal(wrongToken.error.code, 'approval-token-mismatch')
})

test('token is distinct from requestId and required for approval', () => {
  const store = createDeterministicStore()

  const issued = store.issueApproval({
    connectionId: 'conn-1',
    source: 'renderer',
    operationHash: 'op-123',
  })

  const consumed = store.consumeApproval({
    requestId: issued.request.requestId,
    token: issued.request.requestId,
    connectionId: 'conn-1',
    source: 'renderer',
    operationHash: 'op-123',
  })

  assert.notEqual(issued.request.token, issued.request.requestId)
  assert.equal(consumed.ok, false)
  assert.equal(consumed.error.code, 'approval-token-mismatch')
})

test('store prunes expired and consumed approvals during normal use', () => {
  let currentTime = 1000
  let requestCounter = 0
  let tokenCounter = 0

  const store = createApprovalStore({
    now: () => currentTime,
    ttlMs: 500,
    createId: () => `req-${++requestCounter}`,
    createToken: () => `token-${++tokenCounter}`,
  })

  const first = store.issueApproval({
    connectionId: 'conn-1',
    source: 'renderer',
    operationHash: 'op-1',
  })
  const second = store.issueApproval({
    connectionId: 'conn-1',
    source: 'renderer',
    operationHash: 'op-2',
  })

  const consumed = store.consumeApproval({
    requestId: first.request.requestId,
    token: first.request.token,
    connectionId: 'conn-1',
    source: 'renderer',
    operationHash: 'op-1',
  })

  assert.equal(consumed.ok, true)

  currentTime = 1601

  const third = store.issueApproval({
    connectionId: 'conn-1',
    source: 'renderer',
    operationHash: 'op-3',
  })

  assert.equal(third.ok, true)

  const expired = store.consumeApproval({
    requestId: second.request.requestId,
    token: second.request.token,
    connectionId: 'conn-1',
    source: 'renderer',
    operationHash: 'op-2',
  })

  assert.equal(expired.ok, false)
  assert.equal(expired.error.code, 'approval-not-found')
})
