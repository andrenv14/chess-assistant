[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $repositoryRoot "backend"
$pythonPath = Join-Path $backendRoot ".venv\Scripts\python.exe"
$stockfishRoot = Join-Path $backendRoot "vendor\stockfish"
$stockfishExecutable = Join-Path $stockfishRoot "stockfish-windows-x86-64-universal.exe"
$stockfishLicense = Join-Path $stockfishRoot "Copying.txt"
$stockfishSource = Join-Path $stockfishRoot "src"
$openingsPath = Join-Path $backendRoot "data\lichess_openings.tsv"

if (-not (Test-Path -LiteralPath $pythonPath -PathType Leaf)) {
    throw "Ambiente Python ausente. Crie backend\.venv e instale o grupo package."
}
if (-not (Test-Path -LiteralPath $stockfishExecutable -PathType Leaf)) {
    throw "Stockfish ausente. Execute scripts\install-stockfish.ps1 antes de empacotar."
}
if (-not (Test-Path -LiteralPath $stockfishLicense -PathType Leaf)) {
    throw "A licenca GPL do Stockfish precisa acompanhar o pacote."
}
if (-not (Test-Path -LiteralPath $stockfishSource -PathType Container)) {
    throw "O codigo-fonte correspondente do Stockfish precisa acompanhar o pacote."
}
if (-not (Test-Path -LiteralPath $openingsPath -PathType Leaf)) {
    throw "Base local de aberturas ausente."
}

Push-Location $backendRoot
try {
    & $pythonPath -m PyInstaller `
        --noconfirm `
        --clean `
        --onedir `
        --name chess-assistant-backend `
        --add-data "data;data" `
        --add-data "vendor\stockfish;vendor\stockfish" `
        --collect-all uvicorn `
        --hidden-import uvicorn.loops.asyncio `
        --hidden-import uvicorn.protocols.http.h11_impl `
        --hidden-import uvicorn.protocols.websockets.websockets_impl `
        run_backend.py
    if ($LASTEXITCODE -ne 0) {
        throw "PyInstaller encerrou com codigo $LASTEXITCODE."
    }
} finally {
    Pop-Location
}

$packagedExecutable = Join-Path $backendRoot "dist\chess-assistant-backend\chess-assistant-backend.exe"
if (-not (Test-Path -LiteralPath $packagedExecutable -PathType Leaf)) {
    throw "O executavel esperado do backend nao foi criado."
}

Write-Host "Backend autocontido criado em $packagedExecutable"
