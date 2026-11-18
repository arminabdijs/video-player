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
    Write-Error $Message
    exit 1
}

function Invoke-Npm([string[]]$Arguments) {
    Write-Host "`n> npm $($Arguments -join ' ')" -ForegroundColor Cyan
    & npm @Arguments
    if ($LASTEXITCODE -ne 0) {
        Stop-Build "npm $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
    }
}

if ($env:OS -ne 'Windows_NT') {
    Stop-Build 'Build the Windows installer on Windows x64. This script cannot create the native Windows libmpv runtime on Linux/macOS.'
}

if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Stop-Build 'Node.js 22+ and npm are required. Install the current Node.js LTS release, then reopen PowerShell.'
}
if (-not (Get-Command cmake -ErrorAction SilentlyContinue)) {
    Stop-Build 'CMake is required. Install CMake and reopen PowerShell.'
}

$vsWhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
if (-not (Test-Path $vsWhere)) {
    Stop-Build 'Visual Studio 2022 Build Tools with the Desktop development with C++ workload are required.'
}
$vsPath = & $vsWhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if ($LASTEXITCODE -ne 0 -or -not $vsPath) {
    Stop-Build 'Visual Studio C++ x64 build tools were not found. Install the Desktop development with C++ workload.'
}

if ($MpvSdkRoot) {
    if (-not $MpvIncludeDir) { $MpvIncludeDir = Join-Path $MpvSdkRoot 'include' }
    if (-not $MpvRuntimeDir) { $MpvRuntimeDir = Join-Path $MpvSdkRoot 'bin' }
    if (-not $MpvLib) {
        $libCandidate = Get-ChildItem -Path $MpvSdkRoot -Filter 'libmpv-2.lib' -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($libCandidate) { $MpvLib = $libCandidate.FullName }
    }
}

if (-not $MpvIncludeDir -or -not (Test-Path (Join-Path $MpvIncludeDir 'mpv/client.h'))) {
    Stop-Build 'MPV_INCLUDE_DIR must point to the matching x64 libmpv SDK include directory containing mpv/client.h.'
}
if (-not $MpvLib -or -not (Test-Path $MpvLib)) {
    Stop-Build 'MPV_LIB must point to the matching x64 libmpv import library (normally libmpv-2.lib).'
}
if (-not $MpvRuntimeDir -or -not (Test-Path (Join-Path $MpvRuntimeDir 'libmpv-2.dll'))) {
    Stop-Build 'MPV_RUNTIME_DIR must contain libmpv-2.dll from the same SDK/runtime build.'
}
if (-not (Test-Path (Join-Path $MpvRuntimeDir 'SDL2.dll'))) {
    Stop-Build 'MPV_RUNTIME_DIR must also contain SDL2.dll.'
}
if (-not $Sdl2Dir -or -not (Test-Path $Sdl2Dir)) {
    Stop-Build 'SDL2_DIR must point to the SDL2 CMake package directory for the x64 SDL2 development package.'
}

$env:MPV_INCLUDE_DIR = (Resolve-Path $MpvIncludeDir).Path
$env:MPV_LIB = (Resolve-Path $MpvLib).Path
$env:MPV_RUNTIME_DIR = (Resolve-Path $MpvRuntimeDir).Path
$env:SDL2_DIR = (Resolve-Path $Sdl2Dir).Path

Write-Host 'Aura Player 2.5.13 Windows x64 setup build configuration:' -ForegroundColor Green
Write-Host "  Visual Studio: $vsPath"
Write-Host "  libmpv headers: $env:MPV_INCLUDE_DIR"
Write-Host "  libmpv import library: $env:MPV_LIB"
Write-Host "  runtime DLL directory: $env:MPV_RUNTIME_DIR"
Write-Host "  SDL2 CMake package: $env:SDL2_DIR"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $projectRoot
try {
    Invoke-Npm @('install', '--no-audit', '--no-fund')
    Invoke-Npm @('test')
    Invoke-Npm @('run', 'native:build')
    Invoke-Npm @('run', 'codec:diagnose')
    Invoke-Npm @('run', 'desktop:dist:windows:setup')

    $releaseDir = Join-Path $projectRoot 'release'
    $setup = Get-ChildItem -Path $releaseDir -Filter '*-Setup-*-x64.exe' -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $setup) {
        Stop-Build "electron-builder completed but no NSIS Setup EXE was found in $releaseDir."
    }

    Write-Host "`nAura Player 2.5.13 Windows installer created successfully:" -ForegroundColor Green
    Write-Host $setup.FullName -ForegroundColor Cyan
    Write-Host ('Size: {0:N1} MB' -f ($setup.Length / 1MB))
} finally {
    Pop-Location
}
