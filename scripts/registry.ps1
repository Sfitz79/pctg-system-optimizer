Write-Output "Starting safe Registry Optimization..."
Write-Output ""

Write-Output ">>> Optimizing system performance keys..."
reg add "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management" /v DisablePagingExecutive /t REG_DWORD /d 1 /f 2>$null
reg add "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management" /v LargeSystemCache /t REG_DWORD /d 0 /f 2>$null

Write-Output ">>> Disabling Nagle's Algorithm for better network responsiveness..."
reg add "HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces" /v TcpAckFrequency /t REG_DWORD /d 1 /f 2>$null
reg add "HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces" /v TCPNoDelay /t REG_DWORD /d 1 /f 2>$null

Write-Output ">>> Optimizing Windows responsiveness..."
reg add "HKCU\Control Panel\Desktop" /v AutoEndTasks /t REG_SZ /d 1 /f 2>$null
reg add "HKCU\Control Panel\Desktop" /v MenuShowDelay /t REG_SZ /d 50 /f 2>$null
reg add "HKCU\Control Panel\Desktop" /v WaitToKillAppTimeout /t REG_SZ /d 3000 /f 2>$null
reg add "HKCU\Control Panel\Desktop" /v HungAppTimeout /t REG_SZ /d 3000 /f 2>$null

Write-Output ">>> Enabling hardware acceleration and GPU scheduling..."
reg add "HKLM\SYSTEM\CurrentControlSet\Control\GraphicsDrivers" /v HwSchMode /t REG_DWORD /d 2 /f 2>$null

Write-Output ">>> Optimizing file system and NTFS..."
reg add "HKLM\SYSTEM\CurrentControlSet\Control\FileSystem" /v NtfsDisableLastAccessUpdate /t REG_DWORD /d 1 /f 2>$null
reg add "HKLM\SYSTEM\CurrentControlSet\Control\FileSystem" /v NtfsDisable8dot3NameCreation /t REG_DWORD /d 1 /f 2>$null

Write-Output ">>> Disabling Cortana and web search..."
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Search" /v CortanaConsent /t REG_DWORD /d 0 /f 2>$null
reg add "HKLM\SOFTWARE\Policies\Microsoft\Windows\Windows Search" /v AllowCortana /t REG_DWORD /d 0 /f 2>$null
reg add "HKLM\SOFTWARE\Policies\Microsoft\Windows\Windows Search" /v DisableWebSearch /t REG_DWORD /d 1 /f 2>$null

Write-Output ">>> Disabling startup delay and background apps..."
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\BackgroundAccessApplications" /v GlobalUserDisabled /t REG_DWORD /d 1 /f 2>$null
reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer" /v Serialize /t REG_DWORD /d 0 /f 2>$null

Write-Output "Safe Registry Optimization complete."
