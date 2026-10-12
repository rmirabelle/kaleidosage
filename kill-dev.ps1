<#
.SYNOPSIS
  Stop the KaleidoSage dev app: tree-kill kaleidosage.exe and free the Vite port.
#>
$ErrorActionPreference = "Continue"

Get-Process -Name kaleidosage -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Host "Stopping kaleidosage.exe (PID $($_.Id))"
  & taskkill.exe /PID $_.Id /T /F | Out-Null
}

foreach ($port in 14510, 14511) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object {
      Write-Host "Stopping PID $_ (port $port)"
      & taskkill.exe /PID $_ /T /F | Out-Null
    }
}
