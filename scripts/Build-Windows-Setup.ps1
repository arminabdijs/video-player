[CmdletBinding()]
param(
    [string]$MpvSdkRoot = $env:AURA_MPV_SDK_ROOT,
    [string]$MpvIncludeDir = $env:MPV_INCLUDE_DIR,
    [string]$MpvLib = $env:MPV_LIB,
    [string]$MpvRuntimeDir = $env:MPV_RUNTIME_DIR,
    [string]$Sdl2Dir = $env:SDL2_DIR
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Stop-Build([string]$Message) {
    throw "[Aura Player] $Message"
}

function Invoke-Npm([string[]]$Arguments) {
    Write-Host "`n> npm $($Arguments -join ' ')" -ForegroundColor Cyan
    & npm @Arguments
    if ($LASTEXITCODE -ne 0) { Stop-Build "npm $($Arguments -join ' ') failed with exit code $LASTEXITCODE." }
}

if ($env:OS -ne 'Windows_NT') { Stop-Build 'Build the Windows installer on a Windows x64 runner; native Windows binaries cannot be cross-packaged on Linux/macOS.' }
if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Stop-Build 'Node.js 22+ and npm are required on the build runner.'
}
$nodeMajor = [int](& node -p 'parseInt(process.versions.node.split(".")[0], 10)')
if ($nodeMajor -lt 22) { Stop-Build "Node.js 22 or newer is required; found major version $nodeMajor." }
if (-not (Get-Command cmake -ErrorAction SilentlyContinue)) { Stop-Build 'CMake is required on the isolated build runner.' }

$useMingw = $env:AURA_WINDOWS_TOOLCHAIN -eq 'mingw'
if ($useMingw) {
    foreach ($tool in @('gcc', 'g++', 'ninja', 'objdump')) {
        if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { Stop-Build "The MinGW release toolchain is incomplete: '$tool' was not found on PATH." }
    }
} else {
    $vsWhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
    if (-not (Test-Path $vsWhere)) { Stop-Build 'Visual Studio 2022 Build Tools with the Desktop development with C++ workload are required for the local MSVC path.' }
    $vsPath = & $vsWhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if ($LASTEXITCODE -ne 0 -or -not $vsPath) { Stop-Build 'Visual Studio C++ x64 build tools were not found.' }
}

if ($MpvSdkRoot) {
    if (-not $MpvIncludeDir) { $MpvIncludeDir = Join-Path $MpvSdkRoot 'include' }
    if (-not $MpvRuntimeDir) { $MpvRuntimeDir = Join-Path $MpvSdkRoot 'bin' }
    if (-not $MpvLib) {
        $libCandidate = Get-ChildItem -Path $MpvSdkRoot -Filter 'libmpv*' -File -Recurse -ErrorAction SilentlyContinue |
            Where-Object { $_.Extension -eq '.lib' -or $_.Name.EndsWith('.dll.a') } | Select-Object -First 1
        if ($libCandidate) { $MpvLib = $libCandidate.FullName }
    }
}

if (-not $MpvIncludeDir -or -not (Test-Path (Join-Path $MpvIncludeDir 'mpv/client.h'))) {
    Stop-Build 'MPV_INCLUDE_DIR must contain mpv/client.h from the matching x64 libmpv SDK.'
}
if (-not $MpvLib -or -not (Test-Path $MpvLib)) { Stop-Build 'MPV_LIB must point to the matching x64 libmpv import library.' }
if (-not $MpvRuntimeDir -or -not (Test-Path (Join-Path $MpvRuntimeDir 'libmpv-2.dll'))) {
    Stop-Build 'MPV_RUNTIME_DIR must contain libmpv-2.dll from the same SDK/runtime build.'
}
if (-not (Test-Path (Join-Path $MpvRuntimeDir 'SDL2.dll'))) { Stop-Build 'MPV_RUNTIME_DIR must contain SDL2.dll.' }
if (-not $Sdl2Dir -or -not (Test-Path (Join-Path $Sdl2Dir 'SDL2Config.cmake'))) {
    Stop-Build 'SDL2_DIR must point to the directory containing SDL2Config.cmake.'
}

$env:MPV_INCLUDE_DIR = (Resolve-Path $MpvIncludeDir).Path
$env:MPV_LIB = (Resolve-Path $MpvLib).Path
$env:MPV_RUNTIME_DIR = (Resolve-Path $MpvRuntimeDir).Path
$env:SDL2_DIR = (Resolve-Path $Sdl2Dir).Path
if ($useMingw) {
    $env:CMAKE_GENERATOR = if ($env:CMAKE_GENERATOR) { $env:CMAKE_GENERATOR } else { 'Ninja' }
    Write-Host 'Aura Player Windows x64 build: isolated MinGW-w64/UCRT64 toolchain' -ForegroundColor Green
} else {
    Write-Host "Aura Player Windows x64 build: Visual Studio $vsPath" -ForegroundColor Green
}
Write-Host "  libmpv headers: $env:MPV_INCLUDE_DIR"
Write-Host "  libmpv import library: $env:MPV_LIB"
Write-Host "  bundled runtime DLL directory: $env:MPV_RUNTIME_DIR"
Write-Host "  SDL2 CMake package: $env:SDL2_DIR"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $projectRoot
try {
    Invoke-Npm @('ci', '--no-audit', '--no-fund')
    Invoke-Npm @('test')
    Invoke-Npm @('run', 'native:build')
    Invoke-Npm @('run', 'codec:diagnose')
    Invoke-Npm @('run', 'desktop:dist:windows:setup')

    $releaseDir = Join-Path $projectRoot 'release'
    $setup = Get-ChildItem -Path $releaseDir -Filter '*-Setup-*-x64.exe' -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $setup) { Stop-Build "electron-builder completed but no NSIS Setup EXE was found in $releaseDir." }

    $hash = (Get-FileHash -Path $setup.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    Write-Host "`nAura Player Windows x64 installer created successfully: $($setup.FullName)" -ForegroundColor Green
    Write-Host ('Size: {0:N1} MB' -f ($setup.Length / 1MB))
    Write-Host "SHA-256: $hash"
} finally {
    Pop-Location
}
