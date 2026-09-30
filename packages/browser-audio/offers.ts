/* The resolver: which models a place can run, each on its best build, with the others ranked behind it
 * (rubasace/sidevoice#124 §4). This page computes "Este dispositivo" with it; a host computes "En el host"
 * with sidevoice-core's reference (`sidevoice_core/models/offers.py`), and the desktop app's Rust does the same.
 * The three pass the core's shared vectors (models.vectors.json, a copy like models.json): change the rules
 * there first. A pure function; nothing here detects capabilities or loads anything. */

export type Runs = "native" | "page";
export type Task = "stt" | "tts";

export interface Download {
  url: string;
  sha256: string;
  size: number;
}

export interface Package {
  os: string;
  /** Absent only on a `bundled` package, which ships inside the app for every architecture of its OS. */
  arch?: string;
  requires?: string[];
  /** Best first. */
  accelerators: string[];
  bundled?: boolean;
  download?: Download;
}

export interface Engine {
  id: string;
  runs: Runs;
  families: string[];
  formats: string[];
  /** A page engine's accelerators, best first; a native engine lists them per package. */
  accelerators?: string[];
  packages?: Package[];
}

export interface Build {
  engine: string;
  format: string;
  /** The accelerators this build is limited to, best first; the engine's (or its package's) when absent. */
  accelerators?: string[];
  /** Capabilities it needs beyond an accelerator (`webgpu-f16`). */
  needs?: string[];
  /** Per platform (`macos-aarch64`, `page`): lower wins over the catalogue's default engine order. */
  rank?: Record<string, number>;
  download?: Download;
  config?: unknown;
}

export interface Model {
  id: string;
  family: string;
  requires?: { memory_mb?: number };
  builds: Build[];
}

export interface Catalog {
  version: number;
  engines: Engine[];
  ranking?: { default?: string[] };
  families: Record<string, { task: Task }>;
  providers?: { id: string }[];
  models: Model[];
}

/** What a place reports about itself. `has` holds accelerators and features alike. */
export interface Capabilities {
  runs: Runs;
  os?: string;
  arch?: string;
  has: string[];
  memory_mb?: number;
}

export interface Choice {
  engine: string;
  accelerator: string;
}

export interface Offer extends Choice {
  model: string;
  task: Task;
  /** Bytes the first use downloads: the native engine's package unless bundled, plus the build's files. */
  download_size: number;
  reason: string;
  /** Every other build × accelerator this place runs, best first: what "Avanzado" offers. */
  alternatives: Choice[];
}

/** Places a model runs in besides a provider: this client, or the host it is paired with. */
export const PLACES = ["device", "host"] as const;

export class UnknownPlace extends Error {}

function packageFor(engine: Engine, capabilities: Capabilities): Package | null {
  const has = new Set(capabilities.has);
  for (const candidate of engine.packages ?? []) {
    if (candidate.os !== capabilities.os) continue;
    if (candidate.arch !== undefined && candidate.arch !== capabilities.arch) continue;
    if ((candidate.requires ?? []).every((need) => has.has(need))) return candidate;
  }
  return null;
}

function fit(build: Build, engine: Engine, capabilities: Capabilities): { accelerators: string[]; pkg: Package | null } | null {
  const has = new Set(capabilities.has);
  // A page engine only in a page, a native one only in a native runtime (D5).
  if (engine.runs !== capabilities.runs) return null;
  let pkg: Package | null = null;
  let usable: string[];
  if (capabilities.runs === "native") {
    pkg = packageFor(engine, capabilities);
    if (!pkg) return null;
    usable = pkg.accelerators;
  } else {
    usable = engine.accelerators ?? [];
  }
  if (!(build.needs ?? []).every((need) => has.has(need))) return null;
  const accelerators = (build.accelerators ?? usable).filter((accelerator) => usable.includes(accelerator) && has.has(accelerator));
  return accelerators.length ? { accelerators, pkg } : null;
}

function platformOf(capabilities: Capabilities): string {
  return capabilities.runs === "native" ? `${capabilities.os}-${capabilities.arch}` : "page";
}

function sizeOf(build: Build, pkg: Package | null): number {
  const engine = !pkg || pkg.bundled ? 0 : (pkg.download?.size ?? 0);
  return engine + (build.download?.size ?? 0);
}

/** One offer per model this place can run, in catalogue order. */
export function offers(catalog: Catalog, capabilities: Capabilities, place: string): Offer[] {
  if (!(PLACES as readonly string[]).includes(place)) {
    // A provider's models are the provider's to list (`models: "remote"`), not ours.
    if ((catalog.providers ?? []).some((provider) => provider.id === place)) return [];
    throw new UnknownPlace(`unknown place ${JSON.stringify(place)}`);
  }
  const engines = new Map(catalog.engines.map((engine) => [engine.id, engine]));
  const order = catalog.ranking?.default ?? [];
  const platform = platformOf(capabilities);
  const memory = capabilities.memory_mb;
  const result: Offer[] = [];
  for (const model of catalog.models) {
    const needed = model.requires?.memory_mb;
    if (needed != null && memory != null && memory < needed) continue;
    const fitting = model.builds.flatMap((build, index) => {
      const engine = engines.get(build.engine);
      const found = engine ? fit(build, engine, capabilities) : null;
      return found ? [{ index, build, ...found }] : [];
    });
    if (!fitting.length) continue;
    const key = (item: (typeof fitting)[number]): number[] => {
      const own = item.build.rank?.[platform];
      const position = order.indexOf(item.build.engine);
      return [own === undefined ? 1 : 0, own ?? 0, position < 0 ? order.length : position, item.index];
    };
    fitting.sort((a, b) => {
      const [x, y] = [key(a), key(b)];
      for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
      return 0;
    });
    const best = fitting[0];
    const accelerator = best.accelerators[0];
    const why =
      fitting.length === 1
        ? "the only build that runs here"
        : best.build.rank?.[platform] !== undefined
          ? `this model ranks it first on ${platform}`
          : "first in the catalogue's engine order";
    const pairs = fitting.flatMap((item) => item.accelerators.map((each) => ({ engine: item.build.engine, accelerator: each })));
    result.push({
      model: model.id,
      task: catalog.families[model.family].task,
      engine: best.build.engine,
      accelerator,
      download_size: sizeOf(best.build, best.pkg),
      reason: `${best.build.engine} (${accelerator}): ${why}`,
      alternatives: pairs.slice(1),
    });
  }
  return result;
}
