$ErrorActionPreference = "Stop"

Write-Host "Setting up Kiosk Mode to auto-run on Windows Startup..." -ForegroundColor Cyan

$WshShell = New-Object -comObject WScript.Shell
$StartupFolder = [Environment]::GetFolderPath('Startup')
$ShortcutPath = Join-Path $StartupFolder "PowerGold Kiosk.lnk"

# Get the path to powergold.bat (one directory up from this script)
$BatPath = (Get-Item (Join-Path $PSScriptRoot "..")).FullName
$TargetBat = Join-Path $BatPath "powergold.bat"

if (-not (Test-Path $TargetBat)) {
    Write-Host "ERROR: Could not find powergold.bat at $TargetBat" -ForegroundColor Red
    exit 1
}

$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $TargetBat
$Shortcut.Arguments = "start-kiosk"
$Shortcut.WorkingDirectory = $BatPath
$Shortcut.Description = "Starts PowerGold Enterprises and launches the browser in Kiosk Mode"
$Shortcut.Save()

Write-Host "Success! PowerGold will now start in Kiosk Mode automatically when you log into Windows." -ForegroundColor Green
Write-Host "Shortcut created at: $ShortcutPath" -ForegroundColor Gray
Write-Host ""
