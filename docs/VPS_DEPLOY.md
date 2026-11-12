# endowGPT VPS deployment (Hostinger KVM 4)

This guide runs the endowGPT stack with self-hosted web search on a
Hostinger KVM 4 VPS (4 vCPU, 16 GB RAM, 200 GB NVMe, Ubuntu 24.04 LTS).
It keeps the core `docker-compose.yml` untouched and layers the web-search
override on top.

## 1. What runs

| Service | Image | Network | Host port |
|---|---|---|---|
| `api` (endowGPT/LibreChat) | local build | `default` + `websearch` | `127.0.0.1:3080` (VPS override) |
| `mongodb`, `meilisearch`, `rag_api`, `vectordb`, `ollama` | base stack | `default` | none |
| `searxng` | `searxng/searxng:2026.11.11-248b8ffc0` | `websearch` | none |
| `scraper-pagesift` (default) | `ghcr.io/yolow92/pagesift:1.2.6` | `websearch` + `render` | none |
| `scraper-crw` (profile `crw`) | `ghcr.io/fastcrw/crw:0.43.2` | `websearch` + `render` | none |
| `lightpanda` (profile `js-render`) | `lightpanda/browser:1.0.3` | `render` + `egress` | none |

Only Caddy publishes 80/443. LibreChat publishes on loopback so Caddy can
reach it. SearXNG, the scraper and the sidecar publish nothing.

`websearch` is shared only by LibreChat, SearXNG and the active scraper.
`render` is internal and shared only by the scraper and the sidecar. `egress`
is the sidecar's internet path. No data service joins any of them.

### Search engines

`searxng/settings.yml` keeps five general engines: `google`, `brave`,
`duckduckgo`, `yandex`, `wikipedia`, and `librechat.yaml` requests the same
list. Google and Brave frequently answer a self-hosted IP with 403/429;
DuckDuckGo can serve CAPTCHAs after a handful of rapid queries. Yandex carried
the 20-query benchmark from our test IP. If a production IP loses one engine,
SearXNG merges the others rather than failing the whole search. Watch
`docker logs endowgpt-searxng` for `Suspended`/`CAPTCHA` and adjust the list
only after measuring from the VPS.

## 2. Host hardening

Run as a sudo-capable user. Replace `deploy` and `your.domain.example`.

### SSH keys and password login

```bash
# From your workstation:
ssh-copy-id deploy@YOUR_SERVER_IP

# On the server, only after key login works:
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl reload ssh
```

### Firewall

```bash
sudo apt-get update
sudo apt-get install -y ufw fail2ban unattended-upgrades curl ca-certificates
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

Docker publishes only loopback ports for this stack, so Docker's usual
bypass of UFW does not expose the API or the web-search services.

### fail2ban

```bash
sudo tee /etc/fail2ban/jail.local >/dev/null <<'EOF'
[sshd]
enabled = true
port = 22
maxretry = 5
bantime = 1h
findtime = 10m
EOF
sudo systemctl enable --now fail2ban
sudo fail2ban-client status sshd
```

### Unattended security updates

```bash
sudo tee /etc/apt/apt.conf.d/20auto-upgrades >/dev/null <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
sudo systemctl enable --now unattended-upgrades
```

### 4 GB swap (safety net, not a substitute for RAM)

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-endowgpt.conf
sudo sysctl --system
free -h
```

### Docker Engine + Compose plugin

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker deploy
# log out and back in, then:
docker compose version
```

### Docker daemon log limits

```bash
sudo tee /etc/docker/daemon.json >/dev/null <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" },
  "live-restore": true
}
EOF
sudo systemctl restart docker
```

## 3. Deploy endowGPT

```bash
sudo mkdir -p /opt/endowgpt
sudo chown deploy:deploy /opt/endowgpt
git clone YOUR_REPO_URL /opt/endowgpt
cd /opt/endowgpt
cp .env.example .env
```

Edit `.env`:

- `DOMAIN_CLIENT=https://your.domain.example`
- `DOMAIN_SERVER=https://your.domain.example`
- `PORT=3080`
- Generate `SEARXNG_SECRET`:
  `openssl rand -hex 32`
- Generate one scraper key and use it for BOTH `SCRAPER_API_KEY` and
  `FIRECRAWL_API_KEY`:
  `openssl rand -hex 24`
