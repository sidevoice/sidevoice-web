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
 * The key of a member or of a pattern's property is read as it is written out, whichever way a literal key can be written:
 * `.name`, `["name"]`, `` [`name`] `` (a template with nothing interpolated). That goes for `navigator` and `clientInformation`
 * (the same object under another name), for `identity` and what is read of it, and for the keys of a destructuring pattern,
 * nested ones included (`const { identity: { os } } = host()`).
 *
 * A third rule closes the last way to ask which system the page runs on (D-HOST-OS, sidevoice-desktop#289): the host has no `os`, so
 * nothing outside `src/host` reads one (`host().identity.os`, a destructured `os`) or imports anything shaped like one from
 * it (`HostOS`, `Platform`, `describeBrowser`, `isMac`). What a system decides about the page's words is answered by the host,
 * resolved: `microphone.help(language)`, `identity.shortcutModifier`, `identity.deviceName()`. A new platform touches its app.
 *
 * The `identity` it looks for is any one by that name (`x.identity.os`, `const { os } = identity`): the lint cannot tell the
 * host's from another object's, and a field of that name is the one to rename.
 *
 * Known limitations, which nothing here chases:
 *  - A name put together or fetched at run time: `Reflect.get(window, "navigator")`, `window["navi" + "gator"]`,
 *    `` window[`navi${"gator"}`] ``, `window[name]`, `eval`, `new Function`, and the same for the injected global's name.
 *  - The identity taken apart by an assignment rather than a declaration or a parameter: `({ os } = host().identity)`.
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
// `clientInformation` is the navigator under another name (`window.clientInformation === window.navigator`): held to the same rules.
const NAVIGATOR_NAMES = ["navigator", "clientInformation"];

/** A selector (for `:matches`) for a node whose key spells one of `names`, written out any way a literal key can be:
 *  `.name`, `["name"]`, `` [`name`] ``. `key` is the field that holds the key (`property` of a member, `key` of a pattern's
 *  property) and `owner` the path to the node that has it (`""`, or `"object."` for the object of a member). */
const named = (owner, key, names) => {
  const spelled = `/^(${names.join("|")})$/`;
  return [
    `[${owner}computed=false][${owner}${key}.name=${spelled}]`,
    `[${owner}${key}.value=${spelled}]`,
    `[${owner}computed=true][${owner}${key}.type='TemplateLiteral'][${owner}${key}.expressions.length=0][${owner}${key}.quasis.0.value.cooked=${spelled}]`,
  ].join(", ");
};
const OF_THOSE = `MemberExpression:matches(${named("", "property", [...NAVIGATOR_MEMBERS])})`;

const INJECTED_MESSAGE = "Only src/host names the object an app injects (window.__sidevoiceHost, and the __sidevoiceDesktop it replaces): ask host() for the member you need.";
const NAVIGATOR_MESSAGE = "Only src/host holds the browser's navigator (and clientInformation, which is the same object) beyond its clipboard, language, storage, devices and permissions: ask host() (identity, presence, microphone). It cannot be aliased, passed, destructured or tested with `in`.";
const MICROPHONE_MESSAGE = "Only src/host opens the microphone: ask host() (microphone, voice).";
const OS_MESSAGE = "Nothing outside src/host asks which system the page runs on: host() answers what a system decides, resolved (microphone.help(language), identity.shortcutModifier, identity.deviceName()). A new platform touches its app, not the web.";
const IMPORT_MESSAGE = "Only host() (src/host/index) and the host's types are imported from outside src/host; what is behind them is not.";

/** One read of one of the members above: `navigator.clipboard`, `navigator?.["storage"]`, ``navigator[`language`]``. */
function readOfAllowedMember(member, object) {
  if (member?.type !== "MemberExpression" || member.object !== object) return false;
  const { property, computed } = member;
  if (!computed) return NAVIGATOR_MEMBERS.has(property.name);
  if (property.type === "Literal") return NAVIGATOR_MEMBERS.has(property.value);
  return property.type === "TemplateLiteral" && property.expressions.length === 0 && NAVIGATOR_MEMBERS.has(property.quasis[0].value.cooked);
}

/** The global `navigator` or `clientInformation`, as a reference to the global: a binding of that name in the code (a parameter, a local) is not
 *  it, and a key called `navigator` is not a reference at all. It is only ever the object of one of the reads above;
 *  held, passed, returned, destructured, or tested with `typeof` or `in`, it is the host's. */
const navigatorRule = {
  meta: { type: "problem", schema: [], messages: { held: NAVIGATOR_MESSAGE } },
  create(context) {
    return {
      "Program:exit"(program) {
        for (const { identifier } of context.sourceCode.getScope(program).through) {
          if (NAVIGATOR_NAMES.includes(identifier.name) && !readOfAllowedMember(identifier.parent, identifier)) context.report({ node: identifier, messageId: "held" });
        }
      },
    };
  },
};

// A name shaped like a question about the system: imported from the host's index or its types, it is the ask the host no longer answers.
const OS_SHAPED = "^(?:.*(?:OS|Os|Platform|UserAgent)|describeBrowser|parseBrowser|isMac|isWindows|isLinux|isIos|isAndroid)$";
const OS_NAME = `/${OS_SHAPED}/`;
const OS_MEMBERS = ["os", "platform"];
// The host's two public doors, as a module path (the slash is \x2f, as below).
const PUBLIC_HOST = "(^|\\x2f)host(\\x2f(index|types)(\\.[jt]sx?)?)?$";

// What inside src/host may not be imported: everything but its index and its types (and, for the harness and the test
// helpers that stand in for an app, `testing`). The slash is \x2f so that the same text is a selector's regex.
const internal = (allowed) => `(^|\\x2f)host\\x2f(?!(${allowed})(\\.[jt]sx?)?$).+`;

const restrictions = (allowed) => [
  // The global an app injects: as a name, as a string (bracket access, defineProperty, `in`), as a template.
  { selector: `Identifier[name=/${INJECTED}/]`, message: INJECTED_MESSAGE },
  { selector: `Literal[value=/${INJECTED}/]`, message: INJECTED_MESSAGE },
  { selector: `TemplateElement[value.cooked=/__sidevoice(Host|Desktop)/]`, message: INJECTED_MESSAGE },
  // The navigator (or its alias `clientInformation`) held by an object (`window.navigator`, `globalThis["navigator"]`,
  // `` self[`clientInformation`] ``, a window handed in): only ever the object of a read of one of the members above.
  // The global itself is `host/navigator`.
  { selector: `MemberExpression:matches(${named("", "property", NAVIGATOR_NAMES)}):not(${OF_THOSE} > .object)`, message: NAVIGATOR_MESSAGE },
  { selector: `ObjectPattern > Property:matches(${named("", "key", NAVIGATOR_NAMES)})`, message: NAVIGATOR_MESSAGE },
  // The microphone's stream: opened by whatever holds `mediaDevices`.
  { selector: `MemberExpression:matches(${named("", "property", ["getUserMedia"])})`, message: MICROPHONE_MESSAGE },
  { selector: `ObjectPattern > Property:matches(${named("", "key", ["getUserMedia"])})`, message: MICROPHONE_MESSAGE },
  { selector: "BinaryExpression[operator='in'][left.value='getUserMedia']", message: MICROPHONE_MESSAGE },
  // The system the page runs on: `identity.os` (read, or taken out of the identity, flat or nested in the host's own
  // pattern: `const { identity: { os } } = host()`), and an OS-shaped name of the host's.
  { selector: `MemberExpression:matches(${named("", "property", OS_MEMBERS)}):matches([object.name='identity'], ${named("object.", "property", ["identity"])})`, message: OS_MESSAGE },
  { selector: `VariableDeclarator:matches([init.name='identity'], ${named("init.", "property", ["identity"])}) > ObjectPattern > Property:matches(${named("", "key", OS_MEMBERS)})`, message: OS_MESSAGE },
  { selector: `ObjectPattern > Property:matches(${named("", "key", ["identity"])}) ObjectPattern > Property:matches(${named("", "key", OS_MEMBERS)})`, message: OS_MESSAGE },
  { selector: `TSImportType[argument.literal.value=/${PUBLIC_HOST}/][qualifier.name=${OS_NAME}]`, message: OS_MESSAGE },
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
  "no-restricted-imports": ["error", { patterns: [
    { regex: internal(allowed), message: IMPORT_MESSAGE },
    { regex: PUBLIC_HOST, importNamePattern: OS_SHAPED, message: OS_MESSAGE },
  ] }],
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
