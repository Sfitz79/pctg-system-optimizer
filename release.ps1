param(
    [string]$Version = "",
    [switch]$Local = $false
)
# Releases a new version of PCTG System Optimizer Pro.
#
# Default: bumps the patch version, commits, tags vX.Y.Z, pushes -> GitHub Actions
#          builds the ZIP + installer and publishes the release automatically.
# -Local : also builds on this machine and creates the GitHub release here instead.
#
# Usage:
#   .\release.ps1              # bump patch (1.2.0 -> 1.2.1)
#   .\release.ps1 1.3.0        # specific version
#   .\release.ps1 1.3.0 -Local # build + release locally (no CI)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$pkgPath = Join-Path $root "package.json"

$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
$current = $pkg.version
if ($Version -eq "") {
    $parts = $current -split '\.'
    $parts[2] = [int]$parts[2] + 1
    $Version = ($parts -join '.')
    Write-Host "No version given - bumping patch: $current -> $Version" -ForegroundColor Cyan
}
$Version = $Version.TrimStart('v')

$pkg.version = $Version
$json = $pkg | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($pkgPath, $json, [System.Text.UTF8Encoding]::new($false))
Write-Host "package.json version -> $Version"

if ($Local) {
    Write-Host "Building locally..." -ForegroundColor Cyan
    npm ci
    if (-not $?) { throw "npm ci failed" }
    npm run build
    if (-not $?) { throw "build failed" }
    $hasInno = Test-Path "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
    if ($hasInno) { npm run build:installer } else { Write-Host "Inno Setup not found - skipping installer" -ForegroundColor Yellow }
}

git -C $root add -A
git -C $root commit -m "Release v$Version"
git -C $root tag "v$Version"
git -C $root push origin HEAD
git -C $root push origin "v$Version"

if ($Local) {
    Write-Host "Creating GitHub release locally..." -ForegroundColor Cyan
    gh release create "v$Version" ./dist/*.zip ./dist/*.exe --title "v$Version" --notes "Portable ZIP + installer. See README for install steps."
} else {
    Write-Host "Pushed tag v$Version - GitHub Actions will build and release (watch the Actions tab)." -ForegroundColor Green
}