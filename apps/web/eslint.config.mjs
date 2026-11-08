import { hostRules } from "./lint/host-rules.mjs";

export default [{ ignores: ["dist/**", "test-results/**", "playwright-report/**"] }, ...hostRules];
