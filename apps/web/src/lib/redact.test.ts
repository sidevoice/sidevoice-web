import { expect, test } from "vitest";
import { redactFreeText } from "./redact";

test("the person's home path reads ~, on macOS, Linux and Windows, escaped or not", () => {
  expect(redactFreeText("open /Users/ada.lovelace/Library/Logs/sidevoice.log")).toBe("open ~/Library/Logs/sidevoice.log");
  expect(redactFreeText("HOME=/home/ada")).toBe("HOME=~");
  expect(redactFreeText("USERPROFILE=C:\\Users\\Ada Lovelace")).toBe("USERPROFILE=~");
  expect(redactFreeText("EPERM: open 'C:\\Users\\Ada Lovelace\\AppData\\x.log'")).toBe("EPERM: open '~\\AppData\\x.log'");
  expect(redactFreeText("cd C:\\Users\\ada\\AppData\\Local\\Sidevoice")).toBe("cd ~\\AppData\\Local\\Sidevoice");
  expect(redactFreeText("C:\\Users\\ada: access denied")).toBe("~: access denied");
  expect(redactFreeText("{\"path\":\"C:\\\\Users\\\\ada\\\\AppData\"}")).toBe("{\"path\":\"~\\\\AppData\"}");
  expect(redactFreeText("d:/users/ada/sidevoice")).toBe("~/sidevoice");
});

test("everything after Authorization: is masked, and a Bearer token", () => {
  expect(redactFreeText("> Authorization: Basic YWRhOmxvdmVsYWNl")).toBe("> Authorization: •••");
  expect(redactFreeText("{\"authorization\": \"Bearer abc.def\", \"x\": 1}")).toBe("{\"authorization\": •••");
  expect(redactFreeText("retrying with Bearer sk-live_short then giving up")).toBe("retrying with Bearer ••• then giving up");
});

test("token=, secret=, key= and their kin keep their name and lose their value", () => {
  expect(redactFreeText("environment: token=secret-token")).toBe("environment: token=•••");
  expect(redactFreeText("GET /pair?device=nuc&access_token=abc123&lang=en")).toBe("GET /pair?device=nuc&access_token=•••&lang=en");
  expect(redactFreeText("client_secret = hunter2; next")).toBe("client_secret = •••; next");
  expect(redactFreeText("X-Api-Key: k-1")).toBe("X-Api-Key: •••");
  expect(redactFreeText("{\"token\":\"demo-secret\",\"env\":{\"CUSTOM_CREDENTIAL\":\"demo-credential\"}}"))
    .toBe("{\"token\":\"•••\",\"env\":{\"CUSTOM_CREDENTIAL\":\"•••\"}}");
  expect(redactFreeText("PROXY_PASSWORD='p4ss'")).toBe("PROXY_PASSWORD='•••'");
});

test("a URL's user and password are masked, its host kept", () => {
  expect(redactFreeText("proxy http://demo-user:demo-password@proxy.example:8080 refused"))
    .toBe("proxy http://•••@proxy.example:8080 refused");
});

test("JWT-shaped strings and SV1. pairing codes are masked", () => {
  expect(redactFreeText("session eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZGEifQ.c2lnbmF0dXJl ok")).toBe("session ••• ok");
  expect(redactFreeText("pairing SV1.eyJmcCI6Im51YyJ9 accepted")).toBe("pairing SV1.••• accepted");
  expect(redactFreeText("SV1.private-pairing-code")).toBe("SV1.•••");
});

test("long base64url and hex runs that read as tokens are masked", () => {
  expect(redactFreeText("sha256 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08 ok")).toBe("sha256 ••• ok");
  expect(redactFreeText("device 123e4567-e89b-12d3-a456-426614174000")).toBe("device •••");
  expect(redactFreeText("ghp_R8kQ2xVt7LmN4pZs9WdY3hJc6FbA1eUo0iTg")).toBe("•••");
  expect(redactFreeText("relay k3j4h5k6j7h8g9f0d1s2a3")).toBe("relay •••");
  expect(redactFreeText("cookie ZxQkLmNpQrStUvWxYzAbCdEf")).toBe("cookie •••");
});

test("a line with nothing personal or secret stays exactly as it came", () => {
  const line = "Downloading sidevoice-core 0.4.2 for aarch64-apple-darwin and x86_64-unknown-linux-gnu (12.4 MB) from "
    + "https://github.com/sidevoice/sidevoice-core/releases: LaunchAgentInstaller failed, press any key to see /opt/sidevoice/logs";
  expect(redactFreeText(line)).toBe(line);
  expect(redactFreeText("--------------------------------")).toBe("--------------------------------");
  expect(redactFreeText("")).toBe("");
});

test("redacting twice changes nothing more", () => {
  const once = redactFreeText("HOME=/home/ada token=abc Authorization: Basic x SV1.code 9f86d081884c7d659a2feaa0c55ad015");
  expect(redactFreeText(once)).toBe(once);
});
