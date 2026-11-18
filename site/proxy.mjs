export function normalizeServer(value) {
  const raw = String(value ?? "").trim();
  if (!raw) throw new Error("اكتب عنوان السيرفر أولاً");
  if (/\s|[/?#]/.test(raw)) throw new Error("اكتب IP أو اسم نطاق فقط بدون رابط أو مسار");
  const host = raw.replace(/^\[|\]$/g, "");
  const isIPv6 = host.includes(":");
  if (isIPv6) {
    if (!/^[0-9a-f:]+$/i.test(host) || host.split(":").length < 3) throw new Error("عنوان IPv6 غير صحيح");
    return host.toLowerCase();
  }
  if (host.length > 253 || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(host)) {
    throw new Error("عنوان IP أو النطاق غير صحيح");
  }
  return host.toLowerCase();
}

export function buildTelegramProxyLink({ server, port, secret }) {
  const host = normalizeServer(server);
  const numericPort = Number(port);
  if (!Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65535) throw new Error("رقم المنفذ يجب أن يكون بين 1 و65535");
  const cleanSecret = String(secret ?? "").trim();
  if (!/^[a-f0-9]{32}$/i.test(cleanSecret)) throw new Error("السر يجب أن يتكون من 32 خانة hexadecimal");
  return `tg://proxy?server=${encodeURIComponent(host)}&port=${numericPort}&secret=${cleanSecret.toLowerCase()}`;
}

export function generateSecret(cryptoApi = globalThis.crypto) {
  if (!cryptoApi?.getRandomValues) throw new Error("المتصفح لا يدعم مولّد الأسرار الآمن");
  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}
