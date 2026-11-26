import { useEffect, useState } from "react";

/* The design tokens as the stylesheets declare them, read from the page itself: every `--sv-*` custom property set on
 * the root or on a theme (`:root`, `[data-theme…]`). The catalogue lists what is there, so a token added or removed in
 * theme.css or tokens.css shows here without anyone keeping a second list. */
export function declaredTokens(): string[] {
  const names = new Set<string>();
  const visit = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule && /:root|\[data-theme/.test(rule.selectorText)) {
        for (const property of Array.from(rule.style)) if (property.startsWith("--sv-")) names.add(property);
      } else if ("cssRules" in rule && (rule as CSSGroupingRule).cssRules) visit((rule as CSSGroupingRule).cssRules);
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try { visit(sheet.cssRules); } catch { /* A stylesheet from another origin cannot be read. */ }
  }
  return [...names].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}

/** The tokens whose name matches `pattern`; read once the stylesheets are in. */
export function useTokens(pattern: RegExp): string[] {
  const [tokens, setTokens] = useState<string[]>([]);
  // By its source: a pattern written inline is a new object on every render.
  const source = pattern.source;
  useEffect(() => {
    const match = new RegExp(source);
    const found = declaredTokens().filter((name) => match.test(name));
    setTokens((was) => (was.join() === found.join() ? was : found));
  }, [source]);
  return tokens;
}

/** A token's value where `element` sits (its theme): what the token resolves to there. */
export function valueAt(element: Element | null, token: string) {
  return element ? getComputedStyle(element).getPropertyValue(token).trim() : "";
}

export const isColour = (value: string) => value !== "" && CSS.supports("color", value) && !/^-?[\d.]+(px|rem|em|ms|s|%)?$/.test(value);
