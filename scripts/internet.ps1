Write-Host "Starting Internet & WiFi Optimization (Performance Mode)..." -ForegroundColor Cyan

# -----------------------------
# 1. Flush DNS + Reset Network Stack
# -----------------------------
ipconfig /flushdns
netsh winsock reset
netsh int ip reset

# -----------------------------
# 2. Enable RSS (Receive Side Scaling)
# -----------------------------
Write-Host "Enabling RSS on all adapters..."
Get-NetAdapter | Where-Object Status -eq "Up" | ForEach-Object {
    Set-NetAdapterRss -Name $_.Name -Enabled $true -ErrorAction SilentlyContinue
}

# -----------------------------
# 3. Modern TCP Optimizations
# -----------------------------
Write-Host "Applying TCP Global Settings..."

# Auto-tuning level (best for gaming + browsing)
netsh int tcp set global autotuninglevel=normal

# Enable ECN (safe on modern routers)
netsh int tcp set global ecncapability=enabled

# Enable TCP Fast Open
netsh int tcp set global fastopen=enabled

# Enable HyStart (improves congestion control)
netsh int tcp set global hystart=enabled

# Enable PRR (Proportional Rate Reduction)
netsh int tcp set global prr=enabled

# Enable pacing (smooths latency)
netsh int tcp set global pacingprofile=always

# -----------------------------
# 4. Set DNS to Cloudflare + Google
# -----------------------------
Write-Host "Setting DNS to Cloudflare + Google..."

$interfaces = Get-NetAdapter | Where-Object Status -eq "Up"

foreach ($nic in $interfaces) {
    Set-DnsClientServerAddress -InterfaceAlias $nic.Name -ServerAddresses ("1.1.1.1","8.8.8.8") -ErrorAction SilentlyContinue
}

# -----------------------------
# 5. Disable Nagle's Algorithm (Corrected)
# -----------------------------
Write-Host "Disabling Nagle's Algorithm..."

$ifaces = Get-ChildItem "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces"

foreach ($iface in $ifaces) {
    New-ItemProperty -Path $iface.PSPath -Name "TcpAckFrequency" -Value 1 -PropertyType DWord -Force -ErrorAction SilentlyContinue
    New-ItemProperty -Path $iface.PSPath -Name "TCPNoDelay" -Value 1 -PropertyType DWord -Force -ErrorAction SilentlyContinue
}

# -----------------------------
# 6. WiFi Optimization
# -----------------------------
Write-Host "Optimizing WiFi..."

# Disable WiFi power saving
netsh wlan set power save-mode=off

# Prefer 5GHz band
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\WlanSvc\Parameters" -Name "PreferredBand" -Value 2 -PropertyType DWord -Force -ErrorAction SilentlyContinue

# Disable background scanning interruptions
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\WlanSvc\Parameters" -Name "ScanWhenAssociated" -Value 0 -PropertyType DWord -Force -ErrorAction SilentlyContinue

Write-Host "Internet & WiFi Optimization complete!" -ForegroundColor Green
