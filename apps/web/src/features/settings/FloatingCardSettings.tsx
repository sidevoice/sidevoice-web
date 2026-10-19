import { useEffect, useState, type CSSProperties } from "react";
import { Button } from "../../components/ui/Button";
import { ChoiceCard, Group, Row, Section } from "../../components/ui/Card";
import { Segmented } from "../../components/ui/Tabs";
import { CharacterAvatar } from "../avatar/CharacterAvatar";
import { stillAvatar } from "../avatar/avatar-state";
import { avatarFor, avatarTone, SIDEVOICE_MASCOT } from "../avatar/avatar-spec";
import { avatarColor } from "../avatar/bicho-draw";
import { callControlsBridge, type CallControlsBridge } from "../../services/desktop-host";
import { useRoomStore } from "../../state/room-store";
import { CARD_CORNERS, CARD_FORMATS, CARD_SIZES, setFloatingCard, useFloatingCard, type CardCorner, type CardFormat } from "../../state/floating-card";
import { DesktopCallSettings } from "./DesktopCallSettings";
import type { MessageKey, Translate } from "../../i18n/translator";

/* Settings → Floating card, after Call, in the desktop app only (where its card is): the card's style with a still,
 * simplified preview of each, its starting size, the corner it first appears in, whether the call's controls always show,
 * and forgetting where the person moved it and the size they left it at (decided 2026-10-19, sidevoice-playground#131).
 * The style and size are this device's (state/floating-card.ts); the rest is the app's (CallControlsBridge). */

const FORMAT_WORDS: Record<CardFormat, { name: MessageKey; hint: MessageKey }> = {
  card: { name: "settings.floatingCard.format.card", hint: "settings.floatingCard.format.cardHint" },
  pip: { name: "settings.floatingCard.format.pip", hint: "settings.floatingCard.format.pipHint" },
  avatar: { name: "settings.floatingCard.format.avatar", hint: "settings.floatingCard.format.avatarHint" },
};

/** Shown only inside the app, where it offers the floating card. */
export function useFloatingCardSection(): boolean {
  return !!callControlsBridge();
}

export function FloatingCardSettings({ t }: { t: Translate }) {
  const bridge = callControlsBridge();
  const prefs = useFloatingCard();
  const [app, setApp] = useState<{ corner?: CardCorner; moved?: boolean } | null>(null);
  useEffect(() => {
    let gone = false;
    void bridge?.settings().then((value) => { if (!gone) setApp({ corner: value.corner, moved: value.moved }); }).catch(() => undefined);
    return () => { gone = true; };
  }, [bridge]);
  if (!bridge) return null;
  // A change shows the real card for a moment, where the app offers it.
  const changed = () => bridge.preview?.();
  return <Section id="floating-card" title={t("settings.section.floatingCard")} description={t("settings.floatingCard.description")}>
    <Group>
      <Row label={t("settings.floatingCard.style")} block>
        <div className="floating-card-choices" role="radiogroup" aria-label={t("settings.floatingCard.style")}>
          {CARD_FORMATS.map((format) => (
            <ChoiceCard key={format} className="floating-card-choice" selected={prefs.format === format}
              onSelect={() => { setFloatingCard({ format }); changed(); }}>
              <CardPreview format={format} />
              <strong>{t(FORMAT_WORDS[format].name)}</strong>
              <small>{t(FORMAT_WORDS[format].hint)}</small>
            </ChoiceCard>
          ))}
        </div>
      </Row>
      <Row label={t("settings.floatingCard.size")} description={prefs.format === "pip" ? t("settings.floatingCard.sizeHint") : undefined}>
        <Segmented size="sm" label={t("settings.floatingCard.size")} value={prefs.size} onChange={(size) => {
          setFloatingCard({ size });
          // A preset drops a size the person dragged the picture to; the card shows once the app has.
          void Promise.resolve(bridge.clearSize?.()).catch(() => undefined).then(changed);
        }}
          items={CARD_SIZES.map((size) => ({ value: size, label: t(`settings.floatingCard.size.${size}` as MessageKey) }))} />
      </Row>
      {bridge.setCorner && <CornerRow bridge={bridge} corner={app?.corner ?? "tr"} t={t}
        onChange={(corner) => { setApp((now) => ({ ...now, corner })); changed(); }} />}
      <DesktopCallSettings t={t} />
      {bridge.resetPlace && <Row label="">
        <Button variant="secondary" size="sm" disabled={app?.moved === false}
          onClick={() => { void bridge.resetPlace!().then(() => { setApp((now) => ({ ...now, moved: false })); changed(); }); }}>
          {t("settings.floatingCard.reset")}
        </Button>
      </Row>}
    </Group>
  </Section>;
}

/** Where a card first appears: four spots on a small screen. */
function CornerRow({ bridge, corner, onChange, t }: { bridge: CallControlsBridge; corner: CardCorner; onChange(corner: CardCorner): void; t: Translate }) {
  return <Row label={t("settings.floatingCard.corner")} description={t("settings.floatingCard.cornerHint")}>
    <div className="floating-card-corners" role="radiogroup" aria-label={t("settings.floatingCard.corner")}>
      {CARD_CORNERS.map((each) => {
        const label = t(`settings.floatingCard.corner.${each}` as MessageKey);
        return <button key={each} type="button" role="radio" className="floating-card-corner" data-corner={each} aria-checked={each === corner}
          aria-label={label} title={label} onClick={() => { void bridge.setCorner!(each).then((value) => onChange(value.corner)); }} />;
      })}
    </div>
  </Row>;
}

/** A still, simplified picture of a format where it first sits, on a corner of a screen in the page's theme: shapes for
 *  its words and controls, and the creature it would show (the call's conversation's; else the first; else Sidevoice's
 *  own), still. */
function CardPreview({ format }: { format: CardFormat }) {
  const threadId = useRoomStore((state) => state.session.selected ?? state.participants[0]?.threadId ?? null);
  const spec = threadId ? avatarFor(threadId) : SIDEVOICE_MASCOT;
  const tone = avatarTone(threadId ? avatarColor(spec) : "#c9b6ec") as CSSProperties;
  const figure = <CharacterAvatar spec={spec} state={STILL} size={format === "avatar" ? "stage" : "small"} />;
  return <span className="floating-card-preview" data-format={format} aria-hidden="true" style={tone}>
    {format === "card" && <span className="fcp-card"><span className="fcp-face">{figure}</span><span className="fcp-lines"><i /><i /><i /></span></span>}
    {format === "pip" && <span className="fcp-pip"><span className="fcp-lines"><i /></span><span className="fcp-stage">{figure}</span><span className="fcp-bar"><i /><i /><i /><i /></span></span>}
    {format === "avatar" && <span className="fcp-avatar">{figure}</span>}
  </span>;
}

const STILL = stillAvatar("idle");
