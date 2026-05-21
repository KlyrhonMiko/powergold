#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
ENV_DIR="$SCRIPT_DIR/env"
CERT_DIR="$SCRIPT_DIR/certificates"
IMAGES_DIR="$SCRIPT_DIR/images"
DATABASE_IMAGES_DIR="$IMAGES_DIR/database"
UTILS_IMAGES_DIR="$IMAGES_DIR/utils"
SYSTEM_IMAGES_DIR="$IMAGES_DIR/system"
BACKUPS_DIR="$SCRIPT_DIR/backups"
LOGS_DIR="$SCRIPT_DIR/logs"
DB_COMPOSE_FILE="$SCRIPT_DIR/compose/docker-compose.yml"
APP_COMPOSE_FILE="$SCRIPT_DIR/compose/docker-compose.deploy.yml"
ENV_LOCAL="$ENV_DIR/.env.local"
ENV_DEPLOY="$ENV_DIR/.env.deploy"
VERSION_FILE="$SCRIPT_DIR/VERSION"

get_version() {
  if [[ -f "$VERSION_FILE" ]]; then
    tr -d '[:space:]' < "$VERSION_FILE"
  else
    printf '1.0.0'
  fi
}

export_powergold_version() {
  export POWERGOLD_VERSION
  POWERGOLD_VERSION="$(get_version)"
}

db_compose() {
  export_powergold_version
  docker compose --env-file "$ENV_LOCAL" -f "$DB_COMPOSE_FILE" "$@"
}

app_compose() {
  export_powergold_version
  docker compose --env-file "$ENV_DEPLOY" -f "$APP_COMPOSE_FILE" "$@"
}

usage() {
  cat <<'EOF'
Usage:
  ./powergold.sh [command] [args]

Commands:
  install                 Generate env files and certs, validate bundle
  build-images [version]  Build app images and export all bundle image tars
  start                   Start DB + app stack from deployment bundle
  stop                    Stop app stack only
  stop-all                Stop app + DB stacks
  status                  Show compose status
  logs [service]          Show logs for all services or one service
  verify [host]           Verify HTTPS/backend health (default: localhost)
  cert                    Generate certificates if missing
  cert-force              Regenerate certificates
  env                     Generate env files if missing
  env-force               Regenerate env files
  package [version]       Zip deployment directory for shipping
  help                    Show this help

Run without arguments to open the menu.
EOF
}

need_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

ensure_dirs() {
  mkdir -p \
    "$ENV_DIR" \
    "$CERT_DIR" \
    "$IMAGES_DIR" \
    "$DATABASE_IMAGES_DIR" \
    "$UTILS_IMAGES_DIR" \
    "$SYSTEM_IMAGES_DIR" \
    "$BACKUPS_DIR" \
    "$LOGS_DIR"
}

random_string() {
  local length="$1"
  local result
  result="$(set +o pipefail; tr -dc 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789' </dev/urandom | head -c "$length")"
  printf '%s' "$result"
}

random_hex() {
  local bytes="$1"
  od -An -N "$bytes" -tx1 /dev/urandom | tr -d ' \n'
}

get_lan_ip() {
  local lan_ip
  lan_ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '/src/ {for (i=1; i<=NF; i++) if ($i=="src") {print $(i+1); exit}}')"
  if [[ -z "$lan_ip" || "$lan_ip" =~ ^169\.254\. || "$lan_ip" == "127.0.0.1" ]]; then
    lan_ip="$(ip -4 addr show scope global 2>/dev/null | awk '/inet / {sub("/.*", "", $2); if ($2 !~ /^169\.254\./ && $2 != "127.0.0.1") {print $2; exit}}')"
  fi
  printf '%s' "$lan_ip"
}

