import { createConnection } from "node:net";
import { performance } from "node:perf_hooks";

export function probeTcp(host, port, { timeoutMs = 2200, connect = createConnection } = {}) {
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
      socket = connect({ host, port: Number(port) });
      socket.once("connect", () => finish(true));
      socket.once("error", () => finish(false));
      socket.once("timeout", () => finish(false));
      socket.setTimeout?.(timeoutMs);
    } catch {
      finish(false);
    }
  });
}
