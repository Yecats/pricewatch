#!/usr/bin/env bash
# Deploys Pricewatch to a Linux server with PostgreSQL.
#
# Run this ON YOUR SERVER (not your dev machine). It will:
#   1. Install PostgreSQL + Bun if missing
#   2. Create the pricewatch DB + user
#   3. Build the app
#   4. Set up the systemd service
#   5. Print next steps (install Tailscale, etc.)
#
# Usage (as root or with sudo):
#   curl -fsSL https://your-repo/deploy/install-on-server.sh | bash
#
# Or, clone the repo and run locally:
#   sudo bash deploy/install-on-server.sh
#
# Customize the variables below before running.

set -euo pipefail

# === CONFIGURATION — EDIT THESE ===
INSTALL_DIR="/opt/pricewatch"
DB_NAME="pricewatch"
DB_USER="pricewatch"
DB_PASSWORD="$(openssl rand -base64 24 | tr -d '=+/' | cut -c1-32)"
REPO_URL="${REPO_URL:-}"  # set this env var or clone manually
SYSTEMD_USER="pricewatch"
# ===================================

echo "=== Pricewatch server installer ==="
echo ""

# Check we're root
if [[ $EUID -ne 0 ]]; then
  echo "✗ Please run as root: sudo bash $0"
  exit 1
fi

# ─── Step 1: Install dependencies ────────────────────────────────────────────
echo "→ Installing PostgreSQL and Bun..."

if ! command -v psql &>/dev/null; then
  apt-get update -qq
  apt-get install -y -qq postgresql postgresql-contrib curl ca-certificates openssl
fi

if ! command -v bun &>/dev/null; then
  curl -fsSL https://bun.sh/install | bash
  # bun installs to ~/.bun — make it available system-wide
  ln -sf /root/.bun/bin/bun /usr/local/bin/bun
fi

sudo systemctl enable --now postgresql

# ─── Step 2: Set up Postgres ────────────────────────────────────────────────
echo "→ Creating database '$DB_NAME' with user '$DB_USER'..."

# Only create if the user doesn't exist yet
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
  sudo -u postgres psql <<SQL
CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';
CREATE DATABASE $DB_NAME OWNER $DB_USER;
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
SQL
else
  echo "  (user already exists, skipping)"
fi

# Allow password auth from localhost (for the app to connect)
PG_HBA=$(find /etc/postgresql -name pg_hba.conf 2>/dev/null | head -1)
if [[ -n "$PG_HBA" ]] && ! grep -q "$DB_USER" "$PG_HBA"; then
  echo "host    all    $DB_USER    127.0.0.1/32    scram-sha-256" | sudo tee -a "$PG_HBA" >/dev/null
  sudo systemctl reload postgresql
fi

# ─── Step 3: Get the code ──────────────────────────────────────────────────
if [[ ! -d "$INSTALL_DIR" ]]; then
  if [[ -n "$REPO_URL" ]]; then
    echo "→ Cloning repo to $INSTALL_DIR..."
    git clone "$REPO_URL" "$INSTALL_DIR"
  else
    echo "✗ $INSTALL_DIR does not exist."
    echo "  Either:"
    echo "    a) Set REPO_URL=... and re-run, OR"
    echo "    b) Manually copy your project files to $INSTALL_DIR"
    exit 1
  fi
fi

cd "$INSTALL_DIR"

# ─── Step 4: Create system user ─────────────────────────────────────────────
if ! id "$SYSTEMD_USER" &>/dev/null; then
  useradd -r -s /bin/false -d "$INSTALL_DIR" "$SYSTEMD_USER"
fi
chown -R "$SYSTEMD_USER:$SYSTEMD_USER" "$INSTALL_DIR"

# ─── Step 5: Write .env ─────────────────────────────────────────────────────
echo "→ Writing .env file..."
DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME?schema=public"

cat > "$INSTALL_DIR/.env" <<EOF
DATABASE_URL="$DATABASE_URL"
NODE_ENV=production
HOSTNAME=0.0.0.0
PORT=3000
EOF
chown "$SYSTEMD_USER:$SYSTEMD_USER" "$INSTALL_DIR/.env"
chmod 600 "$INSTALL_DIR/.env"

# Save the password so the user can retrieve it
echo "$DB_PASSWORD" > /root/.pricewatch-db-password
chmod 600 /root/.pricewatch-db-password

# ─── Step 6: Install deps + build ──────────────────────────────────────────
echo "→ Installing dependencies and building (this takes a minute)..."
sudo -u "$SYSTEMD_USER" -H bash <<EOF
set -e
cd "$INSTALL_DIR"
bun install --frozen-lockfile || bun install
cp deploy/../prisma/schema.prod.prisma prisma/schema.prisma
bun run db:generate
bun run db:push
bun run build
EOF

# ─── Step 7: Set up systemd ────────────────────────────────────────────────
echo "→ Installing systemd service..."
cp "$INSTALL_DIR/deploy/pricewatch.service" /etc/systemd/system/pricewatch.service
systemctl daemon-reload
systemctl enable --now pricewatch

sleep 2
if systemctl is-active --quiet pricewatch; then
  echo "✓ Service running"
else
  echo "✗ Service failed to start — check logs:"
  echo "  sudo journalctl -u pricewatch -n 30"
  exit 1
fi

# ─── Done ──────────────────────────────────────────────────────────────────
SERVER_LAN_IP=$(hostname -I | awk '{print $1}')

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  ✓ Pricewatch is running at http://$SERVER_LAN_IP:3000"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "  DB password saved to: /root/.pricewatch-db-password"
echo "  (You won't need it — it's in $INSTALL_DIR/.env already)"
echo ""
echo "  Next steps:"
echo "    1. On your phone, connect to the same Wi-Fi as this server"
echo "    2. Open: http://$SERVER_LAN_IP:3000"
echo ""
echo "  For access from anywhere (cellular too):"
echo "    1. Install Tailscale on this server:"
echo "       curl -fsSL https://tailscale.com/install.sh | sh"
echo "       sudo tailscale up"
echo "    2. Install Tailscale on your phone (App Store / Play Store)"
echo "    3. Sign in with the same account on both"
echo "    4. Open: http://\$(tailscale ip -4):3000  from your phone"
echo ""
echo "  Useful commands:"
echo "    sudo systemctl status pricewatch"
echo "    sudo journalctl -u pricewatch -f"
echo "    sudo systemctl restart pricewatch   # after updates"
echo ""
