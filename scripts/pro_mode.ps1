Write-Output "Running PRO Mode - Deep Optimisation..."
Write-Output "Disabling unnecessary services..."
@("DiagTrack", "dmwappushservice", "WSearch", "SysMain", "MapsBroker", "XboxNetApiSvc", "XblAuthManager", "lfsvc") | ForEach-Object {
  Stop-Service $_ -Force -ErrorAction SilentlyContinue
  Set-Service $_ -StartupType Disabled -ErrorAction SilentlyContinue
}
Write-Output "Clearing prefetch and temp..."
Remove-Item "$env:WINDIR\Prefetch\*" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$env:TEMP\*" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$env:WINDIR\Temp\*" -Recurse -Force -ErrorAction SilentlyContinue
Write-Output "Setting power scheme to High Performance..."
powercfg /setactive SCHEME_MIN
Write-Output "Disabling visual effects..."
Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects" -Name VisualFXSetting -Value 2
Write-Output "Clearing DNS cache..."
ipconfig /flushdns
Write-Output "PRO Mode complete."
