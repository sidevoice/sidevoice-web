/* Only `src/host` names a host mechanism (sidevoice-desktop#289, architecture-v3.md §A.4): the object an app injects, what a
 * browser says of itself, the Media Session and the wake lock, and the microphone's stream. Everything else asks `host()`.
 *
 * One rule, `no-restricted-syntax`, and nothing else: this repository has no other lint. The patterns are the ones the code
 * has used, and `test/host-lint.test.cjs` holds a fixture for each: optional chaining, `window.` against `globalThis.`,
 * bracket access, destructuring and `in`. */
import tseslint from "typescript-eslint";

const INJECTED = "^__sidevoice(Host|Desktop)$";
const NAVIGATOR_FACTS = "userAgent|platform|userAgentData|mediaSession|wakeLock|audioSession";
// `navigator`, `nav` (a parameter that is one), and `<anything>.navigator` (`window.navigator`, `win.navigator`).
const NAVIGATOR = ":matches([object.name=/^(navigator|nav)$/], [object.property.name='navigator'], [object.property.value='navigator'])";
const NAVIGATOR_INIT = ":matches([init.name=/^(navigator|nav)$/], [init.property.name='navigator'])";
const NAVIGATOR_RIGHT = ":matches([right.name=/^(navigator|nav)$/], [right.property.name='navigator'])";

const INJECTED_MESSAGE = "Only src/host names the object an app injects (window.__sidevoiceHost, and the __sidevoiceDesktop it replaces): ask host() for the member you need.";
const NAVIGATOR_MESSAGE = "Only src/host reads what the browser says of itself or the Media Session and wake lock: ask host() (identity, presence).";
const MICROPHONE_MESSAGE = "Only src/host opens the microphone: ask host() (microphone, voice).";

export const restrictions = [
  // The global an app injects: as a name, as a string (bracket access, defineProperty, `in`), as a template.
  { selector: `Identifier[name=/${INJECTED}/]`, message: INJECTED_MESSAGE },
  { selector: `Literal[value=/${INJECTED}/]`, message: INJECTED_MESSAGE },
  { selector: `TemplateElement[value.cooked=/__sidevoice(Host|Desktop)/]`, message: INJECTED_MESSAGE },
  // What the browser says of itself, and the Media Session and wake lock: read, read with `?.`, read with brackets.
  { selector: `MemberExpression${NAVIGATOR}:matches([property.name=/^(${NAVIGATOR_FACTS})$/], [property.value=/^(${NAVIGATOR_FACTS})$/])`, message: NAVIGATOR_MESSAGE },
  { selector: `VariableDeclarator${NAVIGATOR_INIT} > ObjectPattern > Property:matches([key.name=/^(${NAVIGATOR_FACTS})$/], [key.value=/^(${NAVIGATOR_FACTS})$/])`, message: NAVIGATOR_MESSAGE },
  { selector: `BinaryExpression[operator='in']${NAVIGATOR_RIGHT}[left.value=/^(${NAVIGATOR_FACTS})$/]`, message: NAVIGATOR_MESSAGE },
  // The microphone's stream: opened by whatever holds `mediaDevices`.
  { selector: "MemberExpression:matches([property.name='getUserMedia'], [property.value='getUserMedia'])", message: MICROPHONE_MESSAGE },
  { selector: "VariableDeclarator > ObjectPattern > Property:matches([key.name='getUserMedia'], [key.value='getUserMedia'])", message: MICROPHONE_MESSAGE },
  { selector: "BinaryExpression[operator='in'][left.value='getUserMedia']", message: MICROPHONE_MESSAGE },
];

/** Where the rule applies: the web's source, but not the host itself, and not the tests, which stand in for an app. */
export const hostRules = [
  {
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    ignores: ["src/host/**", "**/*.test.{js,jsx,ts,tsx}", "**/*.test-util.{ts,tsx}"],
    // No inline switch-offs: there is no allowlist for the boundary (the call controls card included), and the
    // `eslint-disable` comments the code carries for a rule this repository does not run have nothing to say here.
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: "off" },
    languageOptions: { parser: tseslint.parser, sourceType: "module" },
    rules: { "no-restricted-syntax": ["error", ...restrictions] },
  },
];
