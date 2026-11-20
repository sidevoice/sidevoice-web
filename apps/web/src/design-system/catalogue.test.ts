import { expect, test } from "vitest";

/* The catalogue (Storybook, `npm run catalogue`) is only worth anything if it holds every shared component (web#530): a
 * component of components/ui that no story imports fails here. A story imports it by name (`import { Badge } from
 * "./Badge"`), or a whole module (`import * as Icons from …/Icons`, the foundations' icon set). The few left out say why. */

const sources = import.meta.glob<string>("../components/ui/*.tsx", { query: "?raw", import: "default", eager: true });
const stories = import.meta.glob<string>("../**/*.stories.tsx", { query: "?raw", import: "default", eager: true });

const NOT_IN_THE_CATALOGUE: Record<string, string> = {
  TooltipProvider: "a context: the catalogue's preview wraps every story in it",
  OverlayPortalProvider: "a context for where overlays draw, used by Dialog itself",
  DialogFrame: "dead code with no product use; web#530 removes it",
};

const moduleName = (path: string) => path.replace(/^.*\//, "").replace(/\.tsx$/, "");
const isComponent = (path: string) => !/\.(test|stories)\.tsx$/.test(path);

function exportedComponents(source: string) {
  return [...source.matchAll(/^export (?:const|function) ([A-Z]\w*)/gm)].map((match) => match[1])
    // Components, not constants (COPY_FEEDBACK_MS) or types.
    .filter((name) => /[a-z]/.test(name));
}

/** What the stories import from components/ui, by module: the names, or every name for a namespace import. */
function imported() {
  const names = new Set<string>();
  const whole = new Set<string>();
  for (const source of Object.values(stories)) {
    for (const match of source.matchAll(/import\s+(\*\s+as\s+\w+|\{[^}]*\})\s+from\s+"([^"]+)"/g)) {
      const [, what, from] = match;
      if (!/(^\.\/|components\/ui\/)/.test(from)) continue;
      if (what.startsWith("*")) whole.add(from.replace(/^.*\//, ""));
      else for (const name of what.slice(1, -1).split(",")) names.add(name.replace(/^\s*type\s+/, "").split(/\s+as\s+/)[0].trim());
    }
  }
  return { names, whole };
}

test("every shared component has a story in the catalogue", () => {
  const { names, whole } = imported();
  const missing = Object.entries(sources).filter(([path]) => isComponent(path)).flatMap(([path, source]) =>
    whole.has(moduleName(path)) ? [] : exportedComponents(source).filter((name) => !names.has(name) && !(name in NOT_IN_THE_CATALOGUE)).map((name) => `${moduleName(path)}.${name}`));
  expect(missing, "components/ui exports that no story renders: add a story, or list why not").toEqual([]);
});

test("what is left out of the catalogue still exists", () => {
  const all = new Set(Object.entries(sources).filter(([path]) => isComponent(path)).flatMap(([, source]) => exportedComponents(source)));
  expect(Object.keys(NOT_IN_THE_CATALOGUE).filter((name) => !all.has(name))).toEqual([]);
});
