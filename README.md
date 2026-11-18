# LAYTH AZIZ PROXY

A self-hosted public Telegram MTProto Proxy project based on Telegram's official implementation.

> Status: deployment scaffolding only. No proxy is online until deployed to a real Linux server with a reachable public IP/port.

## Requirements

A Linux VPS/container that stays online, permits inbound TCP on a public port, has a reachable public IPv4 or IPv6 address, and allows outbound connections to Telegram.

GitHub Pages and GitHub Actions are not proxy servers. Actions runners are temporary build machines and must not be used as a persistent public proxy. Free VPS providers may impose shared/NAT IPs, port restrictions, renewal requirements, resource limits, or suspension policies. Verify current provider terms and network support before deploying.

## Run on a Linux VPS

1. Install Docker Engine and the Docker Compose plugin.
2. Clone this repository.
3. Create a private .env file (never commit it):

   ~~~env
   MT_PROXY_SECRET=replace_with_32_hex_characters
   MT_PROXY_PORT=443
   MT_PROXY_WORKERS=1
   ~~~

   Generate a secret on the VPS with: openssl rand -hex 16

4. Start the service:

   ~~~sh
   docker compose up -d --build
   docker compose logs -f mtproxy
   ~~~

5. Open the selected TCP port in both the VPS firewall and provider firewall.
6. Build the Telegram link using the server's public address:

   ~~~text
   tg://proxy?server=YOUR_PUBLIC_IP&port=443&secret=YOUR_SECRET
   ~~~

   Do not publish the secret in this repository or in screenshots. Anyone with the link can use the public proxy.

7. Optionally register the running proxy with Telegram's official @MTProxyBot to receive a proxy tag and usage statistics. Follow Telegram's current instructions before adding a tag.

## Shared IPv4 / NAT

The Compose file publishes the configured host TCP port to container TCP port 8443. If a provider gives a shared IPv4 with a forwarded port, configure its port forwarding to the VPS host port and set MT_PROXY_PORT to that assigned public port.

## Security and operations

- Keep .env private and restrict server access.
- Never commit secrets, SSH keys, passwords, or provider credentials.
- Monitor bandwidth and provider fair-use rules. Public proxies can attract high traffic and abuse.
- This project does not provide anonymity beyond Telegram's MTProto transport; choose a server operator you trust.
- There is no guarantee of unlimited free hosting or uninterrupted availability.

## Official references

- https://core.telegram.org/proxy
- https://github.com/TelegramMessenger/MTProxy


## GitHub Pages control panel

The Arabic control panel lives in `site/`. GitHub Actions runs its Node.js tests and publishes the static site to GitHub Pages after pushes to `main`.

The panel generates a Telegram `tg://proxy` link locally in the visitor's browser from a server address, TCP port, and 32-character hex secret. It does not transmit or store the secret. **It does not create, host, or activate a proxy server.** A real MTProxy process must already be running on a reachable public server before its link can connect.

After the first successful Pages deployment, the site URL is normally:

`https://laythaziz.github.io/Layth-Aziz-Proxy/`

If Pages is not enabled yet, open repository Settings → Pages and choose GitHub Actions as the build and deployment source.


## Vercel admin API (registry and TCP checks)

The repository includes a Vercel-compatible API for an authenticated proxy registry. It can save records for servers you already control, encrypt their MTProto secrets at rest, run a TCP reachability check, and delete registry records. A TCP check is **not** a full MTProto handshake or proof that Telegram can use the proxy.

### Required Vercel environment variables

- `ADMIN_API_TOKEN`: a long random admin token. Generate with `openssl rand -hex 32`.
- `PROXY_SECRET_ENCRYPTION_KEY`: exactly 64 hexadecimal characters. Generate with `openssl rand -hex 32`.
- `SUPABASE_URL`: your Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service-role key. Server-side only; never prefix it with `NEXT_PUBLIC_`.

Run the SQL in `supabase/mtproxy_instances.sql` in the Supabase SQL editor, then add all four values in Vercel → Project Settings → Environment Variables and redeploy. Do not commit real credentials.

### Current boundary

This API is a management foundation, not a cloud-server marketplace. It does not provision a VPS, start or stop a remote MTProxy process, or promise 24/7 uptime. Those actions require an actual infrastructure provider account/API and a running host with public TCP access. With no VPS/provider account configured, the app must show that provisioning is unavailable rather than fabricate an online proxy. Deleting a row removes only its registry record; it does not shut down a remote server.
