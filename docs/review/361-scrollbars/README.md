# Scrollbar visual review — #361

The conversation list uses a native scrollport. Cards previously ended at its client edge; classic scrollbar appearance also changed their width by 15px in Chromium. A stable gutter prevents the width jump. Inline padding separates cards and their shadows from overlay thumbs (which do not reserve a CSS gutter). The rail scrollport extends into its existing padding so classic scrollbars do not clip avatars.

The theme now leaves scrollbar colour to the browser and operating system. Code snippets also use the platform's default scrollbar thickness. There is no custom scrollbar renderer, OS detection, or z-index override.

## Decision for the operator

Recommend **Native platform appearance**. It follows the OS/browser's thumb, track, overlay preference and the page's light/dark color scheme. **Platform scrollbar with theme colours** preserves the previous thumb colour and transparent track, using the same spacing fix.

Compare both live in the playground's **VARIANTS → Scrollbars** panel (companion [playground PR #138](https://github.com/sidevoice/sidevoice-playground/pull/138)). Choose the web PR in the preview, use a long conversation list, expand the sidebar, and switch between light and dark. The options write `sidevoice.variants.scrollbars` (`native` or `themed`) and the page follows the storage event; no product preference is added. Once a choice is approved, the temporary variant can be removed.

## Evidence

Captured from the built web app in Playwright Chromium and WebKit on Linux with a selected conversation and the full-width list. The regression spec scrolls through the top, middle and bottom, selects a card and resizes through every width below. Chromium's default `--hide-scrollbars` flag is removed for these tests. WebKit uses overlay scrollbars, whose visibility is controlled by the engine.

Every viewport is 700px high. Screenshots include native appearance in both themes; `themed-*` shows the alternative at 1100px.

| Engine | Theme | Phone (390) | Compact overlay (700) | Desktop (1100) |
| --- | --- | --- | --- | --- |
| Chromium | Light | [Screenshot](chromium-light-390.jpg) | [Screenshot](chromium-light-700.jpg) | [Screenshot](chromium-light-1100.jpg) |
| Chromium | Dark | [Screenshot](chromium-dark-390.jpg) | [Screenshot](chromium-dark-700.jpg) | [Screenshot](chromium-dark-1100.jpg) |
| WebKit | Light | [Screenshot](webkit-light-390.jpg) | [Screenshot](webkit-light-700.jpg) | [Screenshot](webkit-light-1100.jpg) |
| WebKit | Dark | [Screenshot](webkit-dark-390.jpg) | [Screenshot](webkit-dark-700.jpg) | [Screenshot](webkit-dark-1100.jpg) |

Theme-coloured alternative: [Chromium light](chromium-themed-light.jpg), [Chromium dark](chromium-themed-dark.jpg), [WebKit light](webkit-themed-light.jpg), [WebKit dark](webkit-themed-dark.jpg).

## Verification

`npm run build`, `npm test`, and `npx playwright test -c apps/web/playwright.config.mjs scrollbars --workers 1`.

The browser regression covers 390, 700, 899, 900, 1100 and 1440px, both themes, card separation at three scroll positions, stable card width across the overflow threshold, live appearance switching and keyboard selection in an overflowing rail. The separation and width checks fail on the previous CSS. Additional test screenshots at the other widths are generated in the Playwright output directory.

These Linux engine checks do not certify the packaged macOS or Windows scrollbar theme. Review both options in the actual desktop shell before approving the appearance. No public product-information claim changes.
