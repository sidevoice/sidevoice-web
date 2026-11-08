/* The CPU every WebKit process spends, from the operating system's own counters (Linux /proc, macOS ps): shared by the
 * idle-CPU measurement (idle-cpu.mjs) and the animation audit (animation-audit.mjs). */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const TICK = 100; // Linux /proc clock ticks per second (sysconf CLK_TCK on every Linux runner)

/** The CPU seconds each of the browser's processes has spent so far, by pid. `root`: only the processes under that pid (a
 *  machine that runs other browsers too, as a shared one does: the browsers this process launched are its children). */
function cpuTimes(root) {
  const out = new Map();
  const parents = new Map();
  if (process.platform === "linux") {
    for (const pid of execFileSync("ls", ["/proc"], { encoding: "utf8" }).split("\n").filter((p) => /^\d+$/.test(p))) {
      try {
        const command = readFileSync(`/proc/${pid}/cmdline`, "utf8").replaceAll("\0", " ");
        const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
        const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
        parents.set(pid, fields[1]);
        if (!command.includes("ms-playwright/webkit") && !command.includes("/wk/")) continue;
        out.set(pid, { command, seconds: (Number(fields[11]) + Number(fields[12])) / TICK });
      } catch { /* gone meanwhile */ }
    }
  } else {
    // macOS: `time` is user + system, [[dd-]hh:]mm:ss.cc. The XPC services are launchd's children: matched by their path.
    for (const line of execFileSync("ps", ["-A", "-o", "pid=,ppid=,time=,command="], { encoding: "utf8" }).split("\n")) {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
      if (!match) continue;
      parents.set(match[1], match[2]);
      if (!match[4].includes("ms-playwright/webkit")) continue;
      const parts = match[3].replace(/^(\d+)-/, (_, d) => `${Number(d) * 24}:`).split(":").map(Number);
      const seconds = parts.reduce((total, part) => total * 60 + part, 0);
      out.set(match[1], { command: match[4], seconds });
    }
  }
  if (root === undefined) return out;
  const under = (pid) => { for (let p = pid, hops = 0; p && hops < 12; p = parents.get(p), hops += 1) if (p === String(root)) return true; return false; };
  for (const pid of [...out.keys()]) if (!under(pid)) out.delete(pid);
  return out;
}

function kind(command) {
  if (/GPU/.test(command)) return "gpu";
  if (/WebContent|WebProcess/.test(command)) return "web";
  if (/Network/.test(command)) return "net";
  return "ui";
}

/** The percentage of one core each kind of process spent over `seconds` (`root`: see cpuTimes). */
export async function sample(seconds, root) {
  const before = cpuTimes(root);
  const started = performance.now();
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  const elapsed = (performance.now() - started) / 1000;
  const after = cpuTimes(root);
  const total = { ui: 0, web: 0, gpu: 0, net: 0 };
  for (const [pid, { command, seconds: spent }] of after) total[kind(command)] += spent - (before.get(pid)?.seconds ?? 0);
  return Object.fromEntries(Object.entries(total).map(([k, v]) => [k, (100 * v) / elapsed]));
}
