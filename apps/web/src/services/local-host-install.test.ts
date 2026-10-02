import { expect, test, vi } from "vitest";
import type { LocalHostBridge, LocalHostInstallOperation, LocalHostStatus } from "./desktop-host";
import { createLocalHostInstallController } from "./local-host-install";

const running: LocalHostStatus = { state: "running", reachable: true, installed: true };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function operation(job: string, promise: Promise<LocalHostStatus>) {
  return Object.assign(promise, { job }) as LocalHostInstallOperation;
}

test("install progress belongs to one job, and a second start cannot race it", async () => {
  const result = deferred<LocalHostStatus>();
  let report!: (event: { step: string; done: number | null; total: number | null }) => void;
  const install = vi.fn((onProgress) => {
    report = onProgress!;
    return operation("job-1", result.promise);
  });
  const bridge = { install, cancel: vi.fn(async () => true) } as unknown as LocalHostBridge;
  const controller = createLocalHostInstallController(() => bridge);
  const observed: string[] = [];
  controller.subscribe(() => observed.push(controller.getSnapshot().phase));

  expect(controller.start()).toBe(true);
  expect(controller.start()).toBe(false);
  expect(install).toHaveBeenCalledOnce();
  report({ step: "download", done: 1_572_864, total: 3_145_728 });
  expect(controller.getSnapshot()).toMatchObject({ phase: "installing", job: "job-1", step: "download", done: 1_572_864, total: 3_145_728 });
  expect(await controller.cancel()).toBe(true);
  expect(bridge.cancel).toHaveBeenCalledWith("job-1");
  expect(controller.getSnapshot()).toMatchObject({ phase: "installing", cancelling: true, cancellable: false });

  result.resolve(running);
  await vi.waitFor(() => expect(controller.getSnapshot()).toEqual({ phase: "succeeded", source: "machines" }));
  expect(observed).toContain("succeeded");
});

test("failed bridge details retain allowlisted diagnostics and omit untrusted strings and logs", async () => {
  const result = deferred<LocalHostStatus>();
  const bridge = { install: vi.fn(() => operation("job-2", result.promise)) } as unknown as LocalHostBridge;
  const controller = createLocalHostInstallController(() => bridge);
  controller.start();
  result.reject({ key: "install.authenticity", step: "verification", message: "do not render raw prose",
    params: { check: "signed bundle", token: "secret-token", attempts: 2,
      url: "http://demo-user:demo-password@proxy.example:8080", arbitrary: "{\"token\":\"demo-secret\"}" },
    log_tail: ["environment: token=secret-token", "{\"token\":\"demo-secret\",\"env\":{\"CUSTOM_CREDENTIAL\":\"demo-credential\"}}", "SV1.private-pairing-code"] });

  await vi.waitFor(() => expect(controller.getSnapshot().phase).toBe("failed"));
  expect(controller.getSnapshot()).toEqual({ phase: "failed", source: "machines", step: "verification", error: {
    key: "install.authenticity", step: "verification", params: { check: "signed bundle", attempts: 2 },
  } });
  expect(JSON.stringify(controller.getSnapshot())).not.toContain("secret-token");
  expect(JSON.stringify(controller.getSnapshot())).not.toContain("private-pairing-code");
  expect(JSON.stringify(controller.getSnapshot())).not.toContain("environment:");
  expect(JSON.stringify(controller.getSnapshot())).not.toContain("demo-user");
  expect(JSON.stringify(controller.getSnapshot())).not.toContain("demo-password");
  expect(JSON.stringify(controller.getSnapshot())).not.toContain("demo-secret");
  expect(JSON.stringify(controller.getSnapshot())).not.toContain("demo-credential");
});

test("a refused cancellation disables retrying cancel and leaves the job active", async () => {
  const result = deferred<LocalHostStatus>();
  const bridge = {
    install: vi.fn(() => operation("job-3", result.promise)),
    cancel: vi.fn(async () => false),
  } as unknown as LocalHostBridge;
  const controller = createLocalHostInstallController(() => bridge);
  controller.start();

  expect(await controller.cancel()).toBe(false);
  expect(controller.getSnapshot()).toMatchObject({ phase: "installing", cancellable: false, cancelling: false, cancelState: "too-late" });
  result.resolve(running);
  await vi.waitFor(() => expect(controller.getSnapshot()).toMatchObject({ phase: "succeeded", source: "machines" }));
});

test("install stays unavailable when the optional bridge method is absent", () => {
  const controller = createLocalHostInstallController(() => ({ state: vi.fn(), subscribe: vi.fn(), pairing: vi.fn() }));
  expect(controller.start()).toBe(false);
  expect(controller.getSnapshot()).toEqual({ phase: "idle" });
});
