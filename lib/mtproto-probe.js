import { createHash, createHmac, createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import { createConnection, isIP } from "node:net";
import { lookup as dnsLookup } from "node:dns/promises";
import { domainToASCII } from "node:url";
import { performance } from "node:perf_hooks";
import { isPublicIPv4 } from "./proxy-probe.js";

const MAX_RESPONSE = 1024 * 1024;
const MAX_TLS_RECORD = 16384 + 512;

function decodeSecret(value) {
  const secret = String(value || "").trim().toLowerCase();
  if (/^[0-9a-f]{32}$/.test(secret)) {
    return { bytes: Buffer.from(secret, "hex"), mode: "obfuscated2" };
  }
  if (/^dd[0-9a-f]{32}$/.test(secret)) {
    return { bytes: Buffer.from(secret.slice(2), "hex"), mode: "padded-intermediate" };
  }
  if (/^ee[0-9a-f]{34,510}$/.test(secret)) {
    const raw = Buffer.from(secret.slice(2), "hex");
    const domain = raw.subarray(16).toString("utf8").replace(/\0+$/g, "");
    return { bytes: raw.subarray(0, 16), mode: "fake-tls", domain: domain || "www.google.com" };
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

function littleEndian32(value) {
  const out = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) {
    out[i] = Number(value & 255n);
    value >>= 8n;
  }
  return out;
}

function genX25519PublicKey() {
  const prime = (1n << 255n) - 19n;
  const randomValue = BigInt("0x" + randomBytes(32).toString("hex")) % prime;
  return littleEndian32((randomValue * randomValue) % prime);
}

function u16(value) {
  const out = Buffer.alloc(2);
  out.writeUInt16BE(value);
  return out;
}

function buildFakeTlsClientHello(secret16, domain) {
  const asciiDomain = Buffer.from(domainToASCII(domain) || "www.google.com", "ascii");
  if (!asciiDomain.length || asciiDomain.length > 240) throw new Error("Invalid Fake-TLS domain");
  const sessionId = randomBytes(32);
  const cipherSuites = Buffer.from("fafa130113021303c02bc02fc02cc030cca9cca8c013c014009c009d002f0035", "hex");
  const sni = Buffer.concat([
    Buffer.from([0x00, 0x00]), u16(2 + 1 + 2 + asciiDomain.length),
    u16(1 + 2 + asciiDomain.length), Buffer.from([0x00]),
    u16(asciiDomain.length), asciiDomain
  ]);
  const parts = [
    Buffer.from("1603010200010001fc0303", "hex"),
    Buffer.alloc(32),
    Buffer.from([0x20]), sessionId,
    Buffer.from([0x00, 0x20]), cipherSuites,
    Buffer.from([0x01, 0x00, 0x01, 0x93]),
    Buffer.from("4a4a0000", "hex"),
    sni,
    Buffer.from("00170000ff01000100000a000a0008baba001d00170018000b00020100002300000010000e000c02683208687474702f312e31000500050100000000000d001200100403080404010503080505010806060100120000", "hex"),
    Buffer.from("0033002b0029baba0001001d0020", "hex"),
    genX25519PublicKey(),
    Buffer.from("002d00020101002b000b0a9a9a0304030303020301001b00030200021a1a000100", "hex")
  ];
  const head = Buffer.concat(parts);
  const paddingLength = 517 - (head.length + 4);
  if (paddingLength < 0) throw new Error("Fake-TLS ClientHello is too large");
  const hello = Buffer.concat([head, Buffer.from([0x00, 0x15]), u16(paddingLength), Buffer.alloc(paddingLength)]);
  if (hello.length !== 517) throw new Error("Invalid Fake-TLS ClientHello length");

  const digest = createHmac("sha256", secret16).update(hello).digest();
  const timestamp = Buffer.alloc(4);
  timestamp.writeUInt32LE(Math.floor(Date.now() / 1000));
  for (let i = 0; i < 4; i++) digest[28 + i] ^= timestamp[i];
  digest.copy(hello, 11);
  return { wire: hello, digest, sessionId };
}

function wrapTlsApplication(payload) {
  const records = [];
  for (let offset = 0; offset < payload.length; offset += 16384) {
    const chunk = payload.subarray(offset, Math.min(payload.length, offset + 16384));
    const header = Buffer.from([0x17, 0x03, 0x03, 0, 0]);
    header.writeUInt16BE(chunk.length, 3);
    records.push(header, chunk);
  }
  return Buffer.concat(records);
}

function createSocketReader(socket) {
  let buffer = Buffer.alloc(0);
  let failure = null;
  const waiters = [];
  const flush = () => {
    while (waiters.length) {
      const waiter = waiters[0];
      if (buffer.length >= waiter.size) {
        waiters.shift();
        const result = buffer.subarray(0, waiter.size);
        buffer = buffer.subarray(waiter.size);
        waiter.resolve(result);
      } else if (failure) {
        waiters.shift();
        waiter.reject(failure);
      } else break;
    }
  };
  socket.on("data", chunk => { buffer = Buffer.concat([buffer, chunk]); flush(); });
  socket.on("error", error => { failure = error; flush(); });
  socket.on("close", () => { failure ||= new Error("Socket closed"); flush(); });
  return {
    readExact(size) {
      return new Promise((resolve, reject) => { waiters.push({ size, resolve, reject }); flush(); });
    }
  };
}

async function verifyFakeTlsServerHello(reader, secret16, clientDigest, sessionId) {
  const records = [];
  let sawHandshake = false;
  let sawChangeCipher = false;
  for (let index = 0; index < 8; index++) {
    const header = await reader.readExact(5);
    const type = header[0];
    if (index === 0 && !(header[0] === 0x16 && header[1] === 0x03 && header[2] === 0x03)) {
      throw new Error("Fake-TLS ServerHello missing");
    }
    if (type === 0x15) throw new Error("Fake-TLS secret rejected");
    const length = header.readUInt16BE(3);
    if (length > MAX_TLS_RECORD) throw new Error("Invalid Fake-TLS record size");
    const body = await reader.readExact(length);
    records.push(header, body);
    if (type === 0x16) sawHandshake = true;
    else if (type === 0x14) sawChangeCipher = true;
    else if (type === 0x17) break;
  }
  if (!sawHandshake || !sawChangeCipher) throw new Error("Incomplete Fake-TLS handshake");
  const reply = Buffer.concat(records);
  if (reply.length < 76) throw new Error("Fake-TLS ServerHello too short");
  if (reply[43] === 32 && !timingSafeEqual(reply.subarray(44, 76), sessionId)) {
    throw new Error("Fake-TLS session ID mismatch");
  }
  const serverDigest = reply.subarray(11, 43);
  const zeroed = Buffer.from(reply);
  zeroed.fill(0, 11, 43);
  const expected = createHmac("sha256", secret16).update(Buffer.concat([clientDigest, zeroed])).digest();
  if (!timingSafeEqual(serverDigest, expected)) throw new Error("Fake-TLS server digest mismatch");
}

async function readTlsApplication(reader) {
  while (true) {
    const header = await reader.readExact(5);
    const type = header[0];
    const length = header.readUInt16BE(3);
    if (length > MAX_TLS_RECORD) throw new Error("Invalid TLS record size");
    const body = await reader.readExact(length);
    if (type === 0x17) return body;
    if (type === 0x15) throw new Error("TLS alert received");
    if (type !== 0x14) throw new Error("Unexpected TLS record type");
  }
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
  if (!parsed) return { online: false, latency_ms: null, reason: "invalid-secret" };

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
    const processObfsBytes = chunk => {
      if (settled) return;
      try {
        decrypted = Buffer.concat([decrypted, packet.responseCipher.update(chunk)]);
        if (decrypted.length < 4) return;
        const length = decrypted.readUInt32LE(0);
        if (length < 40 || length > MAX_RESPONSE) return finish(false);
        if (decrypted.length < 4 + length) return;
        finish(responseHasMatchingNonce(decrypted.subarray(4, 4 + length), nonce));
      } catch { finish(false); }
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    try {
      socket = connect({ host: address.address, family: address.family, port: Number(port) });
      if (parsed.mode === "fake-tls") {
        const reader = createSocketReader(socket);
        socket.once("connect", async () => {
          try {
            const hello = buildFakeTlsClientHello(parsed.bytes, parsed.domain);
            socket.write(hello.wire);
            await verifyFakeTlsServerHello(reader, parsed.bytes, hello.digest, hello.sessionId);
            socket.write(wrapTlsApplication(Buffer.concat([packet.header, packet.request])));
            while (!settled) {
              const payload = await readTlsApplication(reader);
              if (payload.length) processObfsBytes(payload);
            }
          } catch { finish(false); }
        });
      } else {
        socket.once("connect", () => {
          try {
            socket.write(packet.header);
            socket.write(packet.request);
          } catch { finish(false); }
        });
        socket.on("data", processObfsBytes);
      }
      socket.once("error", () => finish(false));
      socket.once("close", () => finish(false));
      socket.setTimeout?.(timeoutMs);
    } catch {
      finish(false);
    }
  });
}
