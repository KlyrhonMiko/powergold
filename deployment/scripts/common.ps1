$ErrorActionPreference = "Stop"

function Get-BundleContext {
    param(
        [string]$ScriptRoot
    )

    $bundleRoot = Resolve-Path (Join-Path $ScriptRoot "..")
    $versionFile = Join-Path $bundleRoot "VERSION"
    $version = if (Test-Path $versionFile) { (Get-Content $versionFile -Raw).Trim() } else { $null }

    $envDir = Join-Path $bundleRoot "env"
    $composeDir = Join-Path $bundleRoot "compose"

    return @{
        BundleRoot = $bundleRoot
        ImagesDir = Join-Path $bundleRoot "images"
        DatabaseImagesDir = Join-Path (Join-Path $bundleRoot "images") "database"
        UtilsImagesDir = Join-Path (Join-Path $bundleRoot "images") "utils"
        SystemImagesDir = Join-Path (Join-Path $bundleRoot "images") "system"
        EnvLocal = Join-Path $envDir ".env.local"
        EnvDeploy = Join-Path $envDir ".env.deploy"
        DbComposeFile = Join-Path $composeDir "docker-compose.yml"
        AppComposeFile = Join-Path $composeDir "docker-compose.deploy.yml"
        CertDir = Join-Path $bundleRoot "certificates"
        BackupsDir = Join-Path $bundleRoot "backups"
        VersionFile = $versionFile
        Version = $version
    }
}

function Set-ComposeEnvironment {
    param(
        [hashtable]$Context
    )

    if ($Context.Version) {
        $env:POWERGOLD_VERSION = $Context.Version
    } elseif (Test-Path Env:\POWERGOLD_VERSION) {
        Remove-Item Env:\POWERGOLD_VERSION
    }
}

function Convert-ToCmdArgument {
    param(
        [string]$Value
    )

    if ($null -eq $Value) {
        return '""'
    }

    if ($Value -match '[\s"]') {
        return '"' + ($Value -replace '"', '\"') + '"'
    }

    return $Value
}

function Invoke-CmdWrapped {
    param(
        [string[]]$CommandArgs
    )

    $commandLine = (($CommandArgs | ForEach-Object { Convert-ToCmdArgument $_ }) -join ' ') + ' 2>&1'
    $output = & cmd.exe /d /c $commandLine
    $exitCode = $LASTEXITCODE

    if ($null -ne $output) {
        $output | Out-Host
    }

    $global:LASTEXITCODE = $exitCode
}

function Invoke-DbCompose {
    param(
        [hashtable]$Context,
        [string[]]$ComposeArgs
    )

    Set-ComposeEnvironment -Context $Context
    $allArgs = @("docker", "compose", "--env-file", $Context.EnvLocal, "-f", $Context.DbComposeFile) + $ComposeArgs
    Invoke-CmdWrapped -CommandArgs $allArgs
}

function Invoke-AppCompose {
    param(
        [hashtable]$Context,
        [string[]]$ComposeArgs
    )

    Set-ComposeEnvironment -Context $Context
    $allArgs = @("docker", "compose", "--env-file", $Context.EnvDeploy, "-f", $Context.AppComposeFile) + $ComposeArgs
    Invoke-CmdWrapped -CommandArgs $allArgs
}

function Get-LanIPv4 {
    $adapters = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object {
        $_.IPAddress -ne "127.0.0.1" -and
        $_.IPAddress -notmatch "^169\.254\." -and
        $_.PrefixOrigin -ne "WellKnown"
    } | Sort-Object InterfaceMetric

    $preferred = $adapters | Where-Object {
        $_.InterfaceAlias -notmatch "vEthernet|WSL|Loopback|Docker|VirtualBox|VMware|Hyper-V"
    }

    if ($preferred) {
        $adapters = $preferred
    }

    if (-not $adapters) {
        $adapters = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object {
            $_.IPAddress -ne "127.0.0.1" -and
            $_.IPAddress -notmatch "^169\.254\."
        } | Sort-Object InterfaceMetric
    }

    return ($adapters | Select-Object -First 1).IPAddress
}

function Get-StoredLanIp {
    param(
        [hashtable]$Context
    )

    $lanIpFile = Join-Path $Context.CertDir ".lan-ip"
    if (-not (Test-Path $lanIpFile)) {
        return $null
    }

    return (Get-Content $lanIpFile -Raw).Trim()
}

function Set-StoredLanIp {
    param(
        [hashtable]$Context,
        [string]$LanIp
    )

    if (-not $LanIp) {
        return
    }

    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    $lanIpFile = Join-Path $Context.CertDir ".lan-ip"
    [System.IO.File]::WriteAllText($lanIpFile, "$LanIp`n", $utf8NoBom)
}

