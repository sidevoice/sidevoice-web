import type { ReactNode } from "react";
import { ChoiceCard } from "../../components/ui/Card";
import { OtherMachineIcon, ThisComputerIcon } from "../../components/ui/Icons";
import type { Translate } from "../../i18n/translator";

export type MachineChoice = "agents" | "remote";

/* Where the agents run, as two cards — this computer (where this app can prepare it) and another machine — each with a
 * line on what it means. One look wherever it is asked (operator, 2026-10-16): the setup's Where you work, a choice
 * Continue confirms (`chosen`: radio cards); and the call area's no machine screen, where a card acts at once (no
 * `chosen`: plain buttons). */
export function MachineChoices({ local, label, chosen, onChoose, t }: {
  local: boolean; label: string; chosen?: MachineChoice | null; onChoose(choice: MachineChoice): void; t: Translate;
}) {
  const cards: { choice: MachineChoice; icon: ReactNode; title: string; note: string }[] = [
    ...(local ? [{ choice: "agents" as const, icon: <ThisComputerIcon size={20} />, title: t("wizard.choice.local"), note: t("wizard.choice.localNote") }] : []),
    { choice: "remote", icon: <OtherMachineIcon size={20} />, title: t("wizard.choice.remote"), note: t("wizard.choice.remoteNote") },
  ];
  const body = (card: (typeof cards)[number]) => <>{card.icon}<strong>{card.title}</strong><span className="machine-choice-note">{card.note}</span></>;
  if (chosen === undefined) return <div className="machine-choices" role="group" aria-label={label}>
    {cards.map((card) => <button key={card.choice} type="button" id={`machine-choice-${card.choice}`} className="ui-card ui-card--padded ui-card--interactive"
      onClick={() => onChoose(card.choice)}>{body(card)}</button>)}
  </div>;
  return <div className="machine-choices" role="radiogroup" aria-label={label}>
    {cards.map((card) => <ChoiceCard key={card.choice} selected={chosen === card.choice} onSelect={() => onChoose(card.choice)}>{body(card)}</ChoiceCard>)}
  </div>;
}
