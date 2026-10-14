#!/usr/bin/env node
/* Brings the bichos avatar engine over from the avatar lab, mechanically, and regenerates the stylesheet it needs.
 *
 *   npm run sync:bichos -w @sidevoice/web -- --lab /path/to/avatar-lab
 *
 * The lab is named on the command line every time: nothing here guesses where it lives.
 *
 * What it writes, and nothing else:
 *   - src/features/avatar/engine/   a mirror of the lab's src/ (wiped and rewritten on every run):
 *       verbatim   core.ts, desk.ts, backdrop.ts, bichos/*.ts, parts/*.ts
 *       patched    bichos/spec.ts (no adapter for old recipes), parts/core-species.ts (no v3:/monstruo: rollers)
 *       generated  styles/mascots.ts (only the Sidevoice mascot, with its hull), styles/bichos.ts (the lab's file with
 *                  the third-party mascots' rules stripped from BASE_CSS, its interpolations kept as they are, and
 *                  its seed-to-mascot style object replaced by the CSS alone), README.md (this mapping, with hashes)
 *   - src/styles/bichos.css         the engine's CSS as a flat global stylesheet (features/avatar/engine-stylesheet.ts)
 *
 * Left in the lab on purpose: main.ts, index.html, lab.css, i18n.ts (its stage words live in the call's message
 * bundles), styles/logos.ts and every mascot but Sidevoice's (third-party marks), parts/b16-beyond.ts (a brand),
 * tools/ and docs/. A patch or an extraction that no longer finds its anchor stops the run and says which: fix the
 * anchor here, never the output by hand. */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEST = join(APP, "src/features/avatar/engine");
const STYLESHEET = join(APP, "src/styles/bichos.css");

/** Root files of the lab's src/ that the engine needs; anything else at the root is the lab's own page. */
const ROOT_FILES = ["core.ts", "desk.ts", "backdrop.ts"];
const LAB_ONLY_ROOT = ["main.ts", "editor.ts", "i18n.ts", "lab.css"];
/** Part batches that stay in the lab. */
const EXCLUDED_PARTS = ["b16-beyond.ts"];

/** Groups and keyframes of the third-party mascots (styles/bichos.ts in the lab). Sidevoice's are `sv-*`. */
const THIRD_PARTY_SELECTOR = /\.pg-(?:rays|star|wheel)\b|\.pg-(?:gk|pi|oc|cl|cp|cu|km|ol|lm|ds|mi|qw|ws)-/;
const THIRD_PARTY_KEYFRAMES = /^@keyframes\s+(?:gk|pi|oc|cl|cp|cu|km|ol|lm|ds|mi|qw|ws)-/;
/** Marks of the third-party logos (styles/logos.ts in the lab): none may reach the app. */
const LOGO_CONSTANTS = /\b(?:CLAUDE|GEMINI|OPENAI|OPENCLAW|XAI|PI|OPENCODE|KIMI|OLLAMA|LMSTUDIO|CURSOR|COPILOT|DEEPSEEK|MISTRAL|QWEN|WINDSURF|CLINE)_(?:24|100)\b|\bOPENCLAW\b/;

function fail(message) {
  console.error(`sync-bichos: ${message}`);
  process.exit(1);
}

function args() {
  const at = process.argv.indexOf("--lab");
  const lab = at > 0 ? process.argv[at + 1] : undefined;
  if (!lab) fail("name the lab: --lab /path/to/avatar-lab");
  const src = join(resolve(lab), "src");
  if (!existsSync(join(src, "bichos/render.ts"))) fail(`${src} is not the avatar lab's src/ (no bichos/render.ts)`);
  return src;
}

const read = (path) => readFileSync(path, "utf8");
const sha = (text) => createHash("sha256").update(text).digest("hex").slice(0, 12);

/* ---------- patches: exact anchors, each must apply exactly once ---------- */

