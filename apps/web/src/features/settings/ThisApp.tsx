/* «Esta app» (ONBOARDING_AND_HOSTS.md §5.5): what the desktop app's native Settings window holds today, moved into
 * the one Settings — the global mute shortcut, the call controls, the headset, the agents on this computer, the
 * diagnostics (this computer, the native engine, each stage) and «Borrar datos…». Only in the app. */
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { keyPlatform, ShortcutField } from "../../components/ui/Shortcut";
import { desktopHost } from "../../services/desktop-host";
import { currentLanguage, useT } from "../../i18n";
import { useRoomStore } from "../../state/room-store";
import { useHosts, useHostsController } from "../../state/hosts/hosts-store";
import { bytesText, CopyButton } from "../hosts/common";

/** The bundle's sentence for a key, or null when the bundles do not have it. */
function known(t: ReturnType<typeof useT>, key: string, params: Record<string, string>): string | null {
  const text = t(key, params);
  return text === key ? null : text;
}

export function ThisApp() {
  const t = useT();
  const hosts = useHostsController();
  const settings = useHosts((s) => s.appSettings);
  const diagnostics = useHosts((s) => s.diagnostics);
  const localFp = useHosts((s) => s.localPairing?.fp ?? null);
  const canHostAgents = useHosts((s) => s.canHostAgents);
  const stages = useRoomStore((s) => s.stages);
  const [shortcut, setShortcut] = useState(settings?.muteShortcut ?? "");
  const [note, setNote] = useState<{ text: string; warn: boolean } | null>(null);
  const [testing, setTesting] = useState(false);
  useEffect(() => { setShortcut(settings?.muteShortcut ?? ""); }, [settings?.muteShortcut]);
  const lang = currentLanguage();
  const yes = (v: boolean) => t(v ? "common.yes" : "common.no");

  async function saveShortcut(next = shortcut) {
    if (next === settings?.muteShortcut) return;
    setShortcut(next);
    const result = await hosts.updateApp({ muteShortcut: next });
    setNote(result.ok ? { text: result.warning ? t("app." + result.warning) : t("app.shortcut.saved"), warn: !!result.warning }
      : { text: known(t, "app." + result.error.key, { value: result.error.detail ?? "" }) ?? t("app.shortcut.refused", { message: result.error.message ?? result.error.key }), warn: true });
  }

  const computerRows: [string, string][] = diagnostics ? [
    [t("app.diag.version"), diagnostics.version],
    [t("app.diag.system"), diagnostics.os + " · " + diagnostics.arch],
    [t("app.diag.accelerators"), diagnostics.accelerators.join(", ")],
    [t("app.diag.memory"), diagnostics.memory_mb ? new Intl.NumberFormat(lang, { style: "unit", unit: "gigabyte", maximumFractionDigits: 1 }).format(diagnostics.memory_mb / 1024) : t("app.diag.unknown")],
    [t("app.diag.microphone"), yes(diagnostics.webview.microphone)],
    [t("app.diag.secure"), yes(diagnostics.webview.secureContext)],
    [t("app.diag.webcrypto"), yes(diagnostics.webview.webCrypto)],
  ] : [];
  const engineLines = diagnostics ? [
    ...diagnostics.engine.packages.map((p) => t("app.engine.package", { engine: p.engine, version: p.version, size: bytesText(p.bytes, lang) })),
    ...diagnostics.engine.builds.map((b) => t("app.engine.build", { model: b.model, task: t(b.task === "stt" ? "stage.sttLower" : "stage.ttsLower"), engine: b.engine, size: bytesText(b.bytes, lang) })),
  ] : [];
  const stageRows = (["stt", "tts"] as const).map((task) => ({ task, rows: stages?.[task]?.diagnostics?.rows ?? [] }));
  const copyText = () => [
    t("app.diag.computer"), ...computerRows.map(([k, v]) => k + ": " + v),
    "", t("app.engine.title"), ...(engineLines.length ? engineLines : [t("app.engine.none")]),
    ...stageRows.flatMap(({ task, rows }) => ["", t(task === "stt" ? "stage.stt" : "stage.tts"), ...rows.map((r) => r.label + ": " + r.value)]),
  ].join("\n");

  return (
    <section className="pane this-app">
      <h3>{t("settings.thisApp")}</h3>

      <h4>{t("app.shortcut.title")}</h4>
      {/* The keys as keys, in this platform's words, recorded rather than typed (operator, 2026-10-02). */}
      <div className="ui-field">
        <span className="ui-field-label">{t("app.shortcut.label")}</span>
        <ShortcutField value={shortcut} platform={keyPlatform(desktopHost()?.platform)} label={t("app.shortcut.label")} onChange={(next) => void saveShortcut(next)} />
      </div>
      <p className="muted small">{t("app.shortcut.hint")}</p>
      {note && <p className={note.warn ? "warn-line" : "ok-line"} role="status">{note.text}</p>}

      <h4>{t("app.controls.title")}</h4>
      <label className="switch-row">
        <input type="checkbox" role="switch" checked={!!settings?.callControlsAlways} onChange={(e) => void hosts.updateApp({ callControlsAlways: e.currentTarget.checked })} />
        <span><strong>{t("app.controls.always")}</strong><span className="muted"> {t("app.controls.detail")}</span></span>
      </label>

      <h4>{t("app.headset.title")}</h4>
      <p className="muted small">{t("app.headset.hint")}</p>
      <p className="muted small">{diagnostics?.headset.supported ? t(diagnostics.headset.muteGesture ? "app.headset.gesture" : "app.headset.noGesture") : t("app.headset.unsupported")}</p>
      <Button size="compact" disabled={testing || !diagnostics?.headset.supported} onClick={async () => { setTesting(true); await hosts.headsetTest(); setTesting(false); }}>{testing ? t("app.headset.testing") : t("app.headset.test")}</Button>

      <h4>{t("app.agents.title")}</h4>
      {localFp ? <Button variant="ghost" size="compact" onClick={() => hosts.openSettings("host", localFp, "agents")}>{t("app.agents.open")}</Button>
        : canHostAgents ? <><p className="muted small">{t("app.agents.none")}</p><Button size="compact" onClick={() => { hosts.closeSettings(); void hosts.choosePath("agents").then(() => hosts.openWizard("W1")); }}>{t("hosts.useAgentsHere")}</Button></>
          : <p className="muted small">{t("app.agents.unsupported")}</p>}

      <h4>{t("app.diag.title")}</h4>
      <h5>{t("app.diag.computer")}</h5>
      <dl className="stage-check-rows">{computerRows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <h5>{t("app.engine.title")}</h5>
      <p className="muted small">{t("app.engine.hint")}</p>
      {engineLines.length ? <ul className="plain-list">{engineLines.map((line) => <li key={line}>{line}</li>)}</ul> : <p className="muted small">{t("app.engine.none")}</p>}
      {stageRows.map(({ task, rows }) => rows.length > 0 && (
        <div key={task}>
          <h5>{t(task === "stt" ? "stage.stt" : "stage.tts")}</h5>
          <dl className="stage-check-rows">{rows.map((r) => <div key={r.label}><dt>{r.label}</dt><dd>{r.value}</dd></div>)}</dl>
        </div>
      ))}
      <div className="row-actions"><CopyButton text={copyText} label={t("app.diag.copy")} /></div>

      <h4>{t("app.data.title")}</h4>
      <p className="muted small">{t("app.data.hint")}</p>
      <Button variant="danger" size="compact" onClick={() => hosts.openReset()}>{t("app.data.reset")}</Button>
    </section>
  );
}
