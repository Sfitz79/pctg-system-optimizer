<#
.SYNOPSIS
    PCTG System Optimizer Pro - Software Uninstaller
.DESCRIPTION
    Enumerates installed applications from the Windows registry, identifies
    leftovers (folders, registry keys), and uninstalls cleanly.
    Outputs progress lines consumed by the Electron front-end.
#>

$ErrorActionPreference = 'Continue'

Write-Host "[Uninstaller] Starting software enumeration..."

# Get installed applications from both registry views
$apps = @()

# 64-bit registry
$regPaths = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall'
)

foreach ($path in $regPaths) {
    if (Test-Path $path) {
        Get-ChildItem $path | ForEach-Object {
            $props = $_
            $name = $props.GetValue('DisplayName')
            $uninstallString = $props.GetValue('UninstallString')
            $publisher = $props.GetValue('Publisher')
            $version = $props.GetValue('DisplayVersion')
            $installLocation = $props.GetValue('InstallLocation')
            $systemComponent = $props.GetValue('SystemComponent') -eq 1
            $windowsInstaller = $props.GetValue('WindowsInstaller') -eq 1

            if ($name -and !$systemComponent -and $uninstallString) {
                $apps += [pscustomobject]@{
                    Name = $name
                    UninstallString = $uninstallString
                    Publisher = $publisher
                    Version = $version
                    InstallLocation = $installLocation
                    IsMSI = $windowsInstaller
                    RegistryPath = $props.PSPath
                }
            }
        }
    }
}

# Sort by name
$apps = $apps | Sort-Object Name

Write-Host "[Uninstaller] Found $($apps.Count) installed applications"
Write-Host "::PROGRESS:: Found $($apps.Count) applications"

# For each app, check for leftovers
$cleaned = 0
$errors = 0

foreach ($app in $apps) {
    $leftovers = @()

    # Check install location folder
    if ($app.InstallLocation -and (Test-Path $app.InstallLocation)) {
        $leftovers += "Folder: $($app.InstallLocation)"
    }

    # Check common program files locations
    $commonPaths = @(
        "C:\Program Files\$($app.Name)",
        "C:\Program Files (x86)\$($app.Name)",
        "$env:LOCALAPPDATA\$($app.Name)",
        "$env:APPDATA\$($app.Name)"
    )

    foreach ($p in $commonPaths) {
        if (Test-Path $p) {
            $leftovers += "Folder: $p"
        }
    }

    # Check registry leftovers (common keys)
    $regLeftovers = @(
        "HKLM:\SOFTWARE\$($app.Name)",
        "HKLM:\SOFTWARE\WOW6432Node\$($app.Name)",
        "HKCU:\SOFTWARE\$($app.Name)"
    )

    foreach ($rp in $regLeftovers) {
        if (Test-Path $rp) {
            $leftovers += "Registry: $rp"
        }
    }

    if ($leftovers.Count -gt 0) {
        Write-Host "[Uninstaller] $($app.Name) - $($leftovers.Count) potential leftovers"
        Write-Host "::PROGRESS:: $($app.Name): $($leftovers.Count) leftovers detected"
    }
}

Write-Host "[Uninstaller] Enumeration complete. Use the UI to uninstall selected apps."
Write-Host "::DONE:: Software Uninstaller scan complete"