function Sync-DeployCorsOrigins {
    param(
        [hashtable]$Context,
        [string]$LanIp
    )

    if (-not $LanIp -or -not (Test-Path $Context.EnvDeploy)) {
        return $false
    }

    $desiredOrigins = "https://localhost,https://127.0.0.1,https://$LanIp"
    $content = Get-Content $Context.EnvDeploy -Raw
    $updatedContent = [regex]::Replace(
        $content,
        '(?m)^CORS_ALLOW_ORIGINS=.*$',
        "CORS_ALLOW_ORIGINS=$desiredOrigins"
    )

    if ($updatedContent -eq $content) {
        return $false
    }

    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($Context.EnvDeploy, $updatedContent, $utf8NoBom)
    return $true
}

function Read-EnvValue {
    param(
        [string]$Path,
        [string]$Key,
        [string]$Default = ""
    )

    if (-not (Test-Path $Path)) {
        return $Default
    }

    $line = Get-Content $Path | Where-Object { $_ -match "^$([regex]::Escape($Key))=" } | Select-Object -First 1
    if (-not $line) {
        return $Default
    }

    return ($line -replace "^$([regex]::Escape($Key))=", "").Trim()
}

function Test-DockerImageAvailable {
    param(
        [string]$Image
    )

    & cmd.exe /d /c "docker image inspect $(Convert-ToCmdArgument $Image) 1>nul 2>nul"
    return ($LASTEXITCODE -eq 0)
}

function Get-ExpectedBundleImages {
    param(
        [string]$Version
    )

    return @(
        "postgres:15-alpine",
        "adminer:4.8.1-standalone",
        "caddy:2.8-alpine",
        "powergold-bootstrap:$Version",
        "powergold-backend:$Version",
        "powergold-frontend:$Version"
    )
}

function Get-ImageReferenceFromArchiveName {
    param(
        [string]$ArchiveName,
        [string]$Version
    )

    switch -Regex ($ArchiveName) {
        '^postgres-15-alpine\.tar$' { return 'postgres:15-alpine' }
        '^adminer-4\.8\.1-standalone\.tar$' { return 'adminer:4.8.1-standalone' }
        '^caddy-2\.8-alpine\.tar$' { return 'caddy:2.8-alpine' }
        '^alpine-3\.21\.tar$' { return 'alpine:3.21' }
        '^powergold-bootstrap-' { return "powergold-bootstrap:$Version" }
        '^powergold-backend-' { return "powergold-backend:$Version" }
        '^powergold-frontend-' { return "powergold-frontend:$Version" }
        default { return $null }
    }
}

function Test-BundleThirdPartyImage {
    param(
        [string]$Image
    )

    return $Image -in @(
        "postgres:15-alpine",
        "adminer:4.8.1-standalone",
        "caddy:2.8-alpine",
        "alpine:3.21"
    )
}

function Get-BundleImageArchives {
    param(
        [string]$ImageDir
    )

    if (-not (Test-Path $ImageDir)) {
        return @()
    }

    return @(
        Get-ChildItem -Path $ImageDir -Filter "*.tar" -File -Recurse -ErrorAction SilentlyContinue |
            Sort-Object FullName
    )
}

function Get-ArchiveBundleVersion {
    param(
        [string]$ImagesDir
    )

    $versions = @(
        Get-BundleImageArchives -ImageDir $ImagesDir |
            ForEach-Object {
                if ($_.BaseName -match '^powergold-(bootstrap|backend|frontend)-') {
                    $_.BaseName -replace '^powergold-(bootstrap|backend|frontend)-', ''
                }
            }
    ) | Where-Object { $_ }

    if (-not $versions) {
        return $null
    }

    $uniqueVersions = @($versions | Sort-Object -Unique)
    if ($uniqueVersions.Count -ne 1) {
        throw "Image archives contain multiple PowerGold versions: $($uniqueVersions -join ', ')"
    }

    return ($uniqueVersions | Select-Object -First 1)
}

function Set-BundleVersion {
    param(
        [hashtable]$Context,
        [string]$Version
    )

    if (-not $Version) {
        return
    }

    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($Context.VersionFile, "$Version`n", $utf8NoBom)
    $Context.Version = $Version
}

function Test-BundleImagesPresent {
    param(
        [hashtable]$Context
    )

    if (-not $Context.Version) {
        throw "Bundle version is not set. Ensure VERSION exists or run install/update with valid image archives."
    }

    $missing = @()
    foreach ($image in (Get-ExpectedBundleImages -Version $Context.Version)) {
        if (-not (Test-DockerImageAvailable -Image $image)) {
            $missing += $image
        }
    }

    return $missing
}
