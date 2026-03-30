const DEFAULT_TTL_MS = 2 * 60 * 1000

export function createApprovalStore(options = {}) {
  const {
    now = () => Date.now(),
    ttlMs = DEFAULT_TTL_MS,
    createId = defaultCreateId,
    createToken = defaultCreateId,
  } = options

  const approvals = new Map()

  return {
    issueApproval(fingerprint = {}) {
      pruneApprovals(approvals, now())

      const normalizedFingerprint = normalizeFingerprint(fingerprint)
      if (!normalizedFingerprint.ok) {
        return failure('approval-invalid-fingerprint', normalizedFingerprint.error)
      }

      const requestId = createId()
      const token = createToken()
      const issuedAt = now()
      const expiresAt = issuedAt + ttlMs

      approvals.set(requestId, {
        requestId,
        token,
        issuedAt,
        expiresAt,
        consumedAt: null,
        fingerprint: normalizedFingerprint.fingerprint,
      })

      return {
        ok: true,
        request: {
          requestId,
          token,
          issuedAt,
          expiresAt,
          singleUse: true,
          fingerprint: normalizedFingerprint.fingerprint,
        },
      }
    },

    consumeApproval(input = {}) {
      const currentTime = now()
      const requestId = String(input.requestId || '').trim()
      if (!requestId) {
        return failure('approval-missing-request-id', 'requestId is required')
      }

      pruneApprovals(approvals, currentTime, { excludeRequestId: requestId })

      const token = String(input.token || '').trim()

      const approval = approvals.get(requestId)
      if (!approval) {
        return failure('approval-not-found', 'requestId not found')
      }
      if (approval.consumedAt !== null) {
        return failure('approval-already-consumed', 'requestId has already been consumed')
      }

      if (currentTime > approval.expiresAt) {
        approvals.delete(requestId)
        return failure('approval-expired', 'requestId has expired')
      }

      if (!token || token !== approval.token) {
        return failure('approval-token-mismatch', 'approval token does not match')
      }

      const normalizedFingerprint = normalizeFingerprint(input)
      if (!normalizedFingerprint.ok) {
        return failure('approval-invalid-fingerprint', normalizedFingerprint.error)
      }

      if (!fingerprintsMatch(approval.fingerprint, normalizedFingerprint.fingerprint)) {
        return failure('approval-fingerprint-mismatch', 'approval fingerprint does not match')
      }

      approval.consumedAt = currentTime

      return {
        ok: true,
        consumed: {
          requestId: approval.requestId,
          token: approval.token,
          issuedAt: approval.issuedAt,
          expiresAt: approval.expiresAt,
          consumedAt: currentTime,
          singleUse: true,
          fingerprint: approval.fingerprint,
        },
      }
    },
  }
}

function pruneApprovals(approvals, currentTime, options = {}) {
  const { excludeRequestId = null } = options
  for (const [requestId, approval] of approvals.entries()) {
    if (excludeRequestId && requestId === excludeRequestId) {
      continue
    }
    if (approval.consumedAt !== null || currentTime > approval.expiresAt) {
      approvals.delete(requestId)
    }
  }
}

function normalizeFingerprint(input = {}) {
  const connectionId = normalizeToken(input.connectionId)
  const source = normalizeToken(input.source)
  const operationHash = normalizeToken(input.operationHash)

  if (!connectionId) {
    return { ok: false, error: 'connectionId is required' }
  }

  if (!source) {
    return { ok: false, error: 'source is required' }
  }

  if (!operationHash) {
    return { ok: false, error: 'operationHash is required' }
  }

  return {
    ok: true,
    fingerprint: {
      connectionId,
      source,
      operationHash,
    },
  }
}

function normalizeToken(value) {
  return String(value || '').trim()
}

function fingerprintsMatch(left, right) {
  return (
    left.connectionId === right.connectionId &&
    left.source === right.source &&
    left.operationHash === right.operationHash
  )
}

function failure(code, message) {
  return {
    ok: false,
    error: {
      code,
      message,
    },
  }
}

function defaultCreateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}
