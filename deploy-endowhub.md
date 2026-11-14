# endowGPT — VPS deployment runbook (endowhub.io)

Target-specific runbook for:

| Item | Value |
|---|---|
| Host | `187.53.138.42` |
| SSH user | `developer` (sudo-capable) |
| Deploy path | `/var/www/endowhub.io` |
| Public origin | `https://endowhub.io` |
| Source of truth | `git@github.com:ShoaibVai/endowgpt.git` (**private**) |
| Branch | `main` |

This supersedes `deploy.md` for this host, which assumes `/opt/endowgpt`,
user `deploy`, and `chat.example.com`. Everything about the stack itself —
services, ports, secrets, backups, scraper switching — is unchanged; see
`deploy.md` for the deep reference.

> **The repository is private.** The server therefore needs its own SSH
> **deploy key** (Step 5). Do not copy your personal key to the server.

---

## 0. What runs

| Service | Container | Published port |
|---|---|---|
| `api` (LibreChat as endowGPT) | `endowgpt-api` | `127.0.0.1:3080` |
| `mongodb` | `endowgpt-mongo` | none |
| `meilisearch` | `endowgpt-meili` | none |
| `rag_api` | `endowgpt-rag` | none |
| `vectordb` (pgvector) | `endowgpt-vectordb` | none |
| `ollama` | `endowgpt-ollama` | none |
| `searxng` | `endowgpt-searxng` | none |
| `scraper` (PageSift default) | `endowgpt-scraper` | none |

Only the reverse proxy is public. `docker-compose.vps.yml` overrides the base
port mapping with `!override`, binding the app to `127.0.0.1` only.

Supported command for every lifecycle action:

```sh
docker compose \
  -f docker-compose.yml \
  -f docker-compose.websearch.yml \
  -f docker-compose.vps.yml \
  up -d
```

The web-search overlay is **mandatory**: `librechat.yaml` interpolates
`SEARXNG_INSTANCE_URL`, `FIRECRAWL_API_URL`, and `FIRECRAWL_API_KEY`.

Shorten it once:

```sh
echo "alias dc='docker compose -f docker-compose.yml -f docker-compose.websearch.yml -f docker-compose.vps.yml'" >> ~/.bashrc
source ~/.bashrc
```

---

## 1. Preflight — confirm the host before changing anything

```sh
ssh developer@187.53.138.42

sudo -n true && echo "sudo OK" || echo "NO SUDO"
lsb_release -ds; nproc; free -h; df -h / | tail -1
ss -tlnp | sudo ss -tlnp | grep -E ':(80|443|3080)\b' || echo "80/443/3080 free"
sudo ls -A /var/www/endowhub.io 2>/dev/null | head
```

Decide now:

| Finding | Action |
|---|---|
| `nproc` < 4 or RAM < 8 GB | Add the 4 GB swap in Step 3; expect slow builds |
| Free disk on `/` < 25 GB | Free space first — images alone are ~6–8 GB |
| 80/443 already listening | Do **not** install Caddy; use Step 9-B (nginx) |
| `/var/www/endowhub.io` not empty | Read Step 5.3 before cloning |

---

## 2. DNS

| Type | Name | Value |
|---|---|---|
| A | `@` (`endowhub.io`) | `187.53.138.42` |
| A | `www` | `187.53.138.42` |

```sh
dig +short endowhub.io
```

Cloudflare: keep both records **DNS only (grey cloud)** until the certificate
is issued, then optionally re-enable proxying with SSL/TLS set to **Full
(strict)**. Leave MX/TXT records alone.

---

## 3. Host baseline

### 3.1 Keep long builds alive

```sh
sudo apt-get update -y && sudo apt-get install -y tmux
tmux new -s deploy      # detach: Ctrl-b d   |   reattach: tmux attach -t deploy
```

A dropped SSH session kills `docker compose build`; tmux prevents that.

### 3.2 Swap, firewall, fail2ban, auto-updates

