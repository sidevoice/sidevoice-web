/* The two stages this device configures — transcription (stt) and voice (tts) — as sidevoice/sidevoice-core#21
 * shapes them: a place (this device or a provider the machine holds a key for), a model among what that place
 * offers, and the options that model's family (or the provider) declares in the model catalogue. Pure: the
 * facts come from the store (the catalogue, this device's offers, the machine's integrations, the remote model
 * lists) and everything the settings panes show is derived here. The stage a device saves is the same shape
 * sidevoice-core validates:
 *
 *     { place: 'device' | '<provider>', model, options: {…}, build: {engine, accelerator} | null }
 *
 * `offers` are the resolver's (packages/browser-audio/offers.ts), computed by the controller from what this
 * device measured about itself; nothing here detects anything. */

import { refusalText } from '../../../../packages/browser-audio/refusals.js';
import { CHECKS } from '../../../../packages/browser-audio/model-check.js';

export const TASKS = ['stt', 'tts'];
export const DEVICE = 'device';
/** The machine in use as a place (sidevoice/sidevoice-core#21, D7): it runs the model itself, with what it says it
 *  can run (`ctx.hostOffers`, computed there) — absent when it offers nothing for the stage. */
export const HOST = 'host';
const onMachine = (place) => place === DEVICE || place === HOST;

const OPTION_LABELS = { language: 'Idioma', context: 'Contexto', voice: 'Voz', speed: 'Velocidad', instructions: 'Instrucciones' };
const ACCELERATOR_LABELS = { cpu: 'CPU', coreml: 'Core ML', metal: 'Metal', cuda: 'CUDA', directml: 'DirectML', vulkan: 'Vulkan', webgpu: 'WebGPU', wasm: 'WASM' };

/** A provider's own lists for a task (its models, its voices), as the machine fetched them; keyed `place:task`. */
export const remoteOf = (ctx, place, task) => ctx.remote?.[place + ':' + task];
const primary = (tag) => String(tag || '').toLowerCase().split(/[-_]/)[0];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function familyOf(catalog, modelId) {
    const model = catalog?.models?.find((m) => m.id === modelId);
    return model ? { model, family: catalog.families[model.family] } : null;
}
export function providerOf(catalog, id, task) {
    const provider = (catalog?.providers || []).find((p) => p.id === id);
    return provider && (provider.tasks || []).includes(task) ? provider : null;
}
export function taskOffers(offers, task) { return (offers || []).filter((offer) => offer.task === task); }

/** The option schema a stage's choice declares: its family's on this device, its provider's otherwise. */
export function optionSchema(catalog, stage, task) {
    if (!stage) return [];
    if (onMachine(stage.place)) return familyOf(catalog, stage.model)?.family?.options || [];
    return providerOf(catalog, stage.place, task)?.[task]?.options || [];
}

/** Voices a per-language voice option can take, by speech language. */
function voiceChoices(ctx, stage, option) {
    if (option.from === 'model.voices') {
        const model = familyOf(ctx.catalog, stage.model)?.model;
        const labels = new Map((ctx.languages || []).flatMap((l) => l.voices || []));
        const byLanguage = {};
        for (const voice of model?.voices || []) (byLanguage[primary(voice.language)] ||= []).push({ value: voice.id, label: labels.get(voice.id) || voice.id });
        return byLanguage;
    }
    if (option.from === 'remote.voices') {
        const voices = remoteOf(ctx, stage.place, 'tts')?.voices || [];
        const byLanguage = {};
        for (const language of ctx.languages || []) {
            const own = voices.filter((v) => (v.languages || []).map(primary).includes(language.id));
            const rest = voices.filter((v) => !own.includes(v));
            byLanguage[language.id] = [...own, ...rest].map((v) => ({ value: v.id, label: v.label || v.id, other: rest.includes(v) }));
        }
        return byLanguage;
    }
    return Object.fromEntries((ctx.languages || []).map((l) => [l.id, (option.values || []).map((value) => ({ value, label: value }))]));
}

function validOption(option, value, ctx, stage) {
    switch (option.kind) {
        case 'language': return typeof value === 'string' && ((option.auto && value === 'auto') || (option.values || []).includes(value));
        case 'text': return typeof value === 'string' && value.length <= (option.max || 1000);
        case 'range': return typeof value === 'number' && Number.isFinite(value) && value >= option.min && value <= option.max;
        case 'voice':
            if (!option.per_language) return typeof value === 'string' && !!value;
            if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
            if (option.from !== 'model.voices') return Object.values(value).every((v) => typeof v === 'string' && v);
            {
                const choices = voiceChoices(ctx, stage, option);
                return Object.entries(value).every(([language, voice]) => (choices[language] || []).some((c) => c.value === voice));
            }
        default: return false;
    }
}

