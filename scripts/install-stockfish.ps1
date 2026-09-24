[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$release = "19"
$archiveSha256 = "3C8BF1F9EA66A09350A40DF4F632288285AC206D99F33AB5842C408FC30B48A7"
$downloadUrl = "https://github.com/official-stockfish/Stockfish/releases/download/sf_19/stockfish-windows-x86-64-universal.zip"
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$vendorRoot = Join-Path $repositoryRoot "backend\vendor"
$engineRoot = Join-Path $vendorRoot "stockfish"
$enginePath = Join-Path $engineRoot "stockfish-windows-x86-64-universal.exe"
$archivePath = Join-Path $vendorRoot "stockfish-$release.zip"

if (Test-Path -LiteralPath $enginePath -PathType Leaf) {
    Write-Host "Stockfish $release já está instalado em $enginePath"
    exit 0
}

New-Item -ItemType Directory -Force -Path $vendorRoot | Out-Null
Write-Host "Baixando Stockfish $release do repositório oficial..."
Invoke-WebRequest -Uri $downloadUrl -OutFile $archivePath

$actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash
if ($actualHash -ne $archiveSha256) {
    Remove-Item -LiteralPath $archivePath -Force
    throw "Checksum inválido para o arquivo do Stockfish. Download descartado."
}

Expand-Archive -LiteralPath $archivePath -DestinationPath $vendorRoot -Force
Remove-Item -LiteralPath $archivePath -Force

if (-not (Test-Path -LiteralPath $enginePath -PathType Leaf)) {
    throw "O pacote oficial não continha o executável esperado: $enginePath"
}

Write-Host "Stockfish $release instalado e pronto para descoberta automática."
