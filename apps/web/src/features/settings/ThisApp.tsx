import { useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { desktopAppBridge, type AppDiagnostics as AppDiagnosticsView, type AppSettings } from "../../services/desktop-host";
import { hostTranslator } from "./host-i18n";

/** Native settings are deliberately absent unless the R3 app bridge provides the real operation. */
export function ThisApp() {
  const t = hostTranslator();
  const bridge = desktopAppBridge();
  const appBridge = bridge;
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    let current = true;
    if (!bridge?.settings) return () => { current = false; };
    void bridge.settings().then((value) => { if (current) setSettings(value); })
      .catch(() => { if (current) setNote(t("app.settings.readFailed")); });
    return () => { current = false; };
  }, [bridge]);

  if (!appBridge?.settings || !appBridge.update) return null;
  const updateSettings = appBridge.update.bind(appBridge);

  async function update(patch: Partial<AppSettings>) {
    setNote("");
    const result = await updateSettings(patch);
    if (!result.ok) {
      setNote(t("app.settings.updateFailed"));
      return;
    }
    if (result.settings) setSettings(result.settings);
    else if (settings) setSettings({ ...settings, ...patch });
    setNote(result.warning ? t("app.settings.warning") : t("app.settings.saved"));
  }

  return (
    <section id="pane-app" aria-labelledby="settings-app" hidden>
      <h3>{t("settings.thisApp")}</h3>
      <h4>{t("app.shortcut.title")}</h4>
      <label>{t("app.shortcut.label")}
        <input value={settings?.muteShortcut ?? ""} disabled={!settings} onChange={(event) => {
          const muteShortcut = event.currentTarget.value;
          setSettings((previous) => previous ? { ...previous, muteShortcut } : previous);
        }} onBlur={() => { if (settings) void update({ muteShortcut: settings.muteShortcut }); }} />
      </label>
      <h4>{t("app.controls.title")}</h4>
      <label className="switch-row">
        <input type="checkbox" role="switch" disabled={!settings} checked={!!settings?.callControlsAlways}
          onChange={(event) => void update({ callControlsAlways: event.currentTarget.checked })} />
        <span><strong>{t("app.controls.always")}</strong></span>
      </label>
      {appBridge.headsetTest && <Button type="button" size="compact" onClick={() => void appBridge.headsetTest!()}>{t("app.headset.test")}</Button>}
      {note && <p role="status" className="muted">{note}</p>}
    </section>
  );
}

export function AppDiagnostics() {
  const t = hostTranslator();
  const bridge = desktopAppBridge();
  const [details, setDetails] = useState<AppDiagnosticsView | null>(null);
  useEffect(() => {
    let current = true;
    if (!bridge?.diagnostics) return () => { current = false; };
    void bridge.diagnostics().then((value) => { if (current) setDetails(value); }).catch(() => undefined);
    return () => { current = false; };
  }, [bridge]);
  if (!bridge?.diagnostics) return null;
  return (
    <section className="app-diagnostics">
      <h3>{t("app.diagnostics.title")}</h3>
      {details ? <dl className="app-diagnostics-list">
        <div><dt>{t("app.diagnostics.version")}</dt><dd>{details.version}</dd></div>
        <div><dt>{t("app.diagnostics.platform")}</dt><dd>{details.os} · {details.arch}</dd></div>
        <div><dt>{t("app.diagnostics.accelerators")}</dt><dd>{details.accelerators.join(", ") || t("common.none")}</dd></div>
        <div><dt>{t("app.diagnostics.memory")}</dt><dd>{details.memory_mb == null ? t("common.unknown") : `${Math.round(details.memory_mb)} MB`}</dd></div>
      </dl> : <p className="muted" role="status">{t("common.loading")}</p>}
    </section>
  );
}