function defaultOption(option, language) {
    if (option.kind === 'language') return (option.values || []).includes(language) ? language : option.default ?? (option.auto ? 'auto' : option.values?.[0]);
    if (option.kind === 'text') return '';
    if (option.kind === 'range') return option.default ?? option.min;
    if (option.kind === 'voice') return option.per_language ? {} : undefined;
    return undefined;
}

/** The options a stage carries: every one its schema declares, a valid value kept, anything else its default;
 *  ids the schema does not declare are dropped (the core refuses them). */
export function normalizeOptions(ctx, stage, task) {
    const result = {};
    for (const option of optionSchema(ctx.catalog, stage, task)) {
        const value = stage.options?.[option.id];
        const fallback = defaultOption(option, ctx.language);
        if (value !== undefined && validOption(option, value, ctx, stage)) result[option.id] = value;
        else if (option.kind === 'voice' && option.per_language && value && typeof value === 'object' && option.from === 'model.voices') {
            // A voice for a language the model no longer has is dropped alone; the others stay.
            const choices = voiceChoices(ctx, stage, option);
            result[option.id] = Object.fromEntries(Object.entries(value).filter(([language, voice]) => (choices[language] || []).some((c) => c.value === voice)));
        } else if (option.kind === 'range' && typeof value === 'number') result[option.id] = clamp(value, option.min, option.max);
        else if (fallback !== undefined) result[option.id] = fallback;
    }
    return result;
}

/** What this device would pick with nothing saved: the resolver's first offer for the stage, with its family's
 *  defaults in the person's system language (the "best combination", minus the verification). None
 *  (null) when this device runs nothing for the stage: a provider is the person's to choose, with its key and a
 *  model, and is never made up here. */
export function defaultStage(ctx, task) {
    const offer = taskOffers(ctx.offers, task)[0];
    if (!offer)
        return null;
    const stage = { place: DEVICE, model: offer.model, options: {}, build: null };
    return { ...stage, options: normalizeOptions(ctx, stage, task) };
}

/** The models a place offers for a stage: this device's offers, or the provider's own list. `null` while that
 *  list is not known — loading, or its read failed — which is not the same as a place that offers nothing. */
export function placeModels(ctx, place, task) {
    if (onMachine(place)) {
        const offers = place === HOST ? ctx.hostOffers : ctx.offers;
        if (!offers) return null;
        return taskOffers(offers, task).map((offer) => ({ id: offer.model, label: familyOf(ctx.catalog, offer.model)?.model?.label || offer.model, description: familyOf(ctx.catalog, offer.model)?.model?.description, offer }));
    }
    const provider = providerOf(ctx.catalog, place, task);
    if (!provider) return [];
    const listed = provider[task]?.models;
    if (Array.isArray(listed)) return listed.map((id) => ({ id, label: id }));
    const remote = remoteOf(ctx, place, task);
    return remote?.models ? remote.models.map((m) => ({ id: m.id, label: m.label || m.id, description: m.description })) : null;
}

/** A stage as it will be used: the place kept; on this device, a model it offers; at a provider, the model chosen
 *  — kept when the account's list is unknown or does not name it, since a provider ships models before we list
 *  them — and the list's first only for a new choice with none yet; a build override only when this
 *  device can run it; and options that fit the schema. */
export function effectiveStage(ctx, task, stage) {
    const base = stage && typeof stage === 'object' ? stage : defaultStage(ctx, task);
    if (!base)
        return null;
    let { place, model, build } = base;
    if (!onMachine(place) && !providerOf(ctx.catalog, place, task)) return defaultStage(ctx, task);
    const models = placeModels(ctx, place, task);
    if (models && !models.some((m) => m.id === model) && (onMachine(place) || !model)) {
        if (!models.length && onMachine(place)) return defaultStage(ctx, task);
        model = models[0]?.id || '';
    }
    if (place !== DEVICE) build = null;
    else if (build) {
        const offer = models?.find((m) => m.id === model)?.offer;
        const choices = offer ? [offer, ...offer.alternatives] : [];
        if (models && !choices.some((c) => c.engine === build.engine && c.accelerator === build.accelerator)) build = null;
    }
    const next = { place, model, options: base.options || {}, build: build || null };
    return { ...next, options: normalizeOptions(ctx, next, task) };
}

