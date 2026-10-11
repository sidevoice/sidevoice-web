import { useContext, useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { useVariant } from "../../lib/variants";
import { RoomStoreContext, useRoomStore } from "../../state/room-store";
import { selectInCall } from "../call/stage-view";
import { useOnboardingIfAny } from "../onboarding/onboarding-context";
import { hostTranslator, type HostTranslate } from "../settings/host-i18n";
import { FEATURES, type Feature } from "./catalogue";
import "./whats-new.css";

/* What's new for someone already set up: only what a later release added that needs them (FEATURES), never the setup
 * again. Shown once a session, on entering the room after the setup (finished or put off), never during a call or over
 * another dialog. Set up opens exactly where it is set up; Got it is seen; Later brings it back after a day (a second
 * Later is seen). Where it shows is a design to compare (VARIANTS `whats-new`): a small dialog, or a section of the
 * updates' list (UpdatesEntry). */
export const WHATS_NEW = ["dialog", "panel"] as const;
export function useWhatsNewPlace() { return useVariant("whats-new", WHATS_NEW); }

const DAY = 24 * 60 * 60 * 1000;

export function useWhatsNew() {
  const onboarding = useOnboardingIfAny();
  const room = useRoomStore((state) => state);
  const store = useContext(RoomStoreContext);
  const record = onboarding?.record;
  const settled = !!record && !!(record.completed_at || record.deferred_at) && !onboarding?.open;
  const items = !settled ? [] : FEATURES
    .filter((feature) => feature.introducedIn > record!.baseline_release && !feature.achieved(room))
    .filter((feature) => {
      const answer = record!.features[feature.id];
      return !answer || (answer.state === "later" && Date.now() - answer.at > DAY);
    })
    .sort((a, b) => b.introducedIn - a.introducedIn).slice(0, 3);
  const mark = (state: "seen" | "done" | "later", ids = items.map((item) => item.id)) => {
    // A second Later is as good as seen.
    const twice = state === "later" ? ids.filter((id) => record?.features[id]?.state === "later") : [];
    void onboarding?.markFeatures(ids.filter((id) => !twice.includes(id)), state);
    if (twice.length) void onboarding?.markFeatures(twice, "seen");
  };
  // Settings opened first — its opening picks a section of its own (Machines, with no machine reachable) — then its
  // section and the control in it, which Settings brings into view and points at (settingsFocus).
  const setUp = (feature: Feature) => {
    void onboarding?.markFeatures([feature.id], "done");
    document.getElementById("settings-open")?.click();
    store?.patch({ settingsSection: feature.section, settingsFocus: feature.control });
  };
  return { items, mark, setUp };
}

export function WhatsNewList({ items, onSetUp, t }: { items: Feature[]; onSetUp(feature: Feature): void; t: HostTranslate }) {
  return <ul className="whats-new-list">{items.map((feature) => (
    <li key={feature.id} className="whats-new-item">
      <span><strong>{t(feature.title)}</strong><span className="whats-new-line">{t(feature.line)}</span></span>
      <Button size="sm" variant="secondary" onClick={() => onSetUp(feature)}>{t("whatsNew.setUp")}</Button>
    </li>
  ))}</ul>;
}

/** Shown once a session (this tab), whatever it answered. */
const SHOWN_KEY = "sidevoice.whats-new-shown";
const shown = () => { try { return sessionStorage.getItem(SHOWN_KEY) === "1"; } catch { return false; } };
const markShown = () => { try { sessionStorage.setItem(SHOWN_KEY, "1"); } catch { /* Once per load, then. */ } };

/** The dialog (VARIANTS whats-new "dialog"): at most three, once per load, when nothing else is in the way. */
export function WhatsNew() {
  const t = hostTranslator();
  const place = useWhatsNewPlace();
  const inCall = useRoomStore(selectInCall);
  const { items, mark, setUp } = useWhatsNew();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (place !== "dialog" || shown() || open || inCall || !items.length) return;
    if (document.querySelector("dialog[open]")) return;
    markShown();
    setOpen(true);
  }, [place, open, inCall, items.length]);
  const close = (state: "seen" | "later") => { mark(state); setOpen(false); };
  return <Dialog open={open} size="sm" titleId="whats-new-title" title={t("whatsNew.title")} onClose={() => close("later")}
    footer={<><Button variant="ghost" tone="neutral" onClick={() => close("later")}>{t("whatsNew.later")}</Button><Button variant="primary" onClick={() => close("seen")}>{t("whatsNew.gotIt")}</Button></>}>
    <WhatsNewList items={items} t={t} onSetUp={(feature) => { setOpen(false); setUp(feature); }} />
  </Dialog>;
}
