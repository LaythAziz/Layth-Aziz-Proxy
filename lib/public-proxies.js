const SECRET_RE = /^(?:[0-9a-f]{32}|(?:ee|dd)(?:[0-9a-f]{32,510}))$/i;

export function parsePublicProxyList(raw, { limit = 200 } = {}) {
  const results = [];
  const seen = new Set();
  for (const sourceLine of String(raw || "").split(/\r?\n/)) {
    const line = sourceLine.trim().split("|")[0].trim();
    if (!line || line.startsWith("#")) continue;
    let url;
    try { url = new URL(line); } catch { continue; }
    const isTelegramLink = url.protocol === "tg:" && url.hostname === "proxy";
    const isHttpsLink = url.protocol === "https:" && url.hostname === "t.me" && url.pathname.replace(/\/$/, "") === "/proxy";
    if (!isTelegramLink && !isHttpsLink) continue;
    const server = url.searchParams.get("server") || "";
    const portText = url.searchParams.get("port") || "";
    const secret = url.searchParams.get("secret") || "";
    const port = Number(portText);
    if (!server || server.length > 253 || /[^a-z0-9.:[\]-]/i.test(server) || server.startsWith(".") || server.endsWith(".") || !Number.isInteger(port) || port < 1 || port > 65535 || !SECRET_RE.test(secret)) continue;
    const key = server.toLowerCase() + ":" + port;
    if (seen.has(key)) continue;
    seen.add(key);
    const telegramLink = `tg://proxy?server=${encodeURIComponent(server)}&port=${port}&secret=${secret}`;
    results.push({ id: key, server, port, secret, telegram_link: telegramLink });
    if (results.length >= Math.max(1, Math.min(500, Number(limit) || 200))) break;
  }
  return results;
}

export function mergeProxyFeeds(feeds, { limit = 240, perFeedLimit = 160 } = {}) {
  const lists = (feeds || []).map(feed => ({
    source: String(feed?.source || "unknown"),
    rows: parsePublicProxyList(feed?.content || "", { limit: perFeedLimit })
  }));
  const results = [];
  const seen = new Set();
  for (let index = 0; results.length < Math.max(1, Math.min(500, Number(limit) || 240)); index++) {
    let added = false;
    for (const feed of lists) {
      const row = feed.rows[index];
      if (!row || seen.has(row.id)) continue;
      seen.add(row.id);
      results.push({ ...row, source: feed.source });
      added = true;
      if (results.length >= Math.max(1, Math.min(500, Number(limit) || 240))) break;
    }
    if (!added && lists.every(feed => index >= feed.rows.length)) break;
  }
  return results;
}
