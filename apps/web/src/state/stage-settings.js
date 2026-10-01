/* The two stages this device configures — transcription (stt) and voice (tts) — as rubasace/sidevoice#124 §5
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

export const TASKS = ['stt', 'tts'];
export const DEVICE = 'device';

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
    if (stage.place === DEVICE) return familyOf(catalog, stage.model)?.family?.options || [];
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
 *  defaults in the person's system language (#124 §5, D14's "best combination", minus the verification). None
 *  (null) when this device runs nothing for the stage: a provider is the person's to choose, with its key and a
 *  model, and is never made up here (review R06). */
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
    if (place === DEVICE) {
        if (!ctx.offers) return null;
        return taskOffers(ctx.offers, task).map((offer) => ({ id: offer.model, label: familyOf(ctx.catalog, offer.model)?.model?.label || offer.model, offer }));
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
 *  them — and the list's first only for a new choice with none yet (review R05); a build override only when this
 *  device can run it; and options that fit the schema. */
export function effectiveStage(ctx, task, stage) {
    const base = stage && typeof stage === 'object' ? stage : defaultStage(ctx, task);
    if (!base)
        return null;
    let { place, model, build } = base;
    if (place !== DEVICE && !providerOf(ctx.catalog, place, task)) return defaultStage(ctx, task);
    const models = placeModels(ctx, place, task);
    if (models && !models.some((m) => m.id === model) && (place === DEVICE || !model)) {
        if (!models.length && place === DEVICE) return defaultStage(ctx, task);
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

/** The places a stage can be put, siblings (D8): this device when it offers a model for the stage, and every
 *  provider the machine lists — greyed out with Configurar when it lacks a key, to any paired device. While the
 *  listing is not in, only a provider already chosen is shown, as it was. */
function placesFor(ctx, task, chosen) {
    const places = [];
    const device = placeModels(ctx, DEVICE, task);
    if (device === null ? chosen === DEVICE : device.length) places.push({ id: DEVICE, label: 'Este dispositivo', state: device === null ? 'unknown' : 'ready' });
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
    const current = effectiveStage(ctx, task, stage);
    if (!current) {
        // Nothing chosen and nothing this device runs: the pane offers the places there are, and says why.
        return { task, places: placesFor(ctx, task, null), place: '', editable: ctx.integrations === 'ready', integrations: ctx.integrations,
            models: [], modelsLoading: !ctx.offers, modelsError: '', model: '', options: [], advanced: null, where: 'provider', unconfigured: !!ctx.offers };
    }
    const models = placeModels(ctx, current.place, task);
    const installed = (offer) => (ctx.installed || []).some((b) => b.model === offer.model && b.engine === offer.engine);
    const view = {
        task,
        places: placesFor(ctx, task, current.place),
        place: current.place,
        // Edits that depend on the machine's listing wait for it (#64 review F18): the choice stays as saved.
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
        where: current.place === DEVICE ? (ctx.inApp ? 'app' : 'page') : 'provider',
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
 *  names (voiceFor), because the node speaks only voices the stage carries (review R02). A device model keeps
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
