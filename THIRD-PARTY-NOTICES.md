# Third-party notices — Aura Player 2.5.13

Aura Player packages third-party runtime components. Their license texts are distributed inside the installed application's `resources/native/licenses/` directory when supplied by the corresponding upstream SDK.

- **libmpv / mpv** — Windows release pipeline uses the official x86-64 MinGW LGPL build of mpv 0.42.0. The upstream release identifies this variant as LGPLv3. Project: https://github.com/mpv-player/mpv. The SDK's license/copyright files are copied into `resources/native/licenses/mpv/` when present.
- **SDL2** — SDL 2.32.10, distributed under the zlib license. Project: https://github.com/libsdl-org/SDL. Its license text is copied into `resources/native/licenses/SDL2/`.
- **Electron** — Electron runtime is distributed under its upstream license. Project: https://www.electronjs.org/ and https://github.com/electron/electron.

The Windows installer also contains native media/codec libraries required by the selected libmpv build. Their corresponding notices and license texts should be retained with the binaries. This document is an attribution index, not legal advice or a substitute for the individual license texts.
