Write-Output "Creating system restore point..."
Checkpoint-Computer -Description "PCTG Optimizer Pro Restore Point" -RestorePointType "MODIFY_SETTINGS"

Write-Output "Restore point created."
