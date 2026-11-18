import { requireAdmin, encryptSecret, validateProxyInput } from "../lib/proxy-security.js";
import { insertProxy, listProxies, storeReady } from "../lib/proxy-store.js";

export default async function handler(req, res) {
  if (!requireAdmin(req)) return res.status(401).json({ error: "غير مصرح" });
  if (!storeReady()) return res.status(503).json({ error: "قاعدة البيانات غير مربوطة بعد. أضف متغيرات Supabase في Vercel." });
  try {
    if (req.method === "GET") return res.status(200).json({ proxies: await listProxies() });
    if (req.method === "POST") {
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
    return res.status(400).json({ error: error.message || "تعذر تنفيذ الطلب" });
  }
}
