#!/usr/bin/env node
/**
 * WCAG 2.2 contrast check for the shared widget stylesheet.
 *
 * Parses the `--cat-*` token defaults for the light theme (`.cat-root`) and the dark theme
 * (`.cat-root[data-theme="dark"]` and the `prefers-color-scheme: dark` auto block), then:
 *   1. asserts a fixed list of text/background pairs (UX-02) meets 4.5:1 in both themes;
 *   2. scans every rule that sets both `color` and an opaque `background`, resolves them against
 *      the tokens and asserts 4.5:1, so a hard-coded `color: #fff` on an accent fill is caught;
 *   3. asserts the two dark blocks declare identical tokens (no drift between `dark` and `auto`).
 *
 * Semi-transparent tokens are composited over the page colour assumed for each theme.
 * Usage: node scripts/check-contrast.mjs [path/to/commerce-ai-search.css]
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AA_NORMAL = 4.5;
const PAGE_BG = { light: "#ffffff", dark: "#0c0c12" };

// ---------------------------------------------------------------- colour maths

export function parseColor(input) {
  const value = input.trim().toLowerCase();
  if (value === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  let match = /^#([0-9a-f]{3,8})$/.exec(value);
  if (match) {
    let hex = match[1];
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join("");
    if (hex.length !== 6 && hex.length !== 8) throw new Error(`Bad hex colour: ${input}`);
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
    };
  }
  match = /^rgba?\(([^)]+)\)$/.exec(value);
  if (match) {
    const parts = match[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) throw new Error(`Bad rgb colour: ${input}`);
    const channel = (p) => (p.endsWith("%") ? (parseFloat(p) / 100) * 255 : parseFloat(p));
    const alpha = parts[3] === undefined ? 1 : parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
    return { r: channel(parts[0]), g: channel(parts[1]), b: channel(parts[2]), a: alpha };
  }
  throw new Error(`Unsupported colour: ${input}`);
}

/** Source-over compositing of `top` onto `bottom` (bottom must be opaque for a final colour). */
export function composite(top, bottom) {
  const a = top.a + bottom.a * (1 - top.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = (t, b) => (t * top.a + b * bottom.a * (1 - top.a)) / a;
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a };
}

/** `color-mix(in srgb, A p%, B)` with premultiplied interpolation, as browsers do. */
export function mixSrgb(first, firstPct, second) {
  const w1 = firstPct / 100;
  const w2 = 1 - w1;
  const a = first.a * w1 + second.a * w2;
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const channel = (c1, c2) => (c1 * first.a * w1 + c2 * second.a * w2) / a;
  return { r: channel(first.r, second.r), g: channel(first.g, second.g), b: channel(first.b, second.b), a };
}

export function luminance({ r, g, b }) {
  const lin = (v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function selfTest() {
  const white = parseColor("#fff");
  const black = parseColor("#000");
  const near = (a, b) => Math.abs(a - b) < 0.01;
  if (!near(contrastRatio(black, white), 21)) throw new Error("self-test: black/white must be 21:1");
  if (!near(contrastRatio(parseColor("#777777"), white), 4.48)) throw new Error("self-test: #777 on white must be 4.48:1");
  if (!near(contrastRatio(parseColor("#6366f1"), white), 4.47)) throw new Error("self-test: #6366f1 on white must be 4.47:1");
  const half = composite(parseColor("rgba(0,0,0,0.5)"), white);
  if (Math.round(half.r) !== 128) throw new Error("self-test: alpha compositing is wrong");
}

// ------------------------------------------------------------------ CSS parsing

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function parseDeclarations(body) {
  const decls = [];
  let depth = 0;
  let current = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === ";" && depth === 0) {
      decls.push(current);
      current = "";
    } else current += ch;
  }
  decls.push(current);
  return decls
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => {
      const idx = d.indexOf(":");
      return idx === -1 ? null : { prop: d.slice(0, idx).trim(), value: d.slice(idx + 1).trim() };
    })
    .filter(Boolean);
}

