<#
.SYNOPSIS
  Download the models that the song analysis needs (src-tauri/src/song_analysis.rs and
  song_sections.rs) into %LOCALAPPDATA%\com.robmirabelle.kaleidosage\models, and check their SHA-256.
  Beat This! is MIT licensed: https://github.com/CPJKU/beat_this and https://github.com/danigb/beat-this-rs
  LinkSeg is CC-BY 4.0 (M. Buisson, B. McFee, S. Essid, ISMIR 2024): https://huggingface.co/elicwhite/linkseg-7c-onnx
#>
$ErrorActionPreference = "Stop"

$folder = Join-Path $env:LOCALAPPDATA "com.robmirabelle.kaleidosage\models"
New-Item -ItemType Directory -Force $folder | Out-Null

$repo = "https://raw.githubusercontent.com/danigb/beat-this-rs/1ae768e78f1ad83b0ed3886241dc29ffde853c40/models"
$models = @(
  @{ Name = "mel_spectrogram.onnx"; Url = "$repo/mel_spectrogram.onnx";
     Sha = "fdd59e65c515331308e4c8841edf99972deca646bdf6197744c2a5b7755e3de9" },
  @{ Name = "beat_this.onnx"; Url = "https://github.com/danigb/beat-this-rs/releases/download/model-large/beat_this.onnx";
     Sha = "5f810debe53459b559127fb55bbad40035bb47cc567b20e501670f968c770f02" },
  @{ Name = "linkseg_7c.onnx"; Url = "https://huggingface.co/elicwhite/linkseg-7c-onnx/resolve/b15f9d9f5f68409cbd2cc0e78beb208df497c6f5/linkseg_7c.onnx";
     Sha = "c1dac2e094d260678d0097b85da6f5189abfe87af4b9c6f7adebaf99f4896125" }
)

foreach ($model in $models) {
  $path = Join-Path $folder $model.Name
  if ((Test-Path $path) -and (Get-FileHash $path -Algorithm SHA256).Hash -eq $model.Sha) {
    Write-Host "$($model.Name) is already in place"
    continue
  }
  Write-Host "Downloading $($model.Name)"
  Invoke-WebRequest -Uri $model.Url -OutFile $path -UseBasicParsing
  if ((Get-FileHash $path -Algorithm SHA256).Hash -ne $model.Sha) {
    Remove-Item $path
    throw "$($model.Name) failed the SHA-256 check"
  }
}
Write-Host "Models are in $folder"
