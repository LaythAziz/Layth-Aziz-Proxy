import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

export function requireAdmin(req) {
  const expected = process.env.ADMIN_API_TOKEN;
  const header = req.headers.authorization || "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

function encryptionKey() {
  const raw = process.env.PROXY_SECRET_ENCRYPTION_KEY || "";
  if (!/^[a-f0-9]{64}$/i.test(raw)) throw new Error("PROXY_SECRET_ENCRYPTION_KEY must be 64 hex characters");
  return Buffer.from(raw, "hex");
}

export function encryptSecret(secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptSecret(value) {
  const [iv, tag, encrypted] = String(value).split(".");
  if (!iv || !tag || !encrypted) throw new Error("Stored secret has invalid format");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

export function validateProxyInput(body = {}) {
  const server = String(body.server || "").trim();
  const port = Number(body.port);
  const secret = String(body.secret || "").trim().toLowerCase();
  if (!server || server.length > 253 || /[\\s/?#]/.test(server)) throw new Error("عنوان السيرفر غير صحيح");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("المنفذ يجب أن يكون بين 1 و65535");
  if (!/^[a-f0-9]{32}$/.test(secret)) throw new Error("Secret يجب أن يتكون من 32 خانة hexadecimal");
  return { server, port, secret, name: String(body.name || server).trim().slice(0, 80) || server };
}