- Keep `SEARXNG_INSTANCE_URL=http://searxng:8080`,
  `FIRECRAWL_API_URL=http://scraper:3002`, `FIRECRAWL_VERSION=v1`.
- Keep `COMPOSE_PROFILES=pagesift` for the default scraper.

The existing secrets (`JWT_SECRET`, `JWT_REFRESH_SECRET`, `SESSION_SECRET`,
`CREDS_KEY`, `CREDS_IV`, `MEILI_MASTER_KEY`, `POSTGRES_PASSWORD`,
`OPENCODE_API_KEY`) are documented in `.env.example`. Generate them once and
keep `.env` at mode `600`:

```bash
chmod 600 .env
```

Start the stack with the VPS override (loopback-only API):

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.websearch.yml \
  -f docker-compose.vps.yml \
  up -d --build
```

First boot builds LibreChat and the RAG API; expect several minutes. Check:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.websearch.yml \
  -f docker-compose.vps.yml \
  ps
VPS=1 ./scripts/healthcheck.sh
```

The healthcheck prints PASS/FAIL for SearXNG, the active scraper, the optional
sidecar, LibreChat, and public-port exposure.

## 4. TLS reverse proxy (Caddy)

```bash
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
sudo apt-get update
sudo apt-get install -y caddy
```

Replace `your.domain.example` with the real hostname:

```bash
sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
your.domain.example {
  encode zstd gzip
  reverse_proxy 127.0.0.1:3080
}
EOF
sudo systemctl reload caddy
sudo journalctl -u caddy -n 50 --no-pager
```

Caddy obtains and renews the certificate automatically. Ports 80 and 443 are
the only public ports.

## 5. Switching scrapers

Both scrapers listen on container port 3002 and answer the network alias
`scraper`, so LibreChat's URL and `allowedAddresses` never change.

### PageSift (default)

```dotenv
COMPOSE_PROFILES=pagesift
```

PageSift bundles LightPanda 1.0.1 and renders JavaScript in-process. The
`js-render` sidecar is not used.

### CRW

```dotenv
COMPOSE_PROFILES=crw
```

```bash
docker compose -f docker-compose.yml -f docker-compose.websearch.yml \
  -f docker-compose.vps.yml up -d
```

CRW is HTTP-only by default (`CRW_RENDERER_MODE=none`). To test JS rendering
with the LightPanda 1.0.3 sidecar:

```dotenv
COMPOSE_PROFILES=crw,js-render
CRW_RENDERER_MODE=lightpanda
```

```bash
docker compose -f docker-compose.yml -f docker-compose.websearch.yml \
  -f docker-compose.vps.yml up -d
```

The sidecar has no published ports and is reachable only by the scraper over
the internal `render` network. It has an `egress` network for public pages.

## 6. Resource limits and headroom

Defaults in `.env.example`:

| Service | `mem_limit` | `cpus` |
|---|---:|---:|
| SearXNG | 512m | 0.5 |
| PageSift / CRW | 768m | 1.0 |
| LightPanda sidecar | 256m | 0.5 |

These leave ample headroom on 16 GB for MongoDB, Meilisearch, rag-api,
pgvector, Ollama and LibreChat. Measure before raising:

```bash
docker stats --no-stream
```

Raise a limit only when the measured peak approaches it. PageSift's bundled
browser is part of its 768m; the sidecar is extra only when `js-render` is
enabled.

## 7. SSRF verification

The scraper must refuse private, loopback, link-local and cloud-metadata
addresses. Test from the host with the scraper's loopback port (local dev) or
from a container on the `websearch` network (VPS).

```bash
KEY="$(grep '^SCRAPER_API_KEY=' .env | cut -d= -f2-)"
for URL in \
  'http://169.254.169.254/latest/meta-data/' \
  'http://172.17.0.1:2375/version' \
  'http://mongodb:27017' \
  'http://meilisearch:7700'
do
  echo "=== $URL"
  curl -sS -X POST http://127.0.0.1:3002/v1/scrape \
    -H "Authorization: Bearer $KEY" \
    -H 'Content-Type: application/json' \
    -d "{\"url\":\"$URL\",\"formats\":[\"markdown\"]}" \
    | python3 -m json.tool | head -20
done
```

Expected:

