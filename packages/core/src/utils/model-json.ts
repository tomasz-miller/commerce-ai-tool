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

/**
 * Parses the JSON object in a model response, tolerating code fences and surrounding prose.
 * Truncated output is not repaired: providers reject a response cut by the token cap before it
 * gets here, and anything still incomplete is a malformed answer.
 */
export function parseModelJson<T>(raw: string): T {
  try {
    return JSON.parse(extractJsonObjectLiteral(raw)) as T;
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : "";
    throw new Error(`Invalid AI response: malformed JSON${detail}`, { cause: error });
  }
}
