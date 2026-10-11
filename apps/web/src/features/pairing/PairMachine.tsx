import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Field } from "../../components/ui/Field";
import { CheckIcon, ChevronIcon } from "../../components/ui/Icons";
import { InfoTip } from "../../components/ui/InfoTip";
import { Input, Textarea } from "../../components/ui/Input";
import { useVariant } from "../../lib/variants";
import { currentDeviceName } from "../../state/device-name";
import { hostTranslator, type HostTranslate } from "../settings/host-i18n";
import type { HostMessageKey } from "../settings/messages/en";
import {
  ADDRESS_INSECURE, ADDRESS_INVALID, PAIRING_HTTP_BLOCKED, PAIRING_HTTP_ONLY, PAIRING_HTTP_PRIVATE, machineAddress, previewPairingCode,
  type PairingCodePreview,
} from "../../services/device-pairing.js";
import { ConnectorSteps } from "./ConnectorSteps";
import { CONNECTOR_PAIR_DEVICE } from "./connector-commands";
import "./pairing.css";

/* "Connect to your machine": the one-time code from the machine where the agents run (`sidevoice pair-device`, or the
 * agent), pasted on this device — in the first-run setup (W2r) and in the pairing dialog (Settings › Machines › Add a
 * machine). The form is the same everywhere; around it, three layouts the operator compares (VARIANTS `pair-machine`):
 * `code`, one card, the code first and how to get one behind a disclosure; `steps`, what to run on the machine and this
 * form as two numbered steps; `split`, the two side by side from 720px, stacked below. This computer's own machine
 * pairs by itself and never comes here. */
export const PAIR_MACHINE_LAYOUTS = ["code", "steps", "split"] as const;
export function usePairMachineLayout() { return useVariant("pair-machine", PAIR_MACHINE_LAYOUTS); }

type AlertKind = "expired" | "unreachable" | "httpPrivate" | "httpOnly" | "httpBlocked" | "said";
/** Why a code was not redeemed, and where that is said: under the field it is about, or in the form's alert. The
 *  controller rejects with device-pairing.js's code or sentence; they are told apart here. */
type Failure = { field: "code" | "address"; key: HostMessageKey } | { alert: AlertKind; key?: HostMessageKey };

function failure(reason: unknown): Failure {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (message === ADDRESS_INVALID) return { field: "address", key: "pairing.addressInvalid" };
  if (message === ADDRESS_INSECURE) return { field: "address", key: "pairing.addressInsecure" };
  if (message === PAIRING_HTTP_PRIVATE) return { alert: "httpPrivate" };
  if (message === PAIRING_HTTP_ONLY) return { alert: "httpOnly" };
  if (message === PAIRING_HTTP_BLOCKED) return { alert: "httpBlocked" };
  if (/Pega el código/.test(message)) return { field: "code", key: "pairing.empty" };
  if (/empieza por|incompleto o dañado/.test(message)) return { field: "code", key: "pairing.invalid" };
  if (/otra versión|another version|incompatible/i.test(message)) return { field: "code", key: "pairing.incompatible" };
  if (/caduc|expired|already used|already been used/i.test(message)) return { alert: "expired" };
  if (/dónde encontrar|where the machine can be found|solo lleva a la máquina por http/i.test(message)) return { field: "address", key: "pairing.addressNeeded" };
  if (/navegador no puede comprobar|WebCrypto|verify the machine/i.test(message)) return { alert: "said", key: "pairing.noWebCrypto" };
  if (/no es la del código|does not match this code/i.test(message)) return { alert: "said", key: "pairing.identityMismatch" };
  return { alert: "unreachable" };
}

/** What the code pasted says, or nothing while it is not one that could be used. */
function readCode(code: string, now: number): PairingCodePreview | null {
  try { return previewPairingCode(code, now); } catch { return null; }
}

const minutesLeft = (code: PairingCodePreview, now: number) => Math.max(1, Math.ceil((code.exp * 1000 - now) / 60_000));
/** The machine as a sentence names it: its name, quoted as the language quotes, or "the machine". */
const named = (host: string | null | undefined, t: HostTranslate) => host ? t("pairing.named", { host }) : t("pairing.theMachine");
const upperFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
/** A phone or a tablet: the keyboard would cover the screen, so nothing takes the focus by itself. */
const touchFirst = () => typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;

/** The command that prints a new code, copied from the alert that says the old one is spent. */
function CopyCommand() {
  const t = hostTranslator();
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(CONNECTOR_PAIR_DEVICE); setCopied(true); } catch { setCopied(false); }
  }
  return <Button variant="secondary" size="sm" onClick={() => void copy()}>{t(copied ? "noMachine.commandCopied" : "pairing.copyCommand")}</Button>;
}

