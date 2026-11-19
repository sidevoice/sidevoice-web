/* Why a call ended, as one line in the host's log (sidevoice-desktop#541: on the phone a call ended by itself and nothing
 * said why). The reason is a closed code that travels as the `code` of an object, because the app's log forwarder
 * (`webview_log`) writes every string as `[string]` and lets only a dotted code through: `call.ended.idle`. No text of the
 * conversation, no name, no address; a reason outside the list is `unknown`, never free text. */

/** The reasons a call ends. A new one is added here, and nowhere else. */
export const CALL_END_REASONS=Object.freeze(['user','idle','refused','room_full','pairing_revoked','unreachable','join_failed','move_failed','forgotten','page_unload','unknown']);

/**
 * The line for a call that just ended.
 * @param {string} reason one of CALL_END_REASONS
 * @param {(...args: unknown[]) => void} [warn]
 */
export function logCallEnd(reason,warn=(...args)=>console.warn(...args)){
 const code='call.ended.'+(CALL_END_REASONS.includes(reason)?reason:'unknown');
 try{warn('The call ended.',{code})}catch{/* the log never ends a call */}
}
