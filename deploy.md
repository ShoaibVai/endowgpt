# endowGPT deployment guide

This is the single deployment guide for the whole repository: the endowGPT app
(LibreChat), MongoDB, Meilisearch, the RAG API, pgvector, Ollama, and the
self-hosted web-search stack (SearXNG + a Firecrawl-compatible scraper).

It covers two targets:

1. [Local deployment](#part-a---local-deployment-docker-desktop) — your machine, for development and evaluation.
2. [Hostinger VPS deployment](#part-b---hostinger-vps-deployment) — Ubuntu 24.04 with a TLS reverse proxy.

> `docs/VPS_DEPLOY.md` remains the deep reference for the web-search layer
> (network isolation, SSRF checks, scraper switching, benchmarks). This file is
> the end-to-end runbook for the full stack.
>
> `setup-guide.md` predates the root-level compose stack; treat it as historical
> and use this guide instead.

---

## 0. What runs, and what is exposed

| Service | Container | Purpose | Published port |
|---|---|---|---|
| `api` | `endowgpt-api` | endowGPT app (API + built SPA) | `:3080` (localhost locally; `127.0.0.1:3080` on VPS) |
| `mongodb` | `endowgpt-mongo` | users, chats, documents, version snapshots, storage counters | none |
| `meilisearch` | `endowgpt-meili` | conversation search | none |
| `rag_api` | `endowgpt-rag` | file parsing, chunking, retrieval | none |
| `vectordb` | `endowgpt-vectordb` | pgvector Postgres for embeddings | none |
| `ollama` | `endowgpt-ollama` | local embeddings (`nomic-embed-text`) | none |
| `searxng` | `endowgpt-searxng` | web-search discovery | none |
| `scraper-pagesift` (default) or `scraper-crw` | `endowgpt-scraper` | page content for web search | none |
| `lightpanda` (optional profile) | `endowgpt-lightpanda` | JS rendering sidecar | none |

Only the app port is reachable from outside. Web-search services talk to the app
over the internal `websearch` network and never publish a host port.

### Compose files

| File | Role | Use when |
|---|---|---|
| `docker-compose.yml` | Base stack (app, Mongo, Meili, RAG, pgvector, Ollama) | Always |
| `docker-compose.websearch.yml` | SearXNG + scraper + app search env, `websearch` network | Always for this repo — `librechat.yaml` requires the search variables |
| `docker-compose.vps.yml` | Binds the app to `127.0.0.1` | VPS only |
| `docker-compose.dev.yml` | Publishes SearXNG/scraper on loopback for debugging | Optional, local only |

The supported start command always includes the web-search overlay:

```sh
docker compose -f docker-compose.yml -f docker-compose.websearch.yml up -d
```

On the VPS, add the VPS overlay last:

```sh
docker compose \
  -f docker-compose.yml \
  -f docker-compose.websearch.yml \
  -f docker-compose.vps.yml \
  up -d
```

> A bare `docker compose up -d` (as shown in some older notes) starts the base
> stack only. `librechat.yaml` interpolates `SEARXNG_INSTANCE_URL`,
> `FIRECRAWL_API_URL`, and `FIRECRAWL_API_KEY`, so web search — and potentially
> config validation — fails without the overlay.

### Volumes

All state is in named volumes prefixed with `endowgpt_`:

`mongo-data`, `meili-data`, `pgdata`, `ollama-data`, `rag-uploads`,
`librechat-data`, `librechat-images`, `librechat-uploads`, `librechat-logs`,
`librechat-skill`, `pagesift-data`.

`docker compose down` keeps them; `down -v` deletes them.

---

## 1. Prerequisites

- **Docker Engine with Compose v2** (`docker compose version` → v2.20 or newer).
  On Windows/macOS use Docker Desktop; on Linux use Docker Engine + the Compose plugin.
- **Git** (or another way to copy the repository to the host).
- **Node.js 20+** on the machine you run smoke tests from (not required in containers).
- **OpenCode Go credential** (`OPENCODE_API_KEY`). Chat does not work without it.
- Disk and RAM:
  - Local: 20 GB free disk and Docker Desktop allowed at least 8 GB RAM.
  - VPS: 4 vCPU / 16 GB RAM / 100+ GB SSD recommended (Hostinger KVM 4 class).
    KVM 2 (8 GB) works with the 4 GB swap configured below, but image builds are slow.

Ports used on the host: **3080** (app). The VPS adds **80/443** for the TLS proxy.
Optional local debugging adds loopback-only **8080** (SearXNG) and **3002/3003** (scrapers).

---

## Part A — Local deployment (Docker Desktop)

### A1. Get the code

```sh
git clone <YOUR_REPO_URL> endowGPT
cd endowGPT
git checkout <BRANCH_OR_TAG>
```

The repository root contains `docker-compose.yml`, `.env.example`,
`LibreChat-main/` (app + `librechat.yaml`), and `rag-api-main/`.

### A2. Create `.env`

```sh
cp .env.example .env
```

On Windows, `start.bat` does this automatically on first run, but filling the
secrets is still manual.

Generate the secrets once and paste them into `.env`:

**Linux / macOS / Git Bash**

```sh
# JWT, refresh, session, Meilisearch, Postgres, SearXNG
for i in 1 2 3 4 5 6; do openssl rand -hex 32; done

# AES key and IV used for provider credentials (exact lengths)
openssl rand -hex 32   # CREDS_KEY  -> 64 hex chars
openssl rand -hex 16   # CREDS_IV   -> 32 hex chars

# Scraper bearer key (use the SAME value twice)
openssl rand -hex 24
```

**Windows PowerShell**

```powershell
function New-Hex([int]$bytes) {
  -join (1..($bytes * 2) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
}
New-Hex 32   # repeat for each 64-char secret
New-Hex 16   # CREDS_IV is 32 chars
```

Minimum `.env` for local development:

```dotenv
# App
APP_TITLE=endowGPT
PORT=3080
DOMAIN_CLIENT=http://localhost:3080
DOMAIN_SERVER=http://localhost:3080
NODE_ENV=production

# Secrets (generate; never commit)
JWT_SECRET=<64 hex>
JWT_REFRESH_SECRET=<64 hex>
SESSION_SECRET=<64 hex>
CREDS_KEY=<64 hex>
CREDS_IV=<32 hex>
MEILI_MASTER_KEY=<64 hex>
POSTGRES_PASSWORD=<64 hex>

# Model credential (OpenCode Go plan)
OPENCODE_API_KEY=<your key>

# Auth
ALLOW_REGISTRATION=true
ALLOW_EMAIL_LOGIN=true
ALLOW_PASSWORD_RESET=false
SCHEDULES_SINGLE_PROCESS=true

# Web search (required by the overlay and by librechat.yaml)
COMPOSE_PROFILES=pagesift
SEARXNG_SECRET=<64 hex>
SCRAPER_API_KEY=<same key in both>
FIRECRAWL_API_KEY=<same key in both>
```

Notes:

- `CREDS_KEY` must be exactly 64 hex characters; `CREDS_IV` exactly 32.
- `SCRAPER_API_KEY` is what the scraper enforces; `FIRECRAWL_API_KEY` is what
  the app sends. They **must match** or every scrape returns 401.
- `MONGO_URI`, `RAG_API_URL`, `SEARXNG_INSTANCE_URL`, and `FIRECRAWL_API_URL`
  are supplied by Compose. Leave the internal defaults alone.
- Set `ALLOW_REGISTRATION=false` after onboarding if the instance is private.
- Keep `.env` out of version control (it is git-ignored).

### A3. Start the stack

**Windows (recommended):**

```bat
start.bat            rem build if needed, start, wait for /health
start.bat --build    rem force a rebuild of the app and RAG images
stop.bat             rem stop, keep data
stop.bat --wipe      rem stop and delete all volumes (destructive)
```

**Cross-platform:**

```sh
docker compose -f docker-compose.yml -f docker-compose.websearch.yml up -d --build
```

The first run builds the app and RAG images and pulls `nomic-embed-text`
(~275 MB). Expect 10–30 minutes locally; later starts are seconds.

Optional local debugging ports (SearXNG and scraper reachable from the host):

```sh
docker compose -f docker-compose.yml -f docker-compose.websearch.yml \
  -f docker-compose.dev.yml up -d
# http://127.0.0.1:8080  (SearXNG UI)
# http://127.0.0.1:3002  (active scraper)
```

### A4. First-run setup

1. Open `http://localhost:3080`.
2. Register the first account. In a single-tenant deployment the first
   registered user is created with the `ADMIN` role automatically.
3. Open **Settings → Account** and set the storage meter; open the sidebar
   **Superadmin** entry to confirm the portal loads.
4. Set `ALLOW_REGISTRATION=false` in `.env` when you are done onboarding, then
   restart the app (`docker compose ... up -d api`).

### A5. Verify

```sh
# Container health
docker compose -f docker-compose.yml -f docker-compose.websearch.yml ps

# App health
curl -fsS http://localhost:3080/health

# Web-search + loopback checks
./scripts/healthcheck.sh

# Boot, brand, documents mount, model round-trip
node scripts/smoke.mjs
```

`smoke.mjs` reads `OPENCODE_API_KEY` from `.env` and skips the model call when it
is empty. For the file-generation smoke:

```sh
ENDOWGPT_SMOKE_EMAIL=you@example.com ENDOWGPT_SMOKE_PASSWORD='...' \
  node scripts/smoke-files.mjs
```

### A6. Day-2 commands (local)

```sh
# Logs
docker compose -f docker-compose.yml -f docker-compose.websearch.yml logs -f api
docker compose -f docker-compose.yml -f docker-compose.websearch.yml logs -f rag_api

# Restart one service
docker compose -f docker-compose.yml -f docker-compose.websearch.yml restart api

# Stop / start
docker compose -f docker-compose.yml -f docker-compose.websearch.yml down
docker compose -f docker-compose.yml -f docker-compose.websearch.yml up -d

# Update the code
git pull
docker compose -f docker-compose.yml -f docker-compose.websearch.yml up -d --build
```

### A7. Local troubleshooting

| Symptom | Cause / fix |
|---|---|
| Build fails with heap OOM | Give Docker Desktop 8 GB+ RAM. The frontend build uses a 6 GB Node heap. |
| `port is already allocated` on 3080 | Stop the other process (`netstat -ano | findstr :3080` on Windows) or change `PORT` in `.env`. |
| App container restarts | `docker compose ... logs api`; usually Mongo not healthy or a missing `.env` secret. |
| Chat returns 401 / "model unavailable" | `OPENCODE_API_KEY` missing or invalid. Restart `api` after editing `.env`. |
| Web search returns nothing | Scraper/SearXNG keys differ, or the websearch overlay was not used. Run `./scripts/healthcheck.sh`. |
| RAG answers lack sources | Ollama model not pulled yet; wait for `ollama-init` to complete and check `rag_api` health. |
| File uploads fail on Windows | Docker Desktop file sharing / disk pressure; check `docker system df`. |

---

## Part B — Hostinger VPS deployment

Target: Hostinger KVM VPS (recommended KVM 4: 4 vCPU / 16 GB RAM / 200 GB NVMe)
running **Ubuntu 24.04 LTS**. Commands assume a sudo-capable user named
`deploy` and a domain like `chat.example.com`.

### B1. Create the VPS and DNS

1. In Hostinger hPanel, create the VPS with **Ubuntu 24.04 LTS** and add your SSH
   public key during creation (or immediately after).
2. Note the public IPv4 address.
3. In your DNS provider, create an **A record** for `chat.example.com` pointing
   at that IP. Wait for propagation (`dig +short chat.example.com`).
4. If hPanel shows a **firewall** for the VPS, allow `22/tcp`, `80/tcp`,
   `443/tcp` there as well as in UFW below. If it is disabled, UFW is enough.
5. Optional: take an hPanel snapshot before major upgrades.

### B2. Host hardening

Run as a sudo-capable user. If Hostinger gave you `root`, either run the
commands without `sudo` or create a `deploy` user with sudo and use that.

```bash
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y ufw fail2ban unattended-upgrades curl ca-certificates git

# Firewall: only SSH + HTTP(S)
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

SSH keys only (verify key login works before disabling passwords):

```bash
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl reload ssh
```

fail2ban and unattended upgrades:

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

sudo tee /etc/apt/apt.conf.d/20auto-upgrades >/dev/null <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
sudo systemctl enable --now unattended-upgrades
```

Swap (a safety net for image builds and embeddings):

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-endowgpt.conf
sudo sysctl --system
```

### B3. Install Docker

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
sudo usermod -aG docker "$USER"
# log out and back in
docker compose version
```

Log rotation and live restore:

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

### B4. Deploy the code

```bash
sudo mkdir -p /opt/endowgpt
sudo chown "$USER":"$USER" /opt/endowgpt
git clone <YOUR_REPO_URL> /opt/endowgpt
cd /opt/endowgpt
cp .env.example .env
umask 077
chmod 600 .env
```

Edit `.env` for production:

```dotenv
APP_TITLE=endowGPT
PORT=3080
DOMAIN_CLIENT=https://chat.example.com
DOMAIN_SERVER=https://chat.example.com
NODE_ENV=production

# Same secrets as local; generate once and back them up
JWT_SECRET=<64 hex>
JWT_REFRESH_SECRET=<64 hex>
SESSION_SECRET=<64 hex>
CREDS_KEY=<64 hex>
CREDS_IV=<32 hex>
MEILI_MASTER_KEY=<64 hex>
POSTGRES_PASSWORD=<64 hex>

OPENCODE_API_KEY=<your key>

ALLOW_REGISTRATION=true
ALLOW_EMAIL_LOGIN=true
ALLOW_PASSWORD_RESET=false
SCHEDULES_SINGLE_PROCESS=true

COMPOSE_PROFILES=pagesift
SEARXNG_SECRET=<64 hex>
SCRAPER_API_KEY=<same key in both>
FIRECRAWL_API_KEY=<same key in both>
```

Rules:

- `DOMAIN_CLIENT` and `DOMAIN_SERVER` must be the exact public origin, with
  `https://` and **no trailing slash**. Cookies and CORS depend on it.
- Do not change the internal hostnames (`mongodb`, `meilisearch`, `rag_api`,
  `searxng`, `scraper`); they are Docker DNS names.
- Keep `.env` at mode `600` and include it in your off-host backups.
- The first registered account becomes admin. Close registration after
  onboarding if the instance is invite-only.

### B5. Build and start

Validate the merged configuration first:

```bash
docker compose \
  -f docker-compose.yml -f docker-compose.websearch.yml -f docker-compose.vps.yml \
  config -q
```

Start:

```bash
docker compose \
  -f docker-compose.yml -f docker-compose.websearch.yml -f docker-compose.vps.yml \
  up -d --build
```

First build takes 10–30 minutes on 4 vCPU. Watch progress with:

```bash
docker compose \
  -f docker-compose.yml -f docker-compose.websearch.yml -f docker-compose.vps.yml \
  logs -f api rag_api ollama-init
```

The app is intentionally bound to `127.0.0.1:3080`; it is not public until the
proxy is configured.

### B6. TLS reverse proxy (Caddy, recommended)

Install Caddy:

```bash
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
sudo apt-get update
sudo apt-get install -y caddy
```

`/etc/caddy/Caddyfile`:

```caddyfile
chat.example.com {
  encode zstd gzip
  reverse_proxy 127.0.0.1:3080
}
```

```bash
sudo systemctl reload caddy
sudo journalctl -u caddy -n 50 --no-pager
```

Caddy obtains and renews the certificate automatically once DNS points at the
VPS and ports 80/443 are open.

`TRUST_PROXY` defaults to `1`, which matches this single-proxy setup.

#### Nginx alternative

If you prefer Nginx + certbot, proxy all paths to `127.0.0.1:3080` and keep the
`Host`, `X-Forwarded-For`, `X-Forwarded-Proto`, and `X-Real-IP` headers. Do not
publish 3080.

### B7. Verify on the VPS

```bash
# Services
docker compose \
  -f docker-compose.yml -f docker-compose.websearch.yml -f docker-compose.vps.yml \
  ps

# App health through loopback and through TLS
curl -fsS http://127.0.0.1:3080/health
curl -fsS https://chat.example.com/health

# Web-search containers, HTTP probes, and port isolation
VPS=1 ./scripts/healthcheck.sh

# Full boot/brand/documents/model smoke (run from the repo root)
node scripts/smoke.mjs --base=https://chat.example.com
```

`VPS=1 ./scripts/healthcheck.sh` fails if SearXNG, the active scraper, the app
health endpoint, or the loopback-only port rule is wrong.

Expected first-run work: `ollama-init` pulls the embedding model, then `rag_api`
becomes healthy; the app starts after Mongo, Meili, and RAG are healthy.

---

## 2. Operations

### 2.1 Logs and status

```bash
COMPOSE=(-f docker-compose.yml -f docker-compose.websearch.yml -f docker-compose.vps.yml)
docker compose "${COMPOSE[@]}" ps
docker compose "${COMPOSE[@]}" logs -f api
docker compose "${COMPOSE[@]}" logs -f searxng scraper-pagesift
docker stats --no-stream
```

### 2.2 Update a deployment

```bash
cd /opt/endowgpt
git fetch --all --tags
git checkout <RELEASE_TAG_OR_COMMIT>     # tag every deploy; it is your rollback point
docker compose \
  -f docker-compose.yml -f docker-compose.websearch.yml -f docker-compose.vps.yml \
  up -d --build
VPS=1 ./scripts/healthcheck.sh
node scripts/smoke.mjs --base=https://chat.example.com
```

Database migrations (indexes and role/config backfills) run automatically at
startup. New document storage collections (`documentversions`, `storageusages`)
are created on first use; storage counters seed themselves from existing
documents on the first read, and embedded document versions are imported on the
document's next save.

If the deployment disables MongoDB `autoIndex`, create the new indexes once:

```bash
docker compose exec -T mongodb mongosh LibreChat --quiet --eval '
  db.transactions.createIndex({ tenantId: 1, tokenType: 1, createdAt: 1 });
  db.transactions.createIndex({ user: 1, tokenType: 1, createdAt: 1 });
  db.storageusages.createIndex({ user: 1 }, { unique: true });
  db.documentversions.createIndex(
    { user: 1, conversationId: 1, artifactId: 1, id: 1 }, { unique: true });
  db.documentversions.createIndex(
    { user: 1, conversationId: 1, artifactId: 1, createdAt: 1 });
'
```

After a few upgrades, reclaim disk:

```bash
docker image prune -f
docker builder prune -f --filter until=168h
```

### 2.3 Backups

Back up `.env` **and** the data volumes. File uploads and images are as
important as the databases.

```bash
cd /opt/endowgpt
mkdir -p backups
STAMP=$(date +%F)

# MongoDB (users, chats, documents, versions, counters)
docker compose exec -T mongodb mongodump --db LibreChat --archive --gzip > "backups/mongo-$STAMP.gz"

# Postgres / pgvector (embeddings); adjust the user/database if you changed them
docker compose exec -T vectordb pg_dump -U endowgpt endowgpt | gzip > "backups/pg-$STAMP.sql.gz"

# Uploaded and generated files
docker run --rm -v endowgpt_librechat-uploads:/data:ro -v "$PWD/backups":/backup \
  alpine tar czf "/backup/uploads-$STAMP.tgz" -C /data .
docker run --rm -v endowgpt_librechat-images:/data:ro -v "$PWD/backups":/backup \
  alpine tar czf "/backup/images-$STAMP.tgz" -C /data .

# Secrets
cp .env "backups/env-$STAMP"
chmod 600 backups/*
```

Copy `backups/` off the VPS (hPanel backup, object storage, or `rsync` to
another machine). A backup stored only on the same disk is not a backup.

Meilisearch and Ollama can be rebuilt (re-index and re-pull) and do not need
routine backups. The `pagesift-data` volume holds only scraper cache.

### 2.4 Restore

```bash
cd /opt/endowgpt
docker compose \
  -f docker-compose.yml -f docker-compose.websearch.yml -f docker-compose.vps.yml \
  stop api

# Mongo
docker compose exec -T mongodb mongorestore --drop --archive --gzip < backups/mongo-YYYY-MM-DD.gz

# Postgres
gunzip -c backups/pg-YYYY-MM-DD.sql.gz \
  | docker compose exec -T vectordb psql -U endowgpt -d endowgpt

# Files
docker run --rm -v endowgpt_librechat-uploads:/data -v "$PWD/backups":/backup \
  alpine tar xzf "/backup/uploads-YYYY-MM-DD.tgz" -C /data

docker compose \
  -f docker-compose.yml -f docker-compose.websearch.yml -f docker-compose.vps.yml \
  up -d
```

Test a restore on a staging VPS at least once; an untested restore is a hope.

### 2.5 Rollback

```bash
cd /opt/endowgpt
git checkout <PREVIOUS_TAG_OR_COMMIT>
docker compose \
  -f docker-compose.yml -f docker-compose.websearch.yml -f docker-compose.vps.yml \
  up -d --build
VPS=1 ./scripts/healthcheck.sh
```

Volumes are untouched by the rollback. If an upgrade also changed data, restore
the matching database backups instead of downgrading code against newer data.

### 2.6 Switching the web scraper

Both scrapers listen on container port 3002 under the alias `scraper`, so the
app URL never changes. Set one value in `.env` and recreate:

```dotenv
COMPOSE_PROFILES=pagesift      # default
# COMPOSE_PROFILES=crw         # alternative
```

```bash
docker compose \
  -f docker-compose.yml -f docker-compose.websearch.yml -f docker-compose.vps.yml \
  up -d
VPS=1 ./scripts/healthcheck.sh
```

Optional JS rendering for CRW: `COMPOSE_PROFILES=crw,js-render` and
`CRW_RENDERER_MODE=lightpanda`. See `docs/VPS_DEPLOY.md` §5.

### 2.7 VPS troubleshooting

| Symptom | Cause / fix |
|---|---|
| Build killed (OOM) | Add/confirm the 4 GB swap, or build with a smaller heap: `docker compose build --build-arg NODE_MAX_OLD_SPACE_SIZE=4096 api`. |
| `api` unhealthy, Mongo healthy | Check `docker compose logs api`; usually a missing/blank secret in `.env` or an invalid `librechat.yaml`. |
| 502 from Caddy | App not listening on `127.0.0.1:3080` (`curl -fsS http://127.0.0.1:3080/health`), or Caddyfile points at the wrong port. |
| Caddy cannot get a certificate | DNS `A` record missing/wrong, or ports 80/443 blocked by UFW/hPanel firewall. |
| Caddy fails with "address already in use" | A preinstalled web server owns 80/443. Stop it (`sudo systemctl disable --now apache2 nginx`) or use it as the proxy instead of Caddy. |
| Login works but cookies drop | `DOMAIN_CLIENT`/`DOMAIN_SERVER` do not exactly match the public `https://` origin. |
| Web search empty or 401 | `SCRAPER_API_KEY` ≠ `FIRECRAWL_API_KEY`, or the web-search overlay files were omitted. `VPS=1 ./scripts/healthcheck.sh`. |
| RAG uploads fail | `rag_api` unhealthy or Ollama model missing: `docker compose logs rag_api ollama-init`. |
| Disk filling up | `docker system df`; prune images/build cache, and check log rotation in `/etc/docker/daemon.json`. |
| Permission errors on volumes | Volumes are Docker-managed; if you converted to bind mounts, set `UID`/`GID` in `.env` to the host user. |

For scraper isolation, SSRF verification, and search benchmarks, continue with
`docs/VPS_DEPLOY.md` §5–§8.

---

## 3. Configuration reference

### 3.1 Required secrets

| Variable | Length / format | Notes |
|---|---|---|
| `JWT_SECRET` | 48–64 chars | Access-token signing |
| `JWT_REFRESH_SECRET` | 48–64 chars | Refresh-token signing |
| `SESSION_SECRET` | 48–64 chars | Express session |
| `CREDS_KEY` | exactly 64 hex chars | AES key for stored provider credentials |
| `CREDS_IV` | exactly 32 hex chars | AES IV |
| `MEILI_MASTER_KEY` | 16+ chars | Must match what Meilisearch runs with |
| `POSTGRES_PASSWORD` | strong | pgvector database |
| `SEARXNG_SECRET` | strong | SearXNG server secret |
| `SCRAPER_API_KEY` | strong | Enforced by the scraper |
| `FIRECRAWL_API_KEY` | same as above | Sent by the app |
| `OPENCODE_API_KEY` | provider key | Chat and document AI edits |

Rotating `CREDS_KEY`/`CREDS_IV` makes previously stored provider credentials
unreadable; rotate only with a planned reset.

### 3.2 Domains and auth

| Variable | Local | VPS |
|---|---|---|
| `DOMAIN_CLIENT` | `http://localhost:3080` | `https://chat.example.com` |
| `DOMAIN_SERVER` | `http://localhost:3080` | `https://chat.example.com` |
| `ALLOW_REGISTRATION` | `true` | `true` during onboarding, then `false` |
| `ALLOW_EMAIL_LOGIN` | `true` | `true` |
| `ALLOW_PASSWORD_RESET` | `false` | `false` unless SMTP is configured |
| `SCHEDULES_SINGLE_PROCESS` | `true` | `true` (one app replica) |

### 3.3 App limits and configuration files

- `LibreChat-main/librechat.yaml` — endpoint, model specs, theme, welcome text,
  web-search wiring, and document-editor limits. Mounted read-only at
  `/app/librechat.yaml`.
  - `documents.storageMaxBytes` — per-user cap across current document content
    and generated files (default 100 MB).
  - `documents.versionHistoryCap` — snapshots kept per document (default 50).
  - `documents.aiEditMaxChars` / `aiEditMaxPerHour` — inline AI edit bounds.
- `.env` — secrets, domains, RAG and web-search wiring, file-tool limits.
- `searxng/settings.yml` — engines used by SearXNG.
- `pagesift/pagesift.toml` — scraper configuration.

Changing `LibreChat-main/librechat.yaml` is picked up by the running app on its
next config refresh; restart `api` to force it immediately. Changing `.env`
requires recreating the affected container:

```bash
docker compose \
  -f docker-compose.yml -f docker-compose.websearch.yml -f docker-compose.vps.yml \
  up -d --force-recreate api
```

---

## 4. Security checklist (VPS)

- [ ] SSH key login only; root login and password auth disabled.
- [ ] UFW allows only 22/80/443; hPanel firewall matches if enabled.
- [ ] fail2ban and unattended upgrades are enabled.
- [ ] `.env` is mode `600`, git-ignored, and backed up off-host.
- [ ] The app is bound to `127.0.0.1`; only Caddy/Nginx is public.
- [ ] `VPS=1 ./scripts/healthcheck.sh` passes its loopback-only port checks.
- [ ] TLS is valid and auto-renewing (`https://chat.example.com/health`).
- [ ] `ALLOW_REGISTRATION=false` once onboarding is complete.
- [ ] Admin access is limited to `access:admin` roles; audit reads need
      `read:audit_log`.
- [ ] Backups exist off-host and a restore has been tested.
- [ ] `docker stats` shows memory headroom under normal load.

### Licensing

SearXNG, PageSift, CRW, Firecrawl, and LightPanda are AGPL-3.0; Obscura is
Apache-2.0. This deployment keeps those images unmodified and unreachable from
the internet (no published ports). If you modify an AGPL service and expose it
to third parties over a network, AGPL §13 requires offering the corresponding
source. See `LICENSES.md`.

---

## Appendix — command reference

```bash
# Local
docker compose -f docker-compose.yml -f docker-compose.websearch.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.websearch.yml down
./scripts/healthcheck.sh
node scripts/smoke.mjs
node scripts/smoke-files.mjs

# VPS
COMPOSE=(-f docker-compose.yml -f docker-compose.websearch.yml -f docker-compose.vps.yml)
docker compose "${COMPOSE[@]}" up -d --build
docker compose "${COMPOSE[@]}" ps
docker compose "${COMPOSE[@]}" logs -f api
VPS=1 ./scripts/healthcheck.sh
curl -fsS https://chat.example.com/health

# Destructive
docker compose -f docker-compose.yml -f docker-compose.websearch.yml down -v
```

| Endpoint | Purpose |
|---|---|
| `GET /health` | App liveness/readiness |
| `GET /api/config` | Startup config (branding, model specs) |
| `GET /api/documents` | Document list (401 anonymous) |
| `GET /api/superadmin/access` | Portal capability probe |
| `rag_api:8000/health` | RAG service health (internal) |
| `searxng:8080/healthz` | Search health (internal) |
| `scraper:3002/healthz` | Scraper health (internal) |
