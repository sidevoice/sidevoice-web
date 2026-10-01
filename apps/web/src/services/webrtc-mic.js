/* The microphone over WebRTC, for one call session (the node side: sidevoice-core `server/webrtc.py`).
 *
 * The call socket keeps carrying everything it always has; this carries only the microphone, browser →
 * node, and only while it works. Once the socket has a session the page offers the track it already
 * captures — the same getUserMedia stream, echo cancellation and all — waits for ICE gathering (no
 * trickle, with a cap), and posts the offer to the node base like any other request. The node hears
 * which path its audio is on through `voice-media`, and hears `webrtc` only once the connection is
 * `connected`: until then, and after anything goes wrong, the socket's PCM is the microphone.
 *
 * One attempt per session. A failure puts the microphone back on the socket for the rest of it and
 * keeps the reason; a new session may try again. The clock, the network and the peer connection are
 * all handed in, so this runs — and is tested — without a browser. */

export const GATHER_MS = 3000;
export const CONNECT_MS = 8000;
export const DISCONNECTED_MS = 3000;

/** `?webrtc=0` in the page's address, or `localStorage['sidevoice.webrtc']='off'`, keeps the socket path.
 *  Either can only turn the feature off, which is why an address may carry it. */
export function webrtcAllowed({ search, stored } = {}) {
    if (stored === 'off')
        return false;
    return !(search && new URLSearchParams(search).get('webrtc') === '0');
}

/** One session's attempt. `link.path` is what the page's capture reads to know whether the socket still
 *  carries the microphone; `state` and `reason` are what the connection statistics say about it. */
export function createMicLink({ sessionId, track, allowed = true, Peer, config, offer, announce, onChange = () => { },
    clock = globalThis, gatherMs = GATHER_MS, connectMs = CONNECT_MS, disconnectedMs = DISCONNECTED_MS }) {
    let pc = null, sender = null, over = false, current = track, connectTimer = null, dropTimer = null;
    const link = { sessionId, path: 'socket', state: 'idle', reason: '', detail: '', start, close, replaceTrack };
    const report = patch => { Object.assign(link, patch); try { onChange(link); } catch { } };
    const cancel = timer => { if (timer != null) clock.clearTimeout(timer); return null; };
    // The node is told before the capture follows: its path changes, then the socket's PCM stops or resumes.
    function use(path) {
        if (link.path === path)
            return;
        try { announce(path); } catch { }
        link.path = path;
    }
    // A path the node was never told about is never taken back: before `connected` the socket never stopped.
    function end(state, reason, detail) {
        if (over)
            return;
        over = true;
        connectTimer = cancel(connectTimer);
        dropTimer = cancel(dropTimer);
        use('socket');
        try { pc?.close(); } catch { }
        report({ state, reason, detail: String(detail || '').slice(0, 200) });
    }
    function watch() {
        if (over || !pc)
            return;
        const state = pc.connectionState;
        if (state === 'connected') {
            connectTimer = cancel(connectTimer);
            dropTimer = cancel(dropTimer);
            use('webrtc');
            report({ state: 'connected' });
        }
        else if (state === 'disconnected' && link.state === 'connected') {
            // Nothing said while it decides is lost: the socket takes the microphone back at once, and gives
            // it back if the connection returns in time. If it does not, this session is done with WebRTC.
            use('socket');
            report({ state: 'recovering' });
            dropTimer = clock.setTimeout(() => end('fallback', 'disconnected'), disconnectedMs);
        }
        else if (state === 'failed' || state === 'closed')
            end('fallback', state);
    }
    function gathered() {
        if (pc.iceGatheringState === 'complete')
            return Promise.resolve();
        return new Promise(resolve => {
            // Past the cap the offer goes with the candidates it has: a slow STUN server delays nothing more.
            const timer = clock.setTimeout(done, gatherMs);
            function done() {
                clock.clearTimeout(timer);
                pc.onicegatheringstatechange = pc.onicecandidate = null;
                resolve();
            }
            pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') done(); };
            pc.onicecandidate = event => { if (!event?.candidate) done(); };
        });
    }
    async function start() {
        if (!allowed)
            return end('off', 'page_off');
        if (typeof Peer !== 'function' || !current)
            return end('off', 'unsupported');
        report({ state: 'negotiating' });
        let settings;
        try {
            settings = await config();
        }
        catch (error) {
            return end('off', 'unavailable', error?.message);
        }
        if (over)
            return;
        if (!settings?.enabled)
            return end('off', 'node_off');
        try {
            pc = new Peer({ iceServers: Array.isArray(settings.ice_servers) ? settings.ice_servers : [] });
            pc.onconnectionstatechange = watch;
            sender = pc.addTransceiver(current, { direction: 'sendonly' }).sender;
            await pc.setLocalDescription(await pc.createOffer());
            await gathered();
            if (over)
                return;
            let answer;
            try {
                answer = await offer({ session_id: sessionId, sdp: pc.localDescription.sdp, type: 'offer' });
            }
            catch (error) {
                return end('fallback', 'offer', error?.message);
            }
            if (over)
                return;
            await pc.setRemoteDescription({ type: 'answer', sdp: answer?.sdp });
            if (over)
                return;
            connectTimer = clock.setTimeout(() => end('fallback', 'timeout'), connectMs);
            watch();
        }
        catch (error) {
            end('fallback', 'error', error?.message);
        }
    }
    /** The session is over (hang-up, reconnection, a settings swap, another machine): nothing is announced
     *  on a socket that is going away — the page's `announce` knows which socket it belongs to. */
    function close() {
        end('closed', '');
    }
    /** Another microphone mid-call: the connection keeps going with the new track. */
    function replaceTrack(next) {
        current = next;
        if (sender && !over)
            Promise.resolve().then(() => sender.replaceTrack(next)).catch(error => end('fallback', 'track', error?.message));
    }
    return link;
}
