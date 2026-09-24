[CmdletBinding()]
param(
    [string]$Python = "python",
    [switch]$DownloadModel
)

$ErrorActionPreference = "Stop"

$upstreamRevision = "1e13597c42d4858b7cfd7cfdae01e297263364b2"
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$environmentRoot = Join-Path $repositoryRoot "backend\vendor\maia3-venv"
$pythonPath = Join-Path $environmentRoot "Scripts\python.exe"
$enginePath = Join-Path $environmentRoot "Scripts\maia3-5m.exe"

if (-not (Test-Path -LiteralPath $pythonPath -PathType Leaf)) {
    Write-Host "Criando ambiente Python isolado para o Maia-3..."
    & $Python -m venv $environmentRoot
}

if (-not (Test-Path -LiteralPath $enginePath -PathType Leaf)) {
    Write-Host "Instalando Maia-3 oficial na revisão fixada $upstreamRevision..."
    & $pythonPath -m pip install "git+https://github.com/CSSLab/maia3.git@$upstreamRevision"
}

if (-not (Test-Path -LiteralPath $enginePath -PathType Leaf)) {
    throw "A instalação terminou sem criar o entry point esperado: $enginePath"
}

if ($DownloadModel) {
    $cacheCommand = Join-Path $environmentRoot "Scripts\maia3-cache.exe"
    Write-Host "Baixando antecipadamente o checkpoint Maia3-5M..."
    & $cacheCommand --model maia3-5m
}

Write-Host "Maia-3 instalado como módulo opcional em $enginePath"
if (-not $DownloadModel) {
    Write-Host "O checkpoint será baixado no primeiro uso ou com -DownloadModel."
}
