/* Only `src/host` names a host mechanism (sidevoice-desktop#289, architecture-v3.md §A.4): the object an app injects, what a
 * browser says of itself, the Media Session and the wake lock, and the microphone's stream. Everything else asks `host()`.
 * And only `host()` is how: what is inside `src/host` is not imported from outside it.
 *
 * This is a convention guard, not a sandbox: it closes the holes that code written in good faith falls into, and does not
 * chase the ones that need intent. Two core rules, one small rule of its own (the navigator, below), and nothing else: this
 * repository has no other lint. The patterns are the ones the code has used, and `test/host-lint.test.cjs` holds a fixture
 * for each: optional chaining, `window.` against `globalThis.`, bracket access, an alias, a destructuring, `in`, and every
 * way of importing (`import`, `export ... from`, `import()`, `require()`, `import.meta.glob()`, `import()` types).
 *
 * Known limitations, which nothing here chases:
 *  - A name put together or fetched at run time: `Reflect.get(window, "navigator")`, `window["navi" + "gator"]`,
 *    `window[name]`, `eval`, `new Function`, and the same for the injected global's name.
 *  - A `require` or a glob of a path put together at run time.
 */
import tseslint from "typescript-eslint";

const INJECTED = "^__sidevoice(Host|Desktop)$";

// The page reaches `navigator` only through these members, which the design's §A.4 does not give to the host: the clipboard,
// the language the person reads in, the page's storage, devices and permissions (listed and asked about, not opened:
// `getUserMedia` is refused below), and the numbers the engine sizes models by. Anything else (the user agent, the platform,
// the Media Session, the wake lock, the audio session, and whatever a browser adds) is the host's, or is added here on purpose.
// `mediaDevices` and `permissions` are on the list because §A.4 bans only `getUserMedia`; whether they are the host's in
// intent is the plan's open decision on the microphone (sidevoice-web#405, #410).
const NAVIGATOR_MEMBERS = new Set(["clipboard", "language", "languages", "storage", "mediaDevices", "permissions", "gpu", "deviceMemory", "hardwareConcurrency"]);
const MEMBERS_SOURCE = [...NAVIGATOR_MEMBERS].join("|");
const OF_THOSE = `MemberExpression:matches([computed=false][property.name=/^(${MEMBERS_SOURCE})$/], [computed=true][property.value=/^(${MEMBERS_SOURCE})$/])`;

const INJECTED_MESSAGE = "Only src/host names the object an app injects (window.__sidevoiceHost, and the __sidevoiceDesktop it replaces): ask host() for the member you need.";
const NAVIGATOR_MESSAGE = "Only src/host holds the browser's navigator beyond its clipboard, language, storage, devices and permissions: ask host() (identity, presence, microphone). It cannot be aliased, passed, destructured or tested with `in`.";
const MICROPHONE_MESSAGE = "Only src/host opens the microphone: ask host() (microphone, voice).";
const IMPORT_MESSAGE = "Only host() (src/host/index) and the host's types are imported from outside src/host; what is behind them is not.";

/** One read of one of the members above: `navigator.clipboard`, `navigator?.["storage"]`. */
function readOfAllowedMember(member, object) {
  if (member?.type !== "MemberExpression" || member.object !== object) return false;
  const { property, computed } = member;
  return computed ? property.type === "Literal" && NAVIGATOR_MEMBERS.has(property.value) : NAVIGATOR_MEMBERS.has(property.name);
}

/** The global `navigator`, as a reference to the global: a binding of that name in the code (a parameter, a local) is not
 *  it, and a key called `navigator` is not a reference at all. It is only ever the object of one of the reads above;
 *  held, passed, returned, destructured, or tested with `typeof` or `in`, it is the host's. */
const navigatorRule = {
  meta: { type: "problem", schema: [], messages: { held: NAVIGATOR_MESSAGE } },
  create(context) {
    return {
      "Program:exit"(program) {
        for (const { identifier } of context.sourceCode.getScope(program).through) {
          if (identifier.name === "navigator" && !readOfAllowedMember(identifier.parent, identifier)) context.report({ node: identifier, messageId: "held" });
        }
      },
    };
  },
};

