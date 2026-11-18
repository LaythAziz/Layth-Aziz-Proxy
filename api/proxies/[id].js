import net from "node:net";
import { requireAdmin, decryptSecret } from "../../lib/proxy-security.js";
import { deleteProxy, getProxy, updateProxy } from "../../lib/proxy-store.js";
import { deleteHetznerServer, setHetznerServerPower } from "../../lib/hetzner.js";

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
      if (proxy.provider_name === "hetzner" && proxy.provider_server_id) {
        await deleteHetznerServer(proxy.provider_server_id);
      }
      await deleteProxy(id);
      return res.status(200).json({ deleted: true, server_deleted: Boolean(proxy.provider_server_id) });
    }

    if (req.method === "POST" && req.body?.action === "reveal-link") {
      const secret = decryptSecret(proxy.secret_encrypted);
      const link = `tg://proxy?server=${encodeURIComponent(proxy.server)}&port=${proxy.port}&secret=${secret}`;
      return res.status(200).json({ id, telegram_link: link });
    }

    if (req.method === "POST" && ["start", "stop"].includes(req.body?.action)) {
      if (proxy.provider_name !== "hetzner" || !proxy.provider_server_id) {
        return res.status(409).json({ error: "هذا السجل غير مربوط بسيرفر سحابي يمكن تشغيله أو إيقافه." });
      }
      const action = req.body.action;
      await setHetznerServerPower(proxy.provider_server_id, action);
      const status = action === "stop" ? "stopped" : "pending";
      await updateProxy(id, { status, last_check: new Date().toISOString(), latency_ms: null });
      return res.status(200).json({ id, status, action });
    }

    if (req.method === "POST" && req.body?.action === "check") {
      // Do not let a stored manual hostname become an arbitrary server-side TCP target.
      if (proxy.provider_name !== "hetzner" || !proxy.provider_server_id) {
        return res.status(409).json({ error: "فحص TCP متاح للسيرفرات السحابية المُنشأة من هذه اللوحة فقط." });
      }
      const started = Date.now();
      const reachable = await tcpCheck(proxy.server, proxy.port);
      const latency = reachable ? Date.now() - started : null;
      const status = reachable ? "online" : "offline";
      await updateProxy(id, { status, last_check: new Date().toISOString(), latency_ms: latency });
      return res.status(200).json({ id, status, latency_ms: latency, checked_at: new Date().toISOString(), note: "فحص TCP فقط؛ لا يثبت وحده نجاح مصافحة MTProto داخل Telegram." });
    }

    if (req.method === "GET") {
      return res.status(200).json({ proxy: {
        id: proxy.id, name: proxy.name, server: proxy.server, port: proxy.port,
        status: proxy.status, last_check: proxy.last_check, latency_ms: proxy.latency_ms,
        provider_name: proxy.provider_name, provider_location: proxy.provider_location, server_type: proxy.server_type,
      } });
    }
    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return res.status(502).json({ error: error.message || "تعذر تنفيذ الطلب" });
  }
}
