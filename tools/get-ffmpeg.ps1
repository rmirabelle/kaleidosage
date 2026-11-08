<#
.SYNOPSIS
  Download the FFmpeg program that video export uses into src-tauri/ffmpeg.

.DESCRIPTION
  ffmpeg.exe is too large for GitHub, so it is not in the repository. Run this
  once in a new checkout, or to get a newer build. It checks the download
  against the build's published SHA-256. After a newer build, update the build
  line in src-tauri/ffmpeg/SOURCE.txt.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$name = "ffmpeg-n9.0-latest-win64-gpl-9.0"
$base = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest"
$target = Join-Path $PSScriptRoot "..\src-tauri\ffmpeg"
$work = Join-Path ([IO.Path]::GetTempPath()) ("kaleidosage-ffmpeg-" + [Guid]::NewGuid())
New-Item -ItemType Directory -Force -Path $work, $target | Out-Null

try {
  $zip = Join-Path $work "$name.zip"
  $sums = Join-Path $work "checksums.sha256"
  Write-Host "==> Downloading $name.zip (about 195 MB) ..." -ForegroundColor Cyan
  Invoke-WebRequest -UseBasicParsing -Uri "$base/$name.zip" -OutFile $zip
  Invoke-WebRequest -UseBasicParsing -Uri "$base/checksums.sha256" -OutFile $sums

  $line = Get-Content $sums | Where-Object { $_ -match "\s\*?$([regex]::Escape($name))\.zip$" } | Select-Object -First 1
  if (-not $line) { throw "The checksum list has no entry for $name.zip." }
  $expected = ($line -split "\s+")[0]
  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $zip).Hash
  if ($actual -ine $expected) { throw "The download does not match its SHA-256 checksum." }

  Expand-Archive -LiteralPath $zip -DestinationPath $work
  Copy-Item -LiteralPath (Join-Path $work "$name\bin\ffmpeg.exe") -Destination $target -Force
  Copy-Item -LiteralPath (Join-Path $work "$name\LICENSE.txt") -Destination $target -Force
  Write-Host "==> FFmpeg is in src-tauri\ffmpeg." -ForegroundColor Green
}
finally {
  Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}
