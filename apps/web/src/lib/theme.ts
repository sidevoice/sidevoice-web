/* Which theme the page wears: the person's choice (`light`, `dark`), else the system's, followed as it changes. The
 * tokens (styles/theme.css) read it from `data-theme` on the root. The choice is this device's (Settings → General),
 * applied at once. */
export type ThemePreference = "system" | "light" | "dark";

export const THEME_KEY = "sidevoice.appearance";

const query = () => globalThis.matchMedia?.("(prefers-color-scheme: dark)");

export function resolveTheme(preference: ThemePreference): "light" | "dark" {
  if (preference !== "system") return preference;
  return query()?.matches ? "dark" : "light";
}

/** Puts the theme on `root` and keeps it in step with the system; returns what stops that. */
export function applyTheme(preference: ThemePreference, root: HTMLElement = document.documentElement) {
  const set = () => root.setAttribute("data-theme", resolveTheme(preference));
  set();
  if (preference !== "system") return () => {};
  const media = query();
  media?.addEventListener("change", set);
  return () => media?.removeEventListener("change", set);
}

/** The person's choice on this device; the system's when there is none or it cannot be read. */
export function readThemePreference(): ThemePreference {
  try {
    const saved = globalThis.localStorage?.getItem(THEME_KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch { return "system"; }
}

let stopFollowing = () => {};
/** The page's own theme, from now on and on this device's next visits. */
export function setThemePreference(preference: ThemePreference) {
  stopFollowing();
  stopFollowing = applyTheme(preference);
  try {
    if (preference === "system") globalThis.localStorage?.removeItem(THEME_KEY);
    else globalThis.localStorage?.setItem(THEME_KEY, preference);
  } catch { /* Applied for this visit only. */ }
}

/** At start: the saved choice, or the system's. */
export function startPageTheme() {
  stopFollowing = applyTheme(readThemePreference());
}
