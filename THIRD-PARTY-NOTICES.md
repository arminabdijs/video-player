# Third-party notices — Aura Player

Aura Player bundles third-party runtime components. The exact versions and binary hashes used for a Windows build are pinned in scripts/Prepare-Windows-SDK.ps1.

## libmpv (Windows x64)

The Windows build uses the upstream mpv project's v0.42.0 x86_64 Windows LGPL libmpv package:

- Upstream project: https://github.com/mpv-player/mpv
- Release: https://github.com/mpv-player/mpv/releases/tag/v0.42.0
- Package: libmpv-v0.42.0-x86_64-w64-mingw32-lgpl.zip
- License model: upstream LGPL libmpv build; consult the upstream release and source tree for the exact notices and license terms.

The native API headers are distributed by the upstream package. The build workflow converts the package's DLL export table into an MSVC import library; it does not modify the libmpv DLL.

## SDL2

The Windows build uses the official SDL2 2.32.10 Visual C x64 development package:

- Project: https://github.com/libsdl-org/SDL
- Release: https://github.com/libsdl-org/SDL/releases/tag/release-2.32.10
- Package: `SDL2-devel-2.32.10-VC.zip`
- License: zlib license

## Electron

Aura Player uses Electron. The Electron runtime, Chromium, Node.js and their third-party components retain their respective licenses and notices. See the installed Electron distribution and Electron project documentation:

- https://www.electronjs.org/
- https://github.com/electron/electron

## Distribution note

This file is a component summary, not legal advice and not a substitute for the complete license texts, source-code availability and notices required by the licenses of the actual distributed binaries. Review the licenses and corresponding source obligations before redistributing the installer publicly.