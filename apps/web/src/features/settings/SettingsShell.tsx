import { useEffect, useState, type ReactNode } from "react";
import { Button } from "../../components/ui/Button";
import { AdvancedIcon, AppIcon, GeneralIcon, MachinesIcon, TranscriptionIcon, VoicesIcon } from "../../components/ui/Icons";
import { hostTranslator } from "./host-i18n";

interface SettingsShellProps {
  children: ReactNode;
  hasMachines: boolean;
  appAvailable: boolean;
}

/** One Settings navigation for device, app, and machine settings. The room controller still owns saving and stage actions. */
export function SettingsShell({ children, hasMachines, appAvailable }: SettingsShellProps) {
  const t = hostTranslator();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("general");

  useEffect(() => {
    const selectSection = (event: Event) => {
      const section = (event as CustomEvent<{ name?: string }>).detail?.name;
      if (section) setActiveSection(section);
    };
    window.addEventListener("sidevoice:settings-section", selectSection);
    return () => window.removeEventListener("sidevoice:settings-section", selectSection);
  }, []);

  return (
    <div className="settings-shell">
      <div className="settings-layout">
        <aside className="settings-sidebar" data-open={mobileNavOpen || undefined}>
          <Button
            type="button"
            className="settings-nav-toggle"
            variant="ghost"
            aria-expanded={mobileNavOpen}
            aria-controls="settings-navigation"
            onClick={() => setMobileNavOpen((open) => !open)}
          >
            {t(mobileNavOpen ? "settings.navigation.close" : "settings.navigation.open")}
          </Button>
          <nav
            id="settings-navigation"
            className="settings-nav"
            aria-label={t("settings.sections")}
            data-mobile-open={mobileNavOpen || undefined}
            onClickCapture={(event) => {
              const button = (event.target as Element).closest("button");
              if (!button) return;
              setMobileNavOpen(false);
              const paneId = button.getAttribute("aria-controls");
              if (paneId) requestAnimationFrame(() => {
                const heading = document.getElementById(paneId)?.querySelector<HTMLElement>("h3");
                if (heading) { heading.tabIndex = -1; heading.focus(); }
              });
            }}
          >
            <Button type="button" variant="ghost" id="settings-general" aria-controls="pane-general" aria-pressed={activeSection === "general"}><GeneralIcon /> {t("settings.general")}</Button>
            {appAvailable && <Button type="button" variant="ghost" id="settings-app" aria-controls="pane-app" aria-pressed={activeSection === "app"}><AppIcon /> {t("settings.thisApp")}</Button>}
            <Button type="button" variant="ghost" id="settings-advanced" aria-controls="pane-advanced" aria-pressed={activeSection === "advanced"}><AdvancedIcon /> {t("settings.advanced")}</Button>
            {!hasMachines && <>
              <Button type="button" variant="ghost" id="settings-voice" aria-controls="pane-voice" aria-pressed={activeSection === "voice"}><VoicesIcon /> {t("settings.voice")}</Button>
              <Button type="button" variant="ghost" id="settings-transcription" aria-controls="pane-transcription" aria-pressed={activeSection === "transcription"}><TranscriptionIcon /> {t("settings.transcription")}</Button>
            </>}
            <Button type="button" variant="ghost" id="settings-machines" aria-controls="pane-machines" aria-pressed={activeSection === "machines"}><MachinesIcon /> {t("hosts.title")}</Button>
          </nav>
        </aside>
        <div className="settings-content">{children}</div>
      </div>
    </div>
  );
}
