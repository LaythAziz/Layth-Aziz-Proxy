import test from "node:test";
import assert from "node:assert/strict";
import { encryptSecret, decryptSecret, validateProxyInput } from "./security.js";

test("validates and normalizes proxy details", () => {
  const value = validateProxyInput({name:"Primary",server:"proxy.example.com",port:"443",secret:"A".repeat(32)});
  assert.equal(value.server, "proxy.example.com");
  assert.equal(value.port, 443);
  assert.equal(value.secret, "a".repeat(32));
});

test("rejects invalid proxy details", () => {
  assert.throws(() => validateProxyInput({server:"",port:443,secret:"a".repeat(32)}));
  assert.throws(() => validateProxyInput({server:"proxy.example.com",port:70000,secret:"a".repeat(32)}));
  assert.throws(() => validateProxyInput({server:"proxy.example.com",port:443,secret:"not-a-secret"}));
});

test("encrypts and decrypts proxy secrets with authenticated encryption", () => {
  const old = process.env.PROXY_SECRET_ENCRYPTION_KEY;
  process.env.PROXY_SECRET_ENCRYPTION_KEY = "ab".repeat(32);
  try {
    const secret = "0123456789abcdef0123456789abcdef";
    const encrypted = encryptSecret(secret);
    assert.notEqual(encrypted, secret);
    assert.equal(decryptSecret(encrypted), secret);
  } finally {
    if (old === undefined) delete process.env.PROXY_SECRET_ENCRYPTION_KEY;
    else process.env.PROXY_SECRET_ENCRYPTION_KEY = old;
  }
});
