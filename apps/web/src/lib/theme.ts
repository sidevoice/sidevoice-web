/* Which theme the page wears: the person's choice (`light`, `dark`), else the system's, followed as it changes. The
 * tokens (styles/theme.css) read it from `data-theme` on the root. */
export type ThemePreference = "system" | "light" | "dark";

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
