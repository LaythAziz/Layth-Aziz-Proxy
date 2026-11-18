import { parsePublicProxyList } from "../lib/public-proxies.js";
import { probeMtproto } from "../lib/mtproto-probe.js";

// The site uses only the four proxy links explicitly supplied by its owner.
// No external proxy-feed websites are fetched or counted.
const OWNER_PROXIES = [
  "tg://proxy?server=212.118.53.195&port=443&secret=dd4482437e89f9af8929514eee7faaf61f",
  "tg://proxy?server=103.161.35.23&port=443&secret=dd79e7010200010007f0030386e24c3add",
  "tg://proxy?server=77.238.241.225&port=8880&secret=79e344818749bd7ac519130220c25d09",
  "tg://proxy?server=gos.8f.dk.euv.4h.d.kw.68-309-27-46.ir&port=8443&secret=79e344818749bd7ac519130220c25d09"
];

async function probeCandidates(candidates) {
  const checked = [];
  let cursor = 0;
  const workers = Array.from({ length: 4 }, async () => {
    while (cursor < candidates.length) {
      const index = cursor++;
      const proxy = candidates[index];
      const result = await probeMtproto(proxy.server, proxy.port, proxy.secret, {
        timeoutMs: 1800,
        dnsTimeoutMs: 800
      });
      if (result.online) {
        const { secret, ...publicProxy } = proxy;
        checked[index] = {
          ...publicProxy,
          online: true,
          verification: result.verification,
          latency_ms: result.latency_ms,
          region: "غير محدد",
          checked_at: new Date().toISOString()
        };
      }
    }
  });
  await Promise.all(workers);
  return checked.filter(Boolean).sort((a, b) => a.latency_ms - b.latency_ms);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "s-maxage=15, stale-while-revalidate=0");
  try {
    const candidates = parsePublicProxyList(OWNER_PROXIES.join("\\n"), { limit: 4 });
    const proxies = await probeCandidates(candidates);
    return res.status(200).json({
      proxies,
      candidates_checked: candidates.length,
      tested_from: "Vercel server region",
      verification: "MTProto req_pq_multi/resPQ"
    });
  } catch {
    return res.status(502).json({ error: "تعذر فحص البروكسيات حالياً. حاول مرة أخرى بعد قليل." });
  }
}
