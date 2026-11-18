import { requireAdmin, encryptSecret, validateProxyInput } from "../lib/proxy-security.js";
import { insertProxy, listProxies, storeReady } from "../lib/proxy-store.js";
import { createHetznerServer, deleteHetznerServer } from "../lib/hetzner.js";
import { generateProxyCredentials, normalizeServerName } from "../lib/hetzner.js";

function telegramLink(server, port, secret) {
  return `tg://proxy?server=${encodeURIComponent(server)}&port=${port}&secret=${secret}`;
}

async function provisionProxy(body) {
  const credentials = generateProxyCredentials();
  const name = normalizeServerName(body.name);
  const location = String(body.location || "").trim();
  if (location && !/^[a-z0-9-]{2,32}$/i.test(location)) throw new Error("رمز موقع السيرفر غير صحيح");
  const server = await createHetznerServer({
    name,
    location: location || undefined,
    secret: credentials.secret,
    port: credentials.port,
  });

  try {
    const [created] = await insertProxy({
      name: String(body.name || name).trim().slice(0, 80) || name,
      server: server.ip,
      port: credentials.port,
      secret_encrypted: encryptSecret(credentials.secret),
      status: "pending",
      provider_name: "hetzner",
      provider_server_id: server.id,
      provider_location: server.location,
      server_type: server.serverType,
    });
    return {
      proxy: {
        id: created.id,
        name: created.name,
        server: server.ip,
        port: credentials.port,
        status: "pending",
        provider_name: "hetzner",
        provider_location: server.location,
        server_type: server.serverType,
        secret: credentials.secret,
        telegram_link: telegramLink(server.ip, credentials.port, credentials.secret),
      },
      note: "تم إنشاء سيرفر حقيقي. يحتاج MTProxy إلى إكمال الإعداد والإقلاع قبل أن يصبح الرابط متاحاً.",
    };
  } catch (error) {
    try { await deleteHetznerServer(server.id); } catch { /* preserve the database error; provider cleanup may need manual review */ }
    throw error;
  }
}

export default async function handler(req, res) {
  if (!requireAdmin(req)) return res.status(401).json({ error: "غير مصرح" });
  if (!storeReady()) return res.status(503).json({ error: "قاعدة البيانات غير مربوطة بعد. أضف متغيرات Supabase في Vercel." });
  try {
    if (req.method === "GET") return res.status(200).json({ proxies: await listProxies() });
    if (req.method === "POST") {
      if (req.body?.action === "provision") {
        const result = await provisionProxy(req.body);
        return res.status(201).json(result);
      }
      const input = validateProxyInput(req.body);
      const [created] = await insertProxy({
        name: input.name,
        server: input.server,
        port: input.port,
        secret_encrypted: encryptSecret(input.secret),
        status: "pending",
      });
      return res.status(201).json({ proxy: { id: created.id, name: created.name, server: created.server, port: created.port, status: created.status } });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    const status = /HETZNER_API_TOKEN/.test(error.message) ? 503 : 400;
    return res.status(status).json({ error: error.message || "تعذر تنفيذ الطلب" });
  }
}
