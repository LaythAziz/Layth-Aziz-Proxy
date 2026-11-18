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


## Static control panel

The Arabic control panel lives in `site/`. GitHub Actions runs automated tests and builds the MTProxy container image. It does not publish the dashboard.

The panel generates a Telegram `tg://proxy` link locally in the visitor's browser from a server address, TCP port, and 32-character hex secret. It does not transmit or store the secret. **It does not create, host, or activate a proxy server.** A real MTProxy process must already be running on a reachable public server before its link can connect.

The production dashboard is intended to be deployed on Vercel. The repository includes `vercel.json` with `site/` as the static output directory and root-level `api/` serverless functions.


## Vercel admin API (registry and TCP checks)

The repository includes a Vercel-compatible API for an authenticated proxy registry. It can save records for servers you already control, encrypt their MTProto secrets at rest, run a TCP reachability check, and delete registry records. A TCP check is **not** a full MTProto handshake or proof that Telegram can use the proxy.

### Required Vercel environment variables

- `ADMIN_API_TOKEN`: a long random admin token. Generate with `openssl rand -hex 32`.
- `PROXY_SECRET_ENCRYPTION_KEY`: exactly 64 hexadecimal characters. Generate with `openssl rand -hex 32`.
- `SUPABASE_URL`: your Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service-role key. Server-side only; never prefix it with `NEXT_PUBLIC_`.
- `HETZNER_API_TOKEN`: Hetzner Cloud API token with permission to create, power on/off, and delete servers. Keep it only in Vercel environment variables.
- Optional: `HETZNER_LOCATION` (default `fsn1`), `HETZNER_SERVER_TYPE` (default `cx22`), and `HETZNER_IMAGE` (default `ubuntu-24.04`).

Run the SQL in `supabase/mtproxy_instances.sql` in a dedicated Supabase project, then add the five required values above in Vercel → Project Settings → Environment Variables and redeploy. Do not commit real credentials.

### Cloud provisioning

The dashboard can now request a real Hetzner Cloud server when `HETZNER_API_TOKEN` is configured. For each new proxy it generates a cryptographically random MTProto secret and an available high TCP port, asks Hetzner to create an Ubuntu server in the selected location, obtains the server's assigned public IPv4 address, and boots MTProxy through cloud-init + systemd (automatic restart enabled). The secret is encrypted in Supabase and returned to the admin once with the Telegram deep link.

The API can start, stop, check TCP reachability, recover the Telegram link for an authorized admin, and delete a provisioned Hetzner server. Deleting a manually registered external server still deletes only its registry record.

**Important:** Hetzner is a paid cloud provider. Creating a server can incur charges and requires the owner's Hetzner account and API token. A public IP is assigned by the provider; it is never fabricated by the app. A newly created server may need several minutes to compile MTProxy and finish booting. TCP reachability is not a complete Telegram MTProto handshake test.

No hosting provider can guarantee absolute zero downtime. Service restarts automatically after process failure, but availability still depends on the provider, network, account status, and maintenance. Without the provider token configured, the create action returns a setup error and does not create a fake proxy.
