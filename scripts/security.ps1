Write-Output "Running Defender quick scan..."
Start-MpScan -ScanType QuickScan

Write-Output "Refreshing firewall rules..."
netsh advfirewall reset

Write-Output "Enabling SmartScreen..."
Set-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer" -Name SmartScreenEnabled -Value "RequireAdmin"

Write-Output "Enabling exploit protection..."
Set-ProcessMitigation -System -Enable DEP, SEHOP, CFG

Write-Output "Removing malicious startup entries..."
Get-CimInstance Win32_StartupCommand | Where-Object {
  $_.Location -notlike "*Microsoft*"
} | Remove-CimInstance

Write-Output "Security Hardening complete."
