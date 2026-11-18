import test from "node:test";
import assert from "node:assert/strict";
import { generateProxyCredentials, buildCloudInit, normalizeServerName } from "../lib/hetzner.js";

test("generates a unique valid MTProto secret and an assigned TCP port", () => {
  const result = generateProxyCredentials();
  assert.match(result.secret, /^[a-f0-9]{32}$/);
  assert.ok(result.port >= 20000 && result.port <= 60000);
});

test("builds cloud-init that installs MTProxy as a restarting system service", () => {
  const script = buildCloudInit({ secret: "a".repeat(32), port: 28443 });
  assert.match(script, /Restart=always/);
  assert.match(script, /-H 28443/);
  assert.match(script, /-S a{32}/);
  assert.match(script, /systemctl enable --now mtproxy/);
});

test("normalizes a safe provider server name", () => {
  assert.equal(normalizeServerName("My Proxy #1"), "my-proxy-1");
  assert.equal(normalizeServerName(""), "layth-proxy");
});
