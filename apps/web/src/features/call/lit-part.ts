/** What a LitText has lit, and what it still has to say: the text is drawn whole and the lit end is its `data-spoken` (tests). */
export function litPart(root: ParentNode): { played: string; upcoming: string } {
  const node = root.querySelector(".lit-text");
  const all = node?.querySelector(".lit-base")?.textContent ?? "";
  const n = Number(node?.getAttribute("data-spoken") ?? 0);
  return { played: all.slice(0, n), upcoming: all.slice(n) };
}
