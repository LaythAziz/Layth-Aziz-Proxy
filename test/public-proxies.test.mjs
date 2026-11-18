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
