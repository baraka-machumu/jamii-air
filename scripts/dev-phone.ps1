# Runs the local stack for testing on a phone (development only; see mobile/README.md).
# Finds this computer's current Wi-Fi address, then (re)starts, each in its own window:
#   - the API on :3000 (no invite codes) and the media worker, with storage URLs at that address;
#   - the Expo dev server on :8081, advertising that address to the dev build.
# MinIO is opened to the network (MINIO_BIND=0.0.0.0). Run it again whenever the address changes.
#
#   powershell -ExecutionPolicy Bypass -File scripts\dev-phone.ps1            # restart everything
#   powershell -ExecutionPolicy Bypass -File scripts\dev-phone.ps1 -Build     # rebuild the API first
param([switch]$Build)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root 'backend'
$mobile = Join-Path $root 'mobile'

# The address of the interface that carries the default route (Wi-Fi or hotspot), not VPNs or WSL.
$route = Get-NetRoute -DestinationPrefix 0.0.0.0/0 | Sort-Object RouteMetric, InterfaceMetric | Select-Object -First 1
$ip = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $route.InterfaceIndex | Where-Object { $_.IPAddress -notlike '169.*' } | Select-Object -First 1).IPAddress
if (-not $ip) { throw 'No IPv4 address on the default network: connect to Wi-Fi first.' }
$network = (Get-NetConnectionProfile -InterfaceIndex $route.InterfaceIndex -ErrorAction SilentlyContinue).Name
Write-Host "Network: $network   Address: $ip" -ForegroundColor Cyan

# Stop what an earlier run (or a manual start) left behind: this repo's API, worker and Expo server.
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'jamii-air[\\/]backend[\\/]dist[\\/](main|worker)|dist[\\/](main|worker)\.js|jamii-air[\\/]mobile.*expo.*\bstart\b' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; Write-Host "Stopped old process $($_.ProcessId)" }
# ...and close the windows the last run opened (their process ids are kept in a temp file).
$pidFile = Join-Path $env:TEMP 'jamii-dev-phone.pids'
if (Test-Path $pidFile) {
  Get-Content $pidFile | ForEach-Object { Stop-Process -Id ([int]$_) -Force -ErrorAction SilentlyContinue }
  Remove-Item $pidFile -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 1

Push-Location $backend
try {
  $env:MINIO_BIND = '0.0.0.0'
  docker compose up -d --wait minio | Out-Host
  if ($Build -or -not (Test-Path 'dist/main.js')) { npm run build | Out-Host }
} finally { Pop-Location }

$storage = "http://${ip}:9000"
$media = "$storage/jamii-air-media-local"
function Start-Window($title, $dir, $command) {
  $script = "`$Host.UI.RawUI.WindowTitle = '$title'; Set-Location '$dir'; $command"
  $window = Start-Process powershell -ArgumentList '-NoExit', '-Command', $script -PassThru
  Add-Content -Path $pidFile -Value $window.Id
}
Start-Window 'Jamii API :3000' $backend "`$env:REQUIRE_INVITE='false'; `$env:S3_PUBLIC_ENDPOINT='$storage'; `$env:MEDIA_BASE_URL='$media'; node --enable-source-maps dist/main.js"
Start-Window 'Jamii worker' $backend "`$env:S3_PUBLIC_ENDPOINT='$storage'; `$env:MEDIA_BASE_URL='$media'; node --enable-source-maps dist/worker.js"
# The route types are rewritten by the dev server; a stale copy only breaks the local typecheck.
Remove-Item (Join-Path $mobile '.expo/types/router.d.ts') -ErrorAction SilentlyContinue
Start-Window 'Jamii Expo :8081' $mobile "`$env:REACT_NATIVE_PACKAGER_HOSTNAME='$ip'; npx expo start --lan --port 8081"

# Wait until the API answers on the Wi-Fi address (what the phone will use).
$ok = $false
foreach ($i in 1..40) {
  try { if ((Invoke-WebRequest -UseBasicParsing "http://${ip}:3000/api/v1/health/live" -TimeoutSec 2).StatusCode -eq 200) { $ok = $true; break } } catch {}
  Start-Sleep -Seconds 1
}
Write-Host ''
if ($ok) { Write-Host "API is up on http://${ip}:3000" -ForegroundColor Green } else { Write-Host 'API did not answer yet: check the "Jamii API" window.' -ForegroundColor Yellow }
Write-Host "On the phone (same Wi-Fi):"
Write-Host "  1. Browser: http://${ip}:3000/api/v1/health/live  ->  {""status"":""ok""}"
Write-Host "  2. Jamii Air dev build: enter http://${ip}:8081 (or scan the QR in the Expo window)"
