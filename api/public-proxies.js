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
      const content = await response.text();
      return { source: new URL(source).hostname, content };
    } catch { return null; }
  }));
  const availableFeeds = feeds.filter(Boolean);
  const candidates = mergeProxyFeeds(availableFeeds, { limit: 240, perFeedLimit: 160 });
  if (!availableFeeds.length) throw new Error("All public proxy feeds are unavailable");
  return { candidates, sources_ok: availableFeeds.length, sources_total: SOURCES.length };
}