```sh
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-endowgpt.conf
sudo sysctl --system

sudo apt-get install -y ufw fail2ban unattended-upgrades
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status verbose

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

Open 22/80/443 in the provider firewall too, if one is active.

### 3.3 SSH hardening — only after key login is proven

```sh
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl reload ssh
```

Keep your current session open until a new key-based login succeeds.

---

## 4. Docker Engine + Compose v2

```sh
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
```

Log out and back in, then:

```sh
docker compose version    # need v2.20+

sudo tee /etc/docker/daemon.json >/dev/null <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" },
  "live-restore": true
}
EOF
sudo systemctl restart docker
```

---

## 5. Get the code — private repo via deploy key

### 5.1 Generate a read-only deploy key on the server

```sh
ssh-keygen -t ed25519 -C "endowhub-deploy" -f ~/.ssh/github_endowgpt -N ""
cat ~/.ssh/github_endowgpt.pub
```

Add it in GitHub → **ShoaibVai/endowgpt → Settings → Deploy keys → Add deploy
key**, paste the public key, leave **Allow write access unchecked**.

```sh
cat >> ~/.ssh/config <<'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/github_endowgpt
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config

ssh -T git@github.com     # expect: "Hi ShoaibVai/endowgpt! You've successfully authenticated"
```

### 5.2 Clone

```sh
sudo mkdir -p /var/www
sudo chown "$USER":"$USER" /var/www
git clone git@github.com:ShoaibVai/endowgpt.git /var/www/endowhub.io
cd /var/www/endowhub.io
git log --oneline -1
```

If you cloned with `sudo`, tell git the directory is trusted:

```sh
git config --global --add safe.directory /var/www/endowhub.io
```

`.git` lives inside the web root but is never exposed: the reverse proxy
forwards every path to the app container, and no static file server serves
this directory.

### 5.3 If `/var/www/endowhub.io` already contains a site

`git clone` refuses a non-empty target. Move the old content aside first:

```sh
sudo mv /var/www/endowhub.io /var/www/endowhub.io.backup-$(date +%F)
git clone git@github.com:ShoaibVai/endowgpt.git /var/www/endowhub.io
```

Or keep both and deploy the app into a subdirectory
(`/var/www/endowhub.io/endowgpt`) — then run every `docker compose` command
from there and point the proxy at `127.0.0.1:3080` regardless.

> **The repository contains no `.env`.** Secrets are never committed; Step 6
> creates them on the server. Treat the server's `.env` as the authoritative
> copy and back it up off-host.

---

## 6. Create the production `.env`

```sh
cd /var/www/endowhub.io
umask 077
cp .env.example .env

# Six 64-hex secrets: JWT_SECRET, JWT_REFRESH_SECRET, SESSION_SECRET,
#                   CREDS_KEY, MEILI_MASTER_KEY, POSTGRES_PASSWORD
for i in 1 2 3 4 5 6; do openssl rand -hex 32; done

openssl rand -hex 16    # CREDS_IV   — exactly 32 chars
openssl rand -hex 24    # scraper key — paste into BOTH SCRAPER_API_KEY and FIRECRAWL_API_KEY
```

Edit `nano .env` and set exactly these values:

```dotenv
APP_TITLE=endowGPT
PORT=3080
DOMAIN_CLIENT=https://endowhub.io
DOMAIN_SERVER=https://endowhub.io
NODE_ENV=production

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
SCRAPER_API_KEY=<24-byte hex>
FIRECRAWL_API_KEY=<same value as SCRAPER_API_KEY>
```

```sh
chmod 600 .env
```

Rules that break deployments when ignored:

- `CREDS_KEY` is **exactly** 64 hex chars, `CREDS_IV` **exactly** 32 — the app
  refuses to boot otherwise.
- `SCRAPER_API_KEY` must equal `FIRECRAWL_API_KEY`, or every scrape returns 401.
- `DOMAIN_CLIENT` / `DOMAIN_SERVER` must be the exact public origin with
  `https://` and **no trailing slash**.
- Leave `MONGO_URI`, `RAG_API_URL`, `SEARXNG_INSTANCE_URL`, `FIRECRAWL_API_URL`
  at their internal Docker defaults.

---

## 7. Validate the merged configuration

```sh
cd /var/www/endowhub.io
dc config -q && echo "compose OK"
```

This catches a missing secret or a bad `librechat.yaml` in seconds instead of
after a 20-minute build.

