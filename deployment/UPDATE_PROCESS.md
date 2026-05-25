# PowerGold Deployment Update Process

## Goal

Keep client updates simple while allowing the deployment bundle to evolve as the system gains new features.

The standard update unit is a **full deployment bundle release**, not just a set of replacement image tar files.

## Update Rule

Each release should ship a complete, versioned deployment bundle containing:

1. `powergold.bat`
2. `README_CLIENT.md`
3. `CHANGELOG.md`
4. `VERSION`
5. `compose/`
6. `scripts/`
7. `images/database/*.tar`
8. `images/utils/*.tar`
9. `images/system/*.tar`
10. `env/.env.local.template`
11. `env/.env.deploy.template`
12. `infra/caddy/Caddyfile`

This keeps deployment behavior, health checks, startup flow, and images in sync.

## What The Client Keeps

These files and folders are local runtime state and must be preserved during updates:

1. `env/.env.local`
2. `env/.env.deploy`
3. `certificates/`
4. `backups/`

These are generated or maintained on the client machine and must not be replaced by a shipped bundle.

## What Gets Replaced During An Update

These bundle files should be overwritten by the new release:

1. `images/`
2. `scripts/`
3. `compose/`
4. `infra/`
5. `README_CLIENT.md`
6. `CHANGELOG.md`
7. `VERSION`
8. `powergold.bat`

Within `images/`, the current standard layout is:

1. `images/database/` for database images such as Postgres
2. `images/utils/` for utility and infrastructure images such as Caddy, Alpine, and Adminer
3. `images/system/` for PowerGold application images such as bootstrap, backend, and frontend

## Recommended Client Update Flow

1. Receive the new bundle zip from the PowerGold team.
2. Extract it over the existing PowerGold folder.
3. Allow overwrite of shipped bundle files.
4. Keep local runtime files:
   - `env/.env.local`
   - `env/.env.deploy`
   - `certificates/`
   - `backups/`
5. Run:

```powershell
.\powergold.bat update
```

6. Accept the backup prompt unless there is a specific reason to skip it.
7. Verify the application opens successfully after update.

## Why We Do Full-Bundle Updates

Image-only updates are not the default because future releases may also require changes to:

1. Compose service definitions
2. Health checks
3. Update scripts
4. Startup ordering
5. Reverse proxy configuration
6. New environment templates

If only images are updated, the deployment folder can drift and the app can start with mismatched infrastructure logic.

## When Image-Only Updates Are Acceptable

Image-only replacement can be acceptable only if all of the following are true:

1. No compose files changed
2. No scripts changed
3. No Caddy config changed
4. No new env template fields are required
5. The release is strictly application-code-only

Even then, the safer approach is still to ship the full bundle.

## Internal Release Process For Our Team

For each release:

1. Update the app version in `deployment/VERSION`.
2. Build the app images for that version.
3. Export the image archives into `deployment/images/database/`, `deployment/images/utils/`, and `deployment/images/system/`.
4. Ensure deployment scripts and compose files reflect the intended runtime behavior.
5. Package the clean deployment bundle.
6. Smoke-test the bundle from a fresh extracted folder before shipping it.

## Rollback Strategy

If an update fails:

1. Keep the database backup created before update.
2. Reapply the previous known-good deployment bundle.
3. Run the update or start flow from the restored previous bundle.
4. Restore the database only if the failed update materially changed data and rollback requires it.

Rollback should normally use:

1. the previous deployment bundle zip
2. the backup created immediately before update

## Release Validation Checklist

Before shipping a new bundle:

1. `images/database/`, `images/utils/`, and `images/system/` contain the expected image tar files.
2. `VERSION` matches the application image tar version.
3. The zip does not contain:
   - `env/.env.local`
   - `env/.env.deploy`
   - `certificates/*`
   - `backups/*`
4. The bundle starts successfully from a clean extracted folder.
5. `powergold.bat update` completes successfully against an older extracted bundle.

## Current Standard

The standard PowerGold deployment update model is:

1. **full bundle release**
2. **preserve local runtime state**
3. **run `powergold.bat update`**

That keeps the system scalable without making the client workflow complex.
