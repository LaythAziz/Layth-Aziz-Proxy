import test from "node:test";
import assert from "node:assert/strict";
import { buildTelegramProxyLink, generateSecret, normalizeServer } from "./proxy.mjs";

test("builds a Telegram proxy deep link from valid settings", () => {
  assert.equal(buildTelegramProxyLink({server:"proxy.example.com",port:"443",secret:"0123456789abcdef0123456789abcdef"}), "tg://proxy?server=proxy.example.com&port=443&secret=0123456789abcdef0123456789abcdef");
});
test("supports IPv6 hosts", () => {
  assert.equal(normalizeServer("2001:db8::1"), "2001:db8::1");
});
test("rejects invalid ports and secrets", () => {
  assert.throws(() => buildTelegramProxyLink({server:"proxy.example.com",port:"70000",secret:"0".repeat(32)}));
  assert.throws(() => buildTelegramProxyLink({server:"proxy.example.com",port:"443",secret:"bad"}));
});
test("rejects URL paths in server field", () => {
  assert.throws(() => normalizeServer("https://example.com/path"));
});
test("generates a 16-byte hexadecimal secret", () => {
  const fakeCrypto = {getRandomValues(bytes) { bytes.fill(171); return bytes; }};
  assert.equal(generateSecret(fakeCrypto), "ab".repeat(16));
});

import { readFile } from "node:fs/promises";

test("control panel does not contain escaped newline text that breaks HTML or JavaScript", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /\\n/);
});
