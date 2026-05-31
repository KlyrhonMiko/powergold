# PowerGold - Client Operator Guide

## Prerequisites

- **Windows 10/11** or **Windows Server 2019+**
- **Docker Desktop** with the Compose plugin
  - Download: https://www.docker.com/products/docker-desktop/
  - After install, verify by opening PowerShell and running: `docker compose version`
- **8 GB RAM** minimum (16 GB recommended)
- **10 GB free disk space** for images, database, and uploads
- A stable LAN IPv4 address is recommended, but not strictly required. If the machine IP changes, the startup flow will refresh the LAN certificate and CORS settings automatically.

## Quick Start

1. Before extracting the zip, right-click the downloaded zip file, open **Properties**, and if you see an **Unblock** checkbox or button, enable it and click **Apply**.
2. Extract the zip file to a folder (e.g., `C:\powergold`).
3. If Windows 11 Smart App Control or Mark-of-the-Web still blocks the launcher, open **PowerShell as Administrator** in the extracted folder and run:
   ```powershell
   Get-ChildItem -Recurse | Unblock-File
   ```
4. Navigate to the extracted folder:
   ```powershell
   cd C:\powergold
   ```
5. Run the launcher:
   ```powershell
   .\powergold.bat
   ```
   The bundle also includes `Powergold Enterprises Logo.png` beside the launcher for branding/reference.
6. Choose **Install** from the menu.
   This generates fresh secrets on the client machine, creates local certificates, and loads Docker images.
7. Run the launcher again and choose **Start**.
8. Open your browser and navigate to the URL printed at the end of startup.

> On first visit, the browser will show a security warning because the certificate is self-signed. Click **Advanced** then **Proceed** to continue. The connection is still encrypted.

## Default Login

- **Username:** `admin`
- **Password:** Printed during install (also stored in `env\.env.deploy` as `INITIAL_ADMIN_PASSWORD`)

**Change the admin password immediately after first login.**

## Daily Operations

| Task | Command |
|------|---------|
| Open launcher menu | `.\powergold.bat` |
| Start PowerGold | `.\powergold.bat start` |
| Stop PowerGold (DB stays up) | `.\powergold.bat stop` |
| Stop everything (including DB) | `.\powergold.bat stop-all` |
| Restart app only | `.\powergold.bat restart` |
| Check service status | `.\powergold.bat status` |
| View logs | `.\powergold.bat logs` |
| Health check | `.\powergold.bat verify` |

## Backup And Restore

### Create A Backup

```powershell
.\powergold.bat backup
```

Backups are stored in the `backups\` folder with a timestamp. Copy these files to a safe location.

Backups created from the admin UI and scheduled backups also use this same `backups\` folder.

### Restore From A Backup

```powershell
.\powergold.bat restore
```

> Restoring overwrites your current database. The script will ask you to confirm.

## Updating PowerGold

When you receive an update from the PowerGold team:

1. Extract the update package over the existing PowerGold folder.
2. Let it overwrite `images\database\`, `images\utils\`, `images\system\`, `scripts\`, `compose\`, `infra\`, `README_CLIENT.md`, and `VERSION`.
3. Keep your existing `env\`, `certificates\`, and `backups\` folders.
4. Run the update script:
   ```powershell
   .\powergold.bat update
   ```
5. The script will offer to back up your database first (recommended).

Updates **do not** delete your database or uploaded files.
The update process uses the bundle version shipped with the package so new scripts, compose changes, and images stay in sync.
The `images\system\` folder holds the PowerGold application images, while `images\database\` and `images\utils\` hold shared infrastructure images.

The shipped bundle does not include generated `env` secrets or generated certificates. Those are created locally when you run **Install** for the first time.
The shipped bundle includes `CHANGELOG.md` so operators can see the release notes that correspond to the delivered bundle.

For the full deployment update policy used by the PowerGold team, see `UPDATE_PROCESS.md`.

## Files You Should Not Edit

Do not modify these files unless instructed by the PowerGold team:

- `compose\docker-compose.yml`
- `compose\docker-compose.deploy.yml`
- `infra\caddy\Caddyfile`
- `certificates\localhost.pem`
- `certificates\localhost-key.pem`
- `env\.env.local.template`
- `env\.env.deploy.template`
- `VERSION`
- All files in `scripts\`

## Files You May Edit

- `env\.env.local` - database password, timezone
- `env\.env.deploy` - SMTP settings, admin username, timezone

After editing env files, restart the application stack:
```powershell
.\powergold.bat restart
```

## Finding The Machine's LAN IP

In PowerShell:
```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -ne "127.0.0.1" -and $_.IPAddress -notmatch "^169\." } | Select-Object IPAddress, InterfaceAlias
```

## Firewall

Ensure Windows Firewall allows inbound connections on ports **80** and **443** (HTTP/HTTPS). Docker Desktop should add these rules automatically, but if other machines on the network cannot reach the application, check:

1. Open **Windows Defender Firewall with Advanced Security**
2. Verify **Inbound Rules** allow Docker Desktop or port 443

## Troubleshooting

| Symptom | Action |
|---------|--------|
| "Docker is not installed" error | Install Docker Desktop and restart |
| Install hangs at "Loading Docker images" | Docker engine may not be fully started. Wait for the Docker Desktop tray icon to show "Engine running" and retry. If it persists, restart Docker Desktop and run `docker info` in PowerShell to confirm readiness. |
| `powergold.bat` is blocked by Windows 11 | Right-click the zip and use **Unblock** before extraction, or run `Get-ChildItem -Recurse \| Unblock-File` in PowerShell after extraction |
| Services won't start | Run `.\powergold.bat logs` to see error details |
| Database won't connect | Ensure the database stack is running: `.\powergold.bat status` |
| Certificate warning in browser | Click Advanced then Proceed (self-signed cert is normal) |
| Cannot access from other devices | Check firewall rules for port 443 |
| Bootstrap fails | Check `DATABASE_URL` in `env\.env.deploy` matches `POSTGRES_PASSWORD` |
| After machine IP changes | Restart the app with `.\powergold.bat restart`; the launcher will refresh the LAN certificate and access settings automatically |
| Update finishes but app still looks old | Run `.\powergold.bat status` and confirm the bundle version in `VERSION` matches the update package |

## Adminer (Database Management)

Adminer is available at `http://localhost:8080` from the host machine only (not accessible from other devices on the network).

- **System:** PostgreSQL
- **Server:** powergold-db
- **Username:** postgres
- **Password:** (from `env\.env.local`)
- **Database:** powergold
