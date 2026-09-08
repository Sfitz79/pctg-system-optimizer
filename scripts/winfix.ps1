Write-Output "Starting 1‑Click Windows File Check & Fix..."
Write-Output ""

Write-Output ">>> Running sfc /scannow..."
sfc /scannow
Write-Output ""

Write-Output ">>> Running DISM /RestoreHealth..."
DISM /Online /Cleanup-Image /RestoreHealth
Write-Output ""

Write-Output ">>> Running DISM /checkhealth..."
Dism.exe /online /Cleanup-Image /checkhealth
Write-Output ""

Write-Output ">>> Running DISM /scanhealth..."
Dism.exe /online /Cleanup-Image /scanhealth
Write-Output ""

Write-Output ">>> Running DISM /AnalyzeComponentStore..."
Dism.exe /Online /Cleanup-Image /AnalyzeComponentStore
Write-Output ""

Write-Output ">>> Running DISM /StartComponentCleanup..."
Dism.exe /Online /Cleanup-Image /StartComponentCleanup
Write-Output ""

Write-Output "1‑Click Windows File Check & Fix complete."
