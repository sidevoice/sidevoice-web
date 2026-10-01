import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { en } from "./messages/en";
import { es } from "./messages/es";
import { pairingFailureKey } from "../features/hosts/PairWithCode";

/** Every literal key the new screens look up, from their source. */
function usedKeys(): string[] {
  const roots = ["features/onboarding", "features/hosts", "features/settings", "state/hosts"].map((dir) => join(__dirname, "..", dir));
  const files: string[] = [];
  const walk = (dir: string) => { for (const name of readdirSync(dir)) { const path = join(dir, name); if (statSync(path).isDirectory()) walk(path); else if (/\.tsx?$/.test(name) && !name.includes(".test.")) files.push(path); } };
  roots.forEach(walk);
  const keys = new Set<string>();
  for (const file of files) for (const match of readFileSync(file, "utf8").matchAll(/\bt\("([a-zA-Z0-9_.-]+)"|key: "([a-z][a-zA-Z]*\.[a-zA-Z0-9_.-]+)"/g)) keys.add(match[1] ?? match[2]);
  return [...keys].filter((key) => !key.endsWith("."));
}

describe("message bundles", () => {
  it("has every key the screens use in English, the fallback", () => {
    expect(usedKeys().filter((key) => !(key in en))).toEqual([]);
  });
  it("has the same keys in Spanish", () => {
    expect(Object.keys(en).filter((key) => !(key in es))).toEqual([]);
    expect(Object.keys(es).filter((key) => !(key in en))).toEqual([]);
  });
});

describe("pairing refusals in words", () => {
  it("recognises device-pairing.js's sentences and the host's 403", () => {
    expect(pairingFailureKey(new Error("Eso no es un código de emparejamiento de Sidevoice: empieza por «SV1.».")).key).toBe("pair.error.malformed");
    expect(pairingFailureKey(new Error("Este código ya caducó: duran 10 minutos. Pide uno nuevo.")).key).toBe("pair.error.expired");
    expect(pairingFailureKey(new Error("No se pudo llegar a «NUC»: ni directamente ni a través de la sala.")).key).toBe("pair.error.unreachable");
    expect(pairingFailureKey(new Error("La máquina que respondió no es la del código. No se ha guardado nada.")).key).toBe("pair.error.mismatch");
    expect(pairingFailureKey(new Error("Ese código no vale: no existe, ya se usó o ha caducado.")).key).toBe("pair.error.used");
    expect(pairingFailureKey(new Error("storage")).key).toBe("pair.error.storage");
  });
});
