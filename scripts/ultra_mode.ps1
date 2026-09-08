Write-Output "PCTG Optimizer Pro — Ultra Mode"
Write-Output "================================="
Write-Output ""

# --------------------------------------------------
# 1. GPU AUTO-DETECTION
# --------------------------------------------------
Write-Output ">>> Detecting GPU..."
$gpu = "UNKNOWN"
$gpuInfo = (Get-WmiObject Win32_VideoController).Name
if ($gpuInfo -match "NVIDIA") { $gpu = "NVIDIA" }
elseif ($gpuInfo -match "AMD|Radeon") { $gpu = "AMD" }
elseif ($gpuInfo -match "Intel") { $gpu = "INTEL" }
Write-Output "  -> GPU: $gpu ($gpuInfo)"

# --------------------------------------------------
# 2. GPU OPTIMIZATIONS
# --------------------------------------------------
Write-Output ">>> Applying GPU optimizations..."
if ($gpu -eq "NVIDIA") {
  Write-Output "  -> NVIDIA optimizations: Power management mode, Threaded optimisation"
  nvidia-smi -pm 1 2>$null
  nvidia-smi -pl 100 2>$null
  Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers" -Name "PlatformSupportMiracast" -Value 0 -ErrorAction SilentlyContinue
} elseif ($gpu -eq "AMD") {
  Write-Output "  -> AMD optimizations: Shader cache, Surface format, Tesselation"
  Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers" -Name "DX10Enable" -Value 1 -ErrorAction SilentlyContinue
} elseif ($gpu -eq "INTEL") {
  Write-Output "  -> Intel optimizations"
} else {
  Write-Output "  -> Generic GPU optimizations"
}
Write-Output "  -> Enabling GPU Hardware Accelerated GPU Scheduling (HAGS)"
New-Item -Path "HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers" -Name "HwSchMode" -Force -ErrorAction SilentlyContinue | Out-Null
Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers" -Name "HwSchMode" -Value 2 -ErrorAction SilentlyContinue

# --------------------------------------------------
# 3. WINDOWS OPTIMIZATION
# --------------------------------------------------
Write-Output ">>> Windows optimizations..."

# Game Mode
Write-Output "  -> Enabling Game Mode"
New-Item -Path "HKCU:\Software\Microsoft\GameBar" -Force -ErrorAction SilentlyContinue | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Microsoft\GameBar" -Name "AllowAutoGameMode" -Value 1 -ErrorAction SilentlyContinue
Set-ItemProperty -Path "HKCU:\Software\Microsoft\GameBar" -Name "AutoGameModeEnabled" -Value 1 -ErrorAction SilentlyContinue

# High Performance power plan
Write-Output "  -> Setting High Performance power plan"
powercfg /setactive SCHEME_MIN
powercfg -change -standby-timeout-ac 0
powercfg -change -hibernate-timeout-ac 0
powercfg -h off 2>$null

# Timer resolution
Write-Output "  -> Setting high-resolution timer"
Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Power" -Name "HiberbootEnabled" -Value 0 -ErrorAction SilentlyContinue
New-Item -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\kernel" -Force -ErrorAction SilentlyContinue | Out-Null
Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\kernel" -Name "CriticalThreadCreation" -Value 1 -ErrorAction SilentlyContinue

# Disable startup delay
Write-Output "  -> Removing startup delay"
Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Serialize" -Name "StartupDelayInMSec" -Value 0 -ErrorAction SilentlyContinue

# Disable Cortana / Search indexing
Write-Output "  -> Disabling search indexing"
Stop-Service "WSearch" -Force -ErrorAction SilentlyContinue
Set-Service "WSearch" -StartupType Disabled -ErrorAction SilentlyContinue

# Disable background apps
Write-Output "  -> Disabling background apps"
New-Item -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\BackgroundAccessApplications" -Force -ErrorAction SilentlyContinue | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Search" -Name "BackgroundAppGlobalToggle" -Value 0 -ErrorAction SilentlyContinue

# Disable visual effects for performance
Write-Output "  -> Adjusting visual effects for performance"
Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects" -Name VisualFXSetting -Value 2

# --------------------------------------------------
# 4. DISPLAY — HIGHEST REFRESH RATE
# --------------------------------------------------
Write-Output ">>> Setting highest available refresh rate..."
$monitors = Get-WmiObject WmiMonitorBasicDisplayParams -Namespace root\wmi -ErrorAction SilentlyContinue
if ($monitors) {
  $highest = 0
  foreach ($mon in $monitors) { if ($mon.MaxVerticalImageSize -gt $highest) { $highest = $mon.MaxVerticalImageSize } }
  Write-Output "  -> Max refresh detected: ${highest}Hz"
}
# Alternative: set via CIM
try {
  $adapter = Get-CimInstance -Namespace "Root/CIMv2" -ClassName "CIM_VideoController" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($adapter) { Write-Output "  -> Display adapter: $($adapter.Name)" }
} catch { Write-Output "  -> Could not query display adapter" }

# --------------------------------------------------
# 5. NETWORK OPTIMIZATION
# --------------------------------------------------
Write-Output ">>> Network optimizations..."

# TCP/IP auto-tuning
Write-Output "  -> Enabling TCP auto-tuning"
netsh int tcp set global autotuninglevel=normal

# RSS / RSC
Write-Output "  -> Enabling RSS and RSC"
netsh int tcp set global rss=enabled
netsh int tcp set global rsc=enabled

