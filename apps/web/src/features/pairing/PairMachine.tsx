import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Field } from "../../components/ui/Field";
import { CheckIcon, ChevronIcon } from "../../components/ui/Icons";
import { InfoTip } from "../../components/ui/InfoTip";
import { Input, Textarea } from "../../components/ui/Input";
import { currentDeviceName } from "../../state/device-name";
import { translator, type Translate, type MessageKey } from "../../i18n/translator";
import { errorMessage, failureParts, type ErrorMessage } from "../settings/error-message";
import {
  ADDRESS_INSECURE, ADDRESS_INVALID, PAIRING_HTTP_BLOCKED, PAIRING_HTTP_ONLY, PAIRING_HTTP_PRIVATE, machineAddress, previewPairingCode,
  type PairingCodePreview,
} from "../../services/device-pairing.js";
import { ConnectorSteps } from "./ConnectorSteps";
import { CONNECTOR_PAIR_DEVICE } from "./connector-commands";
import "./pairing.css";

/* "Connect to your machine": the one-time code from the machine where the agents run (`sidevoice pair-device`, or the
 * agent), pasted on this device — in the first-run setup (W2r) and in the pairing dialog (Settings › Machines › Add a
 * machine), the same everywhere: one card, the code first, and how to get one behind a disclosure for when it is needed.
 * This computer's own machine pairs by itself and never comes here. */


type AlertKind = "expired" | "unreachable" | "httpPrivate" | "httpOnly" | "httpBlocked" | "said" | "failed";
/** Why a code was not redeemed, and where that is said: under the field it is about, or in the form's alert. The
 *  controller rejects with device-pairing.js's code; anything else is said in the generic words of a failure, what it
 *  said behind Details (error-message.ts). */
type Failure = { field: "code" | "address"; key: MessageKey } | { alert: AlertKind; key?: MessageKey; why?: ErrorMessage };

const FAILURES: Record<string, Failure> = {
  [ADDRESS_INVALID]: { field: "address", key: "pairing.addressInvalid" },
  [ADDRESS_INSECURE]: { field: "address", key: "pairing.addressInsecure" },
  [PAIRING_HTTP_PRIVATE]: { alert: "httpPrivate" },
  [PAIRING_HTTP_ONLY]: { alert: "httpOnly" },
  [PAIRING_HTTP_BLOCKED]: { alert: "httpBlocked" },
  "code-empty": { field: "code", key: "pairing.empty" },
  "code-invalid": { field: "code", key: "pairing.invalid" },
  "code-damaged": { field: "code", key: "pairing.invalid" },
  "code-version": { field: "code", key: "pairing.incompatible" },
  "code-expired": { alert: "expired" },
  // The machine said the code was not one it could take: used, or expired.
  "code-spent": { alert: "expired" },
  "code-no-address": { field: "address", key: "pairing.addressNeeded" },
  "code-plaintext": { field: "address", key: "pairing.addressNeeded" },
  "no-webcrypto": { alert: "said", key: "pairing.noWebCrypto" },
  "identity-mismatch": { alert: "said", key: "pairing.identityMismatch" },
  unreachable: { alert: "unreachable" },
};

function failure(reason: unknown, t: Translate): Failure {
  const known = FAILURES[failureParts(reason).code];
  if (known) return known;
  // The machine answered and said no (its own sentence behind Details), or something this screen has no words for.
  return { alert: "failed", why: errorMessage(reason, { t, what: "pairing", known: (code) => code === "pair-refused" ? t("pairing.failed") : null }) };
}

/** What the code pasted says, or nothing while it is not one that could be used. */
function readCode(code: string, now: number): PairingCodePreview | null {
  try { return previewPairingCode(code, now); } catch { return null; }
}

const minutesLeft = (code: PairingCodePreview, now: number) => Math.max(1, Math.ceil((code.exp * 1000 - now) / 60_000));
/** The machine as a sentence names it: its name, quoted as the language quotes, or "the machine". */
const named = (host: string | null | undefined, t: Translate) => host ? t("pairing.named", { host }) : t("pairing.theMachine");
const upperFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
/** A phone or a tablet: the keyboard would cover the screen, so nothing takes the focus by itself. */
const touchFirst = () => typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;

