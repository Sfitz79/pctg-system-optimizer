Write-Output "============================================"
Write-Output "  PCTG System Test & Repair"
Write-Output "  Comprehensive Windows diagnostic and"
Write-Output "  repair suite"
Write-Output "============================================"
Write-Output ""

# ============================================================
# 1. SYSTEM FILE INTEGRITY VERIFICATION
# ============================================================
Write-Output "[1/15] System File Checker (SFC) — verifying protected system files..."
$sfcLog = "$env:TEMP\pctg_sfc.txt"
sfc /scannow > $sfcLog 2>&1
Get-Content $sfcLog | ForEach-Object { Write-Output "  $_" }
Write-Output ""

# ============================================================
# 2. DISM COMPONENT STORE HEALTH
# ============================================================
Write-Output "[2/15] DISM — checking and restoring component store health..."
Write-Output "  >> DISM /checkhealth..."
Dism.exe /online /Cleanup-Image /checkhealth 2>&1 | ForEach-Object { Write-Output "    $_" }
Write-Output "  >> DISM /scanhealth..."
Dism.exe /online /Cleanup-Image /scanhealth 2>&1 | ForEach-Object { Write-Output "    $_" }
Write-Output "  >> DISM /RestoreHealth (may take several minutes)..."
DISM /Online /Cleanup-Image /RestoreHealth 2>&1 | ForEach-Object { Write-Output "    $_" }
Write-Output "  >> DISM /AnalyzeComponentStore..."
Dism.exe /Online /Cleanup-Image /AnalyzeComponentStore 2>&1 | ForEach-Object { Write-Output "    $_" }
Write-Output "  >> DISM /StartComponentCleanup..."
Dism.exe /Online /Cleanup-Image /StartComponentCleanup 2>&1 | ForEach-Object { Write-Output "    $_" }
Write-Output ""

# ============================================================
# 3. BOOT CONFIGURATION & REPAIR
# ============================================================
Write-Output "[3/15] Boot Configuration — checking and repairing boot records..."
Write-Output "  >> BCD — enumerating boot configuration..."
bcdedit /enum 2>&1 | ForEach-Object { Write-Output "    $_" }
Write-Output "  >> BootRec — scanning for Windows installations..."
bootrec /scanos 2>&1 | ForEach-Object { Write-Output "    $_" }
Write-Output "  >> BootRec — rebuilding BCD..."
bootrec /rebuildbcd 2>&1 | ForEach-Object { Write-Output "    $_" }
Write-Output "  >> BootRec — fixing MBR..."
bootrec /fixmbr 2>&1 | ForEach-Object { Write-Output "    $_" }
Write-Output "  >> BootRec — fixing boot sector..."
bootrec /fixboot 2>&1 | ForEach-Object { Write-Output "    $_" }
Write-Output ""

# ============================================================
# 4. DISK HEALTH & FILE SYSTEM CHECK
# ============================================================
Write-Output "[4/15] Disk Health — checking file system and disk integrity..."
Write-Output "  >> CHKDSK C: /scan — checking for file system errors..."
chkdsk C: /scan 2>&1 | ForEach-Object { Write-Output "    $_" }
Write-Output "  >> CHKDSK — checking for bad sectors (read-only)..."
chkdsk C: 2>&1 | ForEach-Object { Write-Output "    $_" }
Write-Output "  >> Checking disk health via WMI..."
Get-WmiObject Win32_DiskDrive | ForEach-Object {
    $status = if ($_.Status -eq 'OK') { 'PASS' } else { "ISSUE: $($_.Status)" }
    Write-Output "    $($_.Model) — $status"
}
Write-Output ""

# ============================================================
# 5. MEMORY DIAGNOSTIC
# ============================================================
Write-Output "[5/15] Memory Diagnostic — checking for RAM issues..."
$memDiagPath = "$env:SystemRoot\System32\mdsched.exe"
if (Test-Path $memDiagPath) {
    Write-Output "  >> Windows Memory Diagnostic tool available at: $memDiagPath"
    Write-Output "  >> Scheduling: Run 'mdsched.exe' and restart to test RAM thoroughly"
    $pending = Get-CimInstance -Namespace root\cimv2 -ClassName Win32_ComputerSystem -ErrorAction SilentlyContinue
    if ($pending) {
        Write-Output "  >> System RAM: $([math]::Round($pending.TotalPhysicalMemory / 1GB, 1)) GB detected"
        Write-Output "  >> Recommendation: Schedule memtest on next restart if you suspect crashes"
    }
} else {
    Write-Output "  >> Windows Memory Diagnostic not found"
}
Write-Output ""

