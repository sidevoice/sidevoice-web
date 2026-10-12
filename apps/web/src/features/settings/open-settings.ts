import type { RoomStore } from "../../state/room-store";

/* Settings, opened from anywhere, the one way: the gear pressed — the runtime opens Settings from #settings-open's own
 * handler (it reads the machines' agents and the catalogues again, and picks Machines when no machine answers) — and,
 * when a place in it is asked for, that section's page, a machine's within Machines, a control in it brought into view
 * (`settingsFocus`). The place is set after the press, so the runtime's own pick never wins over it. Where it lands is
 * decided per opening: on a phone the list of sections unless a place is asked for (settings-levels.tsx); on a desktop
 * the section asked for, else the one it was left at. */
export interface SettingsPlace {
  section?: string;
  /** Within Machines: the machine's page (a phone's third level); its list on a phone, the first on a desktop, if none. */
  machine?: string | null;
  /** A control's id, in view and focused once its section is drawn. */
  focus?: string;
}

export function openSettings(place: SettingsPlace = {}, store?: RoomStore | null) {
  document.getElementById("settings-open")?.click();
  const { section, machine, focus } = place;
  if (!section) return;
  store?.patch({ settingsSection: section, settingsLevel: "page", ...(section === "machines" ? { machinesView: { machine: machine ?? null } } : {}), ...(focus ? { settingsFocus: focus } : {}) });
}
