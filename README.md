# Aura Player 2.5.13

راهنمای کوتاه ساخت و نصب Aura Player برای **Fedora/Linux، Debian/Ubuntu و Windows 10/11 x64**.

> فایل ZIP سورس، نصب‌کننده نیست. خروجی Linux را روی Linux و نصب‌کنندهٔ Windows را روی Windows بسازید؛ باینری native این دو سیستم‌عامل قابل جایگزینی نیست.

## 1) کدام فایل را نصب کنم؟

| سیستم‌عامل | فایل | روش نصب |
|---|---|---|
| Fedora | `*.AppImage` | اجرا مستقیم یا یکپارچه‌سازی با GNOME |
| Debian / Ubuntu | `*.deb` یا `*.AppImage` | نصب با APT یا اجرای AppImage |
| Windows 10/11 x64 | `Aura Player-Setup-2.5.13-x64.exe` | Setup مرحله‌ای NSIS |

کاربر نهایی فقط به فایل نصب سیستم خودش نیاز دارد؛ Node.js، CMake، Visual Studio و SDKهای توسعه فقط برای **ساخت** برنامه لازم‌اند.

## 2) ساخت در Fedora / Linux

ترمینال را در پوشهٔ پروژه، کنار `package.json` باز کن.

### نصب پیش‌نیازها

```bash
sudo dnf install -y nodejs npm cmake gcc-c++ pkgconf-pkg-config mpv-devel sdl2-compat-devel mesa-libGL-devel libxcrypt-compat
```

نسخه‌ها را بررسی کن؛ Node.js باید 22 یا جدیدتر باشد:

```bash
node --version
npm --version
cmake --version
```

### ساخت AppImage و DEB

```bash
npm install --no-audit --no-fund
npm run desktop:dist:current
```

خروجی‌ها در `release/` ساخته می‌شوند:

- `*.AppImage` برای Fedora و سایر توزیع‌های سازگار Linux x64
- `*.deb` برای Debian و Ubuntu x64

فهرست‌کردن خروجی‌ها:

```bash
find release -maxdepth 1 -type f \( -iname '*.AppImage' -o -iname '*.deb' \) -printf '%f\n'
```

### اجرای AppImage در Fedora

```bash
sudo dnf install -y fuse-libs
chmod +x "release/Aura Player-2.5.13-linux-x64.AppImage"
"release/Aura Player-2.5.13-linux-x64.AppImage"
```

اگر FUSE نصب نمی‌کنی، روش جایگزین:

```bash
"release/Aura Player-2.5.13-linux-x64.AppImage" --appimage-extract-and-run
```

### افزودن آیکون به منوی GNOME و Dock

AppImage را به محل ثابت منتقل کن و از ریشهٔ پروژه اجرا کن:

```bash
mkdir -p "$HOME/Applications"
install -Dm755 "release/Aura Player-2.5.13-linux-x64.AppImage" "$HOME/Applications/Aura Player.AppImage"
npm run desktop:integrate:linux -- "$HOME/Applications/Aura Player.AppImage"
```

سپس Aura Player را از Applications اجرا و روی آیکون آن در Dock گزینهٔ **Add to Favorites** را انتخاب کن. بعد از یکپارچه‌سازی، فایل AppImage را دستی جابه‌جا نکن. این روش جایگزین Gear Lever است؛ برای یک AppImage هر دو روش را هم‌زمان استفاده نکن.

### نصب DEB در Debian / Ubuntu

```bash
sudo apt install ./release/*.deb
```

اگر چند فایل DEB در پوشه وجود دارد، نام فایل موردنظر را به‌جای wildcard قرار بده. DEB برای Fedora نیست؛ در Fedora از AppImage استفاده کن.

## 3) ساخت Windows Setup

این مرحله را روی **Windows 10/11 x64** انجام بده. PowerShell را با دسترسی Administrator باز کن.

### نصب خودکار ابزارهای اصلی

وجود `winget` لازم است. این دستورات Node.js LTS، CMake، Git و Visual Studio 2022 C++ Build Tools را نصب می‌کنند:

```powershell
winget install --exact --id OpenJS.NodeJS.LTS --source winget
winget install --exact --id Kitware.CMake --source winget
winget install --exact --id Git.Git --source winget
winget install --exact --id Microsoft.VisualStudio.2022.BuildTools --source winget --override "--wait --passive --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

بعد از پایان نصب، PowerShell را ببند و دوباره باز کن. بررسی:

```powershell
node --version
npm --version
cmake --version
git --version
```

### SDL2 و libmpv موردنیاز

SDL2 را می‌توان با vcpkg نصب کرد:

```powershell
$env:VCPKG_ROOT = "$env:USERPROFILE\vcpkg"
git clone https://github.com/microsoft/vcpkg.git $env:VCPKG_ROOT
& "$env:VCPKG_ROOT\bootstrap-vcpkg.bat" -disableMetrics
& "$env:VCPKG_ROOT\vcpkg.exe" install sdl2:x64-windows
$env:SDL2_DIR = "$env:VCPKG_ROOT\installed\x64-windows\share\sdl2"
```

**libmpv SDK ویندوز جداگانه لازم است و با فرمان‌های بالا نصب نمی‌شود.** یک بستهٔ x64 سازگار تهیه کن که هدرها، import library، DLL اصلی و تمام DLLهای وابستهٔ FFmpeg/کدک را از همان build داشته باشد. فایل‌ها را از buildهای مختلف با هم ترکیب نکن.

ساختار مورد انتظار:

```text
C:\SDK\mpv-dev\
  include\mpv\client.h
  lib\libmpv-2.lib
  bin\libmpv-2.dll
  bin\SDL2.dll
  bin\(سایر DLLهای وابسته)
