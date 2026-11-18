import { parsePublicProxyList } from "../lib/public-proxies.js";

const SOURCES = [
  "https://iwizard7.github.io/MTProxy_list/working.txt",
  "https://iwizard7.github.io/MTProxy_list/stable.txt",
  "https://raw.githubusercontent.com/SoliSpirit/mtproto/master/all_proxies.txt"
];

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
  for (const source of SOURCES) {
    try {
      const response = await fetch(source, { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "LaythAzizProxy/1.0" } });
      if (!response.ok) continue;
      const proxies = parsePublicProxyList(await response.text(), { limit: 80 });
      if (proxies.length) {
        return res.status(200).json({
          proxies,
          source,
          checked_at: new Date().toISOString(),
          note: "قائمة عامة من جهات خارجية؛ قد تتوقف بعض البروكسيات في أي وقت وليست سيرفرات مملوكة لك."
        });
      }
    } catch { /* try the next fixed, trusted feed URL */ }
  }
  return res.status(502).json({ error: "تعذر جلب قائمة البروكسيات العامة حالياً. حاول بعد قليل." });
}
