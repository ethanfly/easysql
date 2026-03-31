import type {
  GovernedMutationResult,
  GovernanceApprovalRequest,
  GovernanceExecutionInfo,
} from '../types'

export function normalizeGovernedMutationResult(
  result: Partial<GovernedMutationResult> | null | undefined,
  fallbackMessage: string,
): GovernedMutationResult

export function executeGovernedMutationAction(
  action: (approval?: GovernanceApprovalRequest) => Promise<GovernedMutationResult>,
  requestApproval: (governance: GovernanceExecutionInfo) => Promise<GovernanceApprovalRequest>,
): Promise<GovernedMutationResult>