/** Which build a device stage runs on: the override from Avanzado when it is one this device offers, the
 *  resolver's best otherwise. `null` when the model is not offered here at all. */
export function deviceBuild(offers, stage) {
    const offer = (offers || []).find((o) => o.model === stage?.model);
    if (!offer) return null;
    const wanted = stage.build && [offer, ...offer.alternatives].find((c) => c.engine === stage.build.engine && c.accelerator === stage.build.accelerator);
    const chosen = wanted || offer;
    return { model: offer.model, engine: chosen.engine, accelerator: chosen.accelerator };
}

function sizeText(bytes) {
    if (!bytes) return '';
    return bytes >= 1e9 ? (bytes / 1e9).toFixed(1).replace('.', ',') + ' GB' : Math.round(bytes / 1e6) + ' MB';
}
function buildLabel(catalog, choice) {
    const engine = catalog?.engines?.find((e) => e.id === choice.engine);
    return (engine?.label?.split(' (')[0] || choice.engine) + ' · ' + (ACCELERATOR_LABELS[choice.accelerator] || choice.accelerator);
}

/** The places a stage can be put, siblings: this device when it offers a model for the stage, and every
 *  provider the machine lists — greyed out with Configurar when it lacks a key, to any paired device. While the
 *  listing is not in, only a provider already chosen is shown, as it was. */
function placesFor(ctx, task, chosen) {
    const places = [];
    const device = placeModels(ctx, DEVICE, task);
    if (device === null ? chosen === DEVICE : device.length) places.push({ id: DEVICE, label: 'Este dispositivo', state: device === null ? 'unknown' : 'ready' });
    const host = placeModels(ctx, HOST, task);
    if (host?.length) places.push({ id: HOST, label: ctx.hostLabel || HOST, state: 'ready' });
    for (const provider of ctx.catalog?.providers || []) {
        if (!(provider.tasks || []).includes(task)) continue;
        if (ctx.integrations !== 'ready') {
            if (provider.id === chosen) places.push({ id: provider.id, label: provider.label || provider.id, state: 'unknown' });
            continue;
        }
        const state = ctx.keyed(provider.id);
        if (state !== 'absent') places.push({ id: provider.id, label: provider.label || provider.id, state });
    }
    return places;
}

function optionView(ctx, stage, task, option, value) {
    const base = { id: option.id, kind: option.kind, label: OPTION_LABELS[option.id] || option.id };
    if (option.kind === 'language') {
        const labels = new Map((ctx.languages || []).map((l) => [l.id, l.label]));
        return { ...base, value, choices: [...(option.auto ? [{ value: 'auto', label: 'Detectar automáticamente' }] : []), ...(option.values || []).map((v) => ({ value: v, label: labels.get(v) || v }))] };
    }
    if (option.kind === 'text') return { ...base, value: value ?? '', max: option.max || 1000 };
    if (option.kind === 'range') return { ...base, value, min: option.min, max: option.max, step: option.step || 0.05 };
    if (option.kind === 'voice') {
        const choices = voiceChoices(ctx, stage, option);
        const loading = option.from === 'remote.voices' && !remoteOf(ctx, stage.place, task)?.voices;
        const languages = (ctx.languages || []).filter((l) => (choices[l.id] || []).length || loading);
        if (!option.per_language) return { ...base, value, perLanguage: false, choices: Object.values(choices)[0] || [] };
        return { ...base, perLanguage: true, loading, rows: languages.map((l) => ({
            language: l.id, label: l.label, value: value?.[l.id] || '',
            choices: [{ value: '', label: choices[l.id]?.[0] ? 'Automática · ' + choices[l.id][0].label : 'Automática' }, ...(choices[l.id] || [])],
        })) };
    }
    return base;
}

/** Everything a stage pane shows. */
export function stageView(ctx, task, stage) {
    // While a model is being selected (sidevoice/sidevoice-core#21) the pane shows that one, and nothing else can be changed until
    // the check is over: it takes effect, or the pane goes back to what was in use.
    const check = ctx.checks?.[task] || null;
    const selecting = check && ['consent', 'running', 'slow'].includes(check.phase) && !check.recheck;
    const view = stageViewOf(ctx, task, selecting ? check.stage : stage);
    if (selecting) view.editable = false;
    view.check = checkView(ctx, task, check);
    view.diagnostics = diagnosticsView(ctx, task, stage);
    return view;
}