generate_env_files() {
  local force="${1:-0}"
  ensure_dirs

  if [[ -f "$ENV_LOCAL" && -f "$ENV_DEPLOY" && "$force" != "1" ]]; then
    printf 'Environment files already exist.\n'
    return 0
  fi

  [[ -f "$ENV_DIR/.env.local.template" ]] || { printf 'Missing env template: %s\n' "$ENV_DIR/.env.local.template" >&2; exit 1; }
  [[ -f "$ENV_DIR/.env.deploy.template" ]] || { printf 'Missing env template: %s\n' "$ENV_DIR/.env.deploy.template" >&2; exit 1; }

  local pg_password secret_key admin_password lan_ip cors_origins version
  pg_password="$(random_string 24)"
  secret_key="$(random_hex 32)"
  admin_password="$(random_string 16)"
  lan_ip="$(get_lan_ip)"
  if [[ -n "$lan_ip" ]]; then
    cors_origins="https://localhost,https://127.0.0.1,https://$lan_ip"
  else
    cors_origins="https://localhost,https://127.0.0.1"
  fi
  version="$(get_version)"

  sed "s/__PG_PASSWORD__/$pg_password/g" "$ENV_DIR/.env.local.template" > "$ENV_LOCAL"
  sed \
    -e "s/__PG_PASSWORD__/$pg_password/g" \
    -e "s/__SECRET_KEY__/$secret_key/g" \
    -e "s/__ADMIN_PASSWORD__/$admin_password/g" \
    -e "s#__CORS_ORIGINS__#$cors_origins#g" \
    "$ENV_DIR/.env.deploy.template" > "$ENV_DEPLOY"

  printf 'Generated env files:\n'
  printf '  %s\n' "$ENV_LOCAL"
  printf '  %s\n' "$ENV_DEPLOY"
  printf 'Initial admin password: %s\n' "$admin_password"
  printf 'Bundle version: %s\n' "$version"
}

generate_certificates() {
  local force="${1:-0}"
  ensure_dirs

  if [[ "$force" != "1" && -f "$CERT_DIR/localhost.pem" && -f "$CERT_DIR/localhost-key.pem" ]]; then
    printf 'Certificates already exist.\n'
    return 0
  fi

  local lan_ip san
  lan_ip="$(get_lan_ip)"
  if [[ -z "$lan_ip" ]]; then
    printf 'Could not determine a usable LAN IPv4 address.\n' >&2
    exit 1
  fi

  rm -f "$CERT_DIR/localhost.pem" "$CERT_DIR/localhost-key.pem"
  san="subjectAltName=DNS:localhost,IP:127.0.0.1,IP:$lan_ip"

  if command -v openssl >/dev/null 2>&1; then
    openssl req -x509 -newkey rsa:2048 \
      -keyout "$CERT_DIR/localhost-key.pem" \
      -out "$CERT_DIR/localhost.pem" \
      -days 3650 -nodes \
      -subj "/CN=localhost" \
      -addext "$san"
  else
    docker run --rm -v "$CERT_DIR:/certs" alpine:3.21 sh -lc \
      "apk add --no-cache openssl >/dev/null 2>&1 && openssl req -x509 -newkey rsa:2048 -keyout /certs/localhost-key.pem -out /certs/localhost.pem -days 3650 -nodes -subj '/CN=localhost' -addext '$san'"
  fi

  printf 'Generated certificates for localhost and %s\n' "$lan_ip"
}

validate_bundle() {
  export_powergold_version
  db_compose config >/dev/null
  app_compose config >/dev/null
}

expected_images() {
  local version
  version="$(get_version)"
  cat <<EOF
postgres:15-alpine
adminer:4.8.1-standalone
caddy:2.8-alpine
powergold-bootstrap:$version
powergold-backend:$version
powergold-frontend:$version
EOF
}

check_images_present() {
  local missing=0 image
  while IFS= read -r image; do
    [[ -n "$image" ]] || continue
    if ! docker image inspect "$image" >/dev/null 2>&1; then
      printf 'Missing image: %s\n' "$image" >&2
      missing=1
    fi
  done < <(expected_images)

  return "$missing"
}