/** Flat list of style rules with the at-rule preludes they are nested in. */
export function parseRules(css) {
  const text = stripComments(css);
  const rules = [];
  const stack = [];
  let buffer = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") {
      stack.push({ prelude: buffer.trim(), start: i + 1 });
      buffer = "";
    } else if (ch === "}") {
      const frame = stack.pop();
      if (!frame) throw new Error("Unbalanced braces in CSS");
      const body = text.slice(frame.start, i);
      if (!body.includes("{") && !frame.prelude.startsWith("@")) {
        rules.push({
          selector: frame.prelude,
          context: stack.map((f) => f.prelude),
          declarations: parseDeclarations(body),
        });
      }
      buffer = "";
    } else buffer += ch;
  }
  if (stack.length) throw new Error("Unbalanced braces in CSS");
  return rules;
}

const normalize = (s) => s.replace(/\s+/g, " ").trim();

export function extractThemes(rules) {
  const tokens = (rule) =>
    Object.fromEntries(rule.declarations.filter((d) => d.prop.startsWith("--cat-")).map((d) => [d.prop, d.value]));
  const light = rules.find((r) => r.context.length === 0 && normalize(r.selector) === ".cat-root");
  const dark = rules.find((r) => r.context.length === 0 && normalize(r.selector) === '.cat-root[data-theme="dark"]');
  const auto = rules.find(
    (r) =>
      r.context.length === 1 &&
      /^@media\s*\(prefers-color-scheme:\s*dark\)$/.test(normalize(r.context[0])) &&
      normalize(r.selector) === '.cat-root[data-theme="auto"]',
  );
  if (!light) throw new Error("Light token block `.cat-root` not found");
  if (!dark) throw new Error('Dark token block `.cat-root[data-theme="dark"]` not found');
  if (!auto) throw new Error('Auto-dark token block `.cat-root[data-theme="auto"]` inside prefers-color-scheme not found');
  return { light: tokens(light), dark: tokens(dark), auto: tokens(auto) };
}

// -------------------------------------------------------------- value evaluation

function splitTopLevel(text, separator) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === separator && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else current += ch;
  }
  parts.push(current.trim());
  return parts;
}

/** Resolve `var()` references (with fallbacks) until the value is a plain colour expression. */
export function resolveVars(value, tokens, seen = new Set()) {
  let out = value;
  for (let guard = 0; guard < 50 && out.includes("var("); guard++) {
    const start = out.indexOf("var(");
    let depth = 0;
    let end = -1;
    for (let i = start + 3; i < out.length; i++) {
      if (out[i] === "(") depth++;
      if (out[i] === ")" && --depth === 0) {
        end = i;
        break;
      }
    }
    if (end === -1) throw new Error(`Unbalanced var() in: ${value}`);
    const [name, ...fallbackParts] = splitTopLevel(out.slice(start + 4, end), ",");
    const fallback = fallbackParts.join(",").trim();
    let replacement;
    if (name in tokens && !seen.has(name)) {
      replacement = resolveVars(tokens[name], tokens, new Set([...seen, name]));
    } else if (fallback) {
      replacement = resolveVars(fallback, tokens, seen);
    } else {
      throw new Error(`Token ${name} is not defined and has no fallback`);
    }
    out = out.slice(0, start) + replacement + out.slice(end + 1);
  }
  return out;
}

export function evalColor(value, tokens) {
  const resolved = resolveVars(value, tokens).trim();
  const mixMatch = /^color-mix\((.*)\)$/i.exec(resolved);
  if (mixMatch) {
    const [space, first, second] = splitTopLevel(mixMatch[1], ",");
    if (normalize(space) !== "in srgb") throw new Error(`Unsupported colour space: ${space}`);
    const firstMatch = /^(.*?)\s+([\d.]+)%$/.exec(first);
    if (!firstMatch) throw new Error(`color-mix needs an explicit percentage: ${resolved}`);
    return mixSrgb(evalColor(firstMatch[1], tokens), parseFloat(firstMatch[2]), evalColor(second, tokens));
  }
  return parseColor(resolved);
}

// ------------------------------------------------------------------------ checks

const OVERLAY = (t) => evalColor("var(--cat-overlay-bg)", t);

