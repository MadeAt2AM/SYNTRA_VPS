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
7. [Set Up SSL with a Free Certificate (Caddy)](#7-set-up-ssl-with-a-free-certificate-caddy)
8. [Useful Commands](#8-useful-commands)
9. [Updating the Application](#9-updating-the-application)
10. [Troubleshooting](#10-troubleshooting)
11. [Architecture Overview](#11-architecture-overview)

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

# Install Docker (official script)
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
POSTGRES_PASSWORD=YourStrongPassword123!

# Long random string for JWT signing
# Generate one: openssl rand -base64 64
SESSION_SECRET=replace_with_very_long_random_secret

# Contact form SMTP (emails enquiries to chris@madeat2am.in)
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
# Run the migration container (exits after completing)
docker compose run --rm migrate
```

This runs `drizzle-kit push` inside a temporary container, which creates all tables and indexes in PostgreSQL.

> You only need to do this **once** on first deploy (and again if the schema changes).

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
| `syntra_postgres` | Up | PostgreSQL database |
| `syntra_api` | Up (healthy) | Express API server |
| `syntra_web` | Up (healthy) | Nginx + React SPA |

The app will be accessible at **http://your-server-ip**.

---

## 7. Set Up SSL with a Free Certificate (Caddy)

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
your-domain.com {
    reverse_proxy localhost:80
}
```

Replace `your-domain.com` with your actual domain name. Make sure your domain's DNS A record points to your server IP.

```bash
# Reload Caddy to apply the config and fetch the SSL cert
sudo systemctl reload caddy
```

Caddy will automatically:
- Obtain a free Let's Encrypt TLS certificate
- Renew it before it expires
- Redirect HTTP → HTTPS

Your app will now be accessible at **https://your-domain.com**.

---

## 8. Useful Commands

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

# Stop and remove volumes (⚠️ DELETES DATABASE DATA)
docker compose down -v

# Open a shell inside the API container
docker compose exec api sh

# Open a PostgreSQL shell
docker compose exec postgres psql -U syntra -d syntra
```

---

## 9. Updating the Application

When you push new code to your repository:

```bash
cd /opt/syntra

# Pull latest code
git pull

# Rebuild and restart all services (cached layers make this fast when unchanged)
docker compose up -d --build

# If the database schema changed (new columns, tables, etc.), rebuild and run
# the migration image explicitly — the "migration" profile is not started by default
docker compose build migrate
docker compose run --rm --profile migration migrate
```

> **When do you need to run migrations?**  
> Any time `lib/db/src/schema/` files change. If you are unsure, running migrations when they are not needed is safe — drizzle-kit push is idempotent.

---

## 10. Troubleshooting

### App shows a blank page
- Check the web container logs: `docker compose logs web`
- Make sure the `api` service is healthy: `docker compose ps`
- Test the API directly: `curl http://localhost:8080/api/healthz`

### Database connection errors
- Check postgres is running: `docker compose ps postgres`
- Verify `POSTGRES_PASSWORD` in `.env` is set and matches what postgres was started with
- On a fresh server, wait ~15 seconds for postgres to finish initializing before the API connects

### Email not sending from contact form
- Verify SMTP credentials in `.env`
- Test with: `docker compose exec api node -e "const n=require('nodemailer'); n.createTransport({host:'mail.cyberslide.net',port:587,auth:{user:'support@madeat2am.in',pass:'${CONTACT_SMTP_PASS}'}}).verify().then(()=>console.log('OK')).catch(console.error)"`
- Check API logs: `docker compose logs api | grep Contact`

### Port 80 already in use
- Another process is using port 80. Find it: `sudo lsof -i :80`
- Stop it or change the SYNTRA port in `docker-compose.yml`: `"8080:80"`

### Out of disk space
```bash
# Remove unused Docker images and containers
docker system prune -a

# Check disk usage
df -h
du -sh /var/lib/docker/volumes/
```

---

## 11. Architecture Overview

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
| `syntra_web` | Nginx + React | Serves the frontend SPA and proxies `/api/*` to the API |
| `syntra_api` | Node.js + Express | Handles all business logic, auth, and database access |
| `syntra_postgres` | PostgreSQL 16 | Persists all company, user, shift, leave, and time data |
| Caddy | Caddy | Terminates HTTPS, renews Let's Encrypt certs automatically |

### Data persistence

PostgreSQL data is stored in a named Docker volume (`postgres_data`). This persists across container restarts and updates. **Back up this volume** regularly.

### Backup the database

```bash
# Create a backup
docker compose exec postgres pg_dump -U syntra syntra > syntra_backup_$(date +%Y%m%d).sql

# Restore from a backup
cat syntra_backup_20260708.sql | docker compose exec -T postgres psql -U syntra -d syntra
```

---

*Generated for SYNTRA Workforce Management Platform. For support, contact chris@madeat2am.in*
