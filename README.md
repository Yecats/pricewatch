# Pricewatch

Track product prices across local stores and find the best value, accounting for different sizes and pack counts. Offline-first — works on your phone at the store with no signal, syncs automatically when you get home.

![Pricewatch](https://img.shields.io/badge/Next.js-16-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![Prisma](https://img.shields.io/badge/Prisma-6-blue) ![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **Smart unit-price normalization** — compares 18-count bulk boxes against single boxes by computing price per ounce / milliliter / each
- **Sale tracking with countdowns** — mark a price as a sale, set an expiration date, and the app highlights how much you save vs the next-best option (in dollars AND percent)
- **Auto-expiring sales** — expired sales are automatically hidden from "best value" calculations and the next-best price takes over
- **Shopping list with smart store grouping** — add products to your list, and the app groups them by the best store to buy each one at right now. When a sale expires, items automatically fall through to the next-best store
- **Barcode scanning** — scan a product's barcode to look it up on OpenFoodFacts (free, no API key) and pre-fill the product details
- **Offline-first sync** — your phone has a local database, works without signal, and syncs bidirectionally with your server when you reconnect
- **PWA installable** — add to your phone's home screen, feels like a native app
- **Dark mode** — modern violet/slate color scheme

## Quick start (development)

### Prerequisites

- [Bun](https://bun.sh) v1.0 or later
- A terminal (PowerShell on Windows, any shell on macOS/Linux)

### Install and run

```bash
git clone https://github.com/your-username/pricewatch.git
cd pricewatch
bun install
bun run db:generate
bun run db:push
bun run seed
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

The seed script loads 5 stores (Costco, Walmart, Target, Safeway, Trader Joe's) and 5 sample products (Mac & Cheese, Milk, Eggs, Chicken, Olive Oil) with 16 prices including 3 active sales, so you can see how everything works immediately.

## Production deployment

### Build the app

```bash
bun run build
```

This creates a standalone Next.js server in `.next/standalone/`.

### Run the server (localhost only)

```bash
bun run start
```

### Run the server (accessible from your phone on the same Wi-Fi)

```bash
bun run start:lan
```

This binds to `0.0.0.0:3000` instead of just `localhost`, so other devices on your network can reach it. Find your computer's LAN IP and open `http://YOUR-LAN-IP:3000` on your phone.

## Deploying on Windows

### 1. Install Bun

Open **PowerShell** and run:

```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

Close and reopen PowerShell, then verify:

```powershell
bun --version
```

### 2. Clone and set up

```powershell
git clone https://github.com/your-username/pricewatch.git
cd pricewatch
bun install
bun run db:generate
bun run db:push
bun run seed
bun run build
```

### 3. Allow through Windows Firewall

Run **PowerShell as Administrator** and run:

```powershell
New-NetFirewallRule -DisplayName "Pricewatch" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

This is a one-time setup.

### 4. Start the server

```powershell
bun run start:lan
```

### 5. Find your PC's LAN IP

```powershell
ipconfig | findstr IPv4
```

Look for the line like `IPv4 Address. . . . . . . . . . . : 192.168.1.50`

### 6. Open on your phone

Make sure your phone is on the same Wi-Fi as your PC, then open:

```
http://192.168.1.50:3000
```

**Install as a PWA** (so it feels like a native app):
- **Android (Chrome):** tap the ⋮ menu → "Add to Home screen" → "Install"
- **iPhone (Safari):** tap the Share icon → "Add to Home Screen"

## Deploying on macOS / Linux

### 1. Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc  # or ~/.zshrc
bun --version
```

### 2. Clone and set up

```bash
git clone https://github.com/your-username/pricewatch.git
cd pricewatch
bun install
bun run db:generate
bun run db:push
bun run seed
bun run build
```

### 3. Start the server

```bash
bun run start:lan
```

### 4. Find your machine's LAN IP

```bash
# macOS
ipconfig getifaddr en0

# Linux
hostname -I | awk '{print $1}'
```

### 5. Open on your phone

Make sure your phone is on the same Wi-Fi, then open `http://YOUR-LAN-IP:3000`.

## Accessing from outside your home (cellular, etc.)

By default the app only works on your home Wi-Fi. To access it from anywhere (cellular, work, the grocery store), install [Tailscale](https://tailscale.com) (free) on both your computer and your phone:

```bash
# On your computer
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
tailscale ip -4   # → 100.x.x.x
```

Then install the Tailscale app on your phone and sign in with the same account. Open `http://100.x.x.x:3000` on your phone — it'll work from anywhere.

Tailscale also gives you free HTTPS (needed for the camera barcode scanner to work on your phone). See `deploy/README.md` for setup instructions.

## Production database (PostgreSQL)

By default the app uses SQLite (a single file at `db/custom.db`) which is perfect for local use. For multi-device concurrent access, switch to PostgreSQL:

```bash
# 1. Install PostgreSQL
#    macOS:  brew install postgresql@16 && brew services start postgresql@16
#    Linux:  sudo apt install postgresql postgresql-contrib
#    Windows: download from https://www.postgresql.org/download/windows/

# 2. Create a database
sudo -u postgres psql -c "CREATE USER pricewatch WITH PASSWORD 'yourpassword';"
sudo -u postgres psql -c "CREATE DATABASE pricewatch OWNER pricewatch;"

# 3. Swap the Prisma schema to PostgreSQL
./deploy/swap-schema.sh prod

# 4. Update .env
echo 'DATABASE_URL="postgresql://pricewatch:yourpassword@localhost:5432/pricewatch?schema=public"' > .env

# 5. Push schema and rebuild
bun run db:generate
bun run db:push
bun run build
```

To switch back to SQLite for local dev: `./deploy/swap-schema.sh sqlite`

## Offline-first sync architecture

```
┌─────────────────┐         ┌──────────────────┐
│  Web browser    │         │  Phone (PWA)     │
│  (always on LAN)│         │                  │
│                 │         │  Local IndexedDB │
│  Reads/writes   │         │  (works offline) │
│  server API     │         │                  │
└────────┬────────┘         └────────┬─────────┘
         │                          │
         │                          │ /api/sync
         │                          │ (auto, debounced)
         ▼                          ▼
    ┌─────────────────────────────────────┐
    │  Server (source of truth)            │
    │  - Next.js API                       │
    │  - SQLite or PostgreSQL              │
    │  - Soft-delete (deletedAt column)    │
    └─────────────────────────────────────┘
```

- Every device has a local IndexedDB that mirrors the server
- Reads are instant (from local DB), writes go local first then sync
- Conflict resolution: last-write-wins by `updatedAt` timestamp
- Sync triggers: on app open, after every write (debounced 2s), on network reconnect, every 60s
- The status indicator in the header shows sync state (✅ synced / 🔄 pending / ⏳ syncing / ☁️ offline)

## NPM scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start dev server with hot reload (localhost only) |
| `bun run build` | Build the production bundle |
| `bun run start` | Run production server (localhost only) |
| `bun run start:lan` | Run production server, accessible from LAN |
| `bun run seed` | Reset DB and load sample data |
| `bun run db:push` | Apply schema changes to the database |
| `bun run db:generate` | Regenerate Prisma client |
| `bun run lint` | Check code quality |

## Tech stack

- **Framework:** Next.js 16 (App Router, standalone output)
- **Language:** TypeScript 5
- **Styling:** Tailwind CSS 4 + shadcn/ui (New York)
- **Database:** Prisma ORM (SQLite for dev, PostgreSQL for prod)
- **Local DB (offline-first):** Dexie (IndexedDB wrapper)
- **Animations:** Framer Motion
- **Barcode scanning:** @zxing/browser + OpenFoodFacts API
- **Icons:** Lucide React

## Project structure

```
pricewatch/
├── prisma/
│   ├── schema.prisma          # SQLite schema (dev)
│   └── schema.prod.prisma     # PostgreSQL schema (prod)
├── src/
│   ├── app/
│   │   ├── page.tsx           # Main page (product grid, shopping list, etc.)
│   │   ├── layout.tsx         # Root layout + theme provider
│   │   └── api/               # API routes
│   │       ├── products/      # CRUD + by-barcode lookup
│   │       ├── stores/        # CRUD
│   │       ├── prices/        # CRUD
│   │       ├── shopping-list/ # CRUD + clear
│   │       ├── barcode/       # OpenFoodFacts lookup proxy
│   │       └── sync/          # Bidirectional sync endpoint
│   ├── components/
│   │   ├── ui/                # shadcn/ui components
│   │   └── price-tracker/     # App-specific components
│   ├── lib/
│   │   ├── db.ts              # Prisma client
│   │   ├── units.ts           # Unit conversion + price math
│   │   ├── barcode.ts         # OpenFoodFacts lookup
│   │   ├── local-db.ts        # Dexie/IndexedDB schema
│   │   ├── sync.ts            # Sync manager
│   │   └── shopping-list.ts   # Store grouping logic
│   └── hooks/
│       └── use-local-data.ts  # React hooks for local DB reads/writes
├── deploy/
│   ├── README.md              # Detailed deployment guide
│   ├── install-on-server.sh   # One-shot installer for Linux servers
│   ├── docker-compose.yml     # Docker Compose with PostgreSQL
│   ├── Dockerfile             # Multi-stage container build
│   ├── Caddyfile.https        # Caddy reverse proxy with Tailscale HTTPS
│   ├── pricewatch.service     # systemd unit file
│   └── swap-schema.sh         # Switch between SQLite and PostgreSQL
├── scripts/
│   └── seed.ts                # Sample data loader
├── public/
│   └── manifest.json          # PWA manifest
└── package.json
```

## Backing up your data

The SQLite database is a single file at `db/custom.db`. To back it up:

```bash
# macOS/Linux
cp db/custom.db db/backup-$(date +%Y-%m-%d).db

# Windows PowerShell
Copy-Item db\custom.db "db\backup-$(Get-Date -Format yyyy-MM-dd).db"
```

For PostgreSQL:

```bash
pg_dump "postgresql://pricewatch:yourpassword@localhost:5432/pricewatch" > backup.sql
```

## Troubleshooting

### "EADDRINUSE: address already in use" on port 3000

A previous server didn't shut down cleanly. Find and kill it:

```bash
# macOS/Linux
lsof -i :3000
kill -9 <PID>

# Windows PowerShell
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### Phone can't connect

1. Make sure both devices are on the **same Wi-Fi network** (not a guest network)
2. Make sure you started the server with `bun run start:lan` (not `bun run start`)
3. **Windows:** make sure you ran the firewall command from an admin PowerShell
4. Try temporarily disabling your firewall to confirm it's the issue

### Camera (barcode scanner) doesn't work on phone

Browsers require HTTPS for camera access on non-localhost origins. On your phone, either:
- Use manual barcode entry (type the digits) — works over plain HTTP
- Set up HTTPS via [Tailscale](https://tailscale.com) (free, see `deploy/README.md`)
- Use a tool like [ngrok](https://ngrok.com) for a temporary HTTPS URL

### `bun run dev` doesn't work on Windows PowerShell

The dev script uses `tee` (a Unix command). On Windows, either:
- Use `bun run start:lan` instead (production mode, doesn't use `tee`)
- Install Git Bash and run `bun run dev` there
- Or run `next dev -p 3000` directly

## License

MIT — do whatever you want with this.

## Acknowledgments

- Product data from [OpenFoodFacts](https://world.openfoodfacts.org/) — free, open database of food products
- Barcode scanning by [@zxing/library](https://github.com/zxing-js/library)
- UI components by [shadcn/ui](https://ui.shadcn.com/)
