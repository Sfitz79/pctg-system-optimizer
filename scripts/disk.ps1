Write-Output "Starting safe Disk Optimization..."
Write-Output ""

Write-Output ">>> Enabling TRIM for SSDs..."
fsutil behavior set DisableDeleteNotify 0 2>$null

Write-Output ">>> Enabling Storage Sense..."
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\StorageSense\Parameters\StoragePolicy" /v 01 /t REG_DWORD /d 1 /f 2>$null

Write-Output ">>> Cleaning user temp files..."
Remove-Item -Path "$env:TEMP\*" -Recurse -Force -ErrorAction SilentlyContinue

Write-Output ">>> Cleaning Windows temp files..."
Remove-Item -Path "$env:SystemRoot\Temp\*" -Recurse -Force -ErrorAction SilentlyContinue

Write-Output ">>> Cleaning Delivery Optimization cache..."
Remove-Item -Path "$env:SystemRoot\SoftwareDistribution\Download\*" -Recurse -Force -ErrorAction SilentlyContinue

Write-Output ">>> Cleaning Prefetch files..."
Remove-Item -Path "$env:SystemRoot\Prefetch\*" -Recurse -Force -ErrorAction SilentlyContinue

Write-Output ">>> Emptying Recycle Bin..."
Clear-RecycleBin -Force -ErrorAction SilentlyContinue

Write-Output ">>> Running Disk Cleanup..."
Start-Process -FilePath "cleanmgr.exe" -ArgumentList "/sagerun:1" -Wait -NoNewWindow 2>$null

Write-Output "Safe Disk Optimization complete."
