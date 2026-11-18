import { randomBytes, randomInt } from "node:crypto";

const API = "https://api.hetzner.cloud/v1";

export function generateProxyCredentials() {
  return { secret: randomBytes(16).toString("hex"), port: randomInt(20000, 60001) };
}

export function normalizeServerName(value) {
  const name = String(value || "layth-proxy")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 63);
  return name || "layth-proxy";
}

export function buildCloudInit({ secret, port }) {
  if (!/^[a-f0-9]{32}$/.test(String(secret))) throw new Error("Invalid MTProto secret");
  if (!Number.isInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535) throw new Error("Invalid TCP port");
  return `#cloud-config
package_update: true
packages:
  - ca-certificates
  - curl
  - git
  - make
  - gcc
  - libc6-dev
  - libssl-dev
  - zlib1g-dev
  - ufw
write_files:
  - path: /etc/systemd/system/mtproxy.service
    permissions: '0644'
    content: |
      [Unit]
      Description=Telegram MTProto Proxy
      After=network-online.target
      Wants=network-online.target

      [Service]
      Type=simple
      User=mtproxy
      Group=mtproxy
      WorkingDirectory=/var/lib/mtproxy
      ExecStart=/opt/MTProxy/objs/bin/mtproto-proxy -p 8888 -H ${Number(port)} -S ${secret} --aes-pwd /var/lib/mtproxy/proxy-secret /var/lib/mtproxy/proxy-multi.conf -M 1
      Restart=always
      RestartSec=5
      NoNewPrivileges=true

      [Install]
      WantedBy=multi-user.target
runcmd:
  - [bash, -lc, "git clone --depth 1 https://github.com/TelegramMessenger/MTProxy.git /opt/MTProxy"]
  - [bash, -lc, "make -C /opt/MTProxy"]
  - [bash, -lc, "mkdir -p /var/lib/mtproxy && curl --fail --silent --show-error --location https://core.telegram.org/getProxySecret -o /var/lib/mtproxy/proxy-secret"]
  - [bash, -lc, "curl --fail --silent --show-error --location https://core.telegram.org/getProxyConfig -o /var/lib/mtproxy/proxy-multi.conf"]
  - [bash, -lc, "useradd --system --no-create-home --shell /usr/sbin/nologin mtproxy || true"]
  - [bash, -lc, "chown -R mtproxy:mtproxy /var/lib/mtproxy /opt/MTProxy"]
  - [bash, -lc, "ufw allow 22/tcp && ufw allow ${Number(port)}/tcp && ufw --force enable"]
  - [bash, -lc, "systemctl daemon-reload && systemctl enable --now mtproxy"]
`;
}

function token() {
  const value = process.env.HETZNER_API_TOKEN;
  if (!value) throw new Error("لم يتم ربط مزوّد السيرفرات بعد. أضف HETZNER_API_TOKEN في إعدادات Vercel.");
  return value;
}

async function hetzner(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.error?.message || data?.message || `Hetzner API error (${response.status})`;
    throw new Error(detail);
  }
  return data;
}

export async function createHetznerServer({ name, location, serverType, secret, port }) {
  const payload = {
    name: normalizeServerName(name),
    server_type: serverType || process.env.HETZNER_SERVER_TYPE || "cx22",
    image: process.env.HETZNER_IMAGE || "ubuntu-24.04",
    location: location || process.env.HETZNER_LOCATION || "fsn1",
    start_after_create: true,
    user_data: buildCloudInit({ secret, port }),
    labels: { app: "layth-aziz-mtproxy", managed_by: "layth-aziz-proxy" },
  };
  const data = await hetzner("/servers", { method: "POST", body: JSON.stringify(payload) });
  const server = data.server;
  if (!server?.id || !server?.public_net?.ipv4?.ip) {
    if (server?.id) {
      try { await hetzner(`/servers/${encodeURIComponent(server.id)}`, { method: "DELETE" }); } catch { /* cleanup failure is reported by provider monitoring */ }
    }
    throw new Error("لم يرجع المزوّد عنوان IPv4 عام للسيرفر؛ تم إلغاء السيرفر إن أمكن.");
  }
  return {
    id: String(server.id),
    ip: server.public_net.ipv4.ip,
    status: server.status || "initializing",
    name: server.name,
    location: server.datacenter?.location?.name || payload.location,
    serverType: payload.server_type,
  };
}

export async function deleteHetznerServer(serverId) {
  await hetzner(`/servers/${encodeURIComponent(serverId)}`, { method: "DELETE" });
}

export async function setHetznerServerPower(serverId, action) {
  if (!["start", "stop"].includes(action)) throw new Error("Invalid server power action");
  await hetzner(`/servers/${encodeURIComponent(serverId)}/actions/${action}`, { method: "POST", body: "{}" });
}
