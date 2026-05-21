# PowerGold Bundle Build Script
#
# This script builds a production release bundle from the repository.
# Run it from the repository root.

param(
    [string]$Version = "1.0.0",
    [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path "$PSScriptRoot\..\..\"
$DeploymentDir = Join-Path $RepoRoot "deployment"

if ($OutputDir) {
    $StagingDir = $OutputDir
} else {
    $StagingDir = Join-Path $RepoRoot ".build" "powergold-bundle-v$Version"
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PowerGold Bundle Builder" -ForegroundColor Cyan
Write-Host "  Version: $Version" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if (Test-Path $StagingDir) {
    Write-Host "Cleaning staging directory: $StagingDir" -ForegroundColor Gray
    Remove-Item -Recurse -Force $StagingDir
}

$dirs = @(
    "$StagingDir", "$StagingDir\compose", "$StagingDir\env",
    "$StagingDir\infra\caddy", "$StagingDir\certificates",
    "$StagingDir\images", "$StagingDir\images\database", "$StagingDir\images\utils",
    "$StagingDir\images\system", "$StagingDir\scripts", "$StagingDir\backups",
    "$StagingDir\logs"
)
foreach ($d in $dirs) {
    New-Item -ItemType Directory -Force -Path $d | Out-Null
}

Write-Host "[1/9] Building backend image..." -ForegroundColor Cyan
docker build --no-cache -f "$RepoRoot\backend\Dockerfile.backend" -t "powergold-backend:$Version" "$RepoRoot\backend"
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: Backend build failed." -ForegroundColor Red; exit 1 }
docker tag "powergold-backend:$Version" "powergold-bootstrap:$Version"
Write-Host "  powergold-backend:$Version" -ForegroundColor Green
Write-Host "  powergold-bootstrap:$Version" -ForegroundColor Green

Write-Host "[2/9] Building frontend image..." -ForegroundColor Cyan
docker build --no-cache -f "$RepoRoot\frontend\Dockerfile.frontend" -t "powergold-frontend:$Version" `
    --build-arg "NEXT_PUBLIC_API_URL=http://backend:8000" "$RepoRoot\frontend"
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: Frontend build failed." -ForegroundColor Red; exit 1 }
Write-Host "  powergold-frontend:$Version" -ForegroundColor Green

Write-Host "[3/9] Pulling third-party images..." -ForegroundColor Cyan
docker pull postgres:15-alpine
docker pull adminer:4.8.1-standalone
docker pull caddy:2.8-alpine
docker pull alpine:3.21
Write-Host "  Third-party images pulled." -ForegroundColor Green

Write-Host "[4/9] Exporting images to tar archives..." -ForegroundColor Cyan
docker save -o "$StagingDir\images\database\postgres-15-alpine.tar" postgres:15-alpine
docker save -o "$StagingDir\images\utils\adminer-4.8.1-standalone.tar" adminer:4.8.1-standalone
docker save -o "$StagingDir\images\utils\caddy-2.8-alpine.tar" caddy:2.8-alpine
docker save -o "$StagingDir\images\utils\alpine-3.21.tar" alpine:3.21
docker save -o "$StagingDir\images\system\powergold-bootstrap-$Version.tar" "powergold-bootstrap:$Version"
docker save -o "$StagingDir\images\system\powergold-backend-$Version.tar" "powergold-backend:$Version"
docker save -o "$StagingDir\images\system\powergold-frontend-$Version.tar" "powergold-frontend:$Version"
Write-Host "  Images exported." -ForegroundColor Green

Write-Host "[5/9] Copying compose files..." -ForegroundColor Cyan
Copy-Item "$DeploymentDir\compose\docker-compose.yml" "$StagingDir\compose\docker-compose.yml"
Copy-Item "$DeploymentDir\compose\docker-compose.deploy.yml" "$StagingDir\compose\docker-compose.deploy.yml"

Write-Host "[6/9] Copying env templates..." -ForegroundColor Cyan
Copy-Item "$DeploymentDir\env\.env.local.template" "$StagingDir\env\.env.local.template"
Copy-Item "$DeploymentDir\env\.env.deploy.template" "$StagingDir\env\.env.deploy.template"

Write-Host "[7/9] Copying infrastructure config..." -ForegroundColor Cyan
Copy-Item "$DeploymentDir\infra\caddy\Caddyfile" "$StagingDir\infra\caddy\Caddyfile"

Write-Host "[8/9] Copying scripts and documentation..." -ForegroundColor Cyan
Copy-Item "$DeploymentDir\scripts\*.ps1" "$StagingDir\scripts\"
if (Test-Path "$StagingDir\scripts\build-bundle.ps1") {
    Remove-Item "$StagingDir\scripts\build-bundle.ps1"
}
Copy-Item "$DeploymentDir\powergold.bat" "$StagingDir\powergold.bat"
Copy-Item "$DeploymentDir\README_CLIENT.md" "$StagingDir\README_CLIENT.md"
Copy-Item "$DeploymentDir\UPDATE_PROCESS.md" "$StagingDir\UPDATE_PROCESS.md"

$VersionContent = "$Version`n"
Set-Content -Path "$StagingDir\VERSION" -Value $VersionContent

$buildDate = Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz"
$metadata = @"
# PowerGold Bundle Metadata
VERSION=$Version
BUILD_DATE=$buildDate
COMPATIBILITY=Windows 10+, Windows Server 2019+
REQUIRES=Docker Desktop
"@
Set-Content -Path "$StagingDir\BUNDLE_INFO.txt" -Value $metadata

Write-Host "[9/9] Creating zip archive..." -ForegroundColor Cyan
$zipPath = Join-Path $RepoRoot ".build" "powergold-bundle-v$Version.zip"
New-Item -ItemType Directory -Force -Path (Split-Path $zipPath) | Out-Null
if (Test-Path $zipPath) { Remove-Item $zipPath }

Compress-Archive -Path "$StagingDir\*" -DestinationPath $zipPath -CompressionLevel Optimal

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Bundle Built!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Version:  $Version" -ForegroundColor White
Write-Host "Staging:  $StagingDir" -ForegroundColor White
Write-Host "Zip:      $zipPath" -ForegroundColor White
Write-Host ""
Write-Host "Smoke-test the bundle by extracting the zip on a Windows machine"
Write-Host "and running: .\scripts\install.ps1"
Write-Host ""
Write-Host "Image tars included:"
Get-ChildItem "$StagingDir\images" -Filter "*.tar" -Recurse | ForEach-Object {
    $sizeMB = [math]::Round($_.Length / 1MB, 1)
    Write-Host "  $($_.Name) ($sizeMB MB)"
}