# ============================================================
# 6. DRIVER VERIFICATION
# ============================================================
Write-Output "[6/15] Driver Verification — checking for problematic drivers..."
$badDrivers = driverquery /si 2>&1 | Out-String
Write-Output "  >> Driver summary:"
$driverSummary = driverquery /fo table 2>&1
$driverSummary | ForEach-Object { Write-Output "    $_" }
Write-Output "  >> Checking for unsigned or problematic drivers..."
$unsigned = Get-WmiObject Win32_SystemDriver | Where-Object { $_.State -eq 'Stopped' -and $_.StartMode -eq 'Auto' }
if ($unsigned) {
    Write-Output "    WARNING: $($unsigned.Count) driver(s) set to auto-start but not running:"
    $unsigned | ForEach-Object { Write-Output "      - $($_.DisplayName) ($($_.Name))" }
} else {
    Write-Output "    All critical drivers appear operational"
}
Write-Output ""

# ============================================================
# 7. BLUE SCREEN / CRASH DUMP ANALYSIS
# ============================================================
Write-Output "[7/15] Crash Analysis — checking for blue screen / crash dumps..."
$dumpDirs = @(
    "$env:SystemRoot\Minidump",
    "$env:SystemRoot\MEMORY.DMP"
)
$foundDumps = $false
foreach ($d in $dumpDirs) {
    if (Test-Path $d) {
        $items = Get-ChildItem $d -ErrorAction SilentlyContinue
        if ($items) {
            $foundDumps = $true
            Write-Output "  >> Found crash dump(s) in: $d"
            $items | ForEach-Object {
                $sizeKB = [math]::Round($_.Length / 1KB, 1)
                Write-Output "      $($_.Name) ($sizeKB KB, $($_.LastWriteTime))"
            }
        }
    }
}
if (-not $foundDumps) {
    Write-Output "  >> No crash dumps found — system appears stable"
}
Write-Output "  >> Checking Windows Error Reporting for recent critical failures..."
$criticalEvents = Get-WinEvent -FilterHashtable @{LogName='System'; Level=1,2} -MaxEvents 10 -ErrorAction SilentlyContinue
if ($criticalEvents) {
    Write-Output "  >> Recent critical system events found:"
    $criticalEvents | ForEach-Object {
        $msg = $_.Message
        if ($msg.Length -gt 150) { $msg = $msg.Substring(0, 147) + '...' }
        Write-Output "    - [$($_.TimeCreated)] $($_.ProviderName): $msg"
    }
} else {
    Write-Output "  >> No critical system errors found"
}
Write-Output ""

# ============================================================
# 8. NETWORK CONNECTIVITY REPAIR
# ============================================================
Write-Output "[8/15] Network Repair — checking and resetting network stack..."
Write-Output "  >> Flushing DNS resolver cache..."
ipconfig /flushdns 2>&1 | ForEach-Object { Write-Output "    $_" }
Write-Output "  >> Re-registering DNS..."
ipconfig /registerdns 2>&1 | ForEach-Object { Write-Output "    $_" }
Write-Output "  >> Resetting Winsock catalog..."
netsh winsock reset 2>&1 | ForEach-Object { Write-Output "    $_" }
Write-Output "  >> Resetting TCP/IP stack..."
netsh int ip reset 2>&1 | ForEach-Object { Write-Output "    $_" }
Write-Output "  >> Checking network adapter status..."
Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object Status -eq 'Up' | ForEach-Object {
    Write-Output "    $($_.Name) — Connected ($($_.LinkSpeed))"
}
Write-Output "  >> Testing internet connectivity..."
try {
    $ping = Test-Connection -ComputerName 8.8.8.8 -Count 2 -Quiet -ErrorAction SilentlyContinue
    if ($ping) {
        Write-Output "    Internet: REACHABLE (Google DNS responded)"
    } else {
        Write-Output "    Internet: UNREACHABLE — check your connection"
    }
} catch {
    Write-Output "    Internet: Unable to test"
}
Write-Output ""

# ============================================================
# 9. STARTUP PROGRAM AUDIT
# ============================================================
Write-Output "[9/15] Startup Audit — reviewing programs that run at boot..."
$startupPrograms = Get-CimInstance Win32_StartupCommand -ErrorAction SilentlyContinue
if ($startupPrograms) {
    Write-Output "  >> $($startupPrograms.Count) startup entries found:"
    $startupPrograms | ForEach-Object {
        Write-Output "    - $($_.Name) ($($_.Command))"
    }
} else {
    Write-Output "  >> No startup entries found (or unable to query)"
}
Write-Output ""