/** The command that prints a new code, copied from the alert that says the old one is spent. */
function CopyCommand() {
  const t = translator();
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(CONNECTOR_PAIR_DEVICE); setCopied(true); } catch { setCopied(false); }
  }
  return <Button variant="secondary" size="sm" onClick={() => void copy()}>{t(copied ? "noMachine.commandCopied" : "pairing.copyCommand")}</Button>;
}

/** The pairing screen's content: the code, the machine's address when it is needed, and what came of connecting, and how
 *  to get one. Its Connect sits at the end of the form, or, given `submitIn`, in the footer of whatever
 *  holds it (the dialog's, the setup's), still submitting it through its `form` attribute; `null` while that footer is
 *  not there. */
export function PairMachine({ idPrefix = "device-pairing", autoFocus = false, rows = 3, submitIn }: {
  idPrefix?: string; autoFocus?: boolean; rows?: number; submitIn?: HTMLElement | null;
}) {
  const t = translator();
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  // The address's disclosure open: by the person (it opens and closes), or by itself where the address is needed.
  const [addressOpen, setAddressOpen] = useState(false);
  // This code's addresses (or the one typed) did not reach its machine: in A and B, an address is needed until another code.
  const [unreached, setUnreached] = useState(false);
  // Connecting: over https (Connect), or without encryption once the person agreed (its own button).
  const [busy, setBusy] = useState<"https" | "insecure" | null>(null);
  const [fieldError, setFieldError] = useState<{ field: "code" | "address"; key: MessageKey } | null>(null);
  const [alert, setAlert] = useState<{ kind: AlertKind; key?: MessageKey; why?: ErrorMessage; host: string; address: string } | null>(null);
  const [connected, setConnected] = useState("");
  // What a screen reader hears once when a code is recognised; the line under the field counts the minutes down quietly.
  const [heard, setHeard] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [how, setHow] = useState(false);
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
  // The address asked for (B's link brings its field in), or where else the machine might be: its field, once drawn.
  useEffect(() => { if (focusAddress.current && addressOpen) { focusAddress.current = false; addressField.current?.focus(); } });
  // The form scrolls inside its dialog and Connect stays in the footer: what came of it is brought into sight.
  useEffect(() => { if (alert) alertBox.current?.scrollIntoView?.({ block: "nearest" }); }, [alert]);
  // Asked to agree to no encryption, the person is taken to what it means, not to the button: the next Tab reaches it.
  useEffect(() => { if (alert?.kind === "httpPrivate" && !busy) warningTitle.current?.focus(); }, [alert, busy]);
  // That button gone with what replaced the warning, the focus goes back to Connect.
  useEffect(() => { if (!busy && refocusConnect.current) { refocusConnect.current = false; connectButton.current?.focus(); } }, [busy]);

  // The address is needed when the code does not say where another device finds the machine; in A and B, also once
  // the addresses it does say did not reach it. Otherwise it is optional (C: only ever when the code says nowhere).
  const needsAddress = !!preview && !preview.reachable;
  const addressRequired = needsAddress || (recognised && unreached);
  const addressShown = addressOpen;

  function changeCode(next: string) {
    const at = Date.now(), seen = readCode(next, at);
    setCode(next);
    setNow(at);
    setConnected("");
    setUnreached(false);
    // A code that does not say where its machine is opens the address.
    if (seen && !seen.reachable) setAddressOpen(true);
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
    if (fieldError && (fieldError.field === "code" || fieldError.key === "pairing.addressNeeded" || fieldError.key === "pairing.addressUnreached" || replaced)) setFieldError(null);
  }

  function changeAddress(next: string) {
    // The person writes host:port; an https:// pasted with it is said already. An http:// is meant: kept.
    setAddress(next.replace(/^\s*https:\/\//i, ""));
    if (fieldError?.field === "address") setFieldError(null);
    if (alert?.kind === "httpPrivate") setAlert(null);
  }

  function refuse(why: Failure, host: string, typed: string) {
    if ("field" in why) {
      setAlert(null);
      // Said under the address: its field is opened to say it.
      if (why.field === "address") setAddressOpen(true);
      setFieldError({ field: why.field, key: why.key });
      return;
    }
    setFieldError(null);
    // The code's own addresses (or the one typed) did not answer: where else it might be is asked for, in its field —
    // unless the focus is going back to Connect, from the button that agreed to no encryption.
    if (why.alert === "unreachable") {
      setUnreached(true);
      setAddressOpen(true);
      if (!refocusConnect.current) focusAddress.current = true;
    }
    setAlert({ kind: why.alert, key: why.key, why: why.why, host, address: typed });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setConnected("");
    let seen: PairingCodePreview;
    try { seen = previewPairingCode(code); } catch (reason) { refuse(failure(reason, t), "", ""); return; }
    const host = named(seen.host, t);
    // An address folded away (A) or never brought in (B) is not used, unless it is needed.
    const typed = addressShown || addressRequired ? address.trim() : "";
    if (!seen.reachable && !typed) { refuse({ field: "address", key: "pairing.addressNeeded" }, host, ""); return; }
    if (addressRequired && !typed) { refuse({ field: "address", key: "pairing.addressUnreached" }, host, ""); return; }
    if (typed) {
      // http:// to a private-network address goes straight to agreeing to no encryption, with no https attempt; to any
      // other, it is refused under the field (machineAddress).
      try { machineAddress(typed); } catch (reason) { refuse(failure(reason, t), host, typed); return; }
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
      setUnreached(false);
      setConnected(t("pairing.connected", { host: named(result?.host ?? seen.host, t) }));
    } catch (reason) {
      const why = failure(reason, t);
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
    try { seen = previewPairingCode(code); } catch (reason) { refuse(failure(reason, t), "", ""); return; }
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
      case "failed": return <Alert tone="danger" live title={alert.why?.text ?? t("pairing.failed")} details={alert.why?.details} />;
    }
  }

  const formId = `${idPrefix}-form`, howId = `${idPrefix}-how`, addressBodyId = `${idPrefix}-address-body`;
  // Connect only ever tries https: no encryption is never the default, nor what Enter does.
  const connect = <Button ref={connectButton} type="submit" form={formId} variant="primary" loading={busy === "https"} disabled={busy === "insecure"}>{t("pairing.connect")}</Button>;
  const status = busy === "https" ? t("pairing.connectingTo", { host: named(preview?.host, t) }) : busy ? "" : connected;
  // The machine's address (an IP or a domain): optional while the code carries addresses that reach it, needed when not.
  // Its label is for assistive tech only (the toggle says it, the placeholder shows it); when to use it, the toggle's tip.
  const addressInput = (
    <Field className="pairing-address" label={t("pairing.address")}
      error={fieldError?.field === "address" ? t(fieldError.key) : undefined}
      hint={needsAddress && !preview?.plain.length && fieldError?.field !== "address" ? t("pairing.addressNeeded") : undefined}>
      <Input ref={addressField} id={`${idPrefix}-address`} type="text" inputMode="url" value={address} placeholder={t("pairing.addressPlaceholder")}
        required={addressRequired} readOnly={!!busy} spellCheck={false} autoComplete="off" autoCapitalize="off" autoCorrect="off"
        onChange={(event) => changeAddress(event.currentTarget.value)} />
    </Field>
  );
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
      {/* The address, a quiet link under the code that opens its field and closes it again; open by itself, and needed,
          where the code carries no usable address or its addresses did not reach the machine. */}
      <span className="pairing-address-head">
        <button type="button" className="pairing-address-link" aria-expanded={addressOpen} aria-controls={addressBodyId}
          onClick={() => { if (!addressOpen) focusAddress.current = true; setAddressOpen(!addressOpen); }}>
          <ChevronIcon size={14} />{t(addressRequired ? "pairing.addressToggleNeeded" : "pairing.addressToggle")}
        </button>
        <InfoTip label={t("pairing.addressWhenAbout")}>{t("pairing.addressWhen")}</InfoTip>
      </span>
      <div id={addressBodyId} className="pairing-address-body" hidden={!addressOpen}>{addressInput}</div>
      <p className="pairing-status" role="status" data-connected={(!busy && !!connected) || undefined}>{!busy && connected && <CheckIcon size={16} />}{status}</p>
      <div ref={alertBox} className="pairing-alert">{alertView()}</div>
      {/* How to get a code, last. */}
      <div className="pairing-how">
        <Button variant="ghost" size="sm" className="pairing-how-toggle" aria-expanded={how} aria-controls={howId} onClick={() => setHow(!how)}>
          <ChevronIcon size={16} />{t("pairing.howToggle")}
        </Button>
        <div id={howId} className="pairing-how-body" hidden={!how}><ConnectorSteps /></div>
      </div>
      {submitIn === undefined ? <div className="pairing-form-actions">{connect}</div> : submitIn && createPortal(connect, submitIn)}
    </form>
  );

  return <div className="pair-machine">{form}</div>;
}
