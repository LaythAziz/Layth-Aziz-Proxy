import { parsePublicProxyList } from "../lib/public-proxies.js";
import { probeTcp } from "../lib/proxy-probe.js";

const SOURCES = [
  "https://iwizard7.github.io/MTProxy_list/working.txt",
  "https://iwizard7.github.io/MTProxy_list/stable.txt",
  "https://raw.githubusercontent.com/SoliSpirit/mtproto/master/all_proxies.txt"
];

async function fetchCandidates() {
  const candidates = [];
  const seen = new Set();
  for (const source of SOURCES) {
    try {
      const response = await fetch(source, {
        signal: AbortSignal.timeout(6500),
        headers: { "User-Agent": "LaythAzizProxy/2.0", "Accept": "text/plain" }
      });
      if (!response.ok) continue;
      const rows = parsePublicProxyList(await response.text(), { limit: 80 });
      for (const row of rows) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        candidates.push({ ...row, source: new URL(source).hostname });
      }
    } catch { /* move to the next public feed */ }
  }
  return candidates.slice(0, 40);
}

async function probeCandidates(candidates) {
  const checked = [];
  let cursor = 0;
  const workers = Array.from({ length: 8 }, async () => {
    while (cursor < candidates.length) {
      const index = cursor++;
      const proxy = candidates[index];
      const result = await probeTcp(proxy.server, proxy.port, { timeoutMs: 1600 });
      if (result.online) checked[index] = {
        ...proxy,
        online: true,
        latency_ms: result.latency_ms,
        region: "عالمي — الموقع غير محدد",
        checked_at: new Date().toISOString()
      };
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
  res.setHeader("Cache-Control", "s-maxage=45, stale-while-revalidate=120");
  try {
    const candidates = await fetchCandidates();
    const proxies = await probeCandidates(candidates);
    return res.status(200).json({
      proxies,
      checked_at: new Date().toISOString(),
      tested_from: "Vercel server region",
      note: "يتم عرض البروكسيات التي استجابت لفحص TCP فقط. هذا الفحص من خادم الموقع وليس من جهازك داخل العراق، ولا يثبت اكتمال اتصال MTProto."
    });
  } catch {
    return res.status(502).json({ error: "تعذر جلب أو فحص البروكسيات حالياً. حاول مرة أخرى بعد قليل." });
  }
}
