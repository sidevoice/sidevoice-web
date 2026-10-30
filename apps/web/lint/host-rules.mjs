/* Only `src/host` names a host mechanism (sidevoice-desktop#289, architecture-v3.md §A.4): the object an app injects, what a
 * browser says of itself, the Media Session and the wake lock, and the microphone's stream. Everything else asks `host()`.
 * And only `host()` is how: what is inside `src/host` is not imported from outside it.
 *
 * Two core rules and nothing else: this repository has no other lint. The patterns are the ones the code has used, and
 * `test/host-lint.test.cjs` holds a fixture for each: optional chaining, `window.` against `globalThis.`, bracket access,
 * an alias, a destructuring, `in`, and every way of importing. */
import tseslint from "typescript-eslint";

const INJECTED = "^__sidevoice(Host|Desktop)$";

// The page reaches `navigator` only through these members, which are not a host's to give: the clipboard, the language the
// person reads in, the page's storage, devices and permissions (listed, not opened: `getUserMedia` is refused below), and
// the numbers the engine sizes models by. Anything else (the user agent, the platform, the Media Session, the wake lock, the
// audio session, and whatever a browser adds) is the host's, or is added here on purpose.
const NAVIGATOR_MEMBERS = "clipboard|language|languages|storage|mediaDevices|permissions|gpu|deviceMemory|hardwareConcurrency";
const OF_THOSE = `MemberExpression:matches([computed=false][property.name=/^(${NAVIGATOR_MEMBERS})$/], [computed=true][property.value=/^(${NAVIGATOR_MEMBERS})$/])`;

const INJECTED_MESSAGE = "Only src/host names the object an app injects (window.__sidevoiceHost, and the __sidevoiceDesktop it replaces): ask host() for the member you need.";
const NAVIGATOR_MESSAGE = "Only src/host holds the browser's navigator beyond its clipboard, language, storage, devices and permissions: ask host() (identity, presence, microphone). It cannot be aliased, passed, destructured or tested with `in`.";
const MICROPHONE_MESSAGE = "Only src/host opens the microphone: ask host() (microphone, voice).";
const IMPORT_MESSAGE = "Only host() (src/host/index) and the host's types are imported from outside src/host; what is behind them is not.";

// What inside src/host may not be imported: everything but its index and its types (and, for the harness and the test
// helpers that stand in for an app, `testing`).
const internal = (allowed) => `(^|\\x2f)host\\x2f(?!(${allowed})(\\.[jt]sx?)?$).+`;

const restrictions = (allowed) => [
  // The global an app injects: as a name, as a string (bracket access, defineProperty, `in`), as a template.
  { selector: `Identifier[name=/${INJECTED}/]`, message: INJECTED_MESSAGE },
  { selector: `Literal[value=/${INJECTED}/]`, message: INJECTED_MESSAGE },
  { selector: `TemplateElement[value.cooked=/__sidevoice(Host|Desktop)/]`, message: INJECTED_MESSAGE },
  // `navigator`, by the global or by any object that holds it (`window`, `globalThis`, `self`, a window handed in), read by dot,
  // `?.` or brackets: it is only ever the object of a read of one of the members above. Held, passed, destructured, tested
  // with `in`, or read for any other member, it is the host's.
  { selector: `Identifier[name='navigator']:not(MemberExpression > .property):not(${OF_THOSE} > .object)`, message: NAVIGATOR_MESSAGE },
  { selector: `MemberExpression:matches([computed=false][property.name='navigator'], [computed=true][property.value='navigator']):not(${OF_THOSE} > .object)`, message: NAVIGATOR_MESSAGE },
  { selector: `ObjectPattern > Property:matches([computed=false][key.name='navigator'], [key.value='navigator'])`, message: NAVIGATOR_MESSAGE },
  // The microphone's stream: opened by whatever holds `mediaDevices`.
  { selector: "MemberExpression:matches([property.name='getUserMedia'], [property.value='getUserMedia'])", message: MICROPHONE_MESSAGE },
  { selector: "ObjectPattern > Property:matches([key.name='getUserMedia'], [key.value='getUserMedia'])", message: MICROPHONE_MESSAGE },
  { selector: "BinaryExpression[operator='in'][left.value='getUserMedia']", message: MICROPHONE_MESSAGE },
  // Importing what is behind host(): a dynamic import, and a type that names the module (`import("../host/native").X`).
  // Static imports and re-exports are `no-restricted-imports`'.
  { selector: `ImportExpression[source.value=/${internal(allowed)}/]`, message: IMPORT_MESSAGE },
  { selector: `TSImportType Literal[value=/${internal(allowed)}/]`, message: IMPORT_MESSAGE },
];

const rules = (allowed) => ({
  "no-restricted-syntax": ["error", ...restrictions(allowed)],
  "no-restricted-imports": ["error", { patterns: [{ regex: internal(allowed), message: IMPORT_MESSAGE }] }],
});

const scope = {
  // No inline switch-offs: there is no allowlist for the boundary (the call controls card included), and the
  // `eslint-disable` comments the code carries for a rule this repository does not run have nothing to say here.
  linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: "off" },
  languageOptions: { parser: tseslint.parser, sourceType: "module" },
};

/** Where the rules apply: the web's source, but not the host itself, and not the tests, which stand in for an app. */
export const hostRules = [
  {
    ...scope,
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    ignores: ["src/host/**", "**/*.test.{js,jsx,ts,tsx}", "**/*.test-util.{ts,tsx}"],
    rules: rules("index|types"),
  },
  {
    // The dev harness and the helpers tests share inject an app through `host/testing`; nothing else of the host's inside.
    ...scope,
    files: ["src/journeys/**/*.{js,jsx,ts,tsx}", "src/test/**/*.{js,jsx,ts,tsx}"],
    ignores: ["**/*.test.{js,jsx,ts,tsx}", "**/*.test-util.{ts,tsx}"],
    rules: rules("index|types|testing"),
  },
];
