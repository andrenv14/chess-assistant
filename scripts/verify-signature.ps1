param(
    [string]$Path = "apps/desktop/release/Chess-Assistant-0.1.0-Setup.exe",
    [switch]$RequireTrusted
)

$resolved = (Resolve-Path -LiteralPath $Path).Path
$signature = Get-AuthenticodeSignature -LiteralPath $resolved
$result = [PSCustomObject]@{
    Path = $resolved
    Status = $signature.Status.ToString()
    Publisher = if ($signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { $null }
    Thumbprint = if ($signature.SignerCertificate) { $signature.SignerCertificate.Thumbprint } else { $null }
}
$result | Format-List

if ($RequireTrusted -and $signature.Status -ne "Valid") {
    throw "The installer is not signed by a currently trusted certificate."
}