load_images() {
  local loaded=0 tarfile fname

  printf 'Loading Docker images...\n'
  while IFS= read -r tarfile; do
    [[ -n "$tarfile" ]] || continue
    fname="${tarfile#$IMAGES_DIR/}"
    printf '  Loading: %s\n' "$fname"
    docker load -i "$tarfile" || {
      printf 'ERROR: Failed to load %s\n' "$fname" >&2
      exit 1
    }
    loaded=1
  done < <(find "$IMAGES_DIR" -type f -name '*.tar' | sort)

  if [[ "$loaded" -eq 0 ]]; then
    printf 'No image tars found in %s.\n' "$IMAGES_DIR" >&2
    exit 1
  fi
  printf 'Images ready.\n'
}

install_bundle() {
  need_command docker
  need_command ip
  ensure_dirs
  generate_env_files 0
  load_images
  generate_certificates 0
  validate_bundle
  printf 'Bundle install preparation complete.\n'
}

build_images() {
  need_command docker
  local version="${1:-$(get_version)}"
  local no_cache="${2:-}"
  ensure_dirs

  printf '%s\n' "$version" > "$VERSION_FILE"
  export POWERGOLD_VERSION="$version"

  local cache_flag=""
  [[ "$no_cache" == "--no-cache" ]] && cache_flag="--no-cache"

  printf '[1/4] Building backend image...\n'
  docker build $cache_flag -f "$REPO_ROOT/backend/Dockerfile.backend" -t "powergold-backend:$version" "$REPO_ROOT/backend"
  docker tag "powergold-backend:$version" "powergold-bootstrap:$version"

  printf '[2/4] Building frontend image...\n'
  docker build $cache_flag -f "$REPO_ROOT/frontend/Dockerfile.frontend" -t "powergold-frontend:$version" \
    --build-arg "NEXT_PUBLIC_API_URL=http://backend:8000" "$REPO_ROOT/frontend"

  printf '[3/4] Pulling third-party images...\n'
  docker pull postgres:15-alpine
  docker pull adminer:4.8.1-standalone
  docker pull caddy:2.8-alpine
  docker pull alpine:3.21

  printf '[4/4] Exporting images...\n'
  find "$IMAGES_DIR" -type f -name '*.tar' -delete
  docker save -o "$DATABASE_IMAGES_DIR/postgres-15-alpine.tar" postgres:15-alpine
  docker save -o "$UTILS_IMAGES_DIR/adminer-4.8.1-standalone.tar" adminer:4.8.1-standalone
  docker save -o "$UTILS_IMAGES_DIR/caddy-2.8-alpine.tar" caddy:2.8-alpine
  docker save -o "$UTILS_IMAGES_DIR/alpine-3.21.tar" alpine:3.21
  docker save -o "$SYSTEM_IMAGES_DIR/powergold-bootstrap-$version.tar" "powergold-bootstrap:$version"
  docker save -o "$SYSTEM_IMAGES_DIR/powergold-backend-$version.tar" "powergold-backend:$version"
  docker save -o "$SYSTEM_IMAGES_DIR/powergold-frontend-$version.tar" "powergold-frontend:$version"

  printf 'Images exported to %s\n' "$IMAGES_DIR"
}

start_bundle() {
  install_bundle
  check_images_present
  db_compose up -d --remove-orphans --wait
  app_compose up -d --remove-orphans --wait
  verify_bundle "${1:-localhost}"
  local lan_ip
  lan_ip="$(get_lan_ip)"
  printf '\nPowerGold is running.\n'
  [[ -n "$lan_ip" ]] && printf 'LAN URL: https://%s\n' "$lan_ip"
  printf 'Local URL: https://localhost\n'
}

stop_bundle() {
  app_compose down --remove-orphans
}

stop_all_bundle() {
  app_compose down --remove-orphans
  db_compose down --remove-orphans
}

status_bundle() {
  db_compose ps
  printf '\n'
  app_compose ps
}

logs_bundle() {
  local service="${1:-}"
  if [[ -n "$service" ]]; then
    case "$service" in
      postgres|adminer) db_compose logs --tail=200 "$service" ;;
      *) app_compose logs --tail=200 "$service" ;;
    esac
  else
    db_compose logs --tail=50 postgres adminer
    printf '\n'
    app_compose logs --tail=200
  fi
}

