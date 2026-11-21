[CmdletBinding()]
param(
    [string]$MpvSdkUrl = $env:AURA_MPV_SDK_URL,
    [string]$MpvSdkSha256 = $env:AURA_MPV_SDK_SHA256
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$DefaultMpvSdkUrl = 'https://github.com/mpv-player/mpv/releases/download/v0.42.0/libmpv-v0.42.0-x86_64-w64-mingw32-lgpl.zip'
$DefaultMpvSdkSha256 = '8e5f77430efc53ef175804ba6618527e3af0448a0dcabf04d3cc72659d1a6fce'
if (-not $MpvSdkUrl) { $MpvSdkUrl = $DefaultMpvSdkUrl }
if (-not $MpvSdkSha256) { $MpvSdkSha256 = $DefaultMpvSdkSha256 }

function Stop-Build([string]$Message) {
    throw "[Aura Player] $Message"
}

function Set-GitHubEnvironment([string]$Name, [string]$Value) {
    Set-Item -Path "Env:$Name" -Value $Value
    if ($env:GITHUB_ENV) {
        $line = "$Name=$Value`n"
        [System.IO.File]::AppendAllText($env:GITHUB_ENV, $line, [System.Text.UTF8Encoding]::new($false))
    }
}

if ($env:OS -ne 'Windows_NT') { Stop-Build 'This preparation script is intended for the isolated Windows x64 release runner.' }
if (-not (Get-Command gcc -ErrorAction SilentlyContinue) -or -not (Get-Command g++ -ErrorAction SilentlyContinue)) {
    Stop-Build 'The CI runner does not have the MSYS2 UCRT64 MinGW-w64 compiler on PATH.'
}
if (-not (Get-Command objdump -ErrorAction SilentlyContinue)) { Stop-Build 'MinGW-w64 objdump is required to audit and bundle transitive DLL dependencies.' }

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$sdkRoot = Join-Path $env:RUNNER_TEMP 'aura-windows-native-sdk'
$mpvArchive = Join-Path $env:RUNNER_TEMP 'libmpv-v0.42.0-x86_64-w64-mingw32-lgpl.zip'
$mpvExtract = Join-Path $sdkRoot 'mpv'
$runtimeDir = Join-Path $projectRoot 'native/windows-runtime'

New-Item -ItemType Directory -Force -Path $sdkRoot, $mpvExtract | Out-Null
if (Test-Path $mpvArchive) { Remove-Item $mpvArchive -Force }
Write-Host '[Aura Player] Downloading the pinned official LGPL libmpv SDK...' -ForegroundColor Cyan
Invoke-WebRequest -Uri $MpvSdkUrl -OutFile $mpvArchive
$actualHash = (Get-FileHash -Path $mpvArchive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualHash -ne $MpvSdkSha256.ToLowerInvariant()) {
    Stop-Build "libmpv SDK SHA-256 mismatch. Expected $MpvSdkSha256, received $actualHash."
}
Write-Host "[Aura Player] Verified libmpv SDK SHA-256: $actualHash" -ForegroundColor Green
Expand-Archive -LiteralPath $mpvArchive -DestinationPath $mpvExtract -Force

$header = Get-ChildItem -Path $mpvExtract -Filter 'client.h' -File -Recurse |
    Where-Object { $_.Directory.Name -eq 'mpv' } | Select-Object -First 1
$importLibrary = Get-ChildItem -Path $mpvExtract -Filter 'libmpv*.dll.a' -File -Recurse | Select-Object -First 1
$mpvDll = Get-ChildItem -Path $mpvExtract -Filter 'libmpv-2.dll' -File -Recurse | Select-Object -First 1
if (-not $header -or -not $importLibrary -or -not $mpvDll) {
    Stop-Build 'The downloaded libmpv archive is missing mpv/client.h, a libmpv DLL import archive, or libmpv-2.dll.'
}
$mpvIncludeDir = $header.Directory.Parent.FullName

$gccPath = (Get-Command gcc).Source
$ucrtBin = Split-Path -Parent $gccPath
$ucrtPrefix = Split-Path -Parent $ucrtBin
$sdlConfig = Join-Path $ucrtPrefix 'lib/cmake/SDL2/SDL2Config.cmake'
$sdlDll = Join-Path $ucrtBin 'SDL2.dll'
if (-not (Get-Command msys2 -ErrorAction SilentlyContinue)) {
    Stop-Build 'The MSYS2 command helper is unavailable. Ensure msys2/setup-msys2 runs before this script.'
}
# pacman is part of MSYS2, not the native Windows PowerShell PATH.
# Use the setup-msys2 helper to execute it inside the configured UCRT64 environment.
$sdlPackageOutput = & msys2 -c 'pacman -Q mingw-w64-ucrt-x86_64-SDL2' 2>$null
$sdlPackageExitCode = $LASTEXITCODE
$sdlPackage = ($sdlPackageOutput | Out-String).Trim()
if ($sdlPackageExitCode -ne 0 -or $sdlPackage -ne 'mingw-w64-ucrt-x86_64-SDL2 2.32.10-1') {
    Stop-Build "Unexpected SDL2 package version. Expected 2.32.10-1; found '$sdlPackage'. Update the pinned runtime notice and CI validation deliberately before changing this version."
}
if (-not (Test-Path $sdlConfig) -or -not (Test-Path $sdlDll)) {
    Stop-Build "SDL2 development/runtime package not found under the active UCRT64 prefix: $ucrtPrefix"
}

if (Test-Path $runtimeDir) { Remove-Item $runtimeDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
Copy-Item -LiteralPath $mpvDll.FullName -Destination (Join-Path $runtimeDir 'libmpv-2.dll') -Force
Copy-Item -LiteralPath $sdlDll -Destination (Join-Path $runtimeDir 'SDL2.dll') -Force

# Build a runtime-only DLL closure. Build tools and headers never enter the application payload.
$searchRoots = @($mpvExtract, $ucrtBin)
$dllIndex = @{}
foreach ($searchRoot in $searchRoots) {
    if (Test-Path $searchRoot) {
        foreach ($candidate in Get-ChildItem -Path $searchRoot -Filter '*.dll' -File -Recurse -ErrorAction SilentlyContinue) {
            $key = $candidate.Name.ToLowerInvariant()
            if (-not $dllIndex.ContainsKey($key)) { $dllIndex[$key] = $candidate.FullName }
        }
    }
}
$queue = [System.Collections.Generic.Queue[string]]::new()
$processed = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
$queue.Enqueue((Join-Path $runtimeDir 'libmpv-2.dll'))
$queue.Enqueue((Join-Path $runtimeDir 'SDL2.dll'))
while ($queue.Count -gt 0) {
    $currentDll = $queue.Dequeue()
    $currentName = [System.IO.Path]::GetFileName($currentDll)
    if (-not $processed.Add($currentName)) { continue }
    $imports = & objdump -p $currentDll 2>$null
    if ($LASTEXITCODE -ne 0) { Stop-Build "Could not inspect native DLL dependencies: $currentName" }
    foreach ($match in ($imports | Select-String -Pattern '^\s*DLL Name:\s*(\S+)')) {
        $dependency = $match.Matches[0].Groups[1].Value.Trim()
        $systemDllPath = Join-Path (Join-Path $env:SystemRoot 'System32') $dependency
        if ($dependency -match '^(api-ms-win-|ext-ms-win-)' -or (Test-Path -LiteralPath $systemDllPath)) { continue }
        $destination = Join-Path $runtimeDir $dependency
        if (-not (Test-Path $destination)) {
            $key = $dependency.ToLowerInvariant()
            if (-not $dllIndex.ContainsKey($key)) {
                Stop-Build "Unresolved non-system DLL dependency '$dependency' required by '$currentName'. The installer must not be published with a missing runtime."
            }
            Copy-Item -LiteralPath $dllIndex[$key] -Destination $destination -Force
        }
        $queue.Enqueue($destination)
    }
}

# Carry the upstream license texts into the installed application's resource tree.
$licenseRoot = Join-Path $runtimeDir 'licenses'
New-Item -ItemType Directory -Force -Path $licenseRoot | Out-Null
$mpvLicenseFiles = Get-ChildItem -Path $mpvExtract -File -Recurse |
    Where-Object { $_.Name -match '^(LICENSE|COPYING)(\.|$)|^(COPYING\.LGPL|LICENSE\.LGPL)' }
foreach ($license in $mpvLicenseFiles) {
    $target = Join-Path $licenseRoot ('mpv/' + $license.Name)
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
    Copy-Item -LiteralPath $license.FullName -Destination $target -Force
}
$ucrtLicenses = Join-Path $ucrtPrefix 'share/licenses'
if (Test-Path $ucrtLicenses) {
    $licensePrefix = (Resolve-Path $ucrtLicenses).Path
    foreach ($license in Get-ChildItem -Path $licensePrefix -File -Recurse) {
        $relativeLicense = $license.FullName.Substring($licensePrefix.Length).TrimStart('\', '/')
        $target = Join-Path (Join-Path $licenseRoot 'MSYS2') $relativeLicense
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
        Copy-Item -LiteralPath $license.FullName -Destination $target -Force
    }
}

Set-GitHubEnvironment 'MPV_INCLUDE_DIR' $mpvIncludeDir
Set-GitHubEnvironment 'MPV_LIB' $importLibrary.FullName
Set-GitHubEnvironment 'MPV_RUNTIME_DIR' $runtimeDir
Set-GitHubEnvironment 'SDL2_DIR' (Split-Path -Parent $sdlConfig)
Set-GitHubEnvironment 'AURA_WINDOWS_TOOLCHAIN' 'mingw'
Set-GitHubEnvironment 'CMAKE_GENERATOR' 'Ninja'

$dllCount = (Get-ChildItem -Path $runtimeDir -Filter '*.dll' -File).Count
Write-Host "[Aura Player] Prepared an offline Windows runtime with $dllCount DLLs." -ForegroundColor Green
Write-Host "[Aura Player] Native payload: $runtimeDir"
Write-Host '[Aura Player] Compiler, CMake, Ninja, headers and import libraries remain build-only and are not added to the installer.'
