#!/usr/bin/env bash
# Runs on the VPS, invoked by deploy.bat. Safe to re-run at any time.
#
#   server-update.sh [build|restart]
#
# build   - git pull, then `docker compose up -d --build`  (default)
# restart - git pull, then `docker compose up -d` without rebuilding
#
# The compose command is deliberately stashed behind `setsid nohup` so the
# ~10 minute image rebuild keeps going if this SSH connection drops. Progress is
# streamed by tailing the log; re-run `deploy.bat --server` to re-attach.
#
# Scope: this touches /var/www/endowhub.io only. The other vhosts on the box
# (endowcorporation.com, endowglobaledu.com, ec.endowglobaledu.com,
# endowtech.net) are separate processes and are not restarted.
set -u

REPO=/var/www/endowhub.io
LOG=/tmp/endowgpt-up.log
ACTION=${1:-build}

# The websearch overlay is mandatory: without it librechat.yaml interpolation
# fails. The vps overlay is what binds the API to 127.0.0.1:${PORT}.
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.websearch.yml -f docker-compose.vps.yml)

cd "$REPO" 2>/dev/null || { echo "FATAL: $REPO not found"; exit 1; }

echo "== target =="
echo "   $(hostname)  $(whoami)  $REPO"
echo "   before: $(git rev-parse --short HEAD 2>/dev/null)  $(git log -1 --pretty=%s 2>/dev/null)"
echo

# Only tracked modifications can stop a --ff-only pull. Untracked files here are
# normally .env backups, so they are reported separately and do not warn.
if [ -n "$(git status --porcelain --untracked-files=no 2>/dev/null)" ]; then
	echo "== WARNING: tracked files modified on the server =="
	git status --porcelain --untracked-files=no | sed 's/^/   /'
	echo "   pull is --ff-only, so it will stop rather than merge."
	echo
fi

echo "== pull =="
if ! git pull --ff-only; then
	echo "FATAL: git pull failed; nothing was restarted."
	exit 1
fi
echo "   after:  $(git rev-parse --short HEAD)  $(git log -1 --pretty=%s)"
echo

if [ "$ACTION" = "restart" ]; then
	echo "== restart (no rebuild) =="
	set -- up -d
else
	echo "== rebuild + up (detached; survives a dropped connection) =="
	set -- up -d --build
fi

rm -f "$LOG"
setsid nohup bash -c "cd $REPO && ${COMPOSE[*]} $* > $LOG 2>&1; echo \"EXIT:\$?\" >> $LOG" \
	</dev/null >/dev/null 2>&1 &

sleep 3

seen=0
waited=0
while [ "$waited" -lt 1800 ]; do
	if [ -f "$LOG" ]; then
		total=$(wc -l < "$LOG")
		if [ "$total" -gt "$seen" ]; then
			# Only the new lines, capped so a chatty build cannot flood the terminal.
			tail -n +"$((seen + 1))" "$LOG" | tail -n 25 | sed 's/^/   /'
			seen=$total
		fi
		grep -q '^EXIT:' "$LOG" && break
	fi
	sleep 5
	waited=$((waited + 5))
done

echo
echo "== result =="
if grep -q '^EXIT:0$' "$LOG" 2>/dev/null; then
	echo "   compose: OK"
else
	echo "   compose: FAILED or still running"
	grep '^EXIT:' "$LOG" 2>/dev/null | sed 's/^/   /'
	tail -n 30 "$LOG" 2>/dev/null | sed 's/^/   /'
fi

echo
echo "== containers =="
docker ps --filter 'name=endowgpt-' --format '   {{.Names}}  {{.Status}}'

echo
echo "== health =="
if curl -fsS -m 15 http://127.0.0.1:3080/health >/dev/null 2>&1; then
	echo "   local api:  OK"
else
	echo "   local api:  FAILED"
fi
if curl -fsS -m 20 https://endowhub.io/health >/dev/null 2>&1; then
	echo "   public:     OK"
else
	echo "   public:     FAILED"
fi

echo
echo "== disk =="
df -h / | tail -n 1 | sed 's/^/   /'

grep -q '^EXIT:0$' "$LOG" 2>/dev/null
