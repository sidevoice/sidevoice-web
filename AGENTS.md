# AGENTS.md

Rules for any coding agent (and person) working in this repository.

## Language of the code and of the product

- Code, identifiers, comments, commit messages and docs are in **English**.
- **Every user-facing text goes through i18n**: a key looked up in per-language message catalogues (one file per
  language), with **English as the fallback** when a key is missing. No literal sentence in any language in
  components, server refusals and errors shown to people, native UI (tray, windows, notifications, installer or CLI
  output meant for people). In the web, the catalogues are `apps/web/src/i18n/locales/<lang>.ts`: one flat key map
  per language plus its own name; every language is typed against English's keys, so adding a text means adding its
  key to every catalogue (the typecheck fails otherwise). A language is offered by adding its file: the list, the
  pickers and the tests find it (`i18n/translator.ts`). The core keeps its own language list for its messages.
- Language defaults: the device's system language when we support it, otherwise English. Never Spanish, or any
  other language, as a hard-coded default.
- What reaches the agent (MCP instructions, tool results, the `[Sidevoice]` trailer) is English; it is not UI.

## Hosts

The web runs in a browser or inside an app (the desktop app, later the mobile one), and asks for what the host offers
through `host()` (`apps/web/src/host`), never from the host directly. Only `src/host` names a host mechanism: the object an
app injects (`window.__sidevoiceHost`, and the `__sidevoiceDesktop` it replaces), the browser's `navigator` beyond its
clipboard, language, storage, devices and permissions (it cannot be aliased, passed or destructured: the user agent, the
platform, the Media Session, the wake lock), and the microphone's `getUserMedia`. And only `host()` (`src/host/index`) and
the host's types are imported from outside `src/host`, never what is behind them. `npm run lint` rejects all of it
anywhere else (CommonJS too, `require` and `import.meta.glob` included), and no comment switches it off; a test or the dev harness that stands in for an app injects through
`src/host/testing.ts`. A new thing a host can do is a new member of `Host` (`src/host/types.ts`), not a new check in a
component. The lint is a convention guard, not a sandbox: a name put together or fetched at run time
(`Reflect.get(window, "navigator")`, `window["navi" + "gator"]`, `eval`) is not caught, and neither is a `require` of a path
built at run time.

## Public product information

For changes to user-visible behavior, supported platforms/models, setup, security/privacy practices, availability, limitations, or release/download details, follow the shared [public-information process](https://github.com/sidevoice/landing/blob/main/AGENTS.md#keep-public-product-information-current). Record the landing change/PR or a linked `sidevoice/landing` issue in the PR checklist. Landing issues are the follow-up triage queue.
