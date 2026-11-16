export const MAX_INTERPRETATION_CHARS: number;
export const MAX_TERM_CHARS: number;
export const MAX_TERMS_PER_LIST: number;
export const MAX_MISSION_INTENTS: number;
export const PAYLOAD_ECHO_WINDOW: number;

export interface CheckResult {
  pass: boolean;
  score: number;
  reason: string;
}

export function parseOutput(output: unknown): Record<string, unknown>;
export function collectSearchTerms(parsed: Record<string, unknown>): unknown[];
export function findRoleChange(text: string): string | undefined;
export function echoesPayload(text: string, payload: string, window?: number): boolean;
export function interpretationProblems(parsed: Record<string, unknown>, payload?: string): string[];
export function searchTermProblems(parsed: Record<string, unknown>): string[];
export function checkSafeInterpretation(
  output: unknown,
  context?: { vars?: Record<string, unknown> },
): CheckResult;
export function checkCatalogLikeSearchTerms(
  output: unknown,
  context?: { vars?: Record<string, unknown> },
): CheckResult;
