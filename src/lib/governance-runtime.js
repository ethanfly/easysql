function hasApprovalRequest(governance) {
  return Boolean(governance?.approvalRequest?.requestId && governance?.approvalRequest?.token)
}

export function normalizeGovernedMutationResult(result, fallbackMessage) {
  return {
    success: result?.success === true,
    message:
      typeof result?.message === 'string' && result.message.trim().length > 0
        ? result.message
        : fallbackMessage,
    governance: result?.governance ?? null,
    insertId: result?.insertId,
  }
}

export async function executeGovernedMutationAction(action, requestApproval) {
  let approval
  let lastResult = null

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await action(approval)
    lastResult = result ?? null

    if (result?.success) {
      return result
    }

    if (!hasApprovalRequest(result?.governance) || result?.governance?.decision !== 'confirm') {
      return result
    }

    approval = await requestApproval(result.governance)
  }

  return lastResult ?? {
    success: false,
    message: '治理审批失败',
    governance: null,
  }
}
