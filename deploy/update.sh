#!/usr/bin/env bash
# Обновление на сервере: bash /opt/habit-pet/deploy/update.sh
set -euo pipefail
cd /opt/habit-pet
git pull --ff-only
npm ci --no-audit --no-fund
npm run build
.venv/bin/pip install -q -r bot/requirements.txt
cp deploy/Caddyfile /etc/caddy/Caddyfile && systemctl reload caddy
cp deploy/habit-pet-bot.service /etc/systemd/system/ && systemctl daemon-reload
systemctl restart habit-pet-bot
echo "Готово: https://129-101-120-201.sslip.io/"
