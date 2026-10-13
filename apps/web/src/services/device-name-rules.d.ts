export const MAX_DEVICE_NAME: number;
export function normalizeDeviceName(text: unknown): string;
export function clampDeviceName(text: unknown, max?: number): string;
export function deviceNameProblem(text: unknown): "empty" | "tooLong" | "invalid" | null;