---

## 8. Build and start

```sh
dc up -d --build
```

First build is **10–30 minutes** on 4 vCPU (the frontend uses a 6 GB Node
heap). If the build is killed (`exit 137`):

```sh
docker compose -f docker-compose.yml -f docker-compose.websearch.yml -f docker-compose.vps.yml \
  build --build-arg NODE_MAX_OLD_SPACE_SIZE=4096 api
dc up -d
```

Startup order: `mongodb`/`meilisearch` healthy → `ollama-init` pulls
`nomic-embed-text` (~275 MB) → `rag_api` healthy → `api` starts.

```sh
dc logs -f ollama-init rag_api api
```

Verify on the box:

```sh
curl -fsS http://127.0.0.1:3080/health && echo
dc ps
sudo ss -tlnp | grep 3080     # must show 127.0.0.1:3080, never 0.0.0.0:3080
```

---

## 9. TLS reverse proxy

### 9-A. Caddy (recommended when 80/443 are free)

```sh
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
endowhub.io, www.endowhub.io {
  encode zstd gzip
  reverse_proxy 127.0.0.1:3080 {
    flush_interval -1
  }
}
```

```sh
sudo systemctl reload caddy
sudo journalctl -u caddy -n 30 --no-pager
```

`flush_interval -1` keeps SSE token streaming unbuffered. Certificates renew
automatically. `TRUST_PROXY` defaults to `1`, matching this single-proxy setup.

### 9-B. nginx + certbot (when a web server already owns 80/443)