/** Text/background pairs from UX-02 plus the token pairs every surface relies on. */
function explicitPairs(tokens, page) {
  const over = (name, base) => composite(evalColor(`var(${name})`, tokens), base);
  const overlay = composite(OVERLAY(tokens), page);
  const panel = composite(evalColor("var(--cat-cart-panel-bg)", tokens), page);
  const glassStrong = over("--cat-glass-bg-strong", page);
  const inputOnOverlay = over("--cat-input-bg", overlay);
  const inputOnPanel = over("--cat-input-bg", panel);
  const color = (name) => evalColor(`var(${name})`, tokens);
  const accent = color("--cat-accent");
  const accentHover = color("--cat-accent-hover");
  const dragBg = composite(mixSrgb(accent, 14, { r: 0, g: 0, b: 0, a: 0 }), overlay);
  const text = (name, bg) => composite(color(name), bg);
  return [
    ["text on overlay", text("--cat-text", overlay), overlay],
    ["text on cart panel", text("--cat-text", panel), panel],
    ["text on input over overlay", text("--cat-text", inputOnOverlay), inputOnOverlay],
    ["text on glass-strong", text("--cat-text", glassStrong), glassStrong],
    ["muted on overlay", text("--cat-text-muted", overlay), overlay],
    ["muted on cart panel", text("--cat-text-muted", panel), panel],
    ["muted on input over overlay", text("--cat-text-muted", inputOnOverlay), inputOnOverlay],
    ["muted on input over cart panel", text("--cat-text-muted", inputOnPanel), inputOnPanel],
    ["muted on glass-strong", text("--cat-text-muted", glassStrong), glassStrong],
    ["accent text on overlay", accent, overlay],
    ["accent text on cart panel", accent, panel],
    ["accent text on input over overlay", accent, inputOnOverlay],
    ["accent text on glass-strong", accent, glassStrong],
    ["accent text on drag-overlay tint", accent, dragBg],
    ["accent-contrast on accent", color("--cat-accent-contrast"), accent],
    ["accent-contrast on accent-hover", color("--cat-accent-contrast"), accentHover],
    ["accent-contrast on success", color("--cat-accent-contrast"), color("--cat-success")],
    ["error on overlay", color("--cat-error"), overlay],
    ["error on cart panel", color("--cat-error"), panel],
    ["success on overlay", color("--cat-success"), overlay],
    ["success on cart panel", color("--cat-success"), panel],
  ];
}

