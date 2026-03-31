import test from 'node:test'
import assert from 'node:assert/strict'

import {
  executeGovernedMutationAction,
  normalizeGovernedMutationResult,
} from '../../src/lib/governance-runtime.js'

test('executeGovernedMutationAction retries once after approval for confirm decisions', async () => {
  const seenApprovals = []
  let calls = 0

  const result = await executeGovernedMutationAction(
    async (approval) => {
      seenApprovals.push(approval ?? null)
      calls += 1
      if (calls === 1) {
        return {
          success: false,
          message: 'approval required',
          governance: {
            decision: 'confirm',
            approvalRequest: {
              requestId: 'req-1',
              token: 'seed-token',
            },
          },
        }
      }

      return {
        success: true,
        message: 'ok',
        governance: {
          decision: 'allow',
        },
      }
    },
    async (governance) => ({
      requestId: governance.approvalRequest.requestId,
      token: 'approved-token',
      connectionId: 'conn-1',
      source: 'table-editor',
      operationHash: 'hash-1',
    }),
  )

  assert.equal(calls, 2)
  assert.deepEqual(seenApprovals, [
    null,
    {
      requestId: 'req-1',
      token: 'approved-token',
      connectionId: 'conn-1',
      source: 'table-editor',
      operationHash: 'hash-1',
    },
  ])
  assert.equal(result.success, true)
})

test('normalizeGovernedMutationResult preserves governance metadata and fallback message', () => {
  const governance = {
    decision: 'confirm',
    classification: 'DDL',
    statementType: 'DROP_TABLE',
  }

  const normalized = normalizeGovernedMutationResult(
    {
      success: false,
      governance,
    },
    'fallback message',
  )

  assert.deepEqual(normalized, {
    success: false,
    message: 'fallback message',
    governance,
    insertId: undefined,
  })
})