// What inside src/host may not be imported: everything but its index and its types (and, for the harness and the test
// helpers that stand in for an app, `testing`). The slash is \x2f so that the same text is a selector's regex.
const internal = (allowed) => `(^|\\x2f)host\\x2f(?!(${allowed})(\\.[jt]sx?)?$).+`;

const restrictions = (allowed) => [
  // The global an app injects: as a name, as a string (bracket access, defineProperty, `in`), as a template.
  { selector: `Identifier[name=/${INJECTED}/]`, message: INJECTED_MESSAGE },
  { selector: `Literal[value=/${INJECTED}/]`, message: INJECTED_MESSAGE },
  { selector: `TemplateElement[value.cooked=/__sidevoice(Host|Desktop)/]`, message: INJECTED_MESSAGE },
  // The navigator held by an object (`window.navigator`, `globalThis["navigator"]`, `self.navigator`, a window handed in):
  // only ever the object of a read of one of the members above. The global itself is `host/navigator`.
  { selector: `MemberExpression:matches([computed=false][property.name='navigator'], [computed=true][property.value='navigator']):not(${OF_THOSE} > .object)`, message: NAVIGATOR_MESSAGE },
  { selector: `ObjectPattern > Property:matches([computed=false][key.name='navigator'], [key.value='navigator'])`, message: NAVIGATOR_MESSAGE },
  // The microphone's stream: opened by whatever holds `mediaDevices`.
  { selector: "MemberExpression:matches([property.name='getUserMedia'], [property.value='getUserMedia'])", message: MICROPHONE_MESSAGE },
  { selector: "ObjectPattern > Property:matches([key.name='getUserMedia'], [key.value='getUserMedia'])", message: MICROPHONE_MESSAGE },
  { selector: "BinaryExpression[operator='in'][left.value='getUserMedia']", message: MICROPHONE_MESSAGE },
  // Importing what is behind host(): a dynamic import, `require`, a glob, and a type that names the module
  // (`import("../host/native").X`). Static imports and re-exports are `no-restricted-imports`'.
  { selector: `ImportExpression[source.value=/${internal(allowed)}/]`, message: IMPORT_MESSAGE },
  { selector: `CallExpression[callee.name='require'] > Literal[value=/${internal(allowed)}/]`, message: IMPORT_MESSAGE },
  { selector: `CallExpression[callee.object.type='MetaProperty'][callee.property.name=/^glob(Eager)?$/] Literal[value=/${internal(allowed)}/]`, message: IMPORT_MESSAGE },
  { selector: `TSImportType Literal[value=/${internal(allowed)}/]`, message: IMPORT_MESSAGE },
];

const rules = (allowed) => ({
  "host/navigator": "error",
  "no-restricted-syntax": ["error", ...restrictions(allowed)],
  "no-restricted-imports": ["error", { patterns: [{ regex: internal(allowed), message: IMPORT_MESSAGE }] }],
});

const scope = {
  // No inline switch-offs: there is no allowlist for the boundary (the call controls card included), and the
  // `eslint-disable` comments the code carries for a rule this repository does not run have nothing to say here.
  linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: "off" },
  languageOptions: { parser: tseslint.parser },
  plugins: { host: { rules: { navigator: navigatorRule } } },
};

const SOURCE = "{js,jsx,ts,tsx,cjs,mjs}";
const TESTS = [`**/*.test.${SOURCE}`, "**/*.test-util.{ts,tsx}"];

/** Where the rules apply: the web's source, but not the host itself, and not the tests, which stand in for an app. */
export const hostRules = [
  {
    ...scope,
    files: [`src/**/*.${SOURCE}`],
    ignores: ["src/host/**", ...TESTS],
    rules: rules("index|types"),
  },
  {
    // The dev harness and the helpers tests share inject an app through `host/testing`; nothing else of the host's inside.
    ...scope,
    files: [`src/journeys/**/*.${SOURCE}`, `src/test/**/*.${SOURCE}`],
    ignores: TESTS,
    rules: rules("index|types|testing"),
  },
];
