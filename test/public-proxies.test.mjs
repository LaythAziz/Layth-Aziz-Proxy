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

test("public proxy API aggregates multiple feeds and checks a larger rotating pool", async () => {
  const { readFile } = await import("node:fs/promises");
  const api = await readFile(new URL("../api/public-proxies.js", import.meta.url), "utf8");
  assert.ok(api.includes("MTProxy_list/working.txt"));
  assert.ok(api.includes("tgmtproxy.github.io/mtproxy/proxies.txt"));
  assert.ok(api.includes("dubblebyte/free-mtproto-proxies"));
  assert.ok(api.includes("limit: 120"));
  assert.ok(api.includes("length: 12"));
  assert.ok(api.includes("s-maxage=20, stale-while-revalidate=0"));
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
  assert.match(api, /s-maxage=20, stale-while-revalidate=0/);
});

test("public page removes old proxy entries when a fresh verification request fails", async () => {
  const { readFile } = await import("node:fs/promises");
  const html = await readFile(new URL("../site/index.html", import.meta.url), "utf8");
  assert.match(html, /catch\(error\)\{\s*proxies=\[\];\s*window\.lastProxyMeta=null;/);
  assert.match(html, /لم يمكن التحقق من البروكسيات الآن/);
});

test("API only includes proxies whose TCP connection probe succeeded", async () => {
  const { readFile } = await import("node:fs/promises");
  const api = await readFile(new URL("../api/public-proxies.js", import.meta.url), "utf8");
  assert.match(api, /if \(result\.online\) checked\[index\]/);
  assert.match(api, /return checked\.filter\(Boolean\)/);
  assert.match(api, /tested_from: "Vercel server region"/);
});
