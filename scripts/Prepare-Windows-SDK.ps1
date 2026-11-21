[CmdletBinding()]
param(
    [string]$ToolsRoot = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path '.build-tools\windows')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Stop-Build([string]$Message) {
    throw "[Aura Player] $Message"
}

function Get-RequiredCommand([string]$Name) {
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $command) { Stop-Build "Required build command was not found: $Name" }
    return $command.Source
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$toolsRoot = [IO.Path]::GetFullPath($ToolsRoot)
$downloadDir = Join-Path $toolsRoot 'downloads'
$mpvExtractDir = Join-Path $toolsRoot 'mpv-sdk'
$runtimeDir = Join-Path $toolsRoot 'mpv-runtime'
$vcpkgRoot = Join-Path $toolsRoot 'vcpkg'
$vcpkgInstall = Join-Path $toolsRoot 'vcpkg-installed'
$mpvArchive = Join-Path $downloadDir 'libmpv-v0.42.0-x86_64-w64-mingw32-lgpl.zip'

New-Item -ItemType Directory -Force -Path $downloadDir, $mpvExtractDir, $runtimeDir | Out-Null

# Pin the upstream Windows x64 LGPL package and verify its published SHA-256.
$mpvUrl = 'https://github.com/mpv-player/mpv/releases/download/v0.42.0/libmpv-v0.42.0-x86_64-w64-mingw32-lgpl.zip'
$mpvSha256 = '8e5f77430efc53ef175804ba6618527e3af0448a0dcabf04d3cc72659d1a6fce'

if (-not (Test-Path $mpvArchive)) {
    Write-Host '[Aura Player] Downloading the pinned official libmpv LGPL x64 SDK...'
    Invoke-WebRequest -Uri $mpvUrl -OutFile $mpvArchive
}
$archiveHash = (Get-FileHash -Path $mpvArchive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($archiveHash -ne $mpvSha256) {
    Remove-Item -Force $mpvArchive
    Stop-Build "libmpv archive SHA-256 mismatch. Expected $mpvSha256, received $archiveHash."
}

if (-not (Get-ChildItem -Path $mpvExtractDir -Filter 'libmpv-2.dll' -File -Recurse -ErrorAction SilentlyContinue)) {
    Expand-Archive -Path $mpvArchive -DestinationPath $mpvExtractDir -Force
}

$mpvDll = Get-ChildItem -Path $mpvExtractDir -Filter 'libmpv-2.dll' -File -Recurse | Select-Object -First 1
$mpvHeader = Get-ChildItem -Path $mpvExtractDir -Filter 'client.h' -File -Recurse |
    Where-Object { $_.Directory.Name -eq 'mpv' } | Select-Object -First 1
if (-not $mpvDll) { Stop-Build 'The verified libmpv archive does not contain libmpv-2.dll.' }
if (-not $mpvHeader) { Stop-Build 'The verified libmpv archive does not contain include/mpv/client.h.' }

$mpvIncludeDir = $mpvHeader.Directory.Parent.FullName
foreach ($header in @('client.h', 'render.h', 'render_gl.h')) {
    if (-not (Test-Path (Join-Path $mpvIncludeDir "mpv\$header"))) {
        Stop-Build "The libmpv SDK is missing required header: mpv/$header"
    }
}

# Keep the complete SDK/runtime beside the project; nothing is installed system-wide.
Get-ChildItem -Path $runtimeDir -File -ErrorAction SilentlyContinue | Remove-Item -Force
$runtimeFiles = Get-ChildItem -Path $mpvDll.Directory.FullName -Filter '*.dll' -File -Recurse
if (-not $runtimeFiles) { Stop-Build 'No libmpv runtime DLLs were found in the verified SDK.' }
foreach ($file in $runtimeFiles) {
    $destination = Join-Path $runtimeDir $file.Name
    if (Test-Path $destination) {
        $existingHash = (Get-FileHash $destination -Algorithm SHA256).Hash
        $incomingHash = (Get-FileHash $file.FullName -Algorithm SHA256).Hash
        if ($existingHash -ne $incomingHash) {
            Stop-Build "Duplicate runtime DLL has conflicting contents: $($file.Name)"
        }
    } else {
        Copy-Item -LiteralPath $file.FullName -Destination $destination
    }
}

# Convert the MinGW import table distributed by upstream into an MSVC .lib.
# This is a link-time file only; the original upstream DLL remains the runtime.
$dumpbin = Get-RequiredCommand 'dumpbin.exe'
$libTool = Get-RequiredCommand 'lib.exe'
$exportsText = & $dumpbin /nologo /exports $mpvDll.FullName 2>&1
if ($LASTEXITCODE -ne 0) { Stop-Build 'dumpbin could not read the upstream libmpv exports.' }
$exports = @()
foreach ($line in $exportsText) {
    if ("$line" -match '^\s*\d+\s+[0-9A-Fa-f]+\s+[0-9A-Fa-f]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*$') {
        $exports += $Matches[1]
    }
}
$exports = @($exports | Sort-Object -Unique)
if ($exports.Count -lt 20) {
    Stop-Build "Only $($exports.Count) libmpv exports were parsed; refusing to create an incomplete import library."
}

$definitionFile = Join-Path $toolsRoot 'libmpv-2.def'
$importLibrary = Join-Path $toolsRoot 'libmpv-2.lib'
@("LIBRARY libmpv-2.dll", 'EXPORTS', $exports) | Set-Content -Path $definitionFile -Encoding Ascii
& $libTool /nologo "/def:$definitionFile" "/out:$importLibrary" /machine:x64
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $importLibrary)) {
    Stop-Build 'MSVC could not generate the x64 libmpv import library.'
}

