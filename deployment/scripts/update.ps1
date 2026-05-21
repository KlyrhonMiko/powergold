param(
    [string]$ImageDir,
    [switch]$SkipBackup,
    [int]$StartupTimeout = 300
)

$ErrorActionPreference = "Stop"
$CommonScript = Join-Path $PSScriptRoot "common.ps1"
. $CommonScript

$Context = Get-BundleContext -ScriptRoot $PSScriptRoot
$ScriptDir = "$PSScriptRoot"

if (-not $ImageDir) {
    $ImageDir = $Context.ImagesDir
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PowerGold Update" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$currentVersion = if ($Context.Version) { $Context.Version } else { "unknown" }
$previousVersion = $Context.Version
Write-Host "Current bundle version: $currentVersion" -ForegroundColor White

$newTars = Get-BundleImageArchives -ImageDir $ImageDir
if (-not $newTars) {
    Write-Host "No image archives found in $ImageDir" -ForegroundColor Yellow
    Write-Host "Place the update .tar files under images\database, images\utils, or images\system and run again." -ForegroundColor Yellow
    exit 0
}

$targetVersion = Get-ArchiveBundleVersion -ImagesDir $ImageDir
if (-not $targetVersion) {
    Write-Host "ERROR: Could not determine the PowerGold application version from the image archives." -ForegroundColor Red
    Write-Host "Expected files like images\system\powergold-backend-<version>.tar in the selected image directory tree." -ForegroundColor Yellow
    exit 1
}

if ($Context.Version -and $Context.Version -ne $targetVersion) {
    Write-Host "NOTICE: Bundle VERSION ($($Context.Version)) differs from update image archives ($targetVersion)." -ForegroundColor Yellow
    Write-Host "  This usually means the new bundle was extracted over an older deployment. The update will use the image archive version." -ForegroundColor Yellow
}

Write-Host "Target bundle version: $targetVersion" -ForegroundColor White
Write-Host ""
Write-Host "Image archives to load:" -ForegroundColor White
foreach ($tar in $newTars) {
    Write-Host "  $($tar.Name)"
}

Write-Host ""
if (-not $SkipBackup) {
    Write-Host "It is recommended to back up the database before updating." -ForegroundColor Yellow
    $doBackup = Read-Host "Create a database backup? [Y/n]"
    if ($doBackup -ne "n" -and $doBackup -ne "N") {
        & "$ScriptDir\backup-db.ps1"
        if ($LASTEXITCODE -ne 0) {
            Write-Host "WARNING: Backup may have failed. Continue anyway? [y/N]" -ForegroundColor Yellow
            $proceed = Read-Host
            if ($proceed -ne "y" -and $proceed -ne "Y") {
                Write-Host "Update cancelled." -ForegroundColor Yellow
                exit 0
            }
        }
    }
}

Write-Host ""
Write-Host "Proceeding with update..." -ForegroundColor Cyan

Write-Host "[1/4] Stopping application stack..." -ForegroundColor Gray
Invoke-AppCompose -Context $Context -ComposeArgs @("down", "--remove-orphans")
if ($LASTEXITCODE -ne 0) {
    Write-Host "WARNING: Application stack stop returned non-zero. Continuing..." -ForegroundColor Yellow
}

Write-Host "[2/4] Loading updated images..." -ForegroundColor Gray
foreach ($tar in $newTars) {
    Write-Host "  Loading: $($tar.Name)..." -ForegroundColor Gray
    docker load -i $tar.FullName
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to load $($tar.Name)" -ForegroundColor Red
        exit 1
    }
}
Write-Host "  Images loaded." -ForegroundColor Green

Set-BundleVersion -Context $Context -Version $targetVersion
Write-Host "  Bundle version updated to $targetVersion" -ForegroundColor Green

$missingImages = Test-BundleImagesPresent -Context $Context
if ($missingImages.Count -gt 0) {
    if ($previousVersion) {
        Set-BundleVersion -Context $Context -Version $previousVersion
    }
    Write-Host "ERROR: Required Docker images are missing after image load:" -ForegroundColor Red
    $missingImages | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    Write-Host "Bundle version marker reverted to $previousVersion." -ForegroundColor Yellow
    exit 1
}

Write-Host "[3/4] Starting application stack..." -ForegroundColor Gray
Invoke-DbCompose -Context $Context -ComposeArgs @("up", "-d", "--remove-orphans", "--wait")
if ($LASTEXITCODE -ne 0) {
    if ($previousVersion) {
        Set-BundleVersion -Context $Context -Version $previousVersion
    }
    Write-Host "ERROR: Failed to ensure the database stack is running." -ForegroundColor Red
    Write-Host "Bundle version marker reverted to $previousVersion." -ForegroundColor Yellow
    exit 1
}

Invoke-AppCompose -Context $Context -ComposeArgs @("up", "-d", "--remove-orphans", "--wait")
if ($LASTEXITCODE -ne 0) {
    if ($previousVersion) {
        Set-BundleVersion -Context $Context -Version $previousVersion
    }
    Write-Host "ERROR: Failed to start application stack." -ForegroundColor Red
    Write-Host "Bundle version marker reverted to $previousVersion." -ForegroundColor Yellow
    exit 1
}
Write-Host "  Core services reported healthy." -ForegroundColor Green

Write-Host ""
Write-Host "[4/4] Running health verification..." -ForegroundColor Gray
& "$ScriptDir\verify.ps1"
$verifyOk = ($LASTEXITCODE -eq 0)

Write-Host ""
if ($verifyOk) {
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  Update complete!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "Running version: $($Context.Version)" -ForegroundColor White
} else {
    if ($previousVersion) {
        Set-BundleVersion -Context $Context -Version $previousVersion
        Write-Host "Bundle version marker reverted to $previousVersion because verification failed." -ForegroundColor Yellow
    }
    Write-Host "Update applied but health check reported issues." -ForegroundColor Yellow
    Write-Host "Check logs: .\powergold.bat logs" -ForegroundColor Yellow
    Write-Host "If problems persist, restore the database backup and contact support." -ForegroundColor Yellow
}