- `169.254.169.254` and `172.17.0.1` → `SSRF_BLOCKED` / "not allowed".
- `mongodb` and `meilisearch` → DNS failure, because the scraper is not on the
  data network. This is network isolation doing the blocking.

The sidecar also runs with `--block-private-networks`, so a browser redirect
cannot reach internal services.

## 8. Benchmark

Local dev (ports published on `127.0.0.1`):

```bash
node scripts/bench-websearch.js --assert
```

VPS (no published web-search ports), from the repo root:

```bash
set -a; . ./.env; set +a
docker run --rm --network endowgpt_websearch \
  -v "$PWD/scripts:/scripts:ro" -v "$PWD:/work:ro" -w /work \
  -e SEARXNG_URL=http://searxng:8080 \
  -e SCRAPER_URL=http://scraper:3002 \
  -e SCRAPER_KEY="$SCRAPER_API_KEY" \
  -e LIBRECHAT_BASE_URL=http://api:3080 \
  -e LIBRECHAT_EMAIL="you@example.com" \
  -e LIBRECHAT_PASSWORD="..." \
  node:22-alpine node /scripts/bench-websearch.js --assert
```

Targets enforced by `--assert`: SearXNG p50 < 1500 ms and non-JS scrape p50
< 2000 ms. JS-heavy pages are reported separately; they are expected to be
slower and may fail on scraper engines that cannot execute the page's scripts.

## 9. Updates and backups

```bash
cd /opt/endowgpt
git pull
docker compose -f docker-compose.yml -f docker-compose.websearch.yml \
  -f docker-compose.vps.yml up -d --build
VPS=1 ./scripts/healthcheck.sh
```

Back up the named volumes (`mongodb`, `meilisearch`, `pgdata`, `rag-uploads`,
`librechat-*`, `pagesift-data`) with your normal volume backup tooling. Keep
`.env` backed up separately; it is the only place the secrets live.

## 10. Rollback: disable web search

This removes only the web-search layer. LibreChat, MongoDB, Meilisearch,
rag-api, pgvector and Ollama keep their data.

```bash
cd /opt/endowgpt

# Stop and remove web-search containers.
docker compose -f docker-compose.yml -f docker-compose.websearch.yml \
  -f docker-compose.vps.yml stop searxng scraper-pagesift scraper-crw lightpanda || true
docker compose -f docker-compose.yml -f docker-compose.websearch.yml \
  -f docker-compose.vps.yml rm -f searxng scraper-pagesift scraper-crw lightpanda || true

# Remove the dedicated networks and the PageSift volume.
docker network rm endowgpt_websearch endowgpt_websearch_render \
  endowgpt_websearch_egress 2>/dev/null || true
docker volume rm endowgpt_pagesift-data 2>/dev/null || true
```

Then:

1. Remove the `webSearch:` block from `LibreChat-main/librechat.yaml` and the
   `interface.webSearch: true` line if you added it only for this feature.
2. Remove `COMPOSE_PROFILES=pagesift` and the `SEARXNG_*` / `FIRECRAWL_*`
   variables from `.env` (or leave them; they are ignored when the override is
   not loaded).
3. Restart LibreChat without the web-search override:

```bash
docker compose -f docker-compose.yml -f docker-compose.vps.yml up -d api
```

4. Verify:

```bash
curl -fsS http://127.0.0.1:3080/health
```

The `webSearch` tool and the Web Search toggle will no longer be offered.

## 11. Firecrawl fallback

The official Firecrawl self-host is intentionally **not** part of this stack.
It is a multi-service, build-from-source deployment (API, Playwright, Redis,
PostgreSQL, RabbitMQ) and is disproportionately heavy for a 4 vCPU VPS. If it
is ever needed, run the upstream self-host separately, then point
`FIRECRAWL_API_URL` at it and add its `host:port` to `webSearch.allowedAddresses`.
There is no `firecrawl-fallback` profile in `docker-compose.websearch.yml`.

## 12. Licensing

SearXNG, PageSift, CRW, Firecrawl and LightPanda are AGPL-3.0. Obscura is
Apache-2.0. This deployment keeps the images unmodified and internal. If you
modify an AGPL service and expose it to third parties over a network, AGPL §13
requires offering the corresponding source. No such exposure exists here:
SearXNG, the scraper and the sidecar have no published ports.