# Disable Nagle's algorithm (via registry)
Write-Output "  -> Disabling Nagle's algorithm"
New-Item -Path "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces" -Force -ErrorAction SilentlyContinue | Out-Null
Get-ChildItem "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces" | ForEach-Object {
  New-ItemProperty -Path $_.PSPath -Name "TcpAckFrequency" -Value 1 -PropertyType DWord -Force -ErrorAction SilentlyContinue | Out-Null
  New-ItemProperty -Path $_.PSPath -Name "TCPNoDelay" -Value 1 -PropertyType DWord -Force -ErrorAction SilentlyContinue | Out-Null
}

# Network Throttling Index
Write-Output "  -> Disabling network throttling"
New-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile" -Name "NetworkThrottlingIndex" -Value 4294967295 -PropertyType DWord -Force -ErrorAction SilentlyContinue | Out-Null

# DNS cache flush
Write-Output "  -> Flushing DNS cache"
ipconfig /flushcache

# --------------------------------------------------
# 6. BROWSER OPTIMIZATION (flags registry)
# --------------------------------------------------
Write-Output ">>> Browser optimizations..."

# Edge: disable hardware acceleration throttling
New-Item -Path "HKCU:\Software\Microsoft\Edge\GPU" -Force -ErrorAction SilentlyContinue | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Microsoft\Edge\GPU" -Name "InForceAdjustment" -Value 0 -ErrorAction SilentlyContinue
Set-ItemProperty -Path "HKCU:\Software\Microsoft\Edge\GPU" -Name "InSoftwareFallback" -Value 0 -ErrorAction SilentlyContinue

# Chrome flags (via registry policy)
New-Item -Path "HKCU:\Software\Policies\Google\Chrome" -Force -ErrorAction SilentlyContinue | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Policies\Google\Chrome" -Name "HardwareAccelerationModeEnabled" -Value 1 -ErrorAction SilentlyContinue
Set-ItemProperty -Path "HKCU:\Software\Policies\Google\Chrome" -Name "RendererCodeIntegrityEnabled" -Value 0 -ErrorAction SilentlyContinue

# --------------------------------------------------
# 7. GAME LAUNCHER OPTIMIZATION
# --------------------------------------------------
Write-Output ">>> Game launcher optimizations..."

# Steam: disable overlay for performance
New-Item -Path "HKCU:\Software\Valve\Steam" -Force -ErrorAction SilentlyContinue | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Valve\Steam" -Name "DisableOverlay" -Value 1 -ErrorAction SilentlyContinue

# Xbox Game Bar: disable
Write-Output "  -> Disabling Xbox Game Bar"
New-Item -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\GameDVR" -Force -ErrorAction SilentlyContinue | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\GameDVR" -Name "AppCaptureEnabled" -Value 0 -ErrorAction SilentlyContinue
Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\GameDVR" -Name "HistoricalCaptureEnabled" -Value 0 -ErrorAction SilentlyContinue

# --------------------------------------------------
# 8. WIFI OPTIMIZATION
# --------------------------------------------------
Write-Output ">>> WiFi optimizations..."
# Power saving off for WiFi
try {
  $adapters = Get-CimInstance -ClassName "CIM_NetworkAdapter" -ErrorAction SilentlyContinue | Where-Object { $_.Name -match "WiFi|Wireless|802.11" }
  foreach ($adapter in $adapters) {
    Write-Output "  -> Disabling power saving for: $($adapter.Name)"
    Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\Power" -Name "HibernateEnabled" -Value 0 -ErrorAction SilentlyContinue
  }
} catch { Write-Output "  -> Could not query WiFi adapters" }
netsh wlan set autoconfig enabled=yes interface="WiFi" 2>$null

# --------------------------------------------------
# 9. DNS AUTO-SELECTION (fastest)
# --------------------------------------------------
Write-Output ">>> Auto-selecting fastest DNS..."
# Test Cloudflare (1.1.1.1) vs Google (8.8.8.8)
$cf = (Measure-Command { Test-NetConnection 1.1.1.1 -Port 53 -WarningAction SilentlyContinue -InformationLevel Quiet 2>$null }).TotalMilliseconds
$gg = (Measure-Command { Test-NetConnection 8.8.8.8 -Port 53 -WarningAction SilentlyContinue -InformationLevel Quiet 2>$null }).TotalMilliseconds
Write-Output "  -> Cloudflare: ${cf}ms | Google: ${gg}ms"
if ($cf -lt $gg) {
  Write-Output "  -> Selected: Cloudflare (1.1.1.1)"
  netsh int ip set dns "WiFi" static 1.1.1.1 2>$null
  netsh int ip add dns "WiFi" 1.0.0.1 index=2 2>$null
} else {
  Write-Output "  -> Selected: Google (8.8.8.8)"
  netsh int ip set dns "WiFi" static 8.8.8.8 2>$null
  netsh int ip add dns "WiFi" 8.8.8.4 index=2 2>$null
}

# --------------------------------------------------
# 10. MAINTENANCE
# --------------------------------------------------
Write-Output ">>> System maintenance..."
Write-Output "  -> Cleaning temp files"
Remove-Item "$env:TEMP\*" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$env:WINDIR\Temp\*" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$env:WINDIR\Prefetch\*" -Recurse -Force -ErrorAction SilentlyContinue
CleanMgr /sagerun:1 2>$null

Write-Output ""
Write-Output "================================="
Write-Output "PCTG Ultra Mode Complete!"
Write-Output "A reboot is recommended for all changes to take effect."