function stageViewOf(ctx, task, stage) {
    const current = effectiveStage(ctx, task, stage);
    if (!current) {
        // Nothing chosen and nothing this device runs: the pane offers the places there are, and says why.
        return { task, places: placesFor(ctx, task, null), place: '', editable: ctx.integrations === 'ready', integrations: ctx.integrations,
            models: [], modelsLoading: !ctx.offers, modelsError: '', model: '', options: [], advanced: null, where: 'provider', unconfigured: !!ctx.offers,
            check: null, diagnostics: null };
    }
    const models = placeModels(ctx, current.place, task);
    const installed = (offer) => ((current.place === HOST ? ctx.hostInstalled : ctx.installed) || []).some((b) => b.model === offer.model && b.engine === offer.engine);
    const view = {
        task,
        places: placesFor(ctx, task, current.place),
        place: current.place,
        // Edits that depend on the machine's listing wait for it: the choice stays as saved.
        editable: ctx.integrations === 'ready' || (current.place === DEVICE && ctx.integrations !== 'loading'),
        integrations: ctx.integrations,
        // A provider model the account's list does not (or cannot now) name is still the one chosen, and shown.
        models: [...(models || []), ...(current.model && !models?.some((m) => m.id === current.model) ? [{ id: current.model, label: current.model }] : [])].map((m) => ({
            id: m.id, label: m.label, description: m.description,
            detail: m.offer ? [sizeText(m.offer.download_size), installed(m.offer) ? 'descargado' : ''].filter(Boolean).join(' · ') : '',
        })),
        modelsLoading: models === null && !(current.place !== DEVICE && remoteOf(ctx, current.place, task)?.error),
        modelsError: current.place !== DEVICE ? remoteOf(ctx, current.place, task)?.error || '' : '',
        model: current.model,
        options: optionSchema(ctx.catalog, current, task).map((option) => optionView(ctx, current, task, option, current.options[option.id])),
        advanced: null,
        where: current.place === DEVICE ? (ctx.inApp ? 'app' : 'page') : current.place === HOST ? 'host' : 'provider',
    };
    const offer = models?.find((m) => m.id === current.model)?.offer;
    if (current.place === DEVICE && offer) {
        const choices = [offer, ...offer.alternatives];
        view.advanced = {
            value: current.build ? current.build.engine + '/' + current.build.accelerator : 'auto',
            choices: [{ value: 'auto', label: 'Automático (' + buildLabel(ctx.catalog, offer) + ')' },
                ...choices.map((c) => ({ value: c.engine + '/' + c.accelerator, label: buildLabel(ctx.catalog, c) }))],
            reason: offer.reason,
        };
    }
    return view;
}

// ----- the edits a pane makes: each returns the next draft stage, never mutating the one it was given -----

/** A new place: what was saved for it when it was the saved place, else its first model with defaults. */
export function withPlace(ctx, task, stage, place, saved) {
    if (saved?.place === place) return effectiveStage(ctx, task, saved);
    const models = placeModels(ctx, place, task);
    return effectiveStage(ctx, task, { place, model: models?.[0]?.id || '', options: {}, build: null });
}
/** A new model: its family's options, keeping the values that still fit (a language, a speed). */
export function withModel(ctx, task, stage, model) {
    return effectiveStage(ctx, task, { ...stage, model, build: null });
}
export function withOption(ctx, task, stage, id, value, language) {
    const options = { ...stage.options };
    if (language) {
        const voices = { ...(options[id] || {}) };
        if (value) voices[language] = value; else delete voices[language];
        options[id] = voices;
    } else options[id] = value;
    return effectiveStage(ctx, task, { ...stage, options });
}
export function withBuild(ctx, task, stage, value) {
    const [engine, accelerator] = value === 'auto' ? [] : String(value).split('/');
    return effectiveStage(ctx, task, { ...stage, build: engine && accelerator ? { engine, accelerator } : null });
}

/** The voice a device stage speaks a language with: the one chosen, else the model's first for that language. */
/** "Automática", once: the first voice the pane lists for that language. The preview speaks it, and a provider's
 *  stage is saved with it (withVoicesChosen), so the call speaks it too. */
export function voiceFor(ctx, stage, language) {
    const chosen = stage?.options?.voice?.[language];
    if (chosen) return chosen;
    const option = optionSchema(ctx.catalog, stage, 'tts').find((o) => o.kind === 'voice');
    const choices = option ? voiceChoices(ctx, stage, option)[language] || [] : [];
    return choices[0]?.value || '';
}

