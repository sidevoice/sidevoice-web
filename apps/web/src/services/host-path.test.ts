import { expect, test } from "vitest";
import { isHostPath } from "./host-path";

test("only a path under the machine itself may carry its token", () => {
  for (const path of ["/api/logs", "/api/logs?limit=10", "/"]) expect(isHostPath(path)).toBe(true);
  for (const path of ["//other.example/api", "https://other.example/api", "@other.example", ".other.example", "api/logs", "", undefined, 5]) expect(isHostPath(path)).toBe(false);
});
