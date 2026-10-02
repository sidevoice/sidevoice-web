const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

function taskValues(value, tasks) {
 const source = object(value);
 return Object.fromEntries(tasks.filter(task => source[task]).map(task => [task, source[task]]));
}

/** Normalize pre-scope stage storage and the current per-host format to { default, hosts }. */
export function normalizeStageScope(rawValue, tasks, legacyDefault = {}) {
 const raw = object(rawValue), defaultStages = taskValues(legacyDefault, tasks);
 const scoped = Object.hasOwn(raw, 'default') || Object.hasOwn(raw, 'hosts');
 const hosts = {};
 let fallback = {};
 if (scoped) {
  Object.assign(fallback, taskValues(raw.default, tasks));
  for (const [fingerprint, value] of Object.entries(object(raw.hosts))) {
   const stages = taskValues(value, tasks);
   if (Object.keys(stages).length) hosts[fingerprint] = stages;
  }
 } else {
  // Very old installations stored one general stage map; the next shape stored maps by fingerprint.
  Object.assign(fallback, taskValues(raw, tasks));
  for (const [fingerprint, value] of Object.entries(raw)) {
   if (tasks.includes(fingerprint)) continue;
   const stages = taskValues(value, tasks);
   if (Object.keys(stages).length) hosts[fingerprint] = stages;
  }
 }
 for (const task of tasks) if (!fallback[task] && defaultStages[task]) fallback[task] = defaultStages[task];
 return { default: fallback, hosts };
}

/** Transfer general choices to a fixed snapshot of hosts without replacing each host's own choices. */
export function adoptStageDefaults(scopeValue, fingerprints) {
 const scope = { default: { ...object(scopeValue?.default) }, hosts: { ...object(scopeValue?.hosts) } };
 const targets = [...new Set((Array.isArray(fingerprints) ? fingerprints : [fingerprints]).filter(Boolean))];
 if (!targets.length || !Object.keys(scope.default).length) return scope;
 for (const fingerprint of targets) {
  const existing = object(scope.hosts[fingerprint]);
  scope.hosts[fingerprint] = { ...scope.default, ...existing };
 }
 scope.default = {};
 return scope;
}

/** Transfer a no-machine default into the first available host without replacing its own choices. */
export function adoptStageDefault(scopeValue, fingerprint) {
 return adoptStageDefaults(scopeValue, fingerprint);
}

/** Replace one machine's choices, or the general choices before a machine is paired. */
export function putStageScope(scopeValue, fingerprint, stages, tasks) {
 const scope = { default: { ...object(scopeValue?.default) }, hosts: { ...object(scopeValue?.hosts) } };
 const values = taskValues(stages, tasks);
 if (fingerprint) scope.hosts[fingerprint] = values;
 else scope.default = values;
 return scope;
}