/** Values that legitimately cannot be evaluated statically (no single colour to compare). */
const NOT_A_COLOR = /^(inherit|initial|unset|revert|revert-layer|currentcolor|none)$|gradient\(|url\(/i;

/** Rules that pair `color` with an opaque `background`, resolved against the tokens. */
function ruleDerivedPairs(rules, tokens, page, problems) {
  const pairs = [];
  for (const rule of rules) {
    if (rule.context.some((c) => /prefers-color-scheme/.test(c))) continue;
    if (rule.selector.startsWith(".cat-root") && rule.declarations.some((d) => d.prop.startsWith("--cat-"))) continue;
    if (/:disabled|\[disabled\]|::placeholder/.test(rule.selector)) continue;
    const fgDecl = rule.declarations.find((d) => d.prop === "color");
    const bgDecl = rule.declarations.find((d) => d.prop === "background" || d.prop === "background-color");
    if (!fgDecl || !bgDecl) continue;
    if (NOT_A_COLOR.test(fgDecl.value.trim()) || NOT_A_COLOR.test(bgDecl.value.trim())) continue;
    const label = `rule ${normalize(rule.selector)} (color ${fgDecl.value} on ${bgDecl.value})`;
    try {
      const bg = evalColor(bgDecl.value, tokens);
      if (bg.a < 0.9) continue;
      const fg = evalColor(fgDecl.value, tokens);
      pairs.push([label, fg, composite(bg, page)]);
    } catch (error) {
      problems.push(`${label} cannot be evaluated: ${error.message}`);
    }
  }
  return pairs;
}

const NAMED_COLORS = new Set(
  (
    "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue " +
    "chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey " +
    "darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray " +
    "darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen " +
    "fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki " +
    "lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen " +
    "lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime " +
    "limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue " +
    "mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive " +
    "olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum " +
    "powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver " +
    "skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white " +
    "whitesmoke yellow yellowgreen canvas canvastext"
  ).split(" "),
);

/** True when a `color` value hard-codes a colour (hex, any colour function, or a named colour). */
export function hasLiteralColor(value) {
  const withoutVars = value.replace(/var\((?:[^()]|\([^()]*\))*\)/g, " ");
  if (/#[0-9a-f]{3,8}\b/i.test(withoutVars)) return true;
  if (/\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)\(/i.test(withoutVars)) return true;
  return withoutVars
    .toLowerCase()
    .split(/[^a-z-]+/)
    .some((word) => NAMED_COLORS.has(word));
}

function literalColorFindings(rules) {
  const findings = [];
  for (const rule of rules) {
    for (const d of rule.declarations) {
      if (d.prop === "color" && hasLiteralColor(d.value)) {
        findings.push(`${normalize(rule.selector)} { color: ${d.value} } uses a literal text colour instead of a token`);
      }
    }
  }
  return findings;
}

/** Public tokens that must keep a default on `.cat-root` (documented in docs/GETTING-STARTED.md). */
export const PUBLIC_TOKENS = [
  "--cat-text",
  "--cat-text-muted",
  "--cat-accent",
  "--cat-accent-hover",
  "--cat-accent-contrast",
  "--cat-error",
  "--cat-success",
  "--cat-overlay-bg",
  "--cat-cart-panel-bg",
  "--cat-input-bg",
  "--cat-z-dropdown",
  "--cat-z-panel",
  "--cat-z-overlay",
];

export function runChecks(css) {
  const rules = parseRules(css);
  const themes = extractThemes(rules);
  const failures = [];
  const rows = [];

  for (const token of PUBLIC_TOKENS) {
    if (!(token in themes.light)) failures.push(`public token ${token} has no default on .cat-root`);
  }
  for (const token of ["--cat-accent", "--cat-accent-contrast", "--cat-error", "--cat-success"]) {
    if (!(token in themes.dark)) failures.push(`public token ${token} has no dark default`);
  }

  const darkKeys = new Set([...Object.keys(themes.dark), ...Object.keys(themes.auto)]);
  for (const key of darkKeys) {
    if (themes.dark[key] !== themes.auto[key]) {
      failures.push(`dark and auto-dark blocks disagree on ${key}: ${themes.dark[key]} vs ${themes.auto[key]}`);
    }
  }

  const merged = { light: themes.light, dark: { ...themes.light, ...themes.dark } };
  for (const theme of ["light", "dark"]) {
    const tokens = merged[theme];
    const page = parseColor(PAGE_BG[theme]);
    const pairs = [];
    const problems = [];
    for (const collect of [() => explicitPairs(tokens, page), () => ruleDerivedPairs(rules, tokens, page, problems)]) {
      try {
        pairs.push(...collect());
      } catch (error) {
        failures.push(`${theme}: ${error.message}`);
      }
    }
    failures.push(...problems.map((problem) => `${theme}: ${problem}`));
    for (const [label, fg, bg] of pairs) {
      const ratio = contrastRatio(composite(fg, bg), bg);
      const ok = ratio >= AA_NORMAL;
      rows.push({ theme, label, ratio, ok });
      if (!ok) failures.push(`${theme}: ${label} = ${ratio.toFixed(2)}:1 (< ${AA_NORMAL}:1)`);
    }
  }
  failures.push(...literalColorFindings(rules));
  return { rows, failures };
}

function main() {
  selfTest();
  const here = dirname(fileURLToPath(import.meta.url));
  const cssPath = resolve(process.argv[2] ?? resolve(here, "../packages/styles/commerce-ai-search.css"));
  const { rows, failures } = runChecks(readFileSync(cssPath, "utf8"));
  if (process.env.CONTRAST_VERBOSE) {
    for (const row of rows) console.log(`${row.ok ? "ok  " : "FAIL"} ${row.theme.padEnd(5)} ${row.ratio.toFixed(2).padStart(6)}  ${row.label}`);
  }
  if (failures.length) {
    console.error(`Contrast check failed (${failures.length}):`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(`Contrast check passed: ${rows.length} pairs >= ${AA_NORMAL}:1 in light and dark.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
