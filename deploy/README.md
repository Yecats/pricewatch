# Pricewatch — Deployment Guide

Three options for deploying with a single shared database accessible from both your phone and your Linux server.

| Option | Setup | Works on cellular? | Cost | Best for |
|--------|-------|---------------------|------|----------|
| 1. LAN + Tailscale | ~30 min | Yes (via Tailscale) | Free | You + a phone, self-hosted |
| 2. Cloud (Fly.io) | ~20 min | Yes | ~$5/mo | Don't want to run a server |
| 3. Pure LAN | ~15 min | No (home Wi-Fi only) | Free | Quick start, local-only |

**Recommendation: Option 1 (Tailscale + Postgres on your Linux server)**

---

## Option 1: Tailscale + Postgres on your Linux server

### Architecture

```
┌─────────────────┐         ┌──────────────────────────────┐
│  Your phone     │         │  Linux server                 │
│  (any network)  │◄───────►│  - Next.js app (port 3000)    │
│  PWA install    │ Tail-   │  - PostgreSQL (port 5432)     │
│                 │ scale   │  - Caddy reverse proxy (:80)  │
└─────────────────┘         └──────────────────────────────┘
```

Both phone and server hit the same Postgres DB → single source of truth.

### Step 1: Install PostgreSQL on your Linux server

```bash
# Debian/Ubuntu
sudo apt update
sudo apt install -y postgresql postgresql-contrib

# Start and enable on boot
sudo systemctl enable --now postgresql

# Create a database and user for the app
sudo -u postgres psql <<'SQL'
CREATE USER pricewatch WITH PASSWORD 'CHANGE_ME_strong_password_here';
CREATE DATABASE pricewatch OWNER pricewatch;
GRANT ALL PRIVILEGES ON DATABASE pricewatch TO pricewatch;
SQL

# Verify it works
psql "postgresql://pricewatch:CHANGE_ME_strong_password_here@localhost:5432/pricewatch" -c "SELECT version();"
```

### Step 2: Set environment variables

Create `/opt/pricewatch/.env` on your server:

```bash
# Use a long random string — generate with: openssl rand -base64 32
DATABASE_URL="postgresql://pricewatch:CHANGE_ME_strong_password_here@localhost:5432/pricewatch?schema=public"
NODE_ENV=production
PORT=3000
```

### Step 3: Build and deploy the app

```bash
# Clone your repo to the server
git clone <your-repo-url> /opt/pricewatch
cd /opt/pricewatch

# Install dependencies
bun install

# Generate Prisma client
bun run db:generate

# Push schema to Postgres (creates tables)
bun run db:push

# Build the production bundle
bun run build

# Test it starts
bun run start
# → should say "Ready on http://localhost:3000"
# Press Ctrl+C to stop
```

### Step 4: Run as a systemd service

Create `/etc/systemd/system/pricewatch.service`:

```ini
[Unit]
Description=Pricewatch
After=network.target postgresql.service

[Service]
Type=simple
User=pricewatch
WorkingDirectory=/opt/pricewatch
EnvironmentFile=/opt/pricewatch/.env
ExecStart=/usr/bin/bun /opt/pricewatch/.next/standalone/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
# Create the user (if you don't want to run as root)
sudo useradd -r -s /bin/false -d /opt/pricewatch pricewatch
sudo chown -R pricewatch:pricewatch /opt/pricewatch

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable --now pricewatch
sudo systemctl status pricewatch

# Check logs
sudo journalctl -u pricewatch -f
```

### Step 5: Install Tailscale (so your phone can reach it from anywhere)

**On the Linux server:**
```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
# This prints a URL — open it in a browser to authenticate
# Note the IP it gives you, e.g. 100.x.x.x
tailscale ip -4   # → 100.x.x.x
```

**On your phone:**
1. Install Tailscale from the App Store / Play Store
2. Sign in with the same account
3. You're now on the same private mesh network as your server

### Step 6: Access from your phone

Open `http://<server-tailscale-ip>:3000` on your phone (e.g. `http://100.64.0.1:3000`).

