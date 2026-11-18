import { mergeProxyFeeds } from "../lib/public-proxies.js";
import { probeTcp } from "../lib/proxy-probe.js";

const SOURCES = [
  "https://iwizard7.github.io/MTProxy_list/working.txt",
  "https://iwizard7.github.io/MTProxy_list/stable.txt",
  "https://iwizard7.github.io/MTProxy_list/best.txt",
  "https://tgmtproxy.github.io/mtproxy/proxies.txt",
  "https://raw.githubusercontent.com/Kira00011/MTProto/main/all_proxies.txt",
  "https://raw.githubusercontent.com/dubblebyte/free-mtproto-proxies/main/all_proxies.txt",
  "https://raw.githubusercontent.com/SoliSpirit/mtproto/master/all_proxies.txt"
];

async function fetchCandidates() {
  const feeds = await Promise.all(SOURCES.map(async source => {
    try {
      const response = await fetch(source, {
        signal: AbortSignal.timeout(6500),
        headers: { "User-Agent": "LaythAzizProxy/2.1", "Accept": "text/plain" }
      });
      if (!response.ok) return null;
      return { source: new URL(source).hostname, content: await response.text() };
    } catch { return null; }
  }));
  const availableFeeds = feeds.filter(Boolean);
  if (!availableFeeds.length) throw new Error("All public proxy feeds are unavailable");
  return {
    candidates: mergeProxyFeeds(availableFeeds, { limit: 240, perFeedLimit: 160 }),
    sources_ok: availableFeeds.length,
    sources_total: SOURCES.length
  };
}

async function probeCandidates(candidates) {
  const checked = [];
  let cursor = 0;
  const workers = Array.from({ length: 20 }, async () => {
    while (cursor < candidates.length) {
      const index = cursor++;
      const proxy = candidates[index];
      const result = await probeTcp(proxy.server, proxy.port, { timeoutMs: 900 });
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
  res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");
  try {
    const { candidates, sources_ok, sources_total } = await fetchCandidates();
    const proxies = await probeCandidates(candidates);
    return res.status(200).json({
      proxies,
      candidates_checked: candidates.length,
      sources_ok,
      sources_total,
      checked_at: new Date().toISOString(),
      tested_from: "Vercel server region",
      note: "تُجمع القائمة من عدة مصادر عامة وتُعاد مراجعتها عند كل تحديث. يتم عرض البروكسيات التي استجابت لفحص TCP فقط. هذا الفحص من خادم الموقع وليس من جهازك داخل العراق، ولا يثبت اكتمال اتصال MTProto."
    });
  } catch {
    return res.status(502).json({ error: "تعذر جلب أو فحص البروكسيات حالياً. حاول مرة أخرى بعد قليل." });
  }
}
