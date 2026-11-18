import test from "node:test";
import assert from "node:assert/strict";
import { parsePublicProxyList } from "../lib/public-proxies.js";

test("parses valid Telegram MTProto links from a public feed", () => {
  const rows = parsePublicProxyList([
    "tg://proxy?server=one.example&port=443&secret=0123456789abcdef0123456789abcdef",
    "https://t.me/proxy?server=two.example&port=8443&secret=abcdef0123456789abcdef0123456789"
  ].join("\n"));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].server, "one.example");
  assert.equal(rows[1].telegram_link.startsWith("tg://proxy?"), true);
  const fakeTls = parsePublicProxyList("tg://proxy?server=tls.example&port=443&secret=ee0123456789abcdef0123456789abcdef6578616d706c652e636f6d");
  assert.equal(fakeTls.length, 1);
});

test("ignores malformed entries and deduplicates identical endpoints", () => {
  const valid = "tg://proxy?server=one.example&port=443&secret=0123456789abcdef0123456789abcdef";
  const rows = parsePublicProxyList([valid, valid, "tg://proxy?server=bad&port=99999&secret=nope", "not a proxy"].join("\n"));
  assert.equal(rows.length, 1);
});

test("does not return more than the requested maximum", () => {
  const lines = Array.from({length: 5}, (_, i) => `tg://proxy?server=p${i}.example&port=443&secret=0123456789abcdef0123456789abcdef`);
  assert.equal(parsePublicProxyList(lines.join("\n"), {limit: 3}).length, 3);
});


import { probeTcp } from "../lib/proxy-probe.js";
import { EventEmitter } from "node:events";

test("TCP probe reports latency only after a successful connection", async () => {
  const result = await probeTcp("proxy.example", 443, {
    timeoutMs: 50,
    lookup: async () => [{ address: "8.8.8.8", family: 4 }],
    connect: () => {
      const socket = new EventEmitter();
      socket.destroy = () => {};
      queueMicrotask(() => socket.emit("connect"));
      return socket;
    }
  });
  assert.equal(result.online, true);
  assert.equal(typeof result.latency_ms, "number");
});

test("TCP probe marks refused connections offline without inventing latency", async () => {
  const result = await probeTcp("proxy.example", 443, {
    timeoutMs: 50,
    lookup: async () => [{ address: "8.8.8.8", family: 4 }],
    connect: () => {
      const socket = new EventEmitter();
      socket.destroy = () => {};
      queueMicrotask(() => socket.emit("error", new Error("refused")));
      return socket;
    }
  });
  assert.deepEqual(result, { online: false, latency_ms: null });
});


test("TCP probe refuses private and documentation IP ranges", async () => {
  const { isPublicIPv4 } = await import("../lib/proxy-probe.js");
  assert.equal(isPublicIPv4("8.8.8.8"), true);
  assert.equal(isPublicIPv4("127.0.0.1"), false);
  assert.equal(isPublicIPv4("192.168.1.1"), false);
  assert.equal(isPublicIPv4("10.0.0.2"), false);
  assert.equal(isPublicIPv4("203.0.113.7"), false);
});

test("merges multiple public feeds into a larger deduplicated candidate pool", async () => {
  const { mergeProxyFeeds } = await import("../lib/public-proxies.js");
  const a = "tg://proxy?server=one.example&port=443&secret=0123456789abcdef0123456789abcdef";
  const b = "tg://proxy?server=two.example&port=443&secret=0123456789abcdef0123456789abcdef";
  const c = "tg://proxy?server=three.example&port=443&secret=0123456789abcdef0123456789abcdef";
  const merged = mergeProxyFeeds([
    { source: "feed-a", content: [a, b].join("\n") },
    { source: "feed-b", content: [b, c].join("\n") }
  ], { limit: 10 });
  assert.deepEqual(merged.map(row => row.id), ["one.example:443", "two.example:443", "three.example:443"]);
  assert.equal(merged[0].source, "feed-a");
  assert.equal(merged[2].source, "feed-b");
});

test("candidate pool limit can exceed the old 32-proxy ceiling", async () => {
  const { mergeProxyFeeds } = await import("../lib/public-proxies.js");
  const rows = Array.from({ length: 75 }, (_, i) =>
    `tg://proxy?server=p${i}.example&port=443&secret=0123456789abcdef0123456789abcdef`
  );
  assert.equal(mergeProxyFeeds([{ source: "large", content: rows.join("\n") }], { limit: 75 }).length, 75);
});

