<#
.SYNOPSIS
    PCTG System Optimizer Pro - Context Menu Manager
.DESCRIPTION
    Enumerates shell extensions in the Windows right-click context menu
    and allows disabling/removing unwanted entries.
    Outputs progress lines consumed by the Electron front-end.
#>

$ErrorActionPreference = 'Continue'

Write-Host "[ContextMenuMgr] Enumerating shell extensions..."

$entries = @()

# File context menu handlers (HKCR)
$fileTypes = @(
    'HKCR:\*\shellex\ContextMenuHandlers',
    'HKCR:\Directory\shellex\ContextMenuHandlers',
    'HKCR:\Directory\Background\shellex\ContextMenuHandlers',
    'HKCR:\Drive\shellex\ContextMenuHandlers',
    'HKCR:\Folder\shellex\ContextMenuHandlers'
)

foreach ($path in $fileTypes) {
    if (Test-Path $path) {
        Get-ChildItem $path | ForEach-Object {
            $name = $_.PSChildName
            $clsid = $_.GetValue('')  # Default value is the CLSID

            if ($clsid) {
                # Try to resolve CLSID to a readable name
                $displayName = $name
                $clsidPath = "HKCR:\CLSID\$clsid"
                if (Test-Path $clsidPath) {
                    $resolved = (Get-ItemProperty $clsidPath).'(default)'
                    if ($resolved) { $displayName = $resolved }
                }

                # Check if it's a Microsoft/Windows component
                $isSystem = $clsidPath -match 'Microsoft|Windows|Shell' -or $displayName -match 'Microsoft|Windows|Shell'

                $entries += [pscustomobject]@{
                    Name = $displayName
                    CLSID = $clsid
                    Type = $path.Split('\')[-1]
                    IsSystem = $isSystem
                    RegistryPath = $_.PSPath
                }
            }
        }
    }
}

# Also check HKLM for additional handlers
$lmPaths = @(
    'HKLM:\SOFTWARE\Classes\*\shellex\ContextMenuHandlers',
    'HKLM:\SOFTWARE\Classes\Directory\shellex\ContextMenuHandlers',
    'HKLM:\SOFTWARE\Classes\Directory\Background\shellex\ContextMenuHandlers',
    'HKLM:\SOFTWARE\Classes\Drive\shellex\ContextMenuHandlers',
    'HKLM:\SOFTWARE\Classes\Folder\shellex\ContextMenuHandlers'
)

foreach ($path in $lmPaths) {
    if (Test-Path $path) {
        Get-ChildItem $path | ForEach-Object {
            $name = $_.PSChildName
            $clsid = $_.GetValue('')

            if ($clsid) {
                $displayName = $name
                $clsidPath = "HKCR:\CLSID\$clsid"
                if (Test-Path $clsidPath) {
                    $resolved = (Get-ItemProperty $clsidPath).'(default)'
                    if ($resolved) { $displayName = $resolved }
                }

                $isSystem = $displayName -match 'Microsoft|Windows|Shell'

                $entries += [pscustomobject]@{
                    Name = $displayName
                    CLSID = $clsid
                    Type = $path.Split('\')[-1]
                    IsSystem = $isSystem
                    RegistryPath = $_.PSPath
                }
            }
        }
    }
}

# Deduplicate by CLSID
$unique = $entries | Sort-Object Name -Unique

Write-Host "[ContextMenuMgr] Found $($unique.Count) context menu handlers"
Write-Host "::PROGRESS:: Found $($unique.Count) context menu handlers"

$systemCount = ($unique | Where-Object { $_.IsSystem }).Count
$userCount = $unique.Count - $systemCount

Write-Host "[ContextMenuMgr] System handlers: $systemCount | User/Third-party: $userCount"
Write-Host "::PROGRESS:: System: $systemCount | Third-party: $userCount"

# Output each handler for the UI
foreach ($e in $unique) {
    $tag = if ($e.IsSystem) { '[SYSTEM]' } else { '[USER]' }
    Write-Host "[ContextMenuMgr] $tag $($e.Name) (`$($e.CLSID)`) — $($e.Type)"
    Write-Host "::PROGRESS:: $tag $($e.Name) — $($e.Type)"
}

Write-Host "[ContextMenuMgr] Enumeration complete. Use the UI to disable/remove entries."
Write-Host "::DONE:: Context Menu Manager scan complete"