const PATCHES = {
  "bichos/spec.ts": [
    {
      name: "header: no adapter for old recipes",
      from: " Old recipes (flat\n * `top`/`eyes`/… keys, `feet`, and the `extras`/`gear` lists) load through the adapter below. */",
      to: "\n * (Sidevoice: the lab's adapter for old recipes is left out, the app never stored one; scripts/sync-bichos.mjs.) */",
    },
    {
      name: "the old recipes' slot map",
      from: /\/\*\* Where the old multi-select lists went[\s\S]*?const LEGACY_TOP = [^\n]*\n/,
      to: "",
    },
    {
      name: "the old recipes' branch of normalizeSpec",
      from: /  \} else \{\n    for \(const s of SLOTS\) if \(s\.id in raw\)[\s\S]*?\n  \}\n/,
      to: "  }\n",
    },
  ],
  "parts/core-species.ts": [
    {
      name: "header: no frozen rollers",
      from: ", plus two frozen rollers kept as seed\n * prefixes: \"v3:<seed>\" (the previous default, byte for byte) and \"monstruo:<seed>\" (the old sticker monster). */",
      to: ".\n * (Sidevoice: the lab's frozen rollers, its \"v3:\" and \"monstruo:\" seed prefixes, are left out; scripts/sync-bichos.mjs.) */",
    },
    {
      name: "the v3 and sticker-monster rollers",
      from: /\/\* ---------- v3: the previous roller[\s\S]*?(?=export default batch\(\{)/,
      to: "",
    },
    { name: "their seed prefixes", from: "  prefixes: { v3, monstruo: classicMonster },\n", to: "" },
    {
      name: "imports only the rollers used",
      from: 'import { SWATCHES, batch, rng, type ColorRule, type Rng } from "../bichos/kit";',
      to: 'import { SWATCHES, batch, type ColorRule } from "../bichos/kit";',
    },
  ],
};

function patch(file, text) {
  for (const p of PATCHES[file] ?? []) {
    const count = typeof p.from === "string" ? text.split(p.from).length - 1 : (text.match(new RegExp(p.from.source, "g")) ?? []).length;
    if (count !== 1) fail(`${file}: patch "${p.name}" found its anchor ${count} times (expected once)`);
    text = text.replace(p.from, p.to);
  }
  return text;
}

/* ---------- extraction: whole top-level declarations, by their first line ---------- */

/** The declaration starting with `head` (plus the doc comment right above it), up to its closing brace at column 0. */
function declaration(text, head, file) {
  const start = text.indexOf(head);
  if (start < 0 || text.indexOf(head, start + 1) >= 0) fail(`${file}: expected exactly one "${head}"`);
  const close = head.trimEnd().endsWith("= {") ? "\n};\n" : "\n}\n";
  const end = text.indexOf(close, start);
  if (end < 0) fail(`${file}: no end for "${head}"`);
  let from = start;
  const before = text.slice(0, start);
  if (before.endsWith("*/\n")) {
    const open = before.lastIndexOf("/**");
    if (open >= 0 && before.indexOf("*/", open) === before.length - 3) from = open;
  }
  return text.slice(from, end + close.length);
}

/** Sidevoice's row of the lab's hull table (MASCOT_HULLS), or nothing if the lab has no table. */
function hull(mascots) {
  const row = /^\s*sidevoice: (\[\d+(?:\.\d+)?, "[^"\n]*"\]),$/m.exec(mascots);
  if (!row) fail("styles/mascots.ts: no sidevoice row in MASCOT_HULLS");
  return row[1];
}

/** The lab's mascot module cut down to the Sidevoice mascot: its shade (the renderer's too), its drawing and its mark. */
function mascotsModule(src) {
  const mascots = read(join(src, "styles/mascots.ts")), logos = read(join(src, "styles/logos.ts"));
  const file = "styles/mascots.ts";
  return `/* GENERATED by scripts/sync-bichos.mjs from the avatar lab's styles/mascots.ts and styles/logos.ts: do not edit.
 * Only Sidevoice's own mascot ships (and the shade every figure uses). The lab's third-party mascots stay in the lab,
 * and nothing draws a mascot unless it is asked for by name: a conversation's seed always rolls a bicho. */

import { n } from "../core";

/** The mascots that ship. The lab calls a mascot's kind its harness. */
export const HARNESSES = ["sidevoice"] as const;
export type Harness = (typeof HARNESSES)[number];

const INK = "#1b1428";

${declaration(logos, "export const SIDEVOICE_24 = {", "styles/logos.ts")}
${declaration(mascots, "export function shade(", file)}
${declaration(mascots, "export interface Mascot {", file)}
/** Sidevoice's mark at rest, ink included, and its eyes' line, [eyeY, hull]: the shared cues keep clear of it. */
const SIDEVOICE_HULL: [number, string] = ${hull(mascots)};

/** A mascot by name: only Sidevoice's, with the hull its cues are placed by. */
export function mascot(kind: Harness, id: string): Mascot {
  if (kind !== "sidevoice") throw new Error(\`[bichos] no mascot "\${String(kind)}" ships\`);
  const [eyeY, hull] = SIDEVOICE_HULL;
  return { ...sidevoice(id), hull, eyeY };
}

${declaration(mascots, "function sidevoice(id: string): Mascot {", file)}`;
}

/* ---------- the shared CSS: the lab's BASE_CSS minus the third-party mascots ---------- */

/** Top-level items of a CSS text: comments and blocks (rules, at-rules), each with the whitespace before it. */
function cssItems(css) {
  const items = [];
  let i = 0;
  while (i < css.length) {
    const lead = /^\s*/.exec(css.slice(i))[0];
    const at = i + lead.length;
    if (at >= css.length) { items.push({ kind: "space", raw: lead }); break; }
    if (css[at] === HOLE) {
      const end = css.indexOf(HOLE, at + 1);
      items.push({ kind: "hole", raw: css.slice(i, end + 1) });
      i = end + 1;
      continue;
    }
    if (css.startsWith("/*", at)) {
      const end = css.indexOf("*/", at);
      if (end < 0) fail("unclosed comment in BASE_CSS");
      items.push({ kind: "comment", raw: css.slice(i, end + 2) });
      i = end + 2;
      continue;
    }
    const open = css.indexOf("{", at);
    if (open < 0) fail(`BASE_CSS: stray text "${css.slice(at, at + 40)}"`);
    let depth = 0, j = open;
    for (; j < css.length; j += 1) {
      if (css[j] === "{") depth += 1;
      else if (css[j] === "}" && (depth -= 1) === 0) break;
    }
    items.push({ kind: "block", lead, prelude: css.slice(at, open), body: css.slice(open, j + 1) });
    i = j + 1;
  }
  return items;
}

/** Selectors split at top-level commas (not inside :is(), :not()). */
function splitSelectors(prelude) {
  const out = [];
  let depth = 0, start = 0;
  for (let i = 0; i < prelude.length; i += 1) {
    if (prelude[i] === "(") depth += 1;
    else if (prelude[i] === ")") depth -= 1;
    else if (prelude[i] === "," && depth === 0) { out.push(prelude.slice(start, i)); start = i + 1; }
  }
  out.push(prelude.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
}

/** Drops every rule (or selector) and keyframes of the third-party mascots, and the comments that only spoke of them. */
function stripThirdParty(css) {
  const items = cssItems(css);
  // A run of comments heads the blocks after it, up to the next comment: when every block it heads goes, it goes too.
  const kept = [];
  let head = [], blocks = [];
  const flush = () => {
    const alive = blocks.filter((b) => b.raw !== null);
    if (head.length && blocks.length && !alive.length) { head = []; }
    kept.push(...head.map((c) => c.raw), ...alive.map((b) => b.raw));
    head = []; blocks = [];
  };
  for (const item of items) {
    if (item.kind === "space") { kept.push(item.raw); continue; }
    // An interpolation is the lab's own generated CSS (keyframes of a work style): kept as it is. What it produces is
    // checked with the rest once the stylesheet is built.
    if (item.kind === "hole") { blocks.push({ raw: item.raw }); continue; }
    if (item.kind === "comment") { if (blocks.length) flush(); head.push(item); continue; }
    const prelude = item.prelude.trim();
    if (prelude.startsWith("@")) {
      blocks.push({ raw: THIRD_PARTY_KEYFRAMES.test(prelude) ? null : item.lead + item.prelude + item.body });
      continue;
    }
    const selectors = splitSelectors(prelude);
    const left = selectors.filter((s) => !THIRD_PARTY_SELECTOR.test(s));
    if (!left.length) blocks.push({ raw: null });
    else if (left.length === selectors.length) blocks.push({ raw: item.lead + item.prelude + item.body });
    else blocks.push({ raw: `${item.lead}${left.join(", ")} ${item.body}` });
  }
  flush();
  const out = kept.join("");
  if (THIRD_PARTY_SELECTOR.test(out)) fail("styles/bichos.ts: a third-party mascot rule survived the strip");
  return out;
}

/** Marks an interpolation held out of the CSS while it is stripped. */
const HOLE = "\u0001";

/** The end of the template literal whose text starts at `from` (the index of its closing backtick), and the
 *  `${…}` interpolations in it (their braces counted, nested templates included). */
function template(text, from, file) {
  const holes = [];
  for (let i = from; i < text.length; i += 1) {
    if (text[i] === "\\") { i += 1; continue; }
    if (text[i] === "`") return { end: i, holes };
    if (text[i] === "$" && text[i + 1] === "{") {
      let depth = 0, j = i + 1;
      for (; j < text.length; j += 1) {
        if (text[j] === "{") depth += 1;
        else if (text[j] === "}" && (depth -= 1) === 0) break;
      }
      holes.push([i, j + 1]);
      i = j;
    }
  }
  fail(`${file}: unterminated template`);
}

/** The lab's shared-style module, as the app needs it: its BASE_CSS without the third-party mascots' rules, its
 *  mascot frame exported, and its `bichos` style object (the lab's rows, and the lookup that turns a seed spelling a
 *  harness into its mascot) replaced by the style's CSS alone. Everything else — the waiting alias, the entrance — as
 *  the lab wrote it. */
function bichosModule(src) {
  const file = "styles/bichos.ts";
  let text = read(join(src, file));
  const once = (name, from, to) => {
    const count = typeof from === "string" ? text.split(from).length - 1 : (text.match(new RegExp(from.source, "g")) ?? []).length;
    if (count !== 1) fail(`${file}: "${name}" found its anchor ${count} times (expected once)`);
    text = text.replace(from, to);
  };
  // BASE_CSS, its interpolations held out while the rules are stripped.
  const head = "const BASE_CSS = `", at = text.indexOf(head);
  if (at < 0 || text.indexOf(head, at + 1) >= 0) fail(`${file}: expected exactly one BASE_CSS`);
  const bodyStart = at + head.length, { end, holes } = template(text, bodyStart, file);
  let body = "", cursor = bodyStart;
  holes.forEach(([s, e], n) => { body += text.slice(cursor, s) + HOLE + n + HOLE; cursor = e; });
  body += text.slice(cursor, end);
  const stripped = stripThirdParty(body).replace(new RegExp(HOLE + "(\\d+)" + HOLE, "g"), (_, n) => text.slice(...holes[Number(n)]));
  text = text.slice(0, bodyStart) + stripped + text.slice(end);

  const css = /\n {2}css: (.+?),?\n\};\s*$/.exec(text)?.[1];
  if (!css) fail(`${file}: no \`css:\` at the end of the style object`);
  once("the style object", /export const bichos: AvatarStyle = \{[\s\S]*\n\};\s*$/, `export const CSS = ${css};\n`);
  once("the lab's rows", /\/\*\* One lab row per part file[\s\S]*?\n\}\)\);\n\n/, "");
  once("the mascot frame, exported", "\nfunction renderMascot(", "\nexport function renderMascot(");
  once("the lab's header", /\/\* Bichos — a cartoon cast[\s\S]*?\*\/\n/, `/* GENERATED by scripts/sync-bichos.mjs from the avatar lab's styles/bichos.ts: do not edit.
 * What every figure shares: the mascot frame and the CSS (moods, sizes, shared groups), with the third-party mascots'
 * rules left out. The lab's seed-to-mascot lookup (its \`bichos\` style object) is left out too: a mascot is drawn only
 * when asked for by name (renderMascot), never because a seed spells one. src/styles/bichos.css is built from \`CSS\`. */
`);
  return text;
}

