import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "vitest";
import { avatarFor, PERSON_AVATAR, SIDEVOICE_MASCOT } from "./avatar-spec";
import { avatarColor, drawAvatar, engineSize, withOwnIds } from "./bicho-draw";
import { BATCHES, FAMILIES, MEMBERS, PREFIXES } from "./engine/bichos/registry";
import { HARNESSES, mascot } from "./engine/styles/mascots";

const ids = (html: string) => [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const refs = (html: string) => [...html.matchAll(/url\(#([^)]+)\)/g)].map((match) => match[1]);

test("every copy of a drawing has ids of its own, and refers only to its own", () => {
  const a = drawAvatar(avatarFor("t-login"), "small"), b = drawAvatar(avatarFor("t-login"), "small");
  expect(ids(a.html).length).toBeGreaterThan(0);
  expect(ids(a.html).filter((id) => ids(b.html).includes(id))).toEqual([]);
  for (const copy of [a, b]) expect(refs(copy.html).every((ref) => ids(copy.html).includes(ref))).toBe(true);
  // Otherwise they are the same drawing.
  const plain = (html: string) => html.replace(/\b(id="|url\(#)c[0-9a-z]+-/g, "$1");
  expect(plain(a.html)).toBe(plain(b.html));
  expect(withOwnIds('<path id="x" fill="url(#x)"/><use href="#x"/>')).toMatch(/^<path id="(c[0-9a-z]+-)x" fill="url\(#\1x\)"\/><use href="#\1x"\/>$/);
});

test("a conversation's bicho is the same drawing on every device; its tone tints what is behind it", () => {
  const drawing = drawAvatar(avatarFor("7f3c2a91-thread"), "stage");
  expect(drawing.html.startsWith("<svg viewBox=\"0 0 120 120\"")).toBe(true);
  expect(drawing.html).toContain('data-kind="round"');
  expect(drawing.tone).toBe(avatarColor(avatarFor("7f3c2a91-thread")));
  expect(drawing.tone).toMatch(/^#[0-9a-f]{6}$/);
  // A bicho with free hands can take any working style; a small one draws only each style's big cue.
  expect(drawing.works).toEqual(expect.arrayContaining(["crank", "read", "type"]));
  // Resting, it goes in idle steps: quiet, and the pastimes that suit it.
  expect(drawing.idles).toEqual(expect.arrayContaining(["quiet", "bubbles", "music", "stretch", "nap"]));
  expect(engineSize("stage")).toBe("stage");
  expect(engineSize("small")).toBe("sidebar");
  expect(engineSize("pip")).toBe("sidebar");
});

/** Where in the drawing the body's gloss stroke and each arm's group start, from the figure's fills on. */
function paintOrder(seed: string) {
  const html = drawAvatar(avatarFor(seed), "stage").html;
  const fills = html.slice(html.indexOf('<g class="fills">'));
  return { gloss: fills.indexOf('class="shine"'), left: fills.indexOf('class="pg-arm-l"'), right: fills.indexOf('class="pg-arm-r"') };
}

test("a robot's arm is painted over the body's gloss, so the highlight is never drawn across it, at rest or swinging", () => {
  // The robots' highlights run where the arms join (a can's down its side, a tv's round its corner): their bodies, with
  // any arms, and the clamp arm on any body, take the gloss under them.
  const robots = [...["can", "tv", "orb", "stack", "domehead"].flatMap((body) => ["bot", "nubs"].map((arms) => [body, arms])),
    ...["box", "pill", "dome", "wide"].map((body) => [body, "bot"])];
  for (const [body, arms] of robots) {
    const { gloss, left, right } = paintOrder(`bicho:bots/robot:t?body=${body}&arms=${arms}`);
    expect(gloss, `${body} ${arms}`).toBeGreaterThan(-1);
    expect(left, `${body} ${arms}`).toBeGreaterThan(gloss);
    expect(right, `${body} ${arms}`).toBeGreaterThan(gloss);
  }
  // Every other bicho keeps its gloss on top of its arms, as it always was.
  const { gloss, left, right } = paintOrder("7f3c2a91-thread");
  expect(left).toBeGreaterThan(-1);
  expect(gloss).toBeGreaterThan(Math.max(left, right));
});

test("the person is a bicho too, and keeps the old sleep: no working style, no pastime", () => {
  const drawing = drawAvatar(PERSON_AVATAR, "pip");
  expect(drawing.html).toContain('data-kind="round"');
  expect(drawing.works).toEqual([]);
  expect(drawing.idles).toEqual([]);
});

test("only the Sidevoice mascot ships, and only by name: a seed that spells a harness is a bicho", () => {
  expect([...HARNESSES]).toEqual(["sidevoice"]);
  expect(() => mascot("claude" as never, "x")).toThrow();
  const sidevoice = drawAvatar(SIDEVOICE_MASCOT, "stage");
  expect(sidevoice.html).toContain('data-kind="sidevoice"');
  expect(sidevoice.html).toContain("data-logo");
  expect(sidevoice.works).toEqual([]);
  for (const seed of ["sidevoice", "claude", "clawd", "openclaw", "codex", "gemini", "copilot", "cursor", "cline", "ollama", "harness:claude", "Claude", "v3:a1", "monstruo:x"]) {
    const drawing = drawAvatar(avatarFor(seed), "small");
    expect(drawing.html, seed).not.toContain("data-logo");
    expect(drawing.html, seed).not.toContain(`data-kind="${seed}"`);
  }
});

test("nothing of the lab's third-party mascots, its Beyond batch or its frozen rollers is in the app", () => {
  const engine = resolve(process.cwd(), "src/features/avatar/engine");
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]);
  const sources = files(engine).filter((file) => file.endsWith(".ts"));
  expect(sources.map((file) => file.slice(engine.length + 1))).not.toContain("styles/logos.ts");
  expect(sources.some((file) => /b16-beyond/.test(file))).toBe(false);
  for (const file of sources) {
    const text = readFileSync(file, "utf8");
    expect(text, file).not.toMatch(/\b(?:CLAUDE|GEMINI|OPENAI|OPENCLAW|XAI|OPENCODE|KIMI|OLLAMA|LMSTUDIO|CURSOR|COPILOT|DEEPSEEK|MISTRAL|QWEN|WINDSURF|CLINE)_(?:24|100)\b/);
    expect(text, file).not.toMatch(/\bfunction (?:clawd|claude|grok|pi|opencode|cline|copilot|cursor|kimi|ollama|lmstudio|deepseek|mistral|qwen|windsurf)\(/);
  }
  const stylesheet = readFileSync(resolve(process.cwd(), "src/styles/bichos.css"), "utf8");
  expect(stylesheet).not.toMatch(/\.pg-(?:rays|star|wheel)\b|\.pg-(?:gk|pi|oc|cl|cp|cu|km|ol|lm|ds|mi|qw|ws)-/);
  expect(FAMILIES.map((family) => family.id)).not.toContain("beyond");
  expect(MEMBERS.some((member) => member.family === "beyond" || /b16/.test(member.file))).toBe(false);
  expect(BATCHES.some((batch) => /b16/.test(batch.file))).toBe(false);
  expect([...PREFIXES.keys()]).toEqual([]);
});
