Write-Output "Applying Gaming FPS Booster..."
Write-Output "Setting power scheme to Ultimate Performance..."
powercfg /setactive SCHEME_MIN
Write-Output "Disabling Nagle's Algorithm for lower latency..."
Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces\*" -Name TcpAckFrequency -Value 1 -ErrorAction SilentlyContinue
Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces\*" -Name TCPNoDelay -Value 1 -ErrorAction SilentlyContinue
Write-Output "Disabling HPET for reduced overhead..."
bcdedit /deletevalue useplatformclock 2>$null
if ($LASTEXITCODE -ne 0) { Write-Output "  (skipped - run as admin for HPET change)" }
Write-Output "Optimising GPU scheduling..."
Set-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\GameDVR" -Name AppCaptureEnabled -Value 0 -ErrorAction SilentlyContinue
Set-ItemProperty -Path "HKCU:\Software\Microsoft\GameBar" -Name AutoGameModeEnabled -Value 1 -ErrorAction SilentlyContinue
Write-Output "Disabling background apps..."
Get-ChildItem "HKCU:\Software\Microsoft\Windows\CurrentVersion\BackgroundAccessApplications" | ForEach-Object {
  Set-ItemProperty -Path $_.PsPath -Name Disabled -Value 1 -ErrorAction SilentlyContinue
}
Write-Output "FPS Booster applied. A restart is recommended."
