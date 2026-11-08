/* The engine writes its CSS the lab's way: rules nested inside the avatar's root (`&` is the root, a bare selector is
 * inside it) with @keyframes among them. The app's stylesheets are plain global files, so this turns that into flat
 * CSS under one root selector, keyframes hoisted to the top level. No browser has to understand nesting. */

interface Block { prelude: string; body: string }
type Item = { kind: "comment"; text: string } | ({ kind: "block" } & Block);

/** Index of the `}` matching the `{` at `open`, past quotes and comments. */
function closing(css: string, open: number): number {
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    const c = css[i];
    if (c === "/" && css[i + 1] === "*") { i = css.indexOf("*/", i + 2) + 1; if (i <= 0) break; continue; }
    if (c === '"' || c === "'") { i = css.indexOf(c, i + 1); if (i < 0) break; continue; }
    if (c === "{") depth += 1;
    else if (c === "}" && (depth -= 1) === 0) return i;
  }
  throw new Error(`[bichos] unbalanced CSS near "${css.slice(open, open + 60)}"`);
}

/** A block's contents: its own declarations, and the comments and blocks nested in it, in order. */
function parse(css: string): { decls: string[]; items: Item[] } {
  const decls: string[] = [], items: Item[] = [];
  let buffer = "";
  for (let i = 0; i < css.length; i += 1) {
    const c = css[i];
    if (c === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      if (end < 0) throw new Error("[bichos] unclosed CSS comment");
      if (!buffer.trim()) items.push({ kind: "comment", text: css.slice(i, end + 2) });
      i = end + 1;
      continue;
    }
    if (c === '"' || c === "'") {
      const end = css.indexOf(c, i + 1);
      buffer += css.slice(i, end + 1);
      i = end;
      continue;
    }
    if (c === ";") { if (buffer.trim()) decls.push(buffer.trim()); buffer = ""; continue; }
    if (c === "{") {
      const end = closing(css, i);
      items.push({ kind: "block", prelude: buffer.trim().replace(/\s+/g, " "), body: css.slice(i + 1, end) });
      buffer = "";
      i = end;
      continue;
    }
    buffer += c;
  }
  if (buffer.trim()) decls.push(buffer.trim());
  return { decls, items };
}

/** Selectors split at the commas that separate them (not those inside :is(), :not()...). */
export function splitSelectors(prelude: string): string[] {
  const out: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < prelude.length; i += 1) {
    if (prelude[i] === "(") depth += 1;
    else if (prelude[i] === ")") depth -= 1;
    else if (prelude[i] === "," && depth === 0) { out.push(prelude.slice(start, i)); start = i + 1; }
  }
  out.push(prelude.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
}

/** A nested rule's selectors against its parents': `&` is the parent, a bare selector is a descendant of it. */
function resolve(prelude: string, parents: string[]): string[] {
  return parents.flatMap((parent) => splitSelectors(prelude).map((s) => (s.includes("&") ? s.replaceAll("&", parent) : `${parent} ${s}`)));
}

const squash = (text: string) => text.replace(/\s+/g, " ").trim();

function flatten(css: string, parents: string[], rules: string[], keyframes: string[], keepComments: boolean) {
  const { decls, items } = parse(css);
  if (decls.length) rules.push(`${parents.join(",\n")} { ${decls.join("; ")} }`);
  for (const item of items) {
    if (item.kind === "comment") { if (keepComments) rules.push(item.text.replace(/\n\s*/g, "\n   ")); continue; }
    if (/^@(-webkit-)?keyframes\b/.test(item.prelude)) { keyframes.push(`${item.prelude} { ${squash(item.body)} }`); continue; }
    if (item.prelude.startsWith("@")) {
      const inner: string[] = [];
      flatten(item.body, parents, inner, keyframes, false);
      if (inner.length) rules.push(`${item.prelude} {\n${inner.map((r) => "  " + r).join("\n")}\n}`);
      continue;
    }
    flatten(item.body, resolve(item.prelude, parents), rules, keyframes, false);
  }
}

/** Nested CSS whose root is `scope` (the lab's `.av[data-style=bichos] { … }` body) as flat CSS: the rules, then the
 *  keyframes. Comments at the root's level are kept, for whoever reads the output. */
export function scopeCss(css: string, scope: string): string {
  const rules: string[] = [], keyframes: string[] = [];
  flatten(css, [scope], rules, keyframes, true);
  return [...rules, ...keyframes].join("\n") + "\n";
}
