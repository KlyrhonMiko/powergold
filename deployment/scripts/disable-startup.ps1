$ErrorActionPreference = "Stop"

Write-Host "Removing Kiosk Mode auto-run from Windows Startup..." -ForegroundColor Cyan

$StartupFolder = [Environment]::GetFolderPath('Startup')
$ShortcutPath = Join-Path $StartupFolder "PowerGold Kiosk.lnk"

if (Test-Path $ShortcutPath) {
    Remove-Item $ShortcutPath -Force
    Write-Host "Success! The auto-run shortcut has been removed." -ForegroundColor Green
} else {
    Write-Host "The auto-run shortcut was not found. No changes made." -ForegroundColor Yellow
}
Write-Host ""
