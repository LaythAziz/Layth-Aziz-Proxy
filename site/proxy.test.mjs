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

test("dashboard shows only the global proxy directory and removes cloud/admin sections", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /id="proxyGrid"/);
  assert.match(html, /id="refresh"/);
  assert.match(html, /id="sort"/);
  assert.match(html, /id="autoSelect"/);
  assert.match(html, /id="favoritesToggle"/);
  assert.doesNotMatch(html, /id="historyPanel"|تاريخ قياسات TCP|سجل الأداء|ملاحظة مهمة عن الـPing/);
  assert.match(html, /id="notificationToggle"/);
  assert.match(html, /id="qrDialog"/);
  assert.match(html, /last_checked_at/);
  assert.match(html, /LANGUAGE_KEY="lap_language_v1"/);
  assert.match(html, /Notification\.requestPermission/);
  assert.match(html, /QRCode|qrserver\.com/);
  assert.match(html, /mask-reveal/);
  assert.match(html, /stagger/);
  assert.match(html, /whip-pan/);
  assert.match(html, /slice/);
  assert.match(html, /zoom-through/);
  assert.ok(html.includes("https://raw.githubusercontent.com/LaythAziz/Profile-/main/assets/layth.jpg"));
  assert.match(html, /class="brand-mark"[^>]*><img class="brand-avatar"[^>]+alt="Layth Aziz"/);
  assert.doesNotMatch(html, /PERSONAL TELEGRAM DIRECTORY|LAYTH AZIZ · TELEGRAM PROXY DIRECTORY|خدمة مستقلة لا تدير أو تملك البروكسيات العامة المدرجة/);
  assert.match(html, /class="footer"[^>]*>\s*<span[^>]*>© 2026 LAYTH AZIZ PROXY<\/span>/);
  assert.match(html, /\.footer\{[^}]*justify-content:center[^}]*text-align:center/);
  assert.doesNotMatch(html, /GLOBAL NETWORK|GLOBAL TELEGRAM CONNECTIONS|hero-visual|globe-core/);
  assert.doesNotMatch(html, /إدارة البروكسيات السحابية|ADMIN_API_TOKEN|Hetzner|GitHub/);
});

test("site supports Arabic and English with a persistent language switch", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /id="languageToggle"/);
  assert.match(html, /LANGUAGE_KEY="lap_language_v1"/);
  assert.match(html, /document\.documentElement\.dir/);
  assert.match(html, /document\.documentElement\.lang/);
  assert.match(html, /TELEGRAM PROXY/);
  assert.match(html, /Explore proxies|Explore Telegram proxies/);
  assert.match(html, /aria-label="Language"/);
});