# Install SDL2 into this project-local tools directory via an isolated vcpkg root.
$git = Get-RequiredCommand 'git.exe'
if (-not (Test-Path (Join-Path $vcpkgRoot '.git'))) {
    if (Test-Path $vcpkgRoot) { Remove-Item -Recurse -Force $vcpkgRoot }
    & $git clone --depth 1 https://github.com/microsoft/vcpkg.git $vcpkgRoot
    if ($LASTEXITCODE -ne 0) { Stop-Build 'Could not clone vcpkg into the project-local build tools directory.' }
}
$vcpkgBootstrap = Join-Path $vcpkgRoot 'bootstrap-vcpkg.bat'
$vcpkgExe = Join-Path $vcpkgRoot 'vcpkg.exe'
if (-not (Test-Path $vcpkgExe)) {
    & $vcpkgBootstrap -disableMetrics
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $vcpkgExe)) {
        Stop-Build 'Could not bootstrap the project-local vcpkg executable.'
    }
}

& $vcpkgExe install sdl2:x64-windows "--x-install-root=$vcpkgInstall" --disable-metrics
if ($LASTEXITCODE -ne 0) { Stop-Build 'Project-local SDL2 installation failed.' }

$sdl2Dir = Join-Path $vcpkgInstall 'x64-windows\share\sdl2'
$sdl2Dll = Join-Path $vcpkgInstall 'x64-windows\bin\SDL2.dll'
if (-not (Test-Path (Join-Path $sdl2Dir 'SDL2Config.cmake'))) {
    Stop-Build "SDL2 CMake package was not found: $sdl2Dir"
}
if (-not (Test-Path $sdl2Dll)) { Stop-Build "SDL2 runtime DLL was not found: $sdl2Dll" }
Copy-Item -LiteralPath $sdl2Dll -Destination (Join-Path $runtimeDir 'SDL2.dll') -Force

$env:MPV_INCLUDE_DIR = $mpvIncludeDir
$env:MPV_LIB = $importLibrary
$env:MPV_RUNTIME_DIR = $runtimeDir
$env:SDL2_DIR = $sdl2Dir

$env:MPV_INCLUDE_DIR | Set-Content (Join-Path $toolsRoot 'MPV_INCLUDE_DIR.txt')
$env:MPV_LIB | Set-Content (Join-Path $toolsRoot 'MPV_LIB.txt')
$env:MPV_RUNTIME_DIR | Set-Content (Join-Path $toolsRoot 'MPV_RUNTIME_DIR.txt')
$env:SDL2_DIR | Set-Content (Join-Path $toolsRoot 'SDL2_DIR.txt')

Write-Host '[Aura Player] Project-local Windows SDK is ready.' -ForegroundColor Green
Write-Host "  libmpv version: v0.42.0 (LGPL package, x64)"
Write-Host "  MPV headers: $env:MPV_INCLUDE_DIR"
Write-Host "  MPV import library: $env:MPV_LIB"
Write-Host "  Runtime DLL directory: $env:MPV_RUNTIME_DIR"
Write-Host "  SDL2 CMake package: $env:SDL2_DIR"

[pscustomobject]@{
    MpvIncludeDir = $env:MPV_INCLUDE_DIR
    MpvLib = $env:MPV_LIB
    MpvRuntimeDir = $env:MPV_RUNTIME_DIR
    Sdl2Dir = $env:SDL2_DIR
}