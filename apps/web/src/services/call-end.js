/* Why a call ended, as one line in the host's log (sidevoice-desktop#541: on the phone a call ended by itself and nothing
 * said why). The reason is a closed code that travels as the `code` of an object, because the app's log forwarder
 * (`webview_log`) writes every string as `[string]` and lets only a dotted code through: `call.ended.idle`. No text of the
 * conversation, no name, no address; a reason outside the list is `unknown`, never free text. */

/** The reasons a call ends. A new one is added here, and nowhere else. */
export const CALL_END_REASONS=Object.freeze(['user','idle','refused','room_full','pairing_revoked','unreachable','join_failed','move_failed','forgotten','switch_machine','unknown']);

/**
 * The line for a call that just ended.
 * @param {string} reason one of CALL_END_REASONS
 * @param {(...args: unknown[]) => void} [warn]
 */
export function logCallEnd(reason,warn=(...args)=>console.warn(...args)){
 const code='call.ended.'+(CALL_END_REASONS.includes(reason)?reason:'unknown');
 try{warn('The call ended.',{code})}catch{/* the log never ends a call */}
}

/**
 * The line for a call a page leaving leaves parked, not ended: the room keeps it and the next load takes it back. Best
 * effort: an IPC made inside `beforeunload` may never leave the page, and the host's own page-load line covers a reload.
 * @param {(...args: unknown[]) => void} [warn]
 */
export function logCallParked(warn=(...args)=>console.warn(...args)){
 try{warn('The page is going away; the call is parked.',{code:'call.parked.page_unload'})}catch{/* the log never ends a call */}
}
