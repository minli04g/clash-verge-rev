$ErrorActionPreference = 'Stop'

$env:PATH = (Join-Path $env:APPDATA 'npm') + ';' + $env:PATH
$env:COREPACK_HOME = Join-Path $env:TEMP 'clash-corepack-036'

$buildConfig = [System.IO.Path]::GetTempFileName()
Push-Location (Split-Path $PSScriptRoot -Parent)

try {
    Set-Content -LiteralPath $buildConfig -Value '{"bundle":{"createUpdaterArtifacts":false}}' -Encoding ASCII
    pnpm build --config $buildConfig

    if ($LASTEXITCODE -ne 0) {
        throw 'Installer build failed.'
    }

    Invoke-Item 'target\release\bundle\nsis'
} finally {
    Remove-Item -LiteralPath $buildConfig
    Pop-Location
}