verify_bundle() {
  local host="${1:-localhost}"
  curl -ksSf "https://$host/api/health/live" >/dev/null
  curl -ksSfI "https://$host" >/dev/null
  printf 'Verification passed for https://%s\n' "$host"
}

package_bundle() {
  local version="${1:-$(get_version)}"
  local build_dir zip_path
  build_dir="$REPO_ROOT/.build"
  zip_path="$build_dir/powergold-deployment-v$version.zip"

  printf 'Refreshing deployment images for version %s...\n' "$version"
  build_images "$version"

  mkdir -p "$build_dir"
  rm -f "$zip_path"

  if command -v zip >/dev/null 2>&1; then
    (
      cd "$SCRIPT_DIR"
      zip -qr "$zip_path" . \
        -x 'env/.env.local' 'env/.env.deploy' 'certificates/*' 'backups/*' 'logs/*' 'scripts/build-bundle.ps1' 'powergold.sh'
    )
  elif command -v python3 >/dev/null 2>&1; then
    python3 - "$SCRIPT_DIR" "$zip_path" <<'PY'
import os
import sys
import zipfile

root = sys.argv[1]
zip_path = sys.argv[2]
excluded = {
    'env/.env.local',
    'env/.env.deploy',
    'scripts/build-bundle.ps1',
    'powergold.sh',
}
excluded_prefixes = (
    'certificates/',
    'backups/',
    'logs/',
)

with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    for current_root, _, files in os.walk(root):
        for name in files:
            abs_path = os.path.join(current_root, name)
            rel_path = os.path.relpath(abs_path, root)
            rel_path = rel_path.replace(os.sep, '/')
            if rel_path in excluded:
                continue
            if rel_path.startswith(excluded_prefixes):
                continue
            zf.write(abs_path, rel_path)
PY
  else
    printf 'Missing required command: zip or python3\n' >&2
    exit 1
  fi

  printf 'Created bundle: %s\n' "$zip_path"
}

menu() {
  while true; do
    clear
    cat <<'EOF'
========================================
  PowerGold Deployment Launcher
========================================

  1. Install / Prepare Bundle
  2. Build Images
  3. Start Bundle
  4. Stop App
  5. Stop App + DB
  6. Status
  7. Logs
  8. Verify
  9. Generate Env Files
  10. Generate Certificates
  11. Package Zip
  12. Exit

EOF
    read -rp "Choose an option: " choice
    case "$choice" in
      1) install_bundle ;;
      2) read -rp "Version [$(get_version)]: " version; build_images "${version:-$(get_version)}" ;;
      3) start_bundle ;;
      4) stop_bundle ;;
      5) stop_all_bundle ;;
      6) status_bundle ;;
      7) read -rp "Service (blank for all): " service; logs_bundle "$service" ;;
      8) read -rp "Host [localhost]: " host; verify_bundle "${host:-localhost}" ;;
      9) generate_env_files 0 ;;
      10) generate_certificates 0 ;;
      11) read -rp "Version [$(get_version)]: " version; package_bundle "${version:-$(get_version)}" ;;
      12) exit 0 ;;
      *) printf 'Invalid selection.\n' ;;
    esac
    printf '\nPress Enter to continue...'
    read -r _
  done
}

main() {
  case "${1:-}" in
    "") menu ;;
    help|-h|--help) usage ;;
    install) install_bundle ;;
    build-images) build_images "${2:-$(get_version)}" ;;
    start) start_bundle "${2:-localhost}" ;;
    stop) stop_bundle ;;
    stop-all) stop_all_bundle ;;
    status) status_bundle ;;
    logs) logs_bundle "${2:-}" ;;
    verify) verify_bundle "${2:-localhost}" ;;
    cert) generate_certificates 0 ;;
    cert-force) generate_certificates 1 ;;
    env) generate_env_files 0 ;;
    env-force) generate_env_files 1 ;;
    package) package_bundle "${2:-$(get_version)}" ;;
    *) usage; exit 1 ;;
  esac
}

main "$@"