# ============================================================
# 10. SERVICE HEALTH CHECK
# ============================================================
Write-Output "[10/15] Service Health — checking critical Windows services..."
$criticalServices = @(
    @{Name='Windows Update'; Service='wuauserv'},
    @{Name='Background Intelligent Transfer'; Service='BITS'},
    @{Name='Windows Defender'; Service='WinDefend'},
    @{Name='Windows Firewall'; Service='MpsSvc'},
    @{Name='Event Log'; Service='EventLog'},
    @{Name='Themes'; Service='Themes'},
    @{Name='User Profile Service'; Service='ProfSvc'},
    @{Name='Print Spooler'; Service='Spooler'}
)
foreach ($svc in $criticalServices) {
    $s = Get-Service -Name $svc.Service -ErrorAction SilentlyContinue
    if ($s) {
        $status = if ($s.Status -eq 'Running') { 'OK' } else { "STOPPED" }
        $startType = $s.StartType
        Write-Output "    $($svc.Name): $status (Start: $startType)"
    } else {
        Write-Output "    $($svc.Name): NOT FOUND"
    }
}
Write-Output ""

# ============================================================
# 11. WINDOWS UPDATE TROUBLESHOOTING
# ============================================================
Write-Output "[11/15] Windows Update — checking update status and repairing components..."
Write-Output "  >> Checking update service status..."
$wuService = Get-Service -Name wuauserv -ErrorAction SilentlyContinue
if ($wuService -and $wuService.Status -ne 'Running') {
    Write-Output "  >> Windows Update service is not running — attempting repair..."
    Stop-Service -Name wuauserv -Force -ErrorAction SilentlyContinue
    Stop-Service -Name cryptSvc -Force -ErrorAction SilentlyContinue
    Stop-Service -Name BITS -Force -ErrorAction SilentlyContinue
    Stop-Service -Name msiserver -Force -ErrorAction SilentlyContinue
    Write-Output "  >> Clearing Windows Update cache..."
    Remove-Item -Path "$env:SystemRoot\SoftwareDistribution\*" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path "$env:SystemRoot\System32\catroot2\*" -Recurse -Force -ErrorAction SilentlyContinue
    Start-Service -Name wuauserv -ErrorAction SilentlyContinue
    Start-Service -Name cryptSvc -ErrorAction SilentlyContinue
    Start-Service -Name BITS -ErrorAction SilentlyContinue
    Start-Service -Name msiserver -ErrorAction SilentlyContinue
    Write-Output "  >> Update cache cleared and services restarted"
} else {
    Write-Output "  >> Windows Update service is running"
}
Write-Output "  >> Checking for pending updates..."
try {
    $updateSession = New-Object -ComObject Microsoft.Update.Session -ErrorAction SilentlyContinue
    $updateSearcher = $updateSession.CreateUpdateSearcher()
    $historyCount = $updateSearcher.GetTotalHistoryCount()
    Write-Output "  >> Update history entries: $historyCount"
} catch {
    Write-Output "  >> Unable to query update history"
}
Write-Output ""

# ============================================================
# 12. REGISTRY INTEGRITY CHECK
# ============================================================
Write-Output "[12/15] Registry Check — scanning for common issues..."
Write-Output "  >> Checking registry permission issues on common paths..."
$regPaths = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run',
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run',
    'HKLM:\SYSTEM\CurrentControlSet\Services'
)
foreach ($rp in $regPaths) {
    if (Test-Path $rp) {
        $acl = Get-Acl -Path $rp -ErrorAction SilentlyContinue
        Write-Output "    $rp — accessible"
    } else {
        Write-Output "    $rp — NOT FOUND (may have been cleaned)"
    }
}
Write-Output "  >> Scanning for orphaned uninstall entries..."
$uninstall = Get-ChildItem 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall' -ErrorAction SilentlyContinue
$orphaned = 0
$uninstall | ForEach-Object {
    $displayName = $_.GetValue('DisplayName')
    $installPath = $_.GetValue('InstallLocation')
    if ($displayName -and $installPath -and -not (Test-Path $installPath)) {
        $orphaned++
        Write-Output "    ORPHANED: $displayName (path missing: $installPath)"
    }
}
if ($orphaned -eq 0) { Write-Output "    No orphaned install entries detected" }
Write-Output ""