**To install as a PWA** (so it feels like a native app, no browser chrome):
- **Android (Chrome):** tap the ⋮ menu → "Add to Home screen" → "Install"
- **iOS (Safari):** tap the Share icon → "Add to Home Screen"

### (Optional) Add HTTPS with Caddy

If you want HTTPS (required for some PWA features like the camera to work in some browsers), Caddy is already set up in this project. Use Tailscale's HTTPS feature:

```bash
# In Tailscale admin console (https://login.tailscale.com/admin/dns):
# - Enable HTTPS
# - This gives your server a name like "pricewatch.tail-XXXX.ts.net"

# On the server, request a cert:
sudo tailscale cert pricewatch.tail-XXXX.ts.net
# → generates pricewatch.tail-XXXX.ts.net.crt and .key

# Update the Caddyfile to serve HTTPS:
# See deploy/Caddyfile.https in this project
```

Then your phone accesses `https://pricewatch.tail-XXXX.ts.net` — fully HTTPS, camera works, installable as PWA.

---

## Option 2: Cloud deploy on Fly.io

If you don't want to run a server.

### Prerequisites
- Install `flyctl`: `curl -L https://fly.io/flyctl.sh | sh`
- Sign up at fly.io

### Steps

```bash
# From your project directory
fly launch

# Answer the prompts:
# - App name: pricewatch
# - Region: closest to you
# - Postgres: YES (creates a managed Postgres for ~$3/mo)
# - Use existing settings: yes

# Fly will create:
# - A fly.toml config file
# - A Dockerfile
# - A Postgres cluster
# - Set DATABASE_URL automatically

# Set your env vars
fly secrets set NODE_ENV=production

# Deploy
fly deploy

# Open it
fly open
# → https://pricewatch.fly.dev
```

Your DB lives in the same region as the app. Backups are automatic.

**To access from phone:** just bookmark `https://pricewatch.fly.dev` and add to home screen.

---

## Option 3: Pure LAN (home Wi-Fi only, no Postgres)

Quickest way to test — uses SQLite, only works on your home Wi-Fi.

### Step 1: Build the production bundle

```bash
cd /home/z/my-project
bun run build
```

### Step 2: Find your server's LAN IP

```bash
ip addr show | grep "inet " | grep -v 127.0.0.1
# → e.g. 192.168.1.50
```

### Step 3: Run the server, bound to all interfaces

```bash
# Default Next.js binds to localhost only — bind to 0.0.0.0 to accept LAN connections
HOSTNAME=0.0.0.0 PORT=3000 bun .next/standalone/server.js
```

### Step 4: Open on your phone (must be on same Wi-Fi)

Navigate to `http://192.168.1.50:3000` on your phone.

### Limitations of this approach
- ❌ Doesn't work on cellular (you'd need Tailscale — see Option 1)
- ❌ SQLite doesn't handle concurrent writes well — only good for one user
- ❌ No HTTPS → camera (barcode scanner) won't work on most phones
- ✅ Easy to test, no external setup

For anything beyond testing, switch to Option 1 or 2.

---

## Updating the app later

```bash
# SSH to your server
cd /opt/pricewatch
git pull
bun install
bun run db:generate    # in case schema changed
bun run db:push        # apply schema changes to Postgres
bun run build
sudo systemctl restart pricewatch
```

## Backing up the database

```bash
# Manual backup
pg_dump "postgresql://pricewatch:PASSWORD@localhost:5432/pricewatch" \
  --file=pricewatch-$(date +%Y%m%d).sql

# Set up a daily cron job
echo "0 3 * * * pg_dump ... | gzip > /backups/pricewatch-\$(date +\%Y\%m\%d).sql.gz" | crontab -
```

## Restoring

```bash
gunzip -c /backups/pricewatch-20260101.sql.gz | \
  psql "postgresql://pricewatch:PASSWORD@localhost:5432/pricewatch"
```

---

## Files in this folder

- `docker-compose.yml` — Postgres + the app, for Docker-based deploys
- `Dockerfile` — container image of the app
- `Caddyfile.https` — Caddy reverse proxy config with HTTPS via Tailscale
- `pricewatch.service` — systemd unit file for non-Docker deploys
