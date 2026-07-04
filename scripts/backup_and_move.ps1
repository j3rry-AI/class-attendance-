$ts = Get-Date -Format 'yyyyMMdd_HHmmss'
$dest = "C:\Users\hp\Desktop\attend\trash_backup_$ts"
New-Item -ItemType Directory -Path $dest -Force | Out-Null
Move-Item -Path "C:\Users\hp\Desktop\attend\archive\frontend_archive" -Destination $dest -Force -ErrorAction SilentlyContinue
Move-Item -Path "C:\Users\hp\Desktop\attend\node-backend\db.json.bak" -Destination $dest -Force -ErrorAction SilentlyContinue
Write-Output $dest
Get-ChildItem -Path $dest -Recurse | Select-Object FullName