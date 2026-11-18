import net from "node:net";
import { requireAdmin, decryptSecret } from "../../lib/proxy-security.js";
import { deleteProxy, getProxy, updateProxy } from "../../lib/proxy-store.js";

function tcpCheck(host, port, timeoutMs = 4500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (ok) => { socket.destroy(); resolve(ok); };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

export default async function handler(req, res) {
  if (!requireAdmin(req)) return res.status(401).json({ error: "غير مصرح" });
  const id = String(req.query.id || "");
  if (!id) return res.status(400).json({ error: "معرّف البروكسي مطلوب" });
  try {
    const [proxy] = await getProxy(id);
    if (!proxy) return res.status(404).json({ error: "البروكسي غير موجود" });
    if (req.method === "DELETE") {
      await deleteProxy(id);
      return res.status(200).json({ deleted: true });
    }
    if (req.method === "POST" && req.body?.action === "check") {
      const started = Date.now();
      const reachable = await tcpCheck(proxy.server, proxy.port);
      const latency = reachable ? Date.now() - started : null;
      const status = reachable ? "online" : "offline";
      await updateProxy(id, { status, last_check: new Date().toISOString(), latency_ms: latency });
      return res.status(200).json({ id, status, latency_ms: latency, checked_at: new Date().toISOString(), note: "فحص TCP فقط؛ لا يثبت وحده نجاح مصافحة MTProto داخل Telegram." });
    }
    if (req.method === "GET") {
      return res.status(200).json({ proxy: { id: proxy.id, name: proxy.name, server: proxy.server, port: proxy.port, status: proxy.status, last_check: proxy.last_check, latency_ms: proxy.latency_ms } });
    }
    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return res.status(400).json({ error: error.message || "تعذر تنفيذ الطلب" });
  }
}
