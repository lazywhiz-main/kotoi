import type { AgentMode } from '@/lib/types';

/** 旧データなど agent_mode がない依頼文から research / dig を推定する */
export function inferAgentMode(requestBody: string): AgentMode {
  const researchAt = requestBody.lastIndexOf('調べ');
  const digAt = requestBody.lastIndexOf('深掘り');

  if (researchAt < 0 && digAt < 0) return 'dig';
  if (digAt > researchAt) return 'dig';
  if (researchAt > digAt) return 'research';
  return 'dig';
}

export function resolveAgentMode(
  stored: AgentMode | null | undefined,
  requestBody: string,
  fallback?: AgentMode | null,
): AgentMode {
  if (stored === 'research' || stored === 'dig') return stored;
  if (fallback === 'research' || fallback === 'dig') return fallback;
  return inferAgentMode(requestBody);
}