test("public proxy API restores all seven public feeds and adds the four owner-supplied links", async () => {
  const { readFile } = await import("node:fs/promises");
  const api = await readFile(new URL("../api/public-proxies.js", import.meta.url), "utf8");
  const sources = [
    "https://iwizard7.github.io/MTProxy_list/working.txt",
    "https://iwizard7.github.io/MTProxy_list/stable.txt",
    "https://iwizard7.github.io/MTProxy_list/best.txt",
    "https://tgmtproxy.github.io/mtproxy/proxies.txt",
    "https://raw.githubusercontent.com/Kira00011/MTProto/main/all_proxies.txt",
    "https://raw.githubusercontent.com/dubblebyte/free-mtproto-proxies/main/all_proxies.txt",
    "https://raw.githubusercontent.com/SoliSpirit/mtproto/master/all_proxies.txt"
  ];
  for (const source of sources) assert.ok(api.includes(source), "missing restored feed: " + source);
  assert.ok(api.includes("212.118.53.195"));
  assert.ok(api.includes("103.161.35.23"));
  assert.ok(api.includes("77.238.241.225"));
  assert.ok(api.includes("gos.8f.dk.euv.4h.d.kw.68-309-27-46.ir"));
  assert.match(api, /mergeProxyFeeds/);
  assert.doesNotMatch(api, /All public proxy feeds are unavailable/);
  assert.match(api, /limit:\s*36/);
  assert.match(api, /probeMtproto\(proxy\.server, proxy\.port, proxy\.secret/);
  assert.ok(api.includes("s-maxage=15, stale-while-revalidate=0"));
});

test("site automatically refreshes and keeps the last good proxy list after an update error", async () => {
  const { readFile } = await import("node:fs/promises");
  const html = await readFile(new URL("../site/index.html", import.meta.url), "utf8");
  assert.ok(html.includes("if(savedSettings.auto!==false)refreshTimer=setInterval(()=>{if(!document.hidden)load({silent:true})},savedSettings.interval)"));
  assert.ok(html.includes('document.addEventListener("visibilitychange",()=>{if(!document.hidden&&savedSettings.auto!==false)load({silent:true})})'));
  assert.ok(html.includes("Could not verify proxies right now — hidden until a successful check"));
  assert.ok(html.includes("proxies=[];"));
});


test("TCP probe exits promptly when a proxy hostname DNS lookup stalls", async () => {
  const started = Date.now();
  const result = await probeTcp("slow-dns.example", 443, {
    dnsTimeoutMs: 15,
    lookup: () => new Promise(() => {})
  });
  assert.deepEqual(result, { online: false, latency_ms: null });
  assert.ok(Date.now() - started < 250, "DNS timeout should be bounded");
});


test("public proxy API does not serve stale cached entries after their verification window", async () => {
  const { readFile } = await import("node:fs/promises");
  const api = await readFile(new URL("../api/public-proxies.js", import.meta.url), "utf8");
  assert.match(api, /s-maxage=15, stale-while-revalidate=0/);
});

test("public page removes old proxy entries when a fresh verification request fails", async () => {
  const { readFile } = await import("node:fs/promises");
  const html = await readFile(new URL("../site/index.html", import.meta.url), "utf8");
  assert.match(html, /catch\(error\)\{\s*proxies=\[\];\s*window\.lastProxyMeta=null;/);
  assert.match(html, /لم يمكن التحقق من البروكسيات الآن/);
});

test("API only includes proxies whose Telegram MTProto handshake succeeded", async () => {
  const { readFile } = await import("node:fs/promises");
  const api = await readFile(new URL("../api/public-proxies.js", import.meta.url), "utf8");
  assert.match(api, /if \(result\.online\)/);
  assert.match(api, /return checked\.filter\(Boolean\)/);
  assert.match(api, /tested_from: "Vercel server region"/);
  assert.match(api, /MTProto req_pq_multi\/resPQ/);
  assert.match(api, /probeMtproto\(proxy\.server, proxy\.port, proxy\.secret/);
  assert.match(api, /const \{ secret, \.\.\.publicProxy \} = proxy/);
});


test("public proxy parser retains the secret for an end-to-end MTProto check", () => {
  const secret = "0123456789abcdef0123456789abcdef";
  const [proxy] = parsePublicProxyList(`tg://proxy?server=one.example&port=443&secret=${secret}`);
  assert.equal(proxy.secret, secret);
});

test("MTProto probe accepts only a matching req_pq_multi/resPQ nonce response", async () => {
  const { probeMtproto } = await import("../lib/mtproto-probe.js");
  const { createHash, createCipheriv, randomBytes } = await import("node:crypto");
  const { EventEmitter } = await import("node:events");
  const secret = "0123456789abcdef0123456789abcdef";
  const nonce = Buffer.from("00112233445566778899aabbccddeeff", "hex");
  const writes = [];
  const socket = new EventEmitter();
  socket.destroy = () => {};
  socket.setTimeout = () => {};
  socket.write = data => {
    writes.push(Buffer.from(data));
    if (writes.length === 2) {
      const initReversed = Buffer.from(writes[0]).reverse();
      const key = createHash("sha256").update(Buffer.concat([initReversed.subarray(8, 40), Buffer.from(secret, "hex")])).digest();
      const iv = initReversed.subarray(40, 56);
      const body = Buffer.alloc(80);
      body.writeUInt32LE(0x05162463, 0);
      nonce.copy(body, 4);
      randomBytes(16).copy(body, 20);
      body[36] = 8;
      randomBytes(8).copy(body, 37);
      body.writeUInt32LE(0x1cb5c415, 48);
      body.writeUInt32LE(3, 52);
      randomBytes(24).copy(body, 56);
      const message = Buffer.alloc(20 + body.length);
      message.writeBigUInt64LE(0n, 0);
      message.writeBigUInt64LE((BigInt(Math.floor(Date.now() / 1000)) << 32n) + 4n, 8);
      message.writeUInt32LE(body.length, 16);
      body.copy(message, 20);
      const framed = Buffer.concat([Buffer.from([message.length / 4]), message]);
      const serverCipher = createCipheriv("aes-256-ctr", key, iv);
      queueMicrotask(() => {
        socket.emit("data", serverCipher.update(framed));
      });
    }
    return true;
  };
  const result = await probeMtproto("proxy.example", 443, secret, {
    timeoutMs: 200,
    dnsTimeoutMs: 50,
    nonce,
    lookup: async () => [{ address: "8.8.8.8", family: 4 }],
    connect: () => { queueMicrotask(() => socket.emit("connect")); return socket; }
  });
  assert.equal(result.online, true);
  assert.equal(result.verification, "mtproto-respq");
  assert.equal(writes[0].length, 64);
  assert.ok(writes[1].length > 40);
});

test("MTProto probe rejects malformed secrets before opening a socket", async () => {
  const { probeMtproto } = await import("../lib/mtproto-probe.js");
  const result = await probeMtproto("proxy.example", 443, "not-a-valid-secret");
  assert.equal(result.online, false);
  assert.equal(result.reason, "invalid-secret");
});

test("English language dictionary is built after all translations and never replaces missing text with a generic error", async () => {
  const { readFile } = await import("node:fs/promises");
  const html = await readFile(new URL("../site/index.html", import.meta.url), "utf8");
  assert.ok(html.indexOf("Object.assign(translations") < html.indexOf("const reverseTranslations="));
  assert.doesNotMatch(html, /return "Please try again\."/);
  assert.match(html, /"اجتاز مصافحة MTProto"/);
  assert.match(html, /"MTProto handshake verified"/);
  assert.match(html, /translations\["عالمي — الموقع غير محدد"\]="Global — location unverified"/);
  assert.doesNotMatch(html, /ms TCP/);
});


test("MTProto probe validates Fake-TLS ee secrets and then verifies the Telegram nonce", async () => {
  const { probeMtproto } = await import("../lib/mtproto-probe.js");
  const { createHash, createHmac, createCipheriv, randomBytes } = await import("node:crypto");
  const { EventEmitter } = await import("node:events");
  const secret16 = Buffer.from("0123456789abcdef0123456789abcdef", "hex");
  const nonce = Buffer.from("102132435465768798a9bacbdcedfe0f", "hex");
  const domain = "www.example.com";
  const secret = "ee" + secret16.toString("hex") + Buffer.from(domain).toString("hex");
  const socket = new EventEmitter();
  socket.destroy = () => {};
  socket.setTimeout = () => {};
  let writes = 0;
  socket.write = data => {
    writes++;
    if (writes === 1) {
      const hello = Buffer.from(data);
      assert.equal(hello.length, 517);
      const clientDigest = Buffer.from(hello.subarray(11, 43));
      const sessionId = hello.subarray(44, 76);
      const sh = Buffer.alloc(76);
      sh[0] = 2; sh.writeUIntBE(sh.length - 4, 1, 3); sh[4] = 3; sh[5] = 3;
      randomBytes(32).copy(sh, 6);
      sh[38] = 32; sessionId.copy(sh, 39);
      sh[71] = 0x13; sh[72] = 0x01; sh[73] = 0; sh[74] = 0; sh[75] = 0;
      const first = Buffer.alloc(5 + sh.length);
      first.set([0x16, 0x03, 0x03], 0); first.writeUInt16BE(sh.length, 3); sh.copy(first, 5);
      const ccs = Buffer.from([0x14, 0x03, 0x03, 0x00, 0x01, 0x01]);
      const app = Buffer.from([0x17, 0x03, 0x03, 0x00, 0x00]);
      const reply = Buffer.concat([first, ccs, app]);
      const zeroed = Buffer.from(reply); zeroed.fill(0, 11, 43);
      createHmac("sha256", secret16).update(Buffer.concat([clientDigest, zeroed])).digest().copy(reply, 11);
      queueMicrotask(() => socket.emit("data", reply));
    } else {
      const record = Buffer.from(data);
      assert.equal(record[0], 0x17);
      const obfsHeader = record.subarray(5, 69);
      const reversed = Buffer.from(obfsHeader).reverse();
      const key = createHash("sha256").update(Buffer.concat([reversed.subarray(8, 40), secret16])).digest();
      const iv = reversed.subarray(40, 56);
      const body = Buffer.alloc(80);
      body.writeUInt32LE(0x05162463, 0); nonce.copy(body, 4); randomBytes(16).copy(body, 20);
      body[36] = 8; randomBytes(8).copy(body, 37); body.writeUInt32LE(0x1cb5c415, 48); body.writeUInt32LE(3, 52); randomBytes(24).copy(body, 56);
      const message = Buffer.alloc(20 + body.length);
      message.writeBigUInt64LE(0n, 0); message.writeBigUInt64LE((BigInt(Math.floor(Date.now() / 1000)) << 32n) + 4n, 8); message.writeUInt32LE(body.length, 16); body.copy(message, 20);
      const framed = Buffer.alloc(4 + message.length + 4); framed.writeUInt32LE(message.length + 4, 0); message.copy(framed, 4); randomBytes(4).copy(framed, 4 + message.length);
      const encrypted = createCipheriv("aes-256-ctr", key, iv).update(framed);
      const response = Buffer.alloc(5 + encrypted.length); response.set([0x17, 0x03, 0x03], 0); response.writeUInt16BE(encrypted.length, 3); encrypted.copy(response, 5);
      queueMicrotask(() => socket.emit("data", response));
    }
    return true;
  };
  const result = await probeMtproto("proxy.example", 443, secret, {
    timeoutMs: 300, dnsTimeoutMs: 50, nonce,
    lookup: async () => [{ address: "8.8.8.8", family: 4 }],
    connect: () => { queueMicrotask(() => socket.emit("connect")); return socket; }
  });
  assert.equal(result.online, true);
  assert.equal(result.verification, "mtproto-respq");
});


test("public proxy parser accepts standard, dd and ee secrets but rejects incomplete tagged secrets", () => {
  const base = "0123456789abcdef0123456789abcdef";
  const domain = Buffer.from("www.example.com").toString("hex");
  const links = [
    `tg://proxy?server=standard.example&port=443&secret=${base}`,
    `tg://proxy?server=padded.example&port=443&secret=dd${base}`,
    `tg://proxy?server=faketls.example&port=443&secret=ee${base}${domain}`,
    `tg://proxy?server=badfaketls.example&port=443&secret=ee${base}`,
    `tg://proxy?server=baddd.example&port=443&secret=dd${base}${domain}`
  ];
  const rows = parsePublicProxyList(links.join("\n"));
  assert.deepEqual(rows.map(row => row.server), ["standard.example", "padded.example", "faketls.example"]);
});


test("public page hides source websites, source counters, and last-update labels", async () => {
  const { readFile } = await import("node:fs/promises");
  const html = await readFile(new URL("../site/index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /statSources|sources_ok|sources_total|مصدر عام|المصادر المتاحة|Available sources|آخر فحص:/);
  assert.doesNotMatch(html, /regionFilter|last-checked|timeLabel\(/);
  assert.match(html, /بحث بعنوان السيرفر أو المنفذ|ابحث بعنوان السيرفر أو المنفذ/);
});
