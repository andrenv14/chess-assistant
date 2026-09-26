param(
    [string]$Installer = "apps/desktop/release/Chess-Assistant-0.1.0-Setup.exe",
    [int]$BackendPort = 18766
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$installerPath = (Resolve-Path -LiteralPath (Join-Path $repoRoot $Installer)).Path
$qaRoot = Join-Path $repoRoot ".qa\installer-$PID"
$installDir = Join-Path $qaRoot "app"
$dataDir = Join-Path $qaRoot "localappdata"
$appProcess = $null

New-Item -ItemType Directory -Path $installDir,$dataDir -Force | Out-Null

function Wait-Health([bool]$Expected, [int]$Seconds = 30) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        $healthy = $false
        try {
            $response = Invoke-RestMethod -Uri "http://127.0.0.1:$BackendPort/health" -TimeoutSec 1
            $healthy = $response.status -eq "ok"
        } catch {}
        if ($healthy -eq $Expected) { return }
        Start-Sleep -Milliseconds 250
    }
    throw "Backend health did not become $Expected."
}

try {
    $installProcess = Start-Process -FilePath $installerPath -ArgumentList "/S","/D=$installDir" -WindowStyle Hidden -Wait -PassThru
    if ($installProcess.ExitCode -ne 0) { throw "Installer exited with code $($installProcess.ExitCode)." }
    $appExe = Join-Path $installDir "Chess Assistant.exe"
    if (-not (Test-Path -LiteralPath $appExe)) { throw "Installed application was not found." }

    $previousLocalAppData = $env:LOCALAPPDATA
    $previousBackendPort = $env:CHESS_ASSISTANT_PORT
    $env:LOCALAPPDATA = $dataDir
    $env:CHESS_ASSISTANT_PORT = [string]$BackendPort
    try {
        $appProcess = Start-Process -FilePath $appExe -ArgumentList "--force-device-scale-factor=1","--remote-debugging-port=9242" -WindowStyle Hidden -PassThru
    } finally {
        $env:LOCALAPPDATA = $previousLocalAppData
        $env:CHESS_ASSISTANT_PORT = $previousBackendPort
    }
    Wait-Health $true 45
    & node (Join-Path $repoRoot "scripts\check-installed-renderer.mjs") 9242
    if ($LASTEXITCODE -ne 0) { throw "Installed renderer check failed." }

    $health = Invoke-RestMethod -Uri "http://127.0.0.1:$BackendPort/health"
    $body = @{ fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"; actor = "user" } | ConvertTo-Json
    $analysis = Invoke-RestMethod -Uri "http://127.0.0.1:$BackendPort/api/evidence" -Method Post -ContentType "application/json" -Body $body
    if ($health.opening_positions -ne 3815 -or $analysis.candidates.Count -lt 3) {
        throw "Installed build did not return the expected catalogue and candidates."
    }

    if (-not $appProcess.CloseMainWindow()) { Stop-Process -Id $appProcess.Id }
    $appProcess.WaitForExit(10000) | Out-Null
    Wait-Health $false 20

    $uninstaller = Get-ChildItem -LiteralPath $installDir -Filter "*uninstall*.exe" | Select-Object -First 1
    if (-not $uninstaller) { throw "Uninstaller was not created." }
    $uninstallProcess = Start-Process -FilePath $uninstaller.FullName -ArgumentList "/S" -WindowStyle Hidden -Wait -PassThru
    if ($uninstallProcess.ExitCode -ne 0) { throw "Uninstaller exited with code $($uninstallProcess.ExitCode)." }
    Write-Output "Installed build OK: 3,815 openings, $($analysis.candidates.Count) candidates, clean uninstall."
} finally {
    if ($appProcess -and -not $appProcess.HasExited) { Stop-Process -Id $appProcess.Id }
    if (Test-Path -LiteralPath $qaRoot) {
        $resolvedQa = (Resolve-Path -LiteralPath $qaRoot).Path
        if (-not $resolvedQa.StartsWith((Join-Path $repoRoot ".qa"), [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to clean an unexpected QA path: $resolvedQa"
        }
        Remove-Item -LiteralPath $resolvedQa -Recurse -Force
    }
}
