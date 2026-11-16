// Keep this module free of imports: it is re-exported from the standalone
// `@commerce-ai-tool/server/flush` entry that Next.js instrumentation loads.

/**
 * Shape of the `mask` option of `LangfuseSpanProcessor` (`@langfuse/otel`):
 * `mask?: ({ data }) => any | Promise<any>`. Declared here so this package needs no
 * `@langfuse/otel` import.
 */
export type LangfuseMask = (params: { data: unknown }) => unknown;

const EMAIL_PLACEHOLDER = "[redacted-email]";
const PHONE_PLACEHOLDER = "[redacted-phone]";

/**
 * Local part, domain labels and label count are bounded so a long run of address characters
 * cannot make the scan quadratic. ASCII addresses only.
 */
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){1,8}/g;

/**
 * Seven or more digits, optionally separated by single spaces or dashes, with an optional leading
 * plus. The lookbehind skips a run that follows a letter or digit, or a letter or digit plus a dash
 * (identifiers, hex ids, `gpt-4o-2024-08-06`); `redactPhones` skips a run that is followed by a
 * letter or digit (`1234567abcdef`). Every repetition consumes one digit and the lookbehind is
 * at most two characters, so there is no backtracking.
 */
const PHONE_PATTERN = /(?<![A-Za-z0-9]-?)\+?\d(?:[ -]?\d){6,}/g;

function redactPhones(text: string): string {
  return text.replace(PHONE_PATTERN, (match, offset: number) =>
    /[A-Za-z0-9]/.test(text.charAt(offset + match.length)) ? match : PHONE_PLACEHOLDER,
  );
}

/** Nesting deeper than this is replaced instead of walked (span data is shallow JSON). */
const MAX_DEPTH = 20;

/** Redacts e-mail addresses and phone-number-like digit runs in free text. */
export function redactPii(text: string): string {
  return redactPhones(text.replace(EMAIL_PATTERN, EMAIL_PLACEHOLDER));
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function redactValue(value: unknown, depth: number, ancestors: WeakSet<object>): unknown {
  if (typeof value === "string") {
    return redactPii(value);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  const isArray = Array.isArray(value);
  if (!isArray && !isPlainObject(value)) {
    return value;
  }
  if (depth >= MAX_DEPTH || ancestors.has(value)) {
    return "[redacted]";
  }

  ancestors.add(value);
  try {
    if (isArray) {
      return value.map((item) => redactValue(item, depth + 1, ancestors));
    }
    // Keys are redacted like values (a map keyed by e-mail address). Keys that collapse to the
    // same text are kept apart with a `#2`, `#3`, ... suffix; no value is dropped.
    // The next suffix to try is remembered per redacted key, so many keys collapsing to the same
    // text cost linear time instead of re-probing `#2`, `#3`, ... from the start each time.
    const entries = new Map<string, unknown>();
    const nextSuffix = new Map<string, number>();
    for (const [key, item] of Object.entries(value)) {
      const redactedKey = redactPii(key);
      let uniqueKey = redactedKey;
      if (entries.has(uniqueKey)) {
        let n = nextSuffix.get(redactedKey) ?? 2;
        // Still checks `entries`: an original key can literally be `<redactedKey>#<n>`.
        while (entries.has(`${redactedKey}#${n}`)) {
          n += 1;
        }
        uniqueKey = `${redactedKey}#${n}`;
        nextSuffix.set(redactedKey, n + 1);
      }
      entries.set(uniqueKey, redactValue(item, depth + 1, ancestors));
    }
    // fromEntries defines own properties, so a `__proto__` key stays data.
    return Object.fromEntries(entries);
  } finally {
    ancestors.delete(value);
  }
}

/**
 * `@langfuse/otel` hands observation and trace input and output to the mask as the JSON string
 * the tracing SDK serialised, and observation metadata values decoded. A string that parses to an
 * object or array is masked as a structure and serialised again, so numbers and structure survive.
 */
function maskString(text: string): string {
  const first = text.trimStart().charAt(0);
  if (first === "{" || first === "[") {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed !== null && typeof parsed === "object") {
        return JSON.stringify(redactValue(parsed, 0, new WeakSet()));
      }
    } catch {
      // Not JSON: redact it as plain text.
    }
  }
  return redactPii(text);
}

/**
 * Default `mask` for `LangfuseSpanProcessor`: redacts e-mail addresses and phone-number-like digit
 * runs in every string of the exported input, output and observation metadata, including object
 * keys (recursively through plain objects and arrays, and through JSON strings that hold one). Other values are returned
 * unchanged and the input is never mutated.
 * It is a best-effort scrub, not an anonymiser: names and addresses are not detected. Metadata
 * propagated with `propagateAttributes` is not passed through the mask.
 *
 * ```ts
 * new LangfuseSpanProcessor({ mask: defaultLangfuseMask });
 * ```
 */
export const defaultLangfuseMask: LangfuseMask = ({ data }) => {
  try {
    return typeof data === "string" ? maskString(data) : redactValue(data, 0, new WeakSet());
  } catch {
    // Never export unmasked data because the mask failed.
    return "[redaction-failed]";
  }
};
