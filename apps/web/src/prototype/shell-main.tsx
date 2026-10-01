/* PROTOTYPE ONLY — the frame around the app (prototype.html): the scenario switcher, the toggles, sample pairing
 * codes, and the app seen as the desktop app (window, menu bar with the tray menu, the collapsed call card), as a
 * browser, or as a phone. The app itself runs in an iframe, so the room's own responsive layout applies. The URL
 * keeps scenario, view, language and toggles: a link reproduces the screen. */
/// <reference types="vite/client" />
import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useRef, useState } from "react";
import "../styles/tokens.css";
import "./shell.css";
import { readParams, SCENARIOS, TOGGLES, writeParams, scenarioById, type Toggles, type View } from "./scenario";

function SidevoiceMark({ size = 16 }: { size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true"><rect x="1.5" y="9" width="3" height="6" rx="1.5" /><rect x="6" y="6" width="3" height="12" rx="1.5" /><rect x="10.5" y="1.5" width="3" height="21" rx="1.5" /><rect x="15" y="6" width="3" height="12" rx="1.5" style={{ fill: "var(--sv-voice)" }} /><rect x="19.5" y="9" width="3" height="6" rx="1.5" /></svg>;
}

function useNarrow() {
  const query = "(max-width: 760px)";
  const [narrow, setNarrow] = useState(() => matchMedia(query).matches);
  useEffect(() => { const m = matchMedia(query); const on = () => setNarrow(m.matches); m.addEventListener("change", on); return () => m.removeEventListener("change", on); }, []);
  return narrow;
}

function Shell() {
  const initial = useMemo(() => readParams(location.search), []);
  const [scenario, setScenario] = useState(initial.scenario.id);
  const [view, setView] = useState<View>(initial.view);
  const [lang, setLang] = useState(initial.lang);
  const [toggles, setToggles] = useState<Toggles>(initial.toggles);
  const [generation, setGeneration] = useState(0);
  const [panelOpen, setPanelOpen] = useState(!matchMedia("(max-width: 760px)").matches);
  const [hosts, setHosts] = useState<{ alias: string; name: string }[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const [trayOpen, setTrayOpen] = useState(false);
  // The card floats while a call is on: shown for the scenarios that start configured, from the tray otherwise.
  const [card, setCard] = useState(!!initial.scenario.stages);
  const [cardSize, setCardSize] = useState({ width: 344, height: 80 });
  const frame = useRef<HTMLIFrameElement>(null);
  const narrow = useNarrow();
  const current = scenarioById(scenario);
  const [at, setAt] = useState<string | null>(initial.at);
  const query = writeParams({ scenario, view, lang, toggles, at });
  // The frame loads once per generation: a live toggle changes the URL, not the running app.
  const [src, setSrc] = useState("prototype-app.html" + query);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setSrc("prototype-app.html" + query); }, [generation]);

  useEffect(() => { history.replaceState(null, "", query); }, [query]);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { source?: string; type?: string; scenario?: string; hosts?: { alias: string; name: string }[]; pasted?: boolean; width?: number; height?: number; command?: string };
      if (data?.source !== "sidevoice-prototype" && data?.source !== "sidevoice-card") return;
      if (data.type === "ready") setHosts(data.hosts ?? []);
      if (data.type === "step") setAt((data as { step?: string | null }).step ?? null);
      if (data.type === "relaunch" && data.scenario) { setScenario(data.scenario); setToggles({}); setGeneration((g) => g + 1); say("Relanzada tras «Borrar datos» → " + data.scenario); }
      if (data.type === "size" && data.width) setCardSize({ width: data.width, height: data.height ?? 80 });
      if (data.type === "command") {
        if (data.command === "open-app") send({ type: "open-app" });
        else say("Tarjeta: «" + data.command + "» (la llamada no está simulada)");
      }
      if (data.type === "code-sent") say(data.pasted ? "Código pegado en el campo" : "Código copiado al portapapeles (abre el campo del código y pégalo)");
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  function say(text: string) { setFlash(text); setTimeout(() => setFlash(null), 3000); }
  const send = (message: Record<string, unknown>) => frame.current?.contentWindow?.postMessage({ source: "sidevoice-shell", ...message }, "*");
  function setToggle(id: string, value: string | boolean) {
    const next = { ...toggles, [id]: value };
    setToggles(next);
    if (TOGGLES.find((d) => d.id === id)?.reload) setGeneration((g) => g + 1);
    else send({ type: "toggles", toggles: next });
  }
  function choose(id: string) { setAt(null); setScenario(id); const s = scenarioById(id); setView(s.view ?? (s.inApp ? "app" : "browser")); setGeneration((g) => g + 1); }
  const groups = [...new Set(TOGGLES.map((d) => d.group))];
  const active = Object.values(toggles).filter(Boolean).length;
  const effectiveView: View = narrow ? (view === "app" ? "app" : "phone") : view;

  const iframe = <iframe key={generation + ":" + src} ref={frame} className="app-frame" src={src} title="Sidevoice" />;

  return (
    <div className="proto" data-view={effectiveView} data-narrow={narrow || undefined} data-panel={panelOpen || undefined}>
      {narrow ? <div className="bare">{iframe}</div> : effectiveView === "app" ? (
        <div className="desktop">
          <div className="menubar">
            <span className="menubar-left"><b></b><b>Sidevoice</b><span>Archivo</span><span>Edición</span><span>Ventana</span></span>
            <span className="menubar-right">
              <button type="button" className="tray-icon" aria-expanded={trayOpen} aria-label="Sidevoice (bandeja)" onClick={() => setTrayOpen(!trayOpen)}><SidevoiceMark size={15} /></button>
              <span>mié 1 oct · 16:20</span>
              {trayOpen && (
                <div className="tray-menu" role="menu" onMouseLeave={() => setTrayOpen(false)}>
                  <button role="menuitem" onClick={() => { setTrayOpen(false); send({ type: "open-app" }); }}>Abrir Sidevoice</button>
                  <button role="menuitem" onClick={() => { setTrayOpen(false); send({ type: "open-settings", pane: "app" }); }}>Configuración… <small>(abre Configuración › Esta app)</small></button>
                  <hr />
                  <button role="menuitem" onClick={() => { setTrayOpen(false); setCard(!card); }}>{card ? "Ocultar" : "Mostrar"} los controles de llamada</button>
                  <button role="menuitem" disabled>Silenciar micrófono ⇧⌘M</button>
                  <hr />
                  <button role="menuitem" disabled>Salir de Sidevoice</button>
                </div>
              )}
            </span>
          </div>
          <div className="window">
            <div className="titlebar"><span className="lights"><i /><i /><i /></span><span className="title">Sidevoice</span></div>
            {iframe}
          </div>
          {card && <iframe className="card-frame" src={"prototype-card.html?lang=" + (lang || "")} title="Sidevoice · controles de llamada" style={{ width: cardSize.width, height: cardSize.height }} />}
        </div>
      ) : effectiveView === "browser" ? (
        <div className="browser">
          <div className="browser-bar"><span className="lights"><i /><i /><i /></span><span className="address">🔒 sala.sidevoice.example/voice/</span></div>
          {iframe}
        </div>
      ) : (
        <div className="phone"><div className="phone-notch" /><div className="phone-status"><span>9:41</span><span>5G ▮▮▮</span></div>{iframe}</div>
      )}

      <aside className="panel" data-open={panelOpen || undefined} aria-label="Prototipo">
        <button type="button" className="panel-toggle" onClick={() => setPanelOpen(!panelOpen)} aria-expanded={panelOpen}>
          <SidevoiceMark size={14} /> PROTOTIPO{active ? ` · ${active}` : ""} {panelOpen ? "▾" : "▸"}
        </button>
        {panelOpen && (
          <div className="panel-body">
            <p className="panel-warning">Solo prototipo: núcleo, puente de escritorio y hosts simulados. Nada sale de esta página.</p>
            <label>Escenario
              <select value={scenario} onChange={(e) => choose(e.currentTarget.value)}>
                {SCENARIOS.map((s) => <option key={s.id} value={s.id}>{s.id} · {s.title}</option>)}
              </select>
            </label>
            <p className="walk">{current.walk}</p>
            <div className="seg" role="group" aria-label="Vista">
              {(["app", "browser", "phone"] as View[]).map((v) => (
                <button key={v} type="button" aria-pressed={view === v} onClick={() => { setView(v); setGeneration((g) => g + 1); }}>{v === "app" ? "App escritorio" : v === "browser" ? "Navegador" : "Móvil"}</button>
              ))}
            </div>
            <div className="seg" role="group" aria-label="Idioma">
              {[["", "Sistema"], ["es", "ES"], ["en", "EN"]].map(([v, label]) => (
                <button key={v} type="button" aria-pressed={lang === v} onClick={() => { setLang(v); setGeneration((g) => g + 1); }}>{label}</button>
              ))}
            </div>
            {hosts.length > 0 && (
              <details className="codes" open>
                <summary>Códigos de emparejamiento</summary>
                {hosts.map((h) => (
                  <div key={h.alias} className="code-row">
                    <span>{h.name}</span>
                    <button type="button" onClick={() => send({ type: "code", alias: h.alias, variant: "valid" })}>válido</button>
                    <button type="button" onClick={() => send({ type: "code", alias: h.alias, variant: "expired" })}>caducado</button>
                    <button type="button" onClick={() => send({ type: "code", alias: h.alias, variant: "loopback" })}>solo loopback</button>
                    <button type="button" onClick={() => send({ type: "code", alias: h.alias, variant: "plaintext" })}>http</button>
                    <button type="button" onClick={() => send({ type: "code", alias: h.alias, variant: "malformed" })}>malformado</button>
                  </div>
                ))}
              </details>
            )}
            <details className="toggles">
              <summary>Variantes ({active})</summary>
              {groups.map((group) => (
                <fieldset key={group}>
                  <legend>{group}</legend>
                  {TOGGLES.filter((d) => d.group === group).map((d) => d.options ? (
                    <label key={d.id} className="toggle-select">{d.label}{d.reload ? " ↻" : ""}
                      <select value={String(toggles[d.id] || "")} onChange={(e) => setToggle(d.id, e.currentTarget.value)}>
                        {d.options.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
                      </select>
                    </label>
                  ) : (
                    <label key={d.id} className="toggle-check"><input type="checkbox" checked={!!toggles[d.id]} onChange={(e) => setToggle(d.id, e.currentTarget.checked)} /> {d.label}{d.reload ? " ↻" : ""}</label>
                  ))}
                </fieldset>
              ))}
              <p className="hint">↻ reinicia el escenario. El resto se aplica en vivo, en la siguiente acción.</p>
            </details>
            <div className="panel-actions">
              <button type="button" onClick={() => setGeneration((g) => g + 1)}>Reiniciar escenario</button>
              <button type="button" onClick={() => { void navigator.clipboard.writeText(location.href); say("Enlace copiado"); }}>Copiar enlace</button>
              {active > 0 && <button type="button" onClick={() => { setToggles({}); setGeneration((g) => g + 1); }}>Quitar variantes</button>}
            </div>
          </div>
        )}
        {flash && <p className="flash" role="status">{flash}</p>}
      </aside>
    </div>
  );
}

createRoot(document.getElementById("shell")!).render(<Shell />);