```sh
sudo systemctl disable --now apache2 2>/dev/null || true
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

`/etc/nginx/sites-available/endowhub.io`:

```nginx
server {
    listen 80;
    server_name endowhub.io www.endowhub.io;

    client_max_body_size 100m;

    location / {
        proxy_pass http://127.0.0.1:3080;
        proxy_http_version 1.1;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";

        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

```sh
sudo ln -s /etc/nginx/sites-available/endowhub.io /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d endowhub.io -d www.endowhub.io --redirect
```

No `root` or `try_files` directive: this directory is a proxy target, not a
document root.

---

## 10. Verify end-to-end

```sh
curl -fsS https://endowhub.io/health && echo
cd /var/www/endowhub.io
VPS=1 ./scripts/healthcheck.sh
node scripts/smoke.mjs --base=https://endowhub.io    # requires Node 20+ on the host
```

`VPS=1 ./scripts/healthcheck.sh` fails if SearXNG, the active scraper, the app
health endpoint, or the loopback-only port rule is wrong.

---

## 11. Onboarding, then lock registration

1. Open `https://endowhub.io` and register the first account — it is created
   with the `ADMIN` role.
2. Confirm three things: one chat reply (proves `OPENCODE_API_KEY`), one file
   upload (proves RAG + pgvector + Ollama), one web search (proves SearXNG +
   scraper).
3. Close registration:

```sh
cd /var/www/endowhub.io
sed -i 's/^ALLOW_REGISTRATION=.*/ALLOW_REGISTRATION=false/' .env
dc up -d --force-recreate api
```

---

## 12. Day-2 operations

### 12.1 Status and logs

```sh
cd /var/www/endowhub.io
dc ps
dc logs -f api
dc logs -f rag_api searxng scraper-pagesift
docker stats --no-stream
```

### 12.2 Update from GitHub

```sh
cd /var/www/endowhub.io
git fetch --all --tags
git status --porcelain          # must be empty; .env is ignored
git checkout main
git pull --ff-only
dc up -d --build
VPS=1 ./scripts/healthcheck.sh
```

Tag every deploy so rollback is one command:

```sh
git tag -a deploy-$(date +%F) -m "deployed" && git push origin --tags
```

### 12.3 Rollback

```sh
git checkout deploy-2026-11-14
dc up -d --build
VPS=1 ./scripts/healthcheck.sh
```

Volumes are untouched. If an upgrade also changed data shape, restore the
matching database backup instead of running older code against newer data.

### 12.4 Backups

`.env` and the data volumes matter equally; an on-box copy is not a backup.

```sh
cd /var/www/endowhub.io
mkdir -p backups && STAMP=$(date +%F)

docker compose exec -T mongodb mongodump --db LibreChat --archive --gzip > "backups/mongo-$STAMP.gz"
docker compose exec -T vectordb pg_dump -U endowgpt endowgpt | gzip > "backups/pg-$STAMP.sql.gz"
docker run --rm -v endowgpt_librechat-uploads:/data:ro -v "$PWD/backups":/backup alpine tar czf "/backup/uploads-$STAMP.tgz" -C /data .
docker run --rm -v endowgpt_librechat-images:/data:ro -v "$PWD/backups":/backup alpine tar czf "/backup/images-$STAMP.tgz" -C /data .
cp .env "backups/env-$STAMP"

chmod 600 backups/*
```

Then copy `backups/` off the host:

```sh
rsync -avz backups/ you@otherhost:/backups/endowhub/
```

Meilisearch and Ollama rebuild themselves (re-index, re-pull) and need no
routine backup; `pagesift-data` is scraper cache only.

### 12.5 Reclaim disk

```sh
docker system df
docker image prune -f
docker builder prune -f --filter until=168h
```

### 12.6 Push changes from your workstation

```sh
git checkout main
git pull --ff-only
# ...commit work...
git push origin main
```

The server only ever pulls; the deploy key stays read-only.

---

## 13. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Build killed, `exit 137` | OOM — confirm swap (`free -h`), rebuild with `NODE_MAX_OLD_SPACE_SIZE=4096` |
| `port is already allocated` on 3080 | `sudo ss -tlnp \| grep 3080`; stop the other process |
| `api` restarts in a loop, Mongo healthy | Blank or malformed secret in `.env`, or invalid `librechat.yaml` — `dc logs api` |
| 502 from the proxy | App not listening on `127.0.0.1:3080` — `curl -fsS http://127.0.0.1:3080/health` |
| Certificate not issued | DNS not propagated, 80/443 blocked, or Cloudflare proxied (grey-cloud it) |
| Caddy: `address already in use` | Another web server owns 80/443 — use Step 9-B |
| Login works, session drops on reload | `DOMAIN_CLIENT`/`DOMAIN_SERVER` ≠ `https://endowhub.io` exactly |
| Chat 401 / model unavailable | `OPENCODE_API_KEY` missing — `dc up -d --force-recreate api` |
| Web search empty or 401 | `SCRAPER_API_KEY` ≠ `FIRECRAWL_API_KEY`, or the overlay was omitted |
| Upload fails with 413 | nginx `client_max_body_size` (Caddy is unbounded) |
| Uploads succeed, RAG answers lack sources | `ollama-init` incomplete — `dc logs ollama-init rag_api` |
| `git pull` says "dubious ownership" | `git config --global --add safe.directory /var/www/endowhub.io` |
| `Permission denied (publickey)` on clone | Deploy key not added, or `~/.ssh/config` missing `IdentitiesOnly yes` |

---

## 14. Security checklist

- [ ] SSH key login only; password auth and root login disabled.
- [ ] UFW allows only 22/80/443; provider firewall matches.
- [ ] fail2ban and unattended-upgrades running.
- [ ] Deploy key is **read-only** and scoped to this one repository.
- [ ] `.env` is mode `600`, git-ignored, and backed up off-host.
- [ ] `.env` is absent from GitHub (verified: not in the repository or its history).
- [ ] App bound to `127.0.0.1` only; `VPS=1 ./scripts/healthcheck.sh` passes.
- [ ] TLS valid and auto-renewing at `https://endowhub.io/health`.
- [ ] `ALLOW_REGISTRATION=false` after onboarding.
- [ ] A restore from backup has been tested at least once.
- [ ] `docker stats` shows memory headroom under normal load.

### Licensing

LibreChat is MIT. SearXNG, PageSift, CRW, Firecrawl, and LightPanda are
AGPL-3.0; Obscura is Apache-2.0. This deployment runs those images unmodified
and unreachable from the internet (no published ports). Publishing this
repository is compatible with AGPL §13 — keep `LICENSES.md` in place. If you
modify an AGPL service and expose it to third parties, you must offer its
corresponding source.
