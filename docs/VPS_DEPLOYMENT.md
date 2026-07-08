# SYNTRA — VPS Deployment Guide (Docker)

This guide walks you through deploying SYNTRA on a Linux VPS using Docker and Docker Compose.  
Estimated time: **20–30 minutes** for a fresh server.

---

## Table of Contents

1. [Server Requirements](#1-server-requirements)
2. [Install Docker & Docker Compose](#2-install-docker--docker-compose)
3. [Clone the Repository](#3-clone-the-repository)
4. [Configure Environment Variables](#4-configure-environment-variables)
5. [First-Time Database Migration](#5-first-time-database-migration)
6. [Start the Application](#6-start-the-application)
7. [Create the First Platform Admin](#7-create-the-first-platform-admin)
8. [Set Up SSL with a Free Certificate (Caddy)](#8-set-up-ssl-with-a-free-certificate-caddy)
9. [Useful Commands](#9-useful-commands)
10. [Updating the Application](#10-updating-the-application)
11. [Troubleshooting](#11-troubleshooting)
12. [Architecture Overview](#12-architecture-overview)

---

## 1. Server Requirements

| Item | Minimum | Recommended |
|------|---------|-------------|
| OS | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |
| RAM | 1 GB | 2 GB |
| CPU | 1 vCPU | 2 vCPU |
| Disk | 20 GB | 40 GB SSD |
| Open ports | 22 (SSH), 80 (HTTP), 443 (HTTPS) | Same |

> **Tip:** DigitalOcean, Hetzner, Vultr, and Linode all work well. A $6–$12/month droplet is plenty for most teams.

---

## 2. Install Docker & Docker Compose

SSH into your server and run:

```bash
# Update packages
sudo apt update && sudo apt upgrade -y

# Install Docker (official script — includes Docker Compose V2)
curl -fsSL https://get.docker.com | sudo sh

# Add your user to the docker group (so you don't need sudo every time)
sudo usermod -aG docker $USER

# Log out and back in, then verify:
docker --version
docker compose version
```

---

## 3. Clone the Repository

```bash
# Install git if needed
sudo apt install git -y

# Clone SYNTRA to the server
git clone https://github.com/your-org/syntra.git /opt/syntra
cd /opt/syntra
```

> Replace the GitHub URL with your actual repository URL.  
> If the repo is private, use a [Personal Access Token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) or deploy key.

---

## 4. Configure Environment Variables

```bash
# Copy the example file
cp .env.example .env

# Edit it with your values
nano .env
```

Fill in every value in `.env`:

```env
# Strong random password for PostgreSQL
# Generate: openssl rand -base64 32
POSTGRES_PASSWORD=YourStrongPassword123!

# Long random string for JWT signing
# Generate: openssl rand -base64 64
SESSION_SECRET=replace_with_very_long_random_secret

# ⚠️  Required for password-reset emails to work correctly.
# Set this to the public HTTPS URL of your SYNTRA instance (no trailing slash).
# Without it, password-reset links in emails will point to localhost and not work.
APP_BASE_URL=https://app.yourdomain.com

# Contact form SMTP (optional — only needed if the landing-page contact form is used)
# Note: per-company SMTP for staff emails is configured inside the app by each
# company admin under Settings → Email, not here.
CONTACT_SMTP_HOST=mail.cyberslide.net
CONTACT_SMTP_PORT=587
CONTACT_SMTP_USER=support@madeat2am.in
CONTACT_SMTP_PASS=your_smtp_password
CONTACT_EMAIL_TO=chris@madeat2am.in
CONTACT_EMAIL_FROM=SYNTRA Enquiries <support@madeat2am.in>
```

> **Security:** `.env` contains secrets — never commit it to git.  
> The `.gitignore` already excludes it.

---

## 5. First-Time Database Migration

Before starting the app, create the database schema:

```bash
# Run the migration container (starts postgres automatically, exits after completing)
docker compose run --rm migrate
```

This runs `drizzle-kit push` inside a temporary container, which creates all tables and indexes in PostgreSQL.

> You only need to do this **once** on first deploy. Run it again any time the schema changes (see [Updating the Application](#10-updating-the-application)).

---

## 6. Start the Application

```bash
# Build all images and start in the background
docker compose up -d --build

# Verify all containers are running
docker compose ps
```

You should see three running containers:

| Container | Status | Description |
|-----------|--------|-------------|
| `syntra_postgres` | Up (healthy) | PostgreSQL database |
| `syntra_api` | Up (healthy) | Express API server |
| `syntra_web` | Up | Nginx + React SPA |

The app will be accessible at **http://your-server-ip**.

---

## 7. Create the First Platform Admin

SYNTRA has a `platform_admin` role — the operator account that can create and manage companies. There is no sign-up flow for this role; it must be created directly in the database.

```bash
# Open a PostgreSQL shell inside the running container
docker compose exec postgres psql -U syntra -d syntra
```

Then run the following SQL (replace the values in quotes):

```sql
-- Generate a bcrypt hash for your chosen password first (see below), then insert:
INSERT INTO users (email, name, password_hash, role, status, must_change_password)
VALUES (
  'admin@yourdomain.com',
  'Platform Admin',
  '$2b$12$REPLACE_WITH_BCRYPT_HASH',
  'platform_admin',
  'active',
  false
);
```

**To generate the bcrypt password hash**, run this on your server (outside psql):

```bash
docker compose exec api node -e "
  const bcrypt = require('./node_modules/bcryptjs');
  bcrypt.hash('YourChosenPassword', 12).then(h => console.log(h));
"
```

Copy the output hash into the SQL above, then run the INSERT. Exit psql with `\q`.

> **After first login**, the platform admin can create companies via the `/platform` section of the app, which provisions an admin user for each company with a temporary password.

---

## 8. Set Up SSL with a Free Certificate (Caddy)

For HTTPS, use Caddy as a reverse proxy. It handles SSL certificates automatically via Let's Encrypt.

### Install Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

### Configure Caddy

Edit `/etc/caddy/Caddyfile`:

```caddyfile
app.yourdomain.com {
    reverse_proxy localhost:80
}
```

Replace `app.yourdomain.com` with your actual domain. Make sure your domain's DNS A record points to your server IP.

```bash
# Reload Caddy to apply the config and fetch the SSL cert
sudo systemctl reload caddy
```

Caddy will automatically:
- Obtain a free Let's Encrypt TLS certificate
- Renew it before it expires
- Redirect HTTP → HTTPS

Your app will now be accessible at **https://app.yourdomain.com**.

> **After setting up SSL**, update `APP_BASE_URL` in `.env` to your `https://` domain and restart the API:
> ```bash
> docker compose up -d api
> ```

---

## 9. Useful Commands

```bash
# View live logs for all services
docker compose logs -f

# View logs for a specific service
docker compose logs -f api
docker compose logs -f web

# Restart all services
docker compose restart

# Restart just the API
docker compose restart api

# Stop everything
docker compose down

# Stop and remove volumes (⚠️  DELETES ALL DATABASE DATA — use with care)
docker compose down -v

# Open a shell inside the API container
docker compose exec api sh

# Open a PostgreSQL shell
docker compose exec postgres psql -U syntra -d syntra
```

---

## 10. Updating the Application

When you push new code to your repository:

```bash
cd /opt/syntra

# Pull latest code
git pull

# Rebuild images and restart all services
# (Docker layer caching makes unchanged services fast)
docker compose up -d --build
```

### If the database schema changed

Any time files under `lib/db/src/schema/` change, run the migration after pulling:

```bash
# Rebuild the migrate image, then run it
docker compose build migrate
docker compose run --rm migrate
```

> Running migrations when nothing changed is safe — `drizzle-kit push` is idempotent.

---

## 11. Troubleshooting

### App shows a blank page
- Check web container logs: `docker compose logs web`
- Confirm the API is healthy: `docker compose ps`
- Test the API directly: `curl http://localhost:8080/api/healthz`

### Database connection errors
- Check postgres is running: `docker compose ps postgres`
- Verify `POSTGRES_PASSWORD` in `.env` matches what postgres was started with
- On a fresh server, wait ~15 seconds for postgres to finish initializing

### Password-reset emails not arriving
- Confirm `APP_BASE_URL` in `.env` is set to your public HTTPS URL
- Per-company SMTP (for staff password resets and invitations) is configured by each company admin inside the app under **Settings → Email**. The contact form SMTP in `.env` is separate and only used for landing-page enquiries.
- Check API logs for SMTP errors: `docker compose logs api | grep -i smtp`

### Contact form emails not sending
- Verify `CONTACT_SMTP_*` credentials in `.env`
- Test connectivity:
  ```bash
  docker compose exec api node -e "
    const n = require('./node_modules/nodemailer');
    n.createTransport({
      host: process.env.CONTACT_SMTP_HOST,
      port: Number(process.env.CONTACT_SMTP_PORT),
      auth: { user: process.env.CONTACT_SMTP_USER, pass: process.env.CONTACT_SMTP_PASS }
    }).verify().then(() => console.log('SMTP OK')).catch(console.error);
  "
  ```

### SMTP TLS certificate errors (self-signed cert)
- Add `SMTP_REJECT_UNAUTHORIZED=false` to `.env` and restart the API
- Only use this if your SMTP provider uses a self-signed certificate

### Port 80 already in use
- Another process is using port 80: `sudo lsof -i :80`
- Stop it, or change the port mapping in `docker-compose.yml`: `"8080:80"`

### Out of disk space
```bash
# Remove unused Docker images and containers
docker system prune -a

# Check disk usage
df -h
du -sh /var/lib/docker/volumes/
```

---

## 12. Architecture Overview

```
Internet
   │
   ▼
[Caddy] ── HTTPS 443 → HTTP 80 ──────────────────────────────┐
                                                              │
                                                              ▼
                                                    ┌─────────────────┐
                                                    │  syntra_web      │
                                                    │  nginx:80        │
                                                    │  (React SPA)     │
                                                    └────────┬────────┘
                                                             │ /api/*
                                                             ▼
                                                    ┌─────────────────┐
                                                    │  syntra_api      │
                                                    │  node:8080       │
                                                    │  (Express API)   │
                                                    └────────┬────────┘
                                                             │
                                                             ▼
                                                    ┌─────────────────┐
                                                    │  syntra_postgres │
                                                    │  postgres:5432   │
                                                    │  (Database)      │
                                                    └─────────────────┘
```

### What each piece does

| Component | Technology | Purpose |
|-----------|-----------|---------|
| `syntra_web` | Nginx + React | Serves the frontend SPA; proxies `/api/*` to the API |
| `syntra_api` | Node.js + Express 5 | Business logic, JWT auth, database access |
| `syntra_postgres` | PostgreSQL 16 | Persists all application data |
| Caddy | Caddy v2 | Terminates HTTPS, auto-renews Let's Encrypt certs |

### Database tables

| Table | Purpose |
|-------|---------|
| `companies` | Tenant records — name, plan, timezone, per-company SMTP config |
| `users` | All users across all roles (platform_admin, admin, manager, employee) |
| `workplaces` | Company locations with GPS coordinates and geofence radius |
| `shifts` | Scheduled shifts (draft → published, assigned or open) |
| `shift_presets` | Reusable time templates for faster shift creation |
| `availability` | Employee weekly availability submissions |
| `leave_requests` | Annual/sick leave requests and approval status |
| `time_logs` | Clock-in/out records with GPS validation |
| `invitations` | Token-based email invitations for onboarding staff |

### Data persistence

PostgreSQL data is stored in a named Docker volume (`postgres_data`). This persists across container restarts and updates. **Back up this volume regularly.**

### Backup the database

```bash
# Create a backup
docker compose exec postgres pg_dump -U syntra syntra > syntra_backup_$(date +%Y%m%d).sql

# Restore from a backup
cat syntra_backup_20260708.sql | docker compose exec -T postgres psql -U syntra -d syntra
```

### Per-company SMTP vs platform SMTP

SYNTRA uses **two distinct SMTP configurations**:

| SMTP | Where configured | Used for |
|------|-----------------|----------|
| **Platform SMTP** | `.env` (`CONTACT_SMTP_*`) | Landing-page contact form enquiries only |
| **Company SMTP** | App UI — Settings → Email (stored in DB per company) | Staff invitations, password reset emails |

Company admins configure their own SMTP server inside the app. Until they do, invitation and password-reset emails will not be sent even if the platform SMTP is configured.

---

*SYNTRA Workforce Management Platform — For support, contact chris@madeat2am.in*
