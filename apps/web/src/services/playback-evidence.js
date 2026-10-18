// Device evidence for this call. Only completed voice chunks advance a confirmed prefix.
// A turn takes a copy at acoustic onset; later publications can be certified absent
// from that cutoff without changing the copy.
const LIMIT = 8;
const length = text => [...(text ?? '')].length;

function state(record) {
  if (record.length != null && (record.complete || record.confirmed >= record.length && record.length > 0))
    return {utterance_id: record.utterance_id, hearing: 'complete', heard_chars: record.length};
  if (record.confirmed > 0)
    return {utterance_id: record.utterance_id, hearing: 'partial', heard_chars: record.confirmed};
  if (record.played)
    return {utterance_id: record.utterance_id, hearing: 'unknown', heard_chars: null};
  return {utterance_id: record.utterance_id, hearing: 'not_played', heard_chars: 0};
}

export function createPlaybackEvidence() {
  const threads = new Map();
  let order = 0, playedOrder = 0;
  let exhausted = false, recordCount = 0;
  function records(thread_id) {
    if (!threads.has(thread_id)) {
      if(threads.size >= 32) exhausted = true;
      threads.set(thread_id, new Map());
    }
    return threads.get(thread_id);
  }
  /** @param {{thread_id:string, utterance_id:string, text?:string, attempt_id?:string}} reply */
  function publication({thread_id, utterance_id, text, attempt_id}) {
    if (!thread_id || !utterance_id || exhausted) return null;
    const group = records(thread_id);
    if(exhausted)return null;
    let record = group.get(utterance_id);
    if (!record) {
      if(recordCount >= 2048) {exhausted = true;return null}
      record = {utterance_id, order: ++order, length: text == null ? null : length(text),
        confirmed: 0, complete: false, played: false, playedOrder: 0, handled: false, attempts: new Set()};
      group.set(utterance_id, record);
      recordCount++;
    }
    if (record.length == null && text != null) record.length = length(text);
    if (attempt_id) record.attempts.add(attempt_id);
    return record;
  }
  function playing(reply) {
    const record = publication(reply);
    if (!record) return;
    record.played = true;
    record.playedOrder = ++playedOrder;
  }
  function handled(reply) {
    const record=publication(reply);
    if(record)record.handled=true;
  }
  function progress(reply, confirmed) {
    const record = publication(reply);
    if (!record || !Number.isInteger(confirmed) || confirmed < 0) return null;
    const next = record.length == null ? confirmed : Math.min(confirmed, record.length);
    if (next > record.confirmed) record.confirmed = next;
    if (next > 0 && !record.played) {
      record.played = true;
      record.playedOrder = ++playedOrder;
    }
    return record.confirmed;
  }
  function complete(reply) {
    const record = publication(reply);
    if (!record) return;
    record.complete = true;
    if (record.length != null) record.confirmed = record.length;
    record.played = true;
    record.playedOrder = ++playedOrder;
  }
  function capture(thread_id) {
    if (!thread_id || exhausted) return Object.freeze({knowledge: 'unknown', last_played: null, recent: Object.freeze([]), truncated: false});
    const all = [...records(thread_id).values()].sort((a, b) => a.order - b.order);
    const recent = all.slice(-LIMIT).map(record => Object.freeze(state(record)));
    const last = all.filter(record => record.played).sort((a, b) => b.playedOrder - a.playedOrder)[0];
    return Object.freeze({knowledge: 'known', last_played: last ? Object.freeze(state(last)) : null,
      recent: Object.freeze(recent), truncated: all.length > LIMIT});
  }
  function absentAtCutoff(thread_id, cutoff) {
    const {states} = cutoff;
    if (!thread_id || !cutoff.canCertify) return {not_played_at_turn_start: []};
    // A publication first observed after the local snapshot cannot have sounded here before it.
    // A prior publication is certified only when the snapshot actually recorded it as unplayed.
    const all = [...records(thread_id).values()].sort((a, b) => a.order - b.order);
    const absent = all.filter(record => !states.has(record.utterance_id)
      || states.get(record.utterance_id) === 'not_played')
      .map(record => ({utterance_id: record.utterance_id, hearing: 'not_played', heard_chars: 0}));
    return {not_played_at_turn_start: absent.slice(-LIMIT),
      ...(absent.length > LIMIT ? {not_played_at_turn_start_truncated: true} : {})};
  }
  function cutoff(thread_id) {
    const snapshot = capture(thread_id);
    // Keep the full local state and publication watermark out of the bounded wire snapshot.
    const states = new Map([...records(thread_id).values()].map(record => [record.utterance_id, state(record).hearing]));
    return {snapshot, states, canCertify:snapshot.knowledge==='known'};
  }
  // The voice engine freezes this list at microphone sample ingress, before async
  // VAD can report a candidate. Its say IDs are mapped here to room originals.
  function cutoffFromSource(thread_id, source, sourceSays) {
    if (!thread_id || exhausted || !source || source.available === false || !Array.isArray(source.recent))
      return {snapshot:Object.freeze({knowledge:'unknown',last_played:null,recent:Object.freeze([]),truncated:false}),
        states:new Map(),canCertify:false};
    const available = new Map(source.recent.map(item => [item.say_id, item]));
    if (source.last_played) available.set(source.last_played.say_id,source.last_played);
    const all = [...records(thread_id).values()].sort((a, b) => a.order - b.order);
    const states = new Map(), included = [];
    let hiddenHandle = false;
    for (const record of all) {
      // The graph-stamped marker proves this original was first published
      // after the microphone frame. Its say may have entered the actor before
      // delayed VAD delivery, but cannot alter the earlier cutoff.
      if(Number.isSafeInteger(source.mark)&&source.mark>0&&record.order>source.mark){
        states.set(record.utterance_id,{utterance_id:record.utterance_id,
          hearing:'not_played',heard_chars:0});
        continue;
      }
      let confirmed = 0, sounded = false, unaccounted = false, capturedHandle = false;
      // A replay's offset is usable only after earlier local chunks establish a
      // contiguous prefix. A later attempt cannot fill a hole by itself.
      const handles = [...sourceSays.entries()].filter(([, binding]) =>
        binding.thread_id === thread_id && binding.utterance_id === record.utterance_id);
      // A call replacement has a fresh source ledger. Its lack of a handle
      // cannot erase an original already heard on the preceding call.
      // A previous call's handle cannot be reconstructed from this call's
      // source list, even if its JS callback was delayed and said it never played.
      if(!handles.length && record.handled) unaccounted = true;
      const steps = [];
      for (const [say_id, binding] of handles) {
        const sample = available.get(say_id);
        if (!sample) { unaccounted = true; hiddenHandle = true; continue; }
        capturedHandle = true;
        // This is a prior-block lower bound. A queued or partly heard handle
        // might start/advance before the first speech sample in the next block.
        if (sample.hearing !== 'complete') unaccounted = true;
        if (sample.hearing !== 'not_played') sounded = true;
        if (Number.isInteger(sample.heard_chars) && sample.heard_chars > 0)
          steps.push({start: binding.replay_start_chars || 0,
            end: (binding.replay_start_chars || 0) + sample.heard_chars});
      }
      steps.sort((a, b) => a.start - b.start);
      for (const step of steps) if (step.start <= confirmed) confirmed = Math.max(confirmed, step.end);
      const length = record.length;
      const value = length != null && confirmed >= length && length > 0
        ? {utterance_id:record.utterance_id, hearing:'complete', heard_chars:length}
          : confirmed > 0
            ? {utterance_id:record.utterance_id, hearing:'partial', heard_chars:confirmed}
          : sounded || unaccounted
            ? {utterance_id:record.utterance_id, hearing:'unknown', heard_chars:null}
            : {utterance_id:record.utterance_id, hearing:'not_played', heard_chars:0};
      states.set(record.utterance_id,value);
      if (unaccounted) hiddenHandle = true;
      // The opaque marker is processed by the voice actor before microphone
      // ingress. An admission observed while VAD waits has a later order.
      if (capturedHandle || Number.isSafeInteger(source.mark) && record.order <= source.mark)
        included.push(record);
    }
    const played = [...available.values()].filter(item => Number.isInteger(item.played_order) && item.played_order > 0)
      .map(item => ({item,binding:sourceSays.get(item.say_id)}))
      .filter(({binding}) => binding?.thread_id === thread_id)
      .sort((a,b) => b.item.played_order-a.item.played_order);
    const last = played.length ? states.get(played[0].binding.utterance_id) : null;
    const missingOrder = [...available.values()].some(item =>
      sourceSays.get(item.say_id)?.thread_id === thread_id && item.hearing !== 'not_played'
      && !Number.isInteger(item.played_order));
    const reliable = !hiddenHandle && !missingOrder;
    const recent = reliable ? included.slice(-LIMIT).map(record => Object.freeze(states.get(record.utterance_id))) : [];
    const snapshot = Object.freeze({knowledge:reliable?'known':'unknown',
      last_played:reliable && last ? Object.freeze(last) : null,
      recent:Object.freeze(recent),truncated:included.length > LIMIT || !!source.truncated});
    return {snapshot,canCertify:true,
      states:new Map([...states].map(([id,value]) => [id,value.hearing]))};
  }
  function certifiedAbsence(thread_id, cutoff) {
    return absentAtCutoff(thread_id, cutoff);
  }
  return {publication, handled, playing, progress, complete, cutoff, cutoffFromSource,
    watermark: () => order,
    certifiedAbsence, clear: () => {threads.clear();order=0;playedOrder=0;recordCount=0;exhausted=false}};
}
