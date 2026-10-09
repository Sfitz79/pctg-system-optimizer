<#
.SYNOPSIS
    PCTG System Optimizer Pro - Duplicate File Finder
.DESCRIPTION
    Scans user-specified directories for duplicate files using SHA-256 hashes.
    Reports space that can be reclaimed and allows safe deletion.
    Outputs progress lines consumed by the Electron front-end.
#>

$ErrorActionPreference = 'Continue'

Write-Host "[DuplicateFinder] Starting duplicate scan..."

$defaultPaths = @(
    "$env:USERPROFILE\Downloads",
    "$env:USERPROFILE\Documents",
    "$env:USERPROFILE\Pictures",
    "$env:USERPROFILE\Videos",
    "$env:USERPROFILE\Music",
    "$env:LOCALAPPDATA",
    "$env:APPDATA"
)

$validPaths = @()
foreach ($p in $defaultPaths) {
    if (Test-Path $p) {
        $validPaths += $p
    }
}

if ($validPaths.Count -eq 0) {
    Write-Host "[DuplicateFinder] No valid scan paths found"
    Write-Host "::DONE:: Duplicate File Finder scan complete"
    exit 0
}

Write-Host "[DuplicateFinder] Scanning $($validPaths.Count) directories..."
Write-Host "::PROGRESS:: Scanning $($validPaths.Count) directories for duplicates..."

$hashes = @{}
$totalFiles = 0
$duplicateGroups = @{}
$totalWasted = 0

foreach ($root in $validPaths) {
    Write-Host "[DuplicateFinder] Scanning $root..."
    Write-Host "::PROGRESS:: Scanning $root..."

    $files = Get-ChildItem -Path $root -File -Recurse -ErrorAction SilentlyContinue
    $count = 0

    foreach ($file in $files) {
        $count++
        if ($count % 500 -eq 0) {
            Write-Host "::PROGRESS:: Scanned $count files in $root..."
        }

        try {
            $hash = Get-FileHash -Path $file.FullName -Algorithm SHA256 -ErrorAction SilentlyContinue
            if ($hash) {
                $key = $hash.Hash
                if ($hashes.ContainsKey($key)) {
                    $hashes[$key] += $file.FullName
                } else {
                    $hashes[$key] = @($file.FullName)
                }
                $totalFiles++
            }
        } catch {
            # Skip unreadable files
        }
    }
}

Write-Host "[DuplicateFinder] Analyzing $totalFiles files for duplicates..."

foreach ($kvp in $hashes.GetEnumerator()) {
    if ($kvp.Value.Count -gt 1) {
        $first = $kvp.Value[0]
        try {
            $size = (Get-Item $first).Length
        } catch {
            $size = 0
        }
        $wasted = $size * ($kvp.Value.Count - 1)
        $totalWasted += $wasted

        $duplicateGroups[$kvp.Key] = @{
            Files = $kvp.Value
            Size = $size
            Count = $kvp.Value.Count
            Wasted = $wasted
        }
    }
}

$groupCount = $duplicateGroups.Count
$wastedGB = [math]::Round($totalWasted / 1GB, 2)

Write-Host "[DuplicateFinder] Found $groupCount duplicate groups wasting $wastedGB GB"
Write-Host "::PROGRESS:: Found $groupCount duplicate groups wasting $wastedGB GB"

if ($groupCount -gt 0) {
    # Show top 10 biggest waste groups
    $sorted = $duplicateGroups.GetEnumerator() | Sort-Object { $_.Value.Wasted } -Descending
    $top = $sorted | Select-Object -First 10

    foreach ($g in $top) {
        $mb = [math]::Round($g.Value.Wasted / 1MB, 1)
        $files = $g.Value.Files -join ' | '
        Write-Host "[DuplicateFinder] $mb MB wasted — $($g.Value.Count) copies: $files"
        Write-Host "::PROGRESS:: $mb MB wasted — $($g.Value.Count) copies"
    }
}

Write-Host "::DONE:: Duplicate File Finder scan complete — $groupCount groups, $wastedGB GB reclaimable"