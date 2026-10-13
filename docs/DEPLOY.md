# Deployment & maintenance

The app is a single Node.js process that serves both the website and the API, with all data in one SQLite file plus an uploads folder. There is no separate database server, queue or cron to maintain.

## Requirements

- A small Linux server or container host (1 vCPU / 512 MB RAM is plenty)
- A persistent disk for `/data`
- A domain name with HTTPS (most hosts provide this)

## Option A — Docker on any server (recommended)

```bash
git clone <this repo> cadet-delivery && cd cadet-delivery
cp .env.example .env        # set APP_URL=https://your-domain
docker compose up -d
```

The app listens on port 8080. Put it behind a reverse proxy that handles HTTPS — [Caddy](https://caddyserver.com/) is the simplest:

```
delivery.example.com {
    reverse_proxy localhost:8080
}
```

Data lives in the `cds-data` Docker volume.

## Option B — A platform host (Render, Railway, Fly.io)

Use the Dockerfile. Configure:

- A **persistent volume mounted at `/data`** (required — without it data is lost on every deploy)
- Environment variable `APP_URL` set to your public address
- Port `8080`
- Health check path `/api/health`
- A single instance (SQLite is a single-writer database; one instance easily handles this workload)

## Option C — Plain Node.js (good for a Proxmox LXC container)

No Docker needed — one Node.js process managed by systemd. This is the lightest option inside an LXC container. Run as root:

```bash
# 1. Node.js 22
apt-get update && apt-get install -y curl ca-certificates git
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

# 2. The app, in /opt, owned by a dedicated user
useradd --system --home /var/lib/cadet-delivery --shell /usr/sbin/nologin cds
git clone <this repo> /opt/cadet-delivery-system
cd /opt/cadet-delivery-system
npm ci --ignore-scripts      # SQLite ships prebuilt; no compiler needed
npm run build
cp .env.example .env         # set APP_URL; add SMTP/Twilio here if you like
mkdir -p /var/lib/cadet-delivery && chown cds:cds /var/lib/cadet-delivery

# 3. Start it now and on every boot
cp deploy/cadet-delivery.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now cadet-delivery
systemctl status cadet-delivery    # should say "active (running)"
curl -s localhost:8080/api/health  # {"ok":true}
```

Data (database, photos, nightly backups) lives in `/var/lib/cadet-delivery`. Logs: `journalctl -u cadet-delivery -f`.

To update:

```bash
cd /opt/cadet-delivery-system
git pull && npm ci --ignore-scripts && npm run build
systemctl restart cadet-delivery
```

## Proxmox LXC and Docker

If `docker compose up` in an LXC container fails with an error like

```
failed to solve: failed to read dockerfile: failed to mount /var/lib/docker/tmp/buildkit-mount…: permission denied
```

the container isn't allowed to run nested containers, so Docker has fallen back to its `vfs` storage driver, which can't build images. Either use **Option C** above (simplest), or enable nesting:

1. On the **Proxmox host** (replace `105` with your container ID):
   ```bash
   pct set 105 --features nesting=1,keyctl=1
   pct reboot 105
   ```
   Or in the web UI: select the container → **Options** → **Features** → tick **Nesting** (and **keyctl** for unprivileged containers) → reboot the container.
2. Inside the container, check `docker info | grep "Storage Driver"`. It should now say `overlay2`.
3. If it still says `vfs`, Docker is reusing its old storage. Before you have any data in the app, it's safe to reset it: `systemctl stop docker && rm -rf /var/lib/docker && systemctl start docker`. (Don't do this once the app holds real data — it deletes the data volume too.)
4. Run `docker compose up -d` again.

## Configuration

All settings are optional environment variables (see `.env.example`):

| Variable | Purpose |
|---|---|
| `APP_URL` | Public site address, used in links inside texts and emails. Can also be set in Settings → Business. |
| `PORT` | Default `8080`. |
| `DATA_DIR` | Database, uploads and backups. Default `./data` (`/data` in Docker). |
| `BACKUP_KEEP` | Number of nightly backups to keep. Default 14. |
| `SMTP_*` | Email settings. Overrides Settings → Text & email setup. |
| `TWILIO_*` | Text message settings. Overrides Settings → Text & email setup. |
| `TRUST_PROXY` | Express trust-proxy setting if your proxy isn't on a private network. |

Text and email credentials can be entered in the app instead, so the organizer can change them without redeploying.

## Text messages (Twilio)

1. Create a Twilio account and buy a local number.
2. **Register for A2P 10DLC** in the Twilio console (required in the US to text from a regular number). Use case: "Customer care / delivery notifications". Approval usually takes a few days; until then texts may be blocked by carriers. A toll-free number with toll-free verification is an alternative.
3. In the app: **Settings → Text & email setup**, enter the Account SID, Auth Token and number, save, and send a test.
4. To receive replies in the Inbox: in Twilio, open the number → *Messaging* → **A message comes in** → Webhook → `https://YOUR-SITE/api/webhooks/sms` (HTTP POST). The app verifies Twilio's signature, so `APP_URL` (or Settings → Business → Site address) must match the URL exactly.

Twilio handles STOP/START opt-outs automatically.

## Email

Any SMTP provider works. For Gmail or Google Workspace: turn on 2-step verification, create an **App Password**, then use `smtp.gmail.com`, port `587`, SSL off, your address as username, the app password as password.

## Backups

- A backup is written automatically every night around 0300 (local time) to `DATA_DIR/backups`, keeping the last 14.
- **Settings → Backups & data → Download full backup** downloads a complete, consistent copy at any time. Download one periodically and keep it somewhere else.

### Restoring

Stop the app, replace `DATA_DIR/cds.sqlite` with the backup file (rename it to `cds.sqlite`), delete any `cds.sqlite-wal` / `cds.sqlite-shm` files next to it, and start the app. Uploaded photos live in `DATA_DIR/uploads`; back that folder up too if you want delivery photos preserved.

With Docker:

```bash
docker compose stop
docker run --rm -v cadet-delivery_cds-data:/data -v "$PWD":/backup alpine \
  sh -c 'rm -f /data/cds.sqlite-wal /data/cds.sqlite-shm && cp /backup/your-backup.sqlite /data/cds.sqlite && chown 1000:1000 /data/cds.sqlite'
docker compose start
```

## Updating

```bash
git pull
docker compose up -d --build
```

Database changes are applied automatically on start-up. Migrations only ever add; take a backup before major updates anyway.

## Monitoring

- `GET /api/health` returns `{"ok":true}`.
- **Settings → Outbox** shows every text and email with its delivery status and error message.
- Server logs go to stdout (`docker compose logs -f`).