/** A provider's voice stage as it is saved: every language left on "Automática" gets the voice that choice
 *  names (voiceFor), because the node speaks only voices the stage carries. A device model keeps
 *  its automatic choice, which the node resolves from the catalogue itself. */
export function withVoicesChosen(ctx, stage) {
    const option = stage && stage.place !== DEVICE && optionSchema(ctx.catalog, stage, 'tts').find((o) => o.kind === 'voice' && o.per_language);
    if (!option) return stage;
    const voices = { ...(stage.options[option.id] || {}) };
    for (const language of Object.keys(voiceChoices(ctx, stage, option))) voices[language] ||= voiceFor(ctx, stage, language) || undefined;
    for (const language of Object.keys(voices)) if (!voices[language]) delete voices[language];
    return { ...stage, options: { ...stage.options, [option.id]: voices } };
}

/** Why a stage cannot be saved as the pane shows it, in words, or '' when it can: a provider with no model
 *  chosen yet, or a provider's voice stage with no voice at all (its list not in yet, or empty). */
export function stageProblem(ctx, task, stage) {
    if (!stage)
        return task === 'stt' ? 'Elige dónde transcribir: este dispositivo no puede ejecutar ningún modelo.' : 'Elige dónde generar la voz: este dispositivo no puede ejecutar ningún modelo.';
    if (stage.place === DEVICE)
        return '';
    const label = providerOf(ctx.catalog, stage.place, task)?.label || stage.place;
    if (!stage.model)
        return 'Elige un modelo de ' + label + '.';
    const voice = optionSchema(ctx.catalog, stage, task).find((o) => o.kind === 'voice');
    const chosen = voice && stage.options[voice.id];
    if (voice && !(chosen && (typeof chosen === 'string' || Object.keys(chosen).length)))
        return 'Elige una voz de ' + label + '.';
    return '';
}

// ----- selecting a model (sidevoice/sidevoice-core#21) and what was measured (sidevoice/sidevoice-core#13), as the pane says them -----

const STEP_LABELS = { download: 'Descarga', load: 'Carga', check: 'Comprobación', key: 'Clave', host: 'Máquina', apply: 'Aplicar' };
/** A time in milliseconds, as the panes say it. */
export function secondsText(ms) {
    if (ms == null || !Number.isFinite(ms)) return '—';
    return (ms / 1000).toFixed(ms < 10000 ? 2 : 1).replace('.', ',') + ' s';
}
export function bytesText(bytes) { return bytes >= 1e9 ? (bytes / 1e9).toFixed(1).replace('.', ',') + ' GB' : (bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0).replace('.', ',') + ' MB'; }
/** A stage's model in a few words: a catalogue model by its label, a provider's as `Provider · model`. */
export function stageLabel(ctx, task, stage) {
    if (!stage) return '';
    if (stage.place === DEVICE) return familyOf(ctx.catalog, stage.model)?.model?.label || stage.model;
    return (providerOf(ctx.catalog, stage.place, task)?.label || stage.place) + ' · ' + stage.model;
}
/** What a check measured, as label/value pairs: the load, then a transcription's turn-final latency or a voice's
 *  first audio and speed — of the measured (second) pass. */
function measured(result, task) {
    const rows = [];
    if (result?.load_ms != null) rows.push({ label: 'Carga', value: secondsText(result.load_ms) });
    const pass = result?.passes?.at(-1);
    if (!pass) return rows;
    if (task === 'stt') rows.push({ label: 'Latencia al terminar el turno', value: secondsText(pass.latency_ms) });
    else {
        rows.push({ label: 'Primer audio', value: secondsText(pass.first_audio_ms) });
        if (pass.realtime != null) rows.push({ label: 'Velocidad', value: String(pass.realtime).replace('.', ',') + '× tiempo real' });
    }
    return rows;
}

/** The pane's account of the selection in flight or just over, or null. */
export function checkView(ctx, task, check) {
    if (!check) return null;
    const base = { phase: check.phase, model: stageLabel(ctx, task, check.stage), previous: check.previous || '', recheck: !!check.recheck };
    if (check.phase === 'consent') return { ...base, size: check.size ? bytesText(check.size) : '' };
    if (check.phase === 'running') {
        const p = check.progress || {};
        const step = STEP_LABELS[p.step] || STEP_LABELS.load;
        const known = p.step === 'download' && p.total;
        return { ...base, step: p.step === 'check' && p.pass ? step + ' ' + p.pass + '/' + p.passes : step,
            amount: known ? bytesText(p.done || 0) + ' / ' + bytesText(p.total) : '',
            fraction: known ? Math.min(1, (p.done || 0) / p.total) : null };
    }
    if (check.phase === 'failed')
        return { ...base, step: STEP_LABELS[check.step] || check.step, cause: refusalText(check.reason, 'Motivo desconocido.') };
    const rows = measured(check.result, task);
    if (check.phase === 'slow')
        return { ...base, latency: secondsText(check.result?.latency_ms), comfort: secondsText(CHECKS.stt.comfort_ms), rows };
    return { ...base, rows };
}

