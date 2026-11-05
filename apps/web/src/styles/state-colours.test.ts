import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

/* Scheme E (the app redesign's state colours): one colour per agent state, the same on every surface, from one set of tokens
 * (styles/tokens.css `--sv-state-*`). A surface that wants a state's colour asks the token; a copy of its hex in another
 * stylesheet is the drift this guards (the floating card's speaking dot was once mustard and its listening one purple). */
const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sheets: Record<string, string> = Object.fromEntries(readdirSync(src, { recursive: true, encoding: "utf8" })
  .filter((file) => file.endsWith(".css")).map((file) => ["/" + file.split(path.sep).join("/"), readFileSync(path.join(src, file), "utf8")]));
/** A stylesheet of src by its file name. */
const sheet = (name: string) => Object.entries(sheets).find(([file]) => file.endsWith("/" + name))![1];
const tokens = sheet("tokens.css");
const others = Object.entries(sheets).filter(([file]) => !file.endsWith("/tokens.css"));

const TOKENS = ["listening", "speaking", "working", "attention", "muted", "idle", "offline"];

test("the seven state tokens are defined once, in light and the dark theme's lighter mixes, and nowhere else", () => {
  for (const name of TOKENS) {
    expect(tokens, name).toMatch(new RegExp("--sv-state-" + name + ": #[0-9a-f]{6};"));
    for (const [file, css] of others) expect(css, file + " " + name).not.toMatch(new RegExp("--sv-state-" + name + "\\s*:"));
  }
  expect(tokens).toContain("--sv-state-listening: #2fb67c;");
  expect(tokens).toContain("--sv-state-speaking: #3d8bfd;");
  expect(tokens).toContain("--sv-state-working: #6b4fd8;");
  expect(tokens).toContain("--sv-state-attention: #e0a82e;");
  expect(tokens).toContain("--sv-state-muted: #e5484d;");
  expect(tokens).toContain("--sv-state-idle: #b9b3c4;");
  expect(tokens).toContain("--sv-state-offline: #8a8594;");
  const dark = tokens.slice(tokens.indexOf('[data-theme="dark"]'));
  for (const name of ["listening", "speaking", "working", "attention", "muted"]) expect(dark, name).toContain("--sv-state-" + name + ":");
});

test("no other stylesheet spells a state's hex: they ask the token", () => {
  const hexes = [...tokens.matchAll(/--sv-state-[a-z]+: (#[0-9a-f]{6});/g)].map((match) => match[1]);
  expect(hexes).toHaveLength(12);
  // The one that is also the brand's: needs-you's mustard is the brand's other voice (`--sv-voice`, theme.css), which names it itself.
  // And the transcript's own violet, the design reference's ink for a read receipt and its "new" dot, which is not a state.
  const brand = /--sv-voice: #e0a82e;|var\(--sv-voice, #e0a82e\)|--tr-accent: #6b4fd8;|--tr-jump-dot: #6b4fd8;/g;
  for (const [file, css] of others) for (const hex of hexes) expect(css.toLowerCase().replace(brand, ""), file + " " + hex).not.toContain(hex);
});

/** The declarations of the rules whose selector contains `selector`. */
function rules(css: string, selector: string): string[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((match) => match[1].includes(selector)).map((match) => match[2]);
}

test("the words of a state are never tinted: only its dot or icon wears the colour", () => {
  const card = sheet("call-card.css"), view = sheet("call-view.css"), room = sheet("room.css");
  const tinted = /(^|[;\s])color:\s*var\(--sv-(state|warning|danger|positive|voice)/;
  // The floating card's state line and the stage's can't-receive chip say it in the ink; the dot, the icon and a wash carry the colour.
  for (const declarations of [...rules(card, ".card-state"), ...rules(view, ".stage-holding"), ...rules(view, ".call-details-holding")]) expect(declarations).not.toMatch(tinted);
  // The conversation list's lines, as the sidebar's own comment says.
  for (const declarations of [...rules(room, ".person-sub"), ...rules(room, ".sidebar-state-text"), ...rules(room, ".person-name")]) expect(declarations).not.toMatch(tinted);
});

test("the floating card's state dot is the idle grey and every other state is an icon of its colour", () => {
  const card = sheet("call-card.css");
  expect(rules(card, ".card-state i").join(" ")).toContain("var(--sv-state-idle)");
  expect(card).not.toMatch(/\.card-state\[data-mood=(listening|speaking|working|holding|muted)\] i/);
});
