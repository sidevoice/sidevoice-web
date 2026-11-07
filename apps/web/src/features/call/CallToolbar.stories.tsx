import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { CallToolbar } from "./CallToolbar";
import { createRoomStore, RoomStoreContext } from "../../state/room-store";
import { CallLayoutContext, createCallLayoutStore } from "../../state/call-layout";
import { translator } from "../../i18n/translator";
import "./call-view.css";

/* The call bar: the join's line over one tray with the microphone (the devices' button showing its level, joined to mute),
 * captions, skip, the call button and ⋮, and the transcript's button at the right end. Every control is a projection of
 * the room's store (CallIndicators: MuteButton, CaptionsButton, SkipButton, CallButton; JoinStatus), so each story seeds
 * the facts of one moment of a call. Its controls keep the ids the runtime binds (#mute, #connect…), so one bar per story.
 * Pressing them asks the runtime, which is not here; Captions is the one that acts (it is this device's choice, kept in
 * this browser). The microphone's level is written by the runtime on #mic-control: here the bars rest. Not shown: the
 * listen-only note (the call joined without the microphone allowed), which is the first-run setup's state. */

const NUC = { fp: "fp-nuc", host: "NUC", urls: [], device_id: "d-nuc", paired_at: 1_700_000_000, revoked: false };
const PAIRED = { machinesReady: true, pairings: [NUC], callNode: NUC.fp, machineLinks: { [NUC.fp]: { reach: "ok", via: "node" } },
  people: [{ thread_id: "t-web", title: "sidevoice-web", available: true, reach: { state: "listening" }, node: NUC.fp, machine: { host: "NUC", id: "connector-nuc" } }],
  roomBinding: { thread_id: "t-web", title: "sidevoice-web", binding_id: "b1" } };
const IN_CALL = { ...PAIRED, ws: {}, sessionId: "s1" };

function Bar({ facts }: { facts: Record<string, unknown> }) {
  const [store] = useState(() => {
    const store = createRoomStore();
    store.patch(facts as never);
    return store;
  });
  const [layout] = useState(() => createCallLayoutStore(null));
  return <RoomStoreContext.Provider value={store}><CallLayoutContext.Provider value={layout}>
    <div style={{ maxWidth: 760 }}><CallToolbar /></div>
  </CallLayoutContext.Provider></RoomStoreContext.Provider>;
}

const meta = {
  title: "Product/Call/CallToolbar",
  component: CallToolbar,
  parameters: { layout: "padded" },
} satisfies Meta<typeof CallToolbar>;
export default meta;
type Story = StoryObj<typeof meta>;

const moment = (facts: () => Record<string, unknown>): Story => ({ render: () => <Bar facts={facts()} /> });

/** Paired, not in the call: the call button joins. */
export const NotJoined = moment(() => PAIRED);
/** Joining: the line says each step, with its dot. */
export const Joining = moment(() => ({ ...PAIRED, connecting: true, joinStep: "voice", joinProgress: 42 }));
/** In the call: the call button hangs up; Skip waits for a reply to sound. */
export const InCall = moment(() => IN_CALL);
/** A reply sounding: Skip can be pressed. */
export const ReplyPlaying = moment(() => ({ ...IN_CALL, botLive: true }));
/** Muted: the microphone's pill in the muted red. */
export const Muted = moment(() => ({ ...IN_CALL, micEnabled: false }));
/** Held to talk while muted: listening's green, ringed. */
export const HoldingToTalk = moment(() => ({ ...IN_CALL, micEnabled: false, holding: true }));
/** The microphone gives no sound though it is not muted (another app holds it): its note over the pill. */
export const MicSilent = moment(() => ({ ...IN_CALL, voiceState: { microphone: "muted" } }));
/** In the call with no conversation chosen: the microphone is off and says why. */
export const NoConversation = moment(() => ({ ...IN_CALL, roomBinding: null }));
/** Getting the call back after a drop: the call button breathes. */
export const Reconnecting = moment(() => ({ ...IN_CALL, reconnecting: true, reconnectShown: true }));
/** A join that failed: the line in the danger colour with its warning mark, and the raw text behind Details. */
export const JoinFailed = moment(() => ({ ...PAIRED, joinFailure: translator()("session.reach.offlineNamed", { host: "NUC" }),
  joinFailureDetails: "connect ECONNREFUSED 192.168.1.20:45781" }));
/** Not paired with any machine: the standing note where a join starts, before any tap. */
export const NoMachine = moment(() => ({ machinesReady: true }));
