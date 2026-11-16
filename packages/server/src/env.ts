/**
 * Boot-time environment parsing for `loadConfigFromEnv`. A set but invalid value throws
 * `Error("Invalid <NAME>: ...")` so a typo fails at startup instead of silently changing
 * behaviour. An unset or blank variable is treated as unset.
 */

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export interface PositiveIntEnvOptions {
  /** Accept `0` (for values where zero is meaningful, for example "disable the cache"). */
  allowZero?: boolean;
}

/** Positive integer variable. Unset or blank returns `fallback`. */
export function parsePositiveIntEnv(name: string, fallback: number, options?: PositiveIntEnvOptions): number;
export function parsePositiveIntEnv(
  name: string,
  fallback: undefined,
  options?: PositiveIntEnvOptions,
): number | undefined;
export function parsePositiveIntEnv(
  name: string,
  fallback: number | undefined,
  options: PositiveIntEnvOptions = {},
): number | undefined {
  const raw = readEnv(name);
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number(raw);
  const min = options.allowZero ? 0 : 1;
  if (!Number.isSafeInteger(parsed) || parsed < min) {
    throw new Error(
      `Invalid ${name}: expected ${options.allowZero ? "a non-negative" : "a positive"} integer, got "${raw}"`,
    );
  }
  return parsed;
}

/** Number between 0 and 1 (a confidence threshold). Unset or blank returns `undefined`. */
export function parseConfidenceEnv(name: string): number | undefined {
  const raw = readEnv(name);
  if (raw === undefined) {
    return undefined;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`Invalid ${name}: expected a number between 0 and 1, got "${raw}"`);
  }
  return parsed;
}

/** Variable restricted to `allowed`. Unset or blank returns `fallback`. */
export function parseEnumEnv<T extends string>(name: string, allowed: readonly T[], fallback: T): T;
export function parseEnumEnv<T extends string>(
  name: string,
  allowed: readonly T[],
  fallback?: undefined,
): T | undefined;
export function parseEnumEnv<T extends string>(
  name: string,
  allowed: readonly T[],
  fallback?: T,
): T | undefined {
  const raw = readEnv(name);
  if (raw === undefined) {
    return fallback;
  }
  const match = allowed.find((value) => value === raw);
  if (match === undefined) {
    throw new Error(`Invalid ${name}: expected one of ${allowed.join(", ")}, got "${raw}"`);
  }
  return match;
}
