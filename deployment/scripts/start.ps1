param(
    [int]$StartupTimeout = 300,
    [switch]$Kiosk
)

$ErrorActionPreference = "Stop"
$CommonScript = Join-Path $PSScriptRoot "common.ps1"
. $CommonScript

$Context = Get-BundleContext -ScriptRoot $PSScriptRoot
$BundleRoot = $Context.BundleRoot
$ScriptDir = "$PSScriptRoot"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PowerGold Startup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$requiredFiles = @($Context.EnvLocal, $Context.EnvDeploy, $Context.DbComposeFile, $Context.AppComposeFile)
foreach ($f in $requiredFiles) {
    if (-not (Test-Path $f)) {
        Write-Host "ERROR: Required file not found: $f" -ForegroundColor Red
        Write-Host "Run install.ps1 first." -ForegroundColor Yellow
        exit 1
    }
}

$currentLanIp = Get-LanIPv4
$storedLanIp = Get-StoredLanIp -Context $Context
$corsUpdated = Sync-DeployCorsOrigins -Context $Context -LanIp $currentLanIp
if ($corsUpdated) {
    Write-Host "Updated CORS origins for current LAN IP: $currentLanIp" -ForegroundColor Yellow
}

$certFile = Join-Path $Context.CertDir "localhost.pem"
$keyFile = Join-Path $Context.CertDir "localhost-key.pem"
if (-not (Test-Path $certFile) -or -not (Test-Path $keyFile) -or ($currentLanIp -and $storedLanIp -and $currentLanIp -ne $storedLanIp)) {
    if ($currentLanIp -and $storedLanIp -and $currentLanIp -ne $storedLanIp) {
        Write-Host "LAN IP changed from $storedLanIp to $currentLanIp. Regenerating certificates..." -ForegroundColor Yellow
        Remove-Item $certFile, $keyFile -Force -ErrorAction SilentlyContinue
    } else {
        Write-Host "Missing certificates. Generating them now..." -ForegroundColor Yellow
    }
    & "$ScriptDir\generate-cert.ps1"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Certificate generation failed." -ForegroundColor Red
        exit 1
    }
}

$missingImages = Test-BundleImagesPresent -Context $Context
if ($missingImages.Count -gt 0) {
    Write-Host "ERROR: Required Docker images are missing for bundle version $($Context.Version):" -ForegroundColor Red
    $missingImages | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    Write-Host "Re-run install.ps1 to load the bundle images." -ForegroundColor Yellow
    exit 1
}

Write-Host "[1/3] Starting database stack..." -ForegroundColor Cyan
Invoke-DbCompose -Context $Context -ComposeArgs @("up", "-d", "--remove-orphans", "--wait")
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to start database stack." -ForegroundColor Red
    exit 1
}
Write-Host "  Postgres is healthy." -ForegroundColor Green

Write-Host ""
Write-Host "[2/3] Starting application stack..." -ForegroundColor Cyan
Invoke-AppCompose -Context $Context -ComposeArgs @("up", "-d", "--remove-orphans", "--wait")
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to start application stack." -ForegroundColor Red
    exit 1
}
Write-Host "  Core services reported healthy." -ForegroundColor Green

& "$ScriptDir\verify.ps1"
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Post-start verification failed." -ForegroundColor Red
    Write-Host "Check logs: .\powergold.bat logs" -ForegroundColor Yellow
    exit 1
}
Write-Host "  HTTPS access verified." -ForegroundColor Green

Write-Host ""
Write-Host "[3/3] Detecting access URL..." -ForegroundColor Cyan
$lanIp = $currentLanIp
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  PowerGold is running!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
if ($lanIp) {
    Write-Host "Access from any device on the same network:" -ForegroundColor White
    Write-Host "  https://$lanIp" -ForegroundColor Cyan
    Write-Host ""
}
Write-Host "Local access:   https://localhost" -ForegroundColor White
Write-Host "Adminer (host): http://localhost:8080" -ForegroundColor Gray
Write-Host ""
Write-Host "Admin login:" -ForegroundColor White
Write-Host "  Username: admin" -ForegroundColor Gray
Write-Host "  Password: (generated during install; check env/.env.deploy for INITIAL_ADMIN_PASSWORD)" -ForegroundColor Gray
Write-Host ""
Write-Host "NOTE: The certificate is self-signed. Accept the browser warning." -ForegroundColor Yellow

if ($Kiosk) {
    Write-Host ""
    Write-Host "Opening PowerGold in Kiosk Mode..." -ForegroundColor Cyan
    $kioskUrl = if ($lanIp) { "https://$lanIp" } else { "https://localhost" }
    Start-Process "msedge.exe" -ArgumentList "--kiosk $kioskUrl --edge-kiosk-type=fullscreen"
}
