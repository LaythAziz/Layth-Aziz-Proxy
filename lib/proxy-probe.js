import { createConnection, isIP } from "node:net";
import { lookup as dnsLookup } from "node:dns/promises";
import { performance } from "node:perf_hooks";

export function isPublicIPv4(address) {
  if (isIP(address) !== 4) return false;
  const octets = address.split(".").map(Number);
  const [a, b, c] = octets;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 0 || b === 168)) return false;
  if (a === 192 && b === 0 && c === 2) return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

export async function probeTcp(host, port, {
  timeoutMs = 2200,
  connect = createConnection,
  lookup = dnsLookup
} = {}) {
  let address;
  try {
    if (isIP(host) === 4) {
      if (!isPublicIPv4(host)) return { online: false, latency_ms: null };
      address = { address: host, family: 4 };
    } else {
      const addresses = await lookup(host, { all: true, verbatim: true });
      address = addresses.find(item => item.family === 4 && isPublicIPv4(item.address));
      if (!address) return { online: false, latency_ms: null };
    }
  } catch {
    return { online: false, latency_ms: null };
  }

  return new Promise(resolve => {
    const started = performance.now();
    let settled = false;
    let socket;
    const finish = online => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket?.destroy(); } catch {}
      resolve({ online, latency_ms: online ? Math.max(1, Math.round(performance.now() - started)) : null });
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    try {
      socket = connect({ host: address.address, family: address.family, port: Number(port) });
      socket.once("connect", () => finish(true));
      socket.once("error", () => finish(false));
      socket.once("timeout", () => finish(false));
      socket.setTimeout?.(timeoutMs);
    } catch {
      finish(false);
    }
  });
}
