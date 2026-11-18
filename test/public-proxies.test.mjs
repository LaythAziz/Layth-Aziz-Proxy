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