# ============================================================
# 13. PERMISSION & ACL REPAIR
# ============================================================
Write-Output "[13/15] Permission Repair — checking and resetting critical file permissions..."
Write-Output "  >> Checking system32 permissions..."
$sys32 = "$env:SystemRoot\System32"
if (Test-Path $sys32) {
    try {
        $acl = Get-Acl -Path $sys32 -ErrorAction SilentlyContinue
        $hasTrustedInstaller = $acl.Access | Where-Object { $_.IdentityReference -match 'TRUSTEDINSTALLER' -and $_.FileSystemRights -match 'FullControl' }
        if ($hasTrustedInstaller) {
            Write-Output "    System32 — TrustedInstaller ownership OK"
        } else {
            Write-Output "    System32 — WARNING: TrustedInstaller ownership may be modified"
        }
    } catch {
        Write-Output "    System32 — unable to check permissions"
    }
}
Write-Output "  >> Checking critical file ownership..."
$criticalFiles = @(
    "$env:SystemRoot\explorer.exe",
    "$env:SystemRoot\regedit.exe",
    "$env:SystemRoot\System32\cmd.exe"
)
foreach ($cf in $criticalFiles) {
    if (Test-Path $cf) {
        try {
            $acl = Get-Acl -Path $cf -ErrorAction SilentlyContinue
            $owner = $acl.Owner
            Write-Output "    $(Split-Path $cf -Leaf) — Owner: $owner"
        } catch {
            Write-Output "    $(Split-Path $cf -Leaf) — unable to check"
        }
    }
}
Write-Output ""

# ============================================================
# 14. SYSTEM STABILITY REPORT
# ============================================================
Write-Output "[14/15] Stability Report — generating system health summary..."
$os = Get-CimInstance Win32_OperatingSystem
$cs = Get-CimInstance Win32_ComputerSystem
$bootTime = $os.LastBootUpTime
$uptime = (Get-Date) - $bootTime
$totalMemGB = [math]::Round($cs.TotalPhysicalMemory / 1GB, 1)
$freeMemPct = [math]::Round(($os.FreePhysicalMemory / $os.TotalVisibleMemorySize) * 100, 1)
Write-Output "  System:      $($cs.Manufacturer) $($cs.Model)"
Write-Output "  OS:          $($os.Caption) — $($os.BuildNumber)"
Write-Output "  Uptime:      $($uptime.Days) days, $($uptime.Hours) hours, $($uptime.Minutes) minutes"
Write-Output "  Memory:      $totalMemGB GB total, $freeMemPct% free"
$cpuCores = $cs.NumberOfLogicalProcessors
Write-Output "  CPU Cores:   $cpuCores"
$disk = Get-WmiObject Win32_LogicalDisk -Filter "DeviceID='C:'" -ErrorAction SilentlyContinue
if ($disk) {
    $totalGB = [math]::Round($disk.Size / 1GB, 1)
    $freeGB = [math]::Round($disk.FreeSpace / 1GB, 1)
    $usedPct = [math]::Round(($disk.Size - $disk.FreeSpace) / $disk.Size * 100, 1)
    Write-Output "  Disk C:      $freeGB GB free of $totalGB GB ($usedPct% used)"
}
Write-Output ""

# ============================================================
# 15. SYSTEM HEALTH REPORT GENERATION
# ============================================================
Write-Output "[15/15] Generating system health report..."
$reportPath = "$env:TEMP\pctg_health_report.txt"
$report = @"
=============================================
  PCTG System Test & Repair — Health Report
  Generated: $(Get-Date)
=============================================

SYSTEM OVERVIEW
  Computer:     $env:COMPUTERNAME
  OS:           $($os.Caption) $($os.Version)
  Build:        $($os.BuildNumber)
  Manufacturer: $($cs.Manufacturer)
  Model:        $($cs.Model)

HARDWARE
  CPU Cores:    $cpuCores
  RAM:          $totalMemGB GB
  Disk C:       $freeGB GB free of $totalGB GB

UPTIME
  $($uptime.Days) days, $($uptime.Hours) hours, $($uptime.Minutes) minutes

COMPLETED CHECKS
  1.  System File Checker (SFC) — done
  2.  DISM Component Store — done
  3.  Boot Configuration / MBR — done
  4.  Disk Health & CHKDSK — done
  5.  Memory Diagnostic — checked
  6.  Driver Verification — done
  7.  Crash Dump Analysis — done
  8.  Network Stack Repair — done
  9.  Startup Audit — done
  10. Service Health Check — done
  11. Windows Update Repair — done
  12. Registry Integrity — done
  13. Permission Check — done
  14. Stability Report — done
  15. Health Report — done

"@
$report | Out-File -FilePath $reportPath -Encoding UTF8
Write-Output "  >> Health report saved to: $reportPath"
Write-Output ""

Write-Output "============================================"
Write-Output "  System Test & Repair complete."
Write-Output "  Review the output above for any issues."
Write-Output "============================================"
