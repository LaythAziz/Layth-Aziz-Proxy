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
  assert.match(html, /id="settingsDialog"/);
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
  assert.match(html, /id="networkMap"/);
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

test("language switching does not install a mutation observer or access storage unsafely", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /new MutationObserver/);
  assert.match(html, /function readLanguagePreference\(\)[\s\S]*?try\s*\{[\s\S]*?localStorage\.getItem\(LANGUAGE_KEY\)/);
});

test("complete bilingual interface translates every visible section and dynamic state", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  for (const phrase of [
    "الصورة الشخصية لليث عزيز", "آخر تحديث للقائمة", "على هذا الجهاز",
    "شبكة البروكسيات العالمية", "المتاح حالياً فقط — الترتيب من الأقل زمناً إلى الأعلى",
    "أقل من 100 ms", "أقل من 250 ms", "أقل من 500 ms",
    "اجتاز مصافحة MTProto", "زمن مصافحة MTProto من السيرفر", "مصدر عام",
    "لا توجد مفضلات متاحة حالياً. العناصر المحفوظة تبقى على جهازك.",
    "لا توجد نتائج ضمن الفلتر.", "لم نعثر على بروكسيات استجابت للفحص حالياً.",
    "نجمع المصادر ونفحص المنافذ المتاحة…", "تعذر جلب القائمة",
    "الإشعارات مفعّلة", "تعذر تفعيل الإشعارات",
    "المرشح الأسرع حسب فحص الخادم", "لا توجد بروكسيات مستجيبة حالياً."
  ]) assert.ok(html.includes(phrase), "missing Arabic source phrase: " + phrase);
  assert.match(html, /function translateText\(/);
  assert.match(html, /translateText\(trimmed\)/);
  assert.match(html, /currentLanguage===\"ar\"\?\"ar-IQ\":\"en-US\"/);
  assert.match(html, /الصورة الشخصية لليث عزيز/);
  assert.ok(html.includes('const label=toEnglish?"AR":"EN"'));
});


test("public dashboard exposes proxy health analytics, global map, search, and advanced filters", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  for (const id of ["statsPanel", "statResponsive", "statSources", "statFavorites", "proxySearch", "regionFilter", "networkMap", "mapStatus", "settingsDialog", "refreshInterval", "autoRefreshToggle"]) {
    assert.ok(html.includes(`id="${id}"`), "missing dashboard feature: " + id);
  }
  assert.match(html, /navigator\.clipboard/);
  assert.match(html, /lap_settings_v1/);
  assert.match(html, /function updateDashboardStats/);
  assert.match(html, /function renderNetworkMap/);
});

test("admin route clearly stays disabled until its private API and database exist", async () => {
  const html = await readFile(new URL("./admin.html", import.meta.url), "utf8");
  assert.match(html, /Admin panel is not enabled yet/);
  assert.match(html, /Do not enter any token or password/);
  assert.doesNotMatch(html, /\/api\/proxies|sessionStorage|Authorization.*Bearer/);
  assert.doesNotMatch(html, /HETZNER_API_TOKEN|PROXY_SECRET_ENCRYPTION_KEY/);
});


test("public page initializes storage helpers before reading saved settings", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const readDefinition = html.indexOf("const read=(k,d)=>");
  const settingsRead = html.indexOf("const rawSettings=read(K.settings");
  assert.ok(readDefinition >= 0 && settingsRead >= 0 && readDefinition < settingsRead,
    "storage helper must exist before saved settings are read");
});

test("public page keeps proxy cards lightweight and avoids per-card entrance animations", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /\.proxy-card\.slice:after\s*\{[^}]*animation:\s*none/s);
  assert.match(html, /\.proxy-grid\.stagger>\*\s*\{[^}]*animation:\s*none/s);
  assert.match(html, /@media\(max-width:700px\)[\s\S]*?backdrop-filter:\s*none/s);
});

test("proxy endpoint bounds DNS lookup and limits expensive feed probing", async () => {
  const api = await readFile(new URL("../api/public-proxies.js", import.meta.url), "utf8");
  const probe = await readFile(new URL("../lib/proxy-probe.js", import.meta.url), "utf8");
  assert.match(api, /limit:\s*120/);
  assert.match(api, /length:\s*12/);
  assert.match(probe, /DNS_TIMEOUT|dnsTimeoutMs/);
});


test("proxy cards are rendered in small batches with an explicit load-more control", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /visibleProxyCount=24/);
  assert.match(html, /rows\.slice\(0,visibleProxyCount\)/);
  assert.match(html, /visibleProxyCount\+=24/);
  assert.match(html, /load-more/);
  assert.doesNotMatch(html, /grid\.append\(more\)\}applyLanguage\(\)/);
});

test("routine refresh and card rendering do not rescan the entire document for translations", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /function statusText\(s\)\{[^}]*status\.append\(dot,t\)\}/);
  assert.doesNotMatch(html, /grid\.append\(e\);applyLanguage\(\);return/);
});


test("every static Arabic interface label has an English translation", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const dictionary = html.slice(html.indexOf("const translations="), html.indexOf("const reverseTranslations="));
  const keys = new Set([...dictionary.matchAll(/"([^"]*[\\u0600-\\u06FF][^"]*)"\\s*:/g)].map(match => match[1]));
  const markup = html.slice(html.indexOf("<body>"), html.indexOf('<script type="module">'));
  const textNodes = [...markup.matchAll(/>([^<>]+)</g)].map(match => match[1].trim()).filter(value => /[\\u0600-\\u06FF]/.test(value));
  const attributes = [...markup.matchAll(/(?:aria-label|placeholder|alt)="([^"]*[\\u0600-\\u06FF][^"]*)"/g)].map(match => match[1]);
  const missing = [...new Set([...textNodes, ...attributes].filter(value => !keys.has(value)))];
  assert.deepEqual(missing, []);
});

test("English mode does not replace untranslated content with a generic error", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /return "Please try again\\."/);
  assert.match(html, /document\\.documentElement\\.lang=toEnglish\\?"en":"ar"/);
  assert.match(html, /document\\.documentElement\\.dir=toEnglish\\?"ltr":"rtl"/);
  assert.match(html, /const reverseTranslations=\\{\\};for\\(const \\[ar,en\\] of Object\\.entries\\(translations\\)\\)/);
});