/** The pairing screen's content: the code, the machine's address when it is needed, and what came of connecting, in the
 *  layout the variant says. Its Connect sits at the end of the form, or, given `submitIn`, in the footer of whatever
 *  holds it (the dialog's, the setup's), still submitting it through its `form` attribute; `null` while that footer is
 *  not there. `howOpen`: how to get a code starts unfolded (the `code` layout's disclosure). */
export function PairMachine({ idPrefix = "device-pairing", autoFocus = false, howOpen = false, rows = 3, submitIn }: {
  idPrefix?: string; autoFocus?: boolean; howOpen?: boolean; rows?: number; submitIn?: HTMLElement | null;
}) {
  const t = hostTranslator();
  const layout = usePairMachineLayout();
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  // The address field, once asked for: "Use a different address", or a machine the code's own addresses did not reach.
  const [addressAsked, setAddressAsked] = useState(false);
  // Connecting: over https (Connect), or without encryption once the person agreed (its own button).
  const [busy, setBusy] = useState<"https" | "insecure" | null>(null);
  const [fieldError, setFieldError] = useState<{ field: "code" | "address"; key: HostMessageKey } | null>(null);
  const [alert, setAlert] = useState<{ kind: AlertKind; key?: HostMessageKey; host: string; address: string } | null>(null);
  const [connected, setConnected] = useState("");
  // What a screen reader hears once when a code is recognised; the line under the field counts the minutes down quietly.
  const [heard, setHeard] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [how, setHow] = useState(howOpen);
  // The address the code itself filled in, replaced when the code changes unless the person wrote their own.
  const prefilled = useRef("");
  const focusAddress = useRef(false);
  const codeField = useRef<HTMLTextAreaElement>(null);
  const addressField = useRef<HTMLInputElement>(null);
  const alertBox = useRef<HTMLDivElement>(null);
  const warningTitle = useRef<HTMLSpanElement>(null);
  const connectButton = useRef<HTMLButtonElement>(null);
  const refocusConnect = useRef(false);

  const preview = useMemo(() => readCode(code, now), [code, now]);
  const recognised = preview !== null;
  useEffect(() => {
    if (!recognised) return;
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [recognised]);
  useEffect(() => { if (autoFocus && !touchFirst()) codeField.current?.focus(); }, [autoFocus]);
  // A field's error takes the person to that field; a failure to connect leaves the focus where it was (Connect).
  useEffect(() => { if (fieldError) (fieldError.field === "code" ? codeField : addressField).current?.focus(); }, [fieldError]);
  // The form scrolls inside its dialog and Connect stays in the footer: what came of it is brought into sight.
  useEffect(() => { if (alert) alertBox.current?.scrollIntoView?.({ block: "nearest" }); }, [alert]);
  // Asked to agree to no encryption, the person is taken to what it means, not to the button: the next Tab reaches it.
  useEffect(() => { if (alert?.kind === "httpPrivate" && !busy) warningTitle.current?.focus(); }, [alert, busy]);
  // That button gone with what replaced the warning, the focus goes back to Connect.
  useEffect(() => { if (!busy && refocusConnect.current) { refocusConnect.current = false; connectButton.current?.focus(); } }, [busy]);

  // The address is asked for only when the code does not say where another device finds the machine: then it is needed.
  const needsAddress = !!preview && !preview.reachable;
  const addressShown = addressAsked || needsAddress || fieldError?.field === "address";
  useEffect(() => { if (addressShown && focusAddress.current) { focusAddress.current = false; addressField.current?.focus(); } }, [addressShown]);

  function changeCode(next: string) {
    const at = Date.now(), seen = readCode(next, at);
    setCode(next);
    setNow(at);
    setConnected("");
    // Agreeing to no encryption is for the code and the address it was asked about, and no other.
    if (alert?.kind === "httpPrivate") setAlert(null);
    setHeard(seen ? t("pairing.recognised", { host: named(seen.host, t), minutes: minutesLeft(seen, at) }) : "");
    // A code that lists its machine only over plain http on a private network starts the address there: the https
    // attempt, and what follows when only plain http answers, go to an address typed.
    const plain = seen && !seen.reachable ? seen.plain[0] ?? "" : "";
    const replaced = !address.trim() || address === prefilled.current;
    if (replaced) setAddress(plain);
    prefilled.current = plain;
    // What was said about the code, or about an address it needed or filled in, no longer stands.
    if (fieldError && (fieldError.field === "code" || fieldError.key === "pairing.addressNeeded" || replaced)) setFieldError(null);
  }

  function changeAddress(next: string) {
    // The person writes host:port; an https:// pasted with it is said already.
    setAddress(next.replace(/^\s*https:\/\//i, ""));
    if (fieldError?.field === "address") setFieldError(null);
    if (alert?.kind === "httpPrivate") setAlert(null);
  }

  function refuse(why: Failure, host: string, typed: string) {
    if ("field" in why) {
      setAlert(null);
      setFieldError({ field: why.field, key: why.key });
      return;
    }
    setFieldError(null);
    // The code's own addresses did not answer: where else it might be is asked for.
    if (why.alert === "unreachable") setAddressAsked(true);
    setAlert({ kind: why.alert, key: why.key, host, address: typed });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setConnected("");
    let seen: PairingCodePreview;
    try { seen = previewPairingCode(code); } catch (reason) { refuse(failure(reason), "", ""); return; }
    const host = named(seen.host, t);
    const typed = addressShown || !seen.reachable ? address.trim() : "";
    if (!seen.reachable && !typed) { refuse({ field: "address", key: "pairing.addressNeeded" }, host, ""); return; }
    if (typed) {
      try { machineAddress(typed); } catch (reason) { refuse(failure(reason), host, typed); return; }
    }
    await redeem(seen, typed, false);
  }

  /** The code redeemed at the address typed (if any): over https, or — `insecure`, the person agreed — over plain http
   *  to that private address. Agreeing keeps the warning in sight until something else replaces it; nothing is kept on
   *  a failure. */
  async function redeem(seen: PairingCodePreview, typed: string, insecure: boolean) {
    const host = named(seen.host, t);
    setBusy(insecure ? "insecure" : "https");
    setFieldError(null);
    if (!insecure) setAlert(null);
    try {
      const name = currentDeviceName((_, params) => t("pair.deviceNameBrowser", params));
      const result = insecure ? await window.sidevoiceActions?.pairDevice(code, name, typed, { insecure: true })
        : await window.sidevoiceActions?.pairDevice(code, name, typed);
      setCode("");
      setHeard("");
      setAlert(null);
      setConnected(t(insecure ? "pairing.connectedInsecure" : "pairing.connected", { host: named(result?.host ?? seen.host, t) }));
    } catch (reason) {
      const why = failure(reason);
      if (insecure && !("field" in why)) refocusConnect.current = true;
      // Not reached without encryption either: the machine is named, not the https address.
      refuse(why, host, insecure ? "" : typed);
    } finally {
      setBusy(null);
    }
  }

  /** Connect without encryption: Connect's attempt again, to the same address, once the person agreed. */
  function agree() {
    if (busy || alert?.kind !== "httpPrivate") return;
    let seen: PairingCodePreview;
    try { seen = previewPairingCode(code); } catch (reason) { refuse(failure(reason), "", ""); return; }
    void redeem(seen, alert.address, true);
  }

  // Enter in the code connects; a code never needs a new line.
  function enterSubmits(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  function alertView() {
    if (!alert) return null;
    switch (alert.kind) {
      case "expired": return <Alert tone="danger" live title={t("pairing.expired")} action={<CopyCommand />} />;
      case "unreachable": return <Alert tone="danger" live title={alert.address ? t("pairing.unreachableTyped", { address: alert.address }) : t("pairing.unreachable", { host: alert.host })} />;
      // Not an alert that interrupts: the focus is brought to it.
      case "httpPrivate": return <Alert tone="warning" className="pairing-consent" title={<span ref={warningTitle} tabIndex={-1}>{t("pairing.httpPrivate")}</span>}>
        <Button variant="secondary" className="pairing-insecure" loading={busy === "insecure"} onClick={agree}>
          {t(busy === "insecure" ? "pairing.connectingInsecure" : "pairing.connectInsecure")}
        </Button>
      </Alert>;
      case "httpOnly": return <Alert tone="danger" live title={upperFirst(t("pairing.httpOnly", { host: alert.host }))} />;
      case "httpBlocked": return <Alert tone="warning" live title={t("pairing.httpBlocked")} />;
      case "said": return <Alert tone="danger" live title={t(alert.key ?? "pairing.unreachable")} />;
    }
  }

  const formId = `${idPrefix}-form`, howId = `${idPrefix}-how`;
  // Connect only ever tries https: no encryption is never the default, nor what Enter does.
  const connect = <Button ref={connectButton} type="submit" form={formId} variant="primary" loading={busy === "https"} disabled={busy === "insecure"}>{t("pairing.connect")}</Button>;
  const status = busy === "https" ? t("pairing.connectingTo", { host: named(preview?.host, t) }) : busy ? "" : connected;
  const form = (
    <form id={formId} className="pairing-form" onSubmit={submit} aria-busy={!!busy} noValidate>
      <p className="pairing-intro">{t("pairing.intro")}</p>
      <Field label={t("pairing.code")} error={fieldError?.field === "code" ? t(fieldError.key) : undefined}
        hint={preview ? <span className="pairing-recognised"><CheckIcon size={14} />{t("pairing.recognised", { host: named(preview.host, t), minutes: minutesLeft(preview, now) })}</span> : undefined}>
        <Textarea ref={codeField} id={`${idPrefix}-code`} className="pairing-code" minRows={rows} maxRows={6} value={code} placeholder={t("pairing.codePlaceholder")}
          readOnly={!!busy} spellCheck={false} autoComplete="off" autoCapitalize="off" autoCorrect="off"
          onChange={(event) => changeCode(event.currentTarget.value)} onKeyDown={enterSubmits} />
      </Field>
      <p className="sr-only" role="status">{heard}</p>
      {layout === "code" && <div className="pairing-how">
        <Button variant="ghost" size="sm" className="pairing-how-toggle" aria-expanded={how} aria-controls={howId} onClick={() => setHow(!how)}>
          <ChevronIcon size={16} />{t("pairing.howToggle")}
        </Button>
        <div id={howId} className="pairing-how-body" hidden={!how}><ConnectorSteps /></div>
      </div>}
      {addressShown
        ? <Field className="pairing-address" label={needsAddress ? t("pairing.address") : t("pairing.addressOptional")}
            aside={<InfoTip label={t("pairing.addressAbout")}>{t("pairing.addressHint")}</InfoTip>}
            error={fieldError?.field === "address" ? t(fieldError.key) : undefined}
            hint={needsAddress && !preview?.plain.length && fieldError?.field !== "address" ? t("pairing.addressNeeded") : undefined}>
            <Input ref={addressField} id={`${idPrefix}-address`} type="text" inputMode="url" value={address} placeholder={t("pairing.addressPlaceholder")}
              required={needsAddress} readOnly={!!busy} spellCheck={false} autoComplete="off" autoCapitalize="off" autoCorrect="off"
              onChange={(event) => changeAddress(event.currentTarget.value)} />
          </Field>
        : recognised && <Button variant="ghost" size="sm" className="pairing-other-address" onClick={() => { focusAddress.current = true; setAddressAsked(true); }}>
            {t("pairing.otherAddress")}
          </Button>}
      <p className="pairing-status" role="status" data-connected={(!busy && !!connected) || undefined}>{!busy && connected && <CheckIcon size={16} />}{status}</p>
      <div ref={alertBox} className="pairing-alert">{alertView()}</div>
      {submitIn === undefined ? <div className="pairing-form-actions">{connect}</div> : submitIn && createPortal(connect, submitIn)}
    </form>
  );

  if (layout === "steps") return (
    <div className="pair-machine" data-layout="steps">
      <ol className="pair-steps">
        <li className="pair-step" data-done={recognised || undefined}>
          {/* A code recognised is the machine's step done: its number becomes a check, and is said so. */}
          <span className="pair-step-mark" aria-hidden="true">{recognised ? <CheckIcon size={14} /> : 1}</span>
          <h3 className="pair-step-title" aria-label={recognised ? t("pairing.stepDone", { step: t("pairing.onMachine") }) : undefined}>{t("pairing.onMachine")}</h3>
          <ConnectorSteps numbered={false} />
        </li>
        <li className="pair-step">
          <span className="pair-step-mark" aria-hidden="true">2</span>
          <h3 className="pair-step-title">{t("pairing.onDevice")}</h3>
          {form}
        </li>
      </ol>
    </div>
  );
  if (layout === "split") return (
    <div className="pair-machine" data-layout="split">
      <section className="pair-machine-side" aria-labelledby={`${idPrefix}-machine`}>
        <h3 id={`${idPrefix}-machine`}>{t("pairing.onMachine")}</h3>
        {/* Its heading frames them, and a narrow column keeps its width for the commands: no numbers of their own. */}
        <ConnectorSteps numbered={false} />
      </section>
      {form}
    </div>
  );
  return <div className="pair-machine" data-layout="code">{form}</div>;
}