/* ---------- the run ---------- */

function listTs(dir) {
  return readdirSync(dir).filter((f) => f.endsWith(".ts")).sort();
}

async function main() {
  const src = args();
  for (const f of readdirSync(src).filter((f) => /\.(ts|css)$/.test(f))) {
    if (!ROOT_FILES.includes(f) && !LAB_ONLY_ROOT.includes(f)) console.warn(`sync-bichos: the lab has a new root file, ${f}: not copied (add it to ROOT_FILES or LAB_ONLY_ROOT)`);
  }
  const out = new Map(), sources = new Map();
  const take = (rel, how, transform = (t) => t) => {
    const text = read(join(src, rel));
    sources.set(rel, sha(text));
    out.set(rel, { text: transform(text, rel), how });
  };
  for (const f of ROOT_FILES) take(f, "verbatim");
  for (const f of listTs(join(src, "bichos"))) take(`bichos/${f}`, PATCHES[`bichos/${f}`] ? "patched" : "verbatim", (t, rel) => patch(rel, t));
  for (const f of listTs(join(src, "parts")).filter((f) => !EXCLUDED_PARTS.includes(f))) take(`parts/${f}`, PATCHES[`parts/${f}`] ? "patched" : "verbatim", (t, rel) => patch(rel, t));
  for (const rel of ["styles/mascots.ts", "styles/logos.ts", "styles/bichos.ts"]) sources.set(rel, sha(read(join(src, rel))));
  out.set("styles/mascots.ts", { text: mascotsModule(src), how: "generated" });
  out.set("styles/bichos.ts", { text: bichosModule(src), how: "generated" });

  for (const [rel, { text }] of out) {
    if (LOGO_CONSTANTS.test(text)) fail(`${rel}: carries a third-party logo mark`);
    if (/family:\s*"beyond"/.test(text)) fail(`${rel}: carries the Beyond batch`);
  }

  const rows = [...out].map(([rel, { how }]) => `| \`src/${rel}\` | \`${rel}\` | ${how} | ${sources.get(rel) ?? "—"} |`);
  out.set("README.md", {
    how: "generated",
    text: `# The bichos engine (vendored)

GENERATED by \`apps/web/scripts/sync-bichos.mjs\`: do not edit anything in this folder. Change the engine in the
avatar lab, then run, from the repo root:

    npm run sync:bichos -w @sidevoice/web -- --lab /path/to/avatar-lab

The run wipes this folder, writes it again from the lab and regenerates \`src/styles/bichos.css\`. A patch or an
extraction that no longer finds its anchor stops the run and names it: fix the anchor in the script.

The app talks to the engine only through \`features/avatar/\` (\`bicho-draw.ts\`, \`CharacterAvatar.tsx\`). Left in the lab:
\`main.ts\`, \`index.html\`, \`lab.css\`, \`i18n.ts\` (its stage words are keys in \`i18n/locales/\`),
\`styles/logos.ts\` and every mascot but Sidevoice's, \`parts/b16-beyond.ts\`, \`tools/\`, \`docs/\`.

| lab | here | how | lab sha256 |
|---|---|---|---|
${rows.join("\n")}
| \`src/styles/logos.ts\` | (into \`styles/mascots.ts\`: \`SIDEVOICE_24\` only) | generated | ${sources.get("styles/logos.ts")} |
`,
  });

  rmSync(DEST, { recursive: true, force: true });
  for (const [rel, { text }] of out) {
    mkdirSync(dirname(join(DEST, rel)), { recursive: true });
    writeFileSync(join(DEST, rel), text);
  }

  // The stylesheet is built by the app's own module from the engine just written (Vite loads the TypeScript).
  const { createServer } = await import("vite");
  const server = await createServer({ root: APP, configFile: false, logLevel: "error", appType: "custom", server: { middlewareMode: true, hmr: false } });
  try {
    const { bichosStylesheet } = await server.ssrLoadModule("/src/features/avatar/engine-stylesheet.ts");
    const sheet = bichosStylesheet();
    if (THIRD_PARTY_SELECTOR.test(sheet) || /@keyframes\s+(?:gk|pi|oc|cl|cp|cu|km|ol|lm|ds|mi|qw|ws)-/.test(sheet)) fail("styles/bichos.css: a third-party mascot rule survived");
    writeFileSync(STYLESHEET, sheet);
  } finally {
    await server.close();
  }
  console.log(`sync-bichos: ${out.size} files in src/features/avatar/engine, and src/styles/bichos.css`);
}

await main();
