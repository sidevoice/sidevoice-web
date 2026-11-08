import { vi } from "vitest";

/** A phone's header row of conversations this wide, as header-row.ts measures it: a test's DOM lays nothing out. */
export function headerRowWidth(width: number) {
  const real = Object.getOwnPropertyDescriptor(Element.prototype, "clientWidth")!;
  return vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
    return this.classList.contains("header-conversations") ? width : real.get!.call(this);
  });
}
