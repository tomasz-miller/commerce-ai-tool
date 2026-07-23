function stripMarkdownCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const openFence = trimmed.indexOf("```");
  if (openFence === -1) {
    return trimmed;
  }

  let contentStart = openFence + 3;
  // Optional language tag (e.g. json) — ASCII letters only, no backtracking.
  while (contentStart < trimmed.length) {
    const code = trimmed.charCodeAt(contentStart);
    const isLetter =
      (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
    if (!isLetter) {
      break;
    }
    contentStart += 1;
  }
  while (contentStart < trimmed.length) {
    const char = trimmed[contentStart]!;
    if (char !== " " && char !== "\t" && char !== "\r" && char !== "\n") {
      break;
    }
    contentStart += 1;
  }

  const closeFence = trimmed.indexOf("```", contentStart);
  if (closeFence === -1) {
    return trimmed;
  }

  return trimmed.slice(contentStart, closeFence).trim();
}

export function extractJsonObjectLiteral(raw: string): string {
  const candidate = stripMarkdownCodeFence(raw);
  const start = candidate.indexOf("{");

  if (start === -1) {
    return candidate;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < candidate.length; i++) {
    const char = candidate[i]!;

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return candidate.slice(start, i + 1);
      }
    }
  }

  return candidate.slice(start);
}

export function repairTruncatedJsonObject(json: string): string {
  let repaired = json.trim();
  if (!repaired) {
    return repaired;
  }

  let inString = false;
  let escaped = false;

  for (let i = 0; i < repaired.length; i++) {
    const char = repaired[i]!;

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
    }
  }

  if (inString) {
    repaired += '"';
  }

  // Incomplete values from truncated model output, e.g. {"transcript": or {"transcript":}
  repaired = repaired.replace(/:\s*,/g, ": null,");
  repaired = repaired.replace(/:\s*([}\]])/g, ": null$1");
  repaired = repaired.replace(/:\s*$/, ": null");

  repaired = repaired.replace(/,\s*$/, "");

  let openBraces = 0;
  inString = false;
  escaped = false;

  for (let i = 0; i < repaired.length; i++) {
    const char = repaired[i]!;

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      openBraces += 1;
    } else if (char === "}") {
      openBraces -= 1;
    }
  }

  while (openBraces > 0) {
    repaired += "}";
    openBraces -= 1;
  }

  return repaired;
}

export function parseModelJson<T>(raw: string): T {
  const extracted = extractJsonObjectLiteral(raw);
  const attempts = [extracted, repairTruncatedJsonObject(extracted)];
  let lastError: unknown;

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt) as T;
    } catch (error) {
      lastError = error;
    }
  }

  const detail = lastError instanceof Error ? `: ${lastError.message}` : "";
  throw new Error(`Invalid AI response: malformed JSON${detail}`);
}
