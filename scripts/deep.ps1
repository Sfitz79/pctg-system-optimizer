param([string]$toggles = "")

Write-Output "Starting Windows Deep Optimization..."
$active = $toggles -split ","

function Apply-Toggle {
  param([string]$key, [int]$enabled, [string]$desc)
  if ($active -contains $key -or $toggles -eq "") {
    Write-Output "  $desc..."
    switch ($key) {
      "startupApps" {
        if ($enabled) { reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" /f 2>$null }
        else { reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" /f 2>$null }
      }
      "backgroundApps" { reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\BackgroundAccessApplications" /v GlobalUserDisabled /t REG_DWORD /d $enabled /f 2>$null }
      "telemetry" { reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\DataCollection" /v AllowTelemetry /t REG_DWORD /d $(if($enabled){1}else{3}) /f 2>$null }
      "gameBar" {
        reg add "HKCU\Software\Microsoft\GameBar" /v AllowAutoGameMode /t REG_DWORD /d $(if($enabled){0}else{1}) /f 2>$null
        reg add "HKCU\Software\Microsoft\GameBar" /v ShowStartupPanel /t REG_DWORD /d $(if($enabled){0}else{1}) /f 2>$null
      }
      "oneDrive" { reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v OneDrive /t REG_SZ /d "" /f 2>$null }
      "widgets" { reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced" /v TaskbarDa /t REG_DWORD /d $(if($enabled){0}else{1}) /f 2>$null }
    }
    Write-Output "  ✔ $desc"
  }
}

if ($toggles -eq "") {
  Write-Output "Applying all optimizations..."
}

Apply-Toggle "startupApps" 1 "Disable startup apps"
Apply-Toggle "backgroundApps" 1 "Disable background apps"
Apply-Toggle "telemetry" 1 "Reduce telemetry"
Apply-Toggle "gameBar" 1 "Disable Xbox Game Bar"
Apply-Toggle "oneDrive" 1 "Disable OneDrive auto-start"
Apply-Toggle "widgets" 1 "Disable Widgets"

Write-Output "Windows Deep Optimization complete."
