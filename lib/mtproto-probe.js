import { createHash, createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import { createConnection, isIP } from "node:net";
import { lookup as dnsLookup } from "node:dns/promises";
import { performance } from "node:perf_hooks";
import { isPublicIPv4 } from "./proxy-probe.js";

const MAX_RESPONSE = 1024 * 1024;

function decodeSecret(value) {
  const secret = String(value || "").trim().toLowerCase();
  if (/^[0-9a-f]{32}$/.test(secret)) {
    return { bytes: Buffer.from(secret, "hex"), mode: "obfuscated2" };
  }
  if (/^dd[0-9a-f]{32}$/.test(secret)) {
    return { bytes: Buffer.from(secret.slice(2), "hex"), mode: "padded-intermediate" };
  }
  if (/^ee[0-9a-f]{34,510}$/.test(secret)) {
    return { bytes: null, mode: "tls", unsupported: true };
  }
  return null;
}

function isPublicAddress(address) {
  const family = isIP(address);
  if (family === 4) return isPublicIPv4(address);
  if (family !== 6) return false;
  const first = Number.parseInt(address.split(":").filter(Boolean)[0] || "0", 16);
  return first >= 0x2000 && first <= 0x3fff && !/^2001:db8:/i.test(address);
}

function sha256(value) {
  return createHash("sha256").update(value).digest();
}

function createProbePacket(secretBytes, nonce, random = randomBytes) {
  let init;
  do {
    init = random(64);
    init.copy(init, 0, 0, 56);
  } while (
    init[0] === 0xef ||
    [0x44414548, 0x54534f50, 0x20544547, 0x4954504f, 0x02010316, 0xdddddddd, 0xeeeeeeee].includes(init.readUInt32LE(0)) ||
    init.readUInt32LE(4) === 0
  );

  Buffer.from([0xdd, 0xdd, 0xdd, 0xdd, 0xfc, 0xff]).copy(init, 56);
  const reversed = Buffer.from(init).reverse();
  const encryptKey = sha256(Buffer.concat([init.subarray(8, 40), secretBytes]));
  const encryptIV = init.subarray(40, 56);
  const decryptKey = sha256(Buffer.concat([reversed.subarray(8, 40), secretBytes]));
  const decryptIV = reversed.subarray(40, 56);
  const encryptor = createCipheriv("aes-256-ctr", encryptKey, encryptIV);
  const encryptedInit = encryptor.update(init);
  const header = Buffer.from(init);
  encryptedInit.copy(header, 56, 56, 64);

  const body = Buffer.alloc(20);
  body.writeUInt32LE(0xbe7e8ef1, 0);
  nonce.copy(body, 4);
  const message = Buffer.alloc(20 + body.length);
  message.writeBigUInt64LE(0n, 0);
  message.writeBigUInt64LE((BigInt(Math.floor(Date.now() / 1000)) << 32n) + 4n, 8);
  message.writeUInt32LE(body.length, 16);
  body.copy(message, 20);
  const padding = random(8);
  const transport = Buffer.alloc(4 + message.length + padding.length);
  transport.writeUInt32LE(message.length + padding.length, 0);
  message.copy(transport, 4);
  padding.copy(transport, 4 + message.length);

  return {
    header,
    request: encryptor.update(transport),
    responseCipher: createDecipheriv("aes-256-ctr", decryptKey, decryptIV),
    nonce
  };
}

function responseHasMatchingNonce(payload, nonce) {
  if (payload.length < 40 || !payload.subarray(0, 8).every(byte => byte === 0)) return false;
  const messageLength = payload.readUInt32LE(16);
  if (messageLength < 36 || messageLength > payload.length - 20) return false;
  const body = payload.subarray(20, 20 + messageLength);
  if (body.length < 20 || body.readUInt32LE(0) !== 0x05162463) return false;
  return timingSafeEqual(body.subarray(4, 20), nonce);
}

export async function probeMtproto(host, port, secret, {
  timeoutMs = 1800,
  dnsTimeoutMs = 650,
  lookup = dnsLookup,
  connect = createConnection,
  nonce: suppliedNonce
} = {}) {
  const parsed = decodeSecret(secret);
  if (!parsed || parsed.unsupported) return { online: false, latency_ms: null, reason: parsed?.unsupported ? "unsupported-secret-mode" : "invalid-secret" };

  const started = performance.now();
  let address;
  try {
    if (isIP(host) && isPublicAddress(host)) {
      address = { address: host, family: isIP(host) };
    } else {
      let dnsTimer;
      const addresses = await Promise.race([
        lookup(String(host).replace(/^\[|\]$/g, ""), { all: true, verbatim: true }),
        new Promise((_, reject) => { dnsTimer = setTimeout(() => reject(new Error("DNS lookup timed out")), dnsTimeoutMs); })
      ]).finally(() => clearTimeout(dnsTimer));
      address = addresses.find(item => isPublicAddress(item.address));
    }
  } catch {
    return { online: false, latency_ms: null, reason: "dns-failed" };
  }
  if (!address) return { online: false, latency_ms: null, reason: "no-public-address" };

  const nonce = suppliedNonce ? Buffer.from(suppliedNonce) : randomBytes(16);
  if (nonce.length !== 16) return { online: false, latency_ms: null, reason: "invalid-nonce" };
  const packet = createProbePacket(parsed.bytes, nonce);

  return new Promise(resolve => {
    let socket;
    let settled = false;
    let decrypted = Buffer.alloc(0);
    const finish = online => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket?.destroy(); } catch {}
      resolve({
        online,
        latency_ms: online ? Math.max(1, Math.round(performance.now() - started)) : null,
        ...(online ? { verification: "mtproto-respq" } : { reason: "mtproto-handshake-failed" })
      });
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    try {
      socket = connect({ host: address.address, family: address.family, port: Number(port) });
      socket.once("connect", () => {
        try {
          socket.write(packet.header);
          socket.write(packet.request);
        } catch { finish(false); }
      });
      socket.on("data", chunk => {
        if (settled) return;
        try {
          decrypted = Buffer.concat([decrypted, packet.responseCipher.update(chunk)]);
          if (decrypted.length < 4) return;
          const length = decrypted.readUInt32LE(0);
          if (length < 40 || length > MAX_RESPONSE) return finish(false);
          if (decrypted.length < 4 + length) return;
          finish(responseHasMatchingNonce(decrypted.subarray(4, 4 + length), nonce));
        } catch { finish(false); }
      });
      socket.once("error", () => finish(false));
      socket.once("close", () => finish(false));
      socket.setTimeout?.(timeoutMs);
    } catch {
      finish(false);
    }
  });
}