```

پس از نصب SDL2 با vcpkg، DLL آن را در پوشهٔ runtime بالا کپی کن:

```powershell
New-Item -ItemType Directory -Force C:\SDK\mpv-dev\bin | Out-Null
Copy-Item "$env:VCPKG_ROOT\installed\x64-windows\bin\SDL2.dll" "C:\SDK\mpv-dev\bin\SDL2.dll" -Force
```

### ساخت Setup.exe

فایل ZIP پروژه را استخراج کن، PowerShell را در پوشه‌ای باز کن که `package.json` و پوشهٔ `scripts` دارد و اجرا کن:

```powershell
$env:AURA_MPV_SDK_ROOT = 'C:\SDK\mpv-dev'
$env:SDL2_DIR = "$env:VCPKG_ROOT\installed\x64-windows\share\sdl2"

.\scripts\Build-Windows-Setup.ps1
```

اسکریپت پیش‌نیازها و SDK را بررسی می‌کند، وابستگی‌های npm و تست‌ها را اجرا می‌کند، موتور native را می‌سازد و فقط NSIS Setup تولید می‌کند. خروجی:

```text
release\Aura Player-Setup-2.5.13-x64.exe
```

## 4) نصب و استفاده در Windows

برای کاربر نهایی فقط Setup لازم است؛ نیازی به نصب Node.js، CMake، Visual Studio، SDL2 یا MPV جداگانه نیست.

1. روی `Aura Player-Setup-2.5.13-x64.exe` دوبار کلیک کن.
2. اجازهٔ Administrator را تأیید کن.
3. مسیر نصب را انتخاب و Install را بزن.
4. برنامه در Start Menu و در صورت فعال‌بودن گزینه، روی Desktop میانبر خواهد داشت.

برای بازشدن ویدیوها با Aura Player: روی ویدیو راست‌کلیک → **Open with** → **Choose another app** → Aura Player → **Always**.

در GNOME نیز روی ویدیو راست‌کلیک → **Open With** → Aura Player را انتخاب کن و در صورت نمایش، آن را Default قرار بده.

## 5) ساخت خودکار با GitHub Actions

Workflow در `.github/workflows/desktop-release.yml` است و دو runner مستقل دارد: Linux برای AppImage/DEB و Windows برای Setup. برای job ویندوز باید دو Repository Secret تنظیم شود:

- `AURA_MPV_SDK_URL`: آدرس دانلود مستقیم آرشیو SDK بومی Windows x64
- `AURA_MPV_SDK_SHA256`: هش SHA-256 همان آرشیو

آرشیو باید ساختار `mpv/include`، `mpv/lib`، `mpv/bin` و `sdl2/cmake` را مطابق Workflow داشته باشد. سپس از GitHub → Actions → **Desktop builds** گزینهٔ **Run workflow** را اجرا کن.

## 6) عیب‌یابی سریع

| خطا | اقدام |
|---|---|
| `libfuse.so.2` در Fedora | `sudo dnf install fuse-libs` |
| `node` یا `npm` پیدا نشد | Node.js را نصب و ترمینال را دوباره باز کن |
| `mpv/client.h` یا `libmpv-2.lib` پیدا نشد | مسیر و کامل‌بودن SDK ویندوز را بررسی کن |
| `SDL2Config.cmake` پیدا نشد | مقدار `SDL2_DIR` را روی پوشهٔ `share\sdl2` بگذار |
| کمبود DLL هنگام اجرا | تمام DLLهای وابستهٔ همان build از libmpv را کنار runtime قرار بده |
| آیکون قدیمی در Dock | Favorite قدیمی را حذف و Launcher جدید را دوباره Pin کن |
| تست یا ساخت شکست خورد | اولین خطای واقعی را بررسی کن؛ فایل ناقص `release/` نصب‌کنندهٔ معتبر نیست |

## 7) نکات انتشار

- `npm test` باید بدون شکست تمام شود.
- هر خروجی را روی سیستم‌عامل مقصد بساز و واقعاً نصب و اجرا کن.
- بازکردن ویدیو با Open With، صدا/تصویر، زیرنویس، توقف و بستن برنامه را آزمایش کن.
- خروجی Windows و Linux را با هم قاطی نکن.
- هشدارهای `npm audit` را جداگانه بررسی کن؛ بدون بررسی `npm audit fix --force` اجرا نکن.
- سورس ZIP با فایل نصبی نهایی یکی نیست.

## منابع فنی

- [Microsoft: نصب Visual Studio Build Tools از خط فرمان](https://learn.microsoft.com/en-us/visualstudio/install/use-command-line-parameters-to-install-visual-studio)
- [Microsoft: شناسهٔ Workload توسعهٔ C++](https://learn.microsoft.com/en-us/visualstudio/install/workload-component-id-vs-build-tools)
- [vcpkg](https://github.com/microsoft/vcpkg)
- [mpv: ساخت libmpv برای Windows](https://github.com/mpv-player/mpv/blob/master/DOCS/compile-windows.md)
