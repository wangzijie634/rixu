$ErrorActionPreference = 'Stop'
$daymarkRoot = $PSScriptRoot
$daymarkUrl = 'http://127.0.0.1:4173'
$daymarkReady = $false
try {
  $daymarkResponse = Invoke-WebRequest -Uri $daymarkUrl -UseBasicParsing -TimeoutSec 2
  $daymarkReady = $daymarkResponse.Content -match 'Daymark'
  if ($daymarkReady) {
    $daymarkApi = Invoke-WebRequest -Uri ($daymarkUrl + '/api/appearance') -UseBasicParsing -TimeoutSec 2
    $daymarkReady = $daymarkApi.StatusCode -eq 200
  }
} catch { $daymarkReady = $false }
if (-not $daymarkReady) {
  $daymarkNode = (Get-Command node -ErrorAction Stop).Source
  $daymarkServerFile = Join-Path $daymarkRoot 'server.mjs'
  $daymarkProcess = Start-Process -FilePath $daymarkNode -ArgumentList ('"' + $daymarkServerFile + '"') -WorkingDirectory $daymarkRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $daymarkRoot 'server.log') -RedirectStandardError (Join-Path $daymarkRoot 'server-error.log')
  for ($daymarkAttempt = 0; $daymarkAttempt -lt 30; $daymarkAttempt++) {
    Start-Sleep -Milliseconds 150
    try {
      $daymarkResponse = Invoke-WebRequest -Uri $daymarkUrl -UseBasicParsing -TimeoutSec 1
      if ($daymarkResponse.Content -match 'Daymark') {
        $daymarkApi = Invoke-WebRequest -Uri ($daymarkUrl + '/api/appearance') -UseBasicParsing -TimeoutSec 1
        if ($daymarkApi.StatusCode -eq 200) { $daymarkReady = $true; break }
      }
    } catch {}
    if ($daymarkProcess.HasExited) { break }
  }
}
if (-not $daymarkReady) { throw 'Daymark could not start. See server-error.log; port 4173 may be occupied.' }
Write-Output ('Daymark ready: ' + $daymarkUrl)
