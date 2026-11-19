/** A path on a paired machine: starts with one slash. The machine's token goes with it, so a path that could name another host
 *  (`//other`, `https://other`, a bare word joined to the base) is refused rather than sent. */
export function isHostPath(path: unknown): path is string {
  return typeof path === "string" && /^\/(?!\/)/.test(path);
}