const yesNo = (value) => (value ? 'Sí' : 'No');
/** Diagnostics for a stage (sidevoice/sidevoice-core#13): where and on what its model runs, and what its last check measured; on a page,
 *  also what the page itself has. `rows` are label/value pairs, the same ones Copiar resultados copies. */
export function diagnosticsView(ctx, task, stage) {
    const current = effectiveStage(ctx, task, stage);
    const record = ctx.diagnostics?.[task] || null;
    const shown = record?.stage || current;
    if (!shown) return null;
    const rows = [{ label: 'Lugar', value: shown.place === DEVICE ? 'Este dispositivo' : providerOf(ctx.catalog, shown.place, task)?.label || shown.place },
        { label: 'Modelo', value: stageLabel(ctx, task, shown) + (shown.place === DEVICE ? ' (' + shown.model + ')' : '') }];
    if (shown.place === DEVICE) {
        const build = record?.build || deviceBuild(ctx.offers, shown);
        if (build) {
            const engine = ctx.catalog?.engines?.find((e) => e.id === build.engine);
            const format = familyOf(ctx.catalog, shown.model)?.model?.builds?.find((b) => b.engine === build.engine)?.format;
            rows.push({ label: 'Motor', value: [build.engine, engine?.version, format].filter(Boolean).join(' · ') },
                { label: 'Acelerador', value: ACCELERATOR_LABELS[build.accelerator] || build.accelerator });
            const offer = (ctx.offers || []).find((o) => o.model === shown.model);
            if (offer?.reason) rows.push({ label: 'Motivo', value: offer.reason });
        }
    }
    if (record) {
        rows.push({ label: 'Resultado', value: record.ok ? 'Correcto' : (STEP_LABELS[record.step] || record.step) + ' · ' + refusalText(record.reason, '') });
        if (record.load_ms != null) rows.push({ label: 'Carga', value: secondsText(record.load_ms) });
        (record.passes || []).forEach((pass, index) => rows.push({ label: 'Pasada ' + (index + 1),
            value: task === 'stt' ? secondsText(pass.latency_ms) : secondsText(pass.first_audio_ms) + ' · ' + (pass.realtime != null ? String(pass.realtime).replace('.', ',') + '×' : '—') }));
        if (record.memory?.total_mb) rows.push({ label: 'Memoria libre / total', value: (record.memory.available_mb ?? '—') + ' / ' + record.memory.total_mb + ' MB' });
        else if (record.memory?.device_gb) rows.push({ label: 'Memoria del dispositivo', value: '≈ ' + record.memory.device_gb + ' GB' });
    } else rows.push({ label: 'Resultado', value: 'Sin comprobar todavía' });
    if (shown.place === DEVICE && ctx.pageFacts) {
        const { adapter, crossOriginIsolated, threads, cores } = ctx.pageFacts;
        rows.push({ label: 'Adaptador WebGPU', value: adapter ? [adapter.vendor, adapter.architecture, adapter.description].filter(Boolean).join(' · ') || 'Sí' : 'Ninguno' },
            { label: 'crossOriginIsolated', value: yesNo(crossOriginIsolated) },
            { label: 'Hilos', value: (threads ?? '—') + ' / ' + (cores ?? '—') });
    }
    if (record?.at) rows.push({ label: 'Comprobado', value: new Date(record.at).toLocaleString() });
    return { rows, checked: !!record, busy: !!ctx.checks?.[task] && ['consent', 'running', 'slow'].includes(ctx.checks[task].phase) };
}

/** Diagnóstico as the text Copiar resultados copies: the stage, then one `label: value` line per row and per extra
 *  fact (the build, the browser), each said through `say` — the page's translation. */
export function diagnosticsText(task, diagnostics, extra = [], say = (text) => text) {
    return [say(task === 'stt' ? 'Transcripción' : 'Voz'), ...[...(diagnostics?.rows || []), ...extra].map((row) => say(row.label) + ': ' + say(row.value))].join('\n');
}
