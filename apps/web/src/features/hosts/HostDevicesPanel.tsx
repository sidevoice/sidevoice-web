import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import type { HostDeviceView } from "../../state/room-types";
import { hostTranslator } from "../settings/host-i18n";

function dateText(value: string | number | null | undefined) {
  if (value == null) return "";
  const date = typeof value === "number" ? new Date(value < 1e12 ? value * 1000 : value) : new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : new Intl.DateTimeFormat(navigator.language, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function HostDevicesPanel({ fp }: { fp: string }) {
  const t = hostTranslator();
  const [devices, setDevices] = useState<HostDeviceView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const epoch = useRef(0);

  async function refresh() {
    const run = ++epoch.current;
    setLoading(true);
    setError(false);
    try {
      const action = window.sidevoiceActions?.loadHostDevices;
      if (!action) throw new Error("unavailable");
      const next = await action(fp);
      if (epoch.current === run) setDevices(next);
    } catch {
      if (epoch.current === run) setError(true);
    } finally {
      if (epoch.current === run) setLoading(false);
    }
  }

  useEffect(() => {
    setDevices([]);
    setConfirmId(null);
    void refresh();
    return () => { epoch.current++; };
    // A page instance belongs to one pairing fingerprint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fp]);

  async function revoke(id: string) {
    const run = ++epoch.current;
    setLoading(true);
    try {
      const action = window.sidevoiceActions?.revokeHostDevice;
      if (!action) throw new Error("unavailable");
      await action(fp, id);
      if (epoch.current !== run) return;
      setConfirmId(null);
      const load = window.sidevoiceActions?.loadHostDevices;
      if (!load) throw new Error("unavailable");
      const next = await load(fp);
      if (epoch.current === run) setDevices(next);
    } catch {
      if (epoch.current === run) setError(true);
    } finally {
      if (epoch.current === run) setLoading(false);
    }
  }

  return <section className="host-devices-panel" aria-labelledby="host-devices-title">
    <h4 id="host-devices-title">{t("hosts.tab.devices")}</h4>
    {error && <p role="alert">{t("hosts.devices.loadFailed")}</p>}
    {(error || (!loading && !devices.length)) && <Button type="button" variant="ghost" size="compact" disabled={loading} onClick={() => void refresh()}>{t("hosts.retry")}</Button>}
    {loading && !devices.length && <p className="muted" role="status">{t("hosts.devices.loading")}</p>}
    {!loading && !error && devices.length === 0 && <p className="muted">{t("hosts.devices.empty")}</p>}
    <ul className="host-device-list">
      {devices.map((device) => <li className="host-device-row" key={device.device_id}>
        <div className="device-copy">
          <strong>{device.name || t(device.current ? "hosts.devices.thisDevice" : "hosts.devices.pairedDevice")}</strong>
          {device.current && <span className="muted">{t("hosts.devices.thisDevice")}</span>}
          {dateText(device.created_at) && <span className="muted">{t("hosts.devices.created", { date: dateText(device.created_at) })}</span>}
          {dateText(device.last_seen_at) && <span className="muted">{t("hosts.devices.lastSeen", { date: dateText(device.last_seen_at) })}</span>}
        </div>
        {device.kind !== "local" && (confirmId === device.device_id
          ? <span className="device-revoke-confirm" role="group" aria-label={t("hosts.devices.revoke", { device: device.name || device.device_id })}>
            <span className="muted">{t("hosts.devices.revokeConfirm")}</span>
            <Button type="button" variant="danger" size="compact" disabled={loading} onClick={() => void revoke(device.device_id)}>{t("hosts.devices.revokeAction")}</Button>
            <Button type="button" variant="ghost" size="compact" disabled={loading} onClick={() => setConfirmId(null)}>{t("hosts.cancel")}</Button>
          </span>
          : <Button type="button" variant="ghost" size="compact" disabled={loading} onClick={() => setConfirmId(device.device_id)}>{t("hosts.devices.revoke", { device: device.name || device.device_id })}</Button>)}
      </li>)}
    </ul>
  </section>;
}
