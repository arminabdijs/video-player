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

## 3) ساخت Windows Setup بدون نصب ابزار روی کامپیوتر توسعه‌دهنده

برای ساخت فایل نصبی ویندوز لازم نیست روی کامپیوتر خودت Node.js، Visual Studio، CMake، MinGW، SDL2 یا MPV نصب کنی. پروژه را در GitHub قرار بده و از مسیر **GitHub → Actions → Windows installer → Run workflow** ساخت را اجرا کن. GitHub یک Windows runner موقت می‌سازد، ابزارهای کامپایل را فقط همان‌جا آماده می‌کند، موتور native و وابستگی‌های DLL را بررسی می‌کند و در پایان فایل NSIS را به‌صورت Artifact تحویل می‌دهد.

### مراحل انتشار

1. محتوای پروژه را در repository خودت commit و push کن.
2. در GitHub وارد تب **Actions** شو.
3. Workflow با نام **Windows installer** را انتخاب کن.
4. **Run workflow** را اجرا کن.
5. پس از موفقیت job ویندوز، Artifact با نام `Aura-Player-Windows-Setup-x64` را دانلود کن. داخل آن فایل `Aura Player-Setup-2.5.13-x64.exe` قرار می‌گیرد.

Workflow از نسخهٔ رسمی LGPL ویندوزی libmpv استفاده می‌کند و SHA-256 آرشیو SDK را قبل از استخراج بررسی می‌کند. SDL2 و ابزارهای کامپایل در Windows runner آماده می‌شوند؛ DLLهای runtime موردنیاز در `native/dist` جمع‌آوری و داخل Setup قرار می‌گیرند. Node، CMake، MinGW، Visual Studio، MPV و SDL2 ابزارهای ساخت هستند، نه پیش‌نیاز کاربر نهایی.

ساخت پیش از بسته‌بندی تست‌ها، فهرست decoderهای موردنیاز و وابستگی‌های DLL را بررسی می‌کند. اگر dependency ناشناخته یا codec لازم وجود نداشته باشد، job شکست می‌خورد و Artifact ناقص منتشر نمی‌شود.

> در این محیط فعلی فایل EXE ویندوز تولید نشده؛ برای تولید واقعی باید Workflow روی Windows runner اجرا شود. فایل ZIP سورس به‌تنهایی نصب‌کننده نیست.

## 4) نصب و استفاده در Windows

برای کاربر نهایی فقط Setup لازم است؛ Node.js، npm، CMake، MinGW، Visual Studio، SDL2، libmpv و FFmpeg به‌صورت جداگانه نصب نمی‌شوند. برنامه موتور و DLLهای runtime خود را از پوشهٔ resources خودش بارگذاری می‌کند. درایور گرافیک/صوت و مؤلفه‌های سیستمی ویندوز همچنان متعلق به خود ویندوز هستند.

1. روی `Aura Player-Setup-2.5.13-x64.exe` دوبار کلیک کن.
2. اجازهٔ Administrator را تأیید کن.
3. مسیر نصب را انتخاب و Install را بزن.
4. برنامه در Start Menu و در صورت فعال‌بودن گزینه، روی Desktop میانبر خواهد داشت.

برای بازشدن ویدیوها با Aura Player: روی ویدیو راست‌کلیک → **Open with** → **Choose another app** → Aura Player → **Always**.

در GNOME نیز روی ویدیو راست‌کلیک → **Open With** → Aura Player را انتخاب کن و در صورت نمایش، آن را Default قرار بده.

## 5) جزئیات ساخت خودکار و محل ذخیره‌سازی

- ساخت Windows فقط روی runner ویندوز GitHub اجرا می‌شود؛ ابزارهای کامپایل روی رایانهٔ توسعه‌دهنده نصب نمی‌شوند.
- دانلود SDK و نصب ابزارهای ساخت فقط هنگام Build انجام می‌شود. خود برنامه در زمان اجرا برای بارگذاری موتور پخش به اینترنت، Node.js، npm، Python، CMake، MPV یا SDL2 سیستم وابسته نیست.
- فایل‌های اجرایی و DLLهای native داخل `resources/native` نصب می‌شوند. تنظیمات Chromium/Electron و cache تصاویر بندانگشتی در مسیر استاندارد دادهٔ کاربر ویندوز ذخیره می‌شوند تا برنامه برای نوشتن داخل `Program Files` به مجوز Administrator نیاز نداشته باشد.
- برای Windows 10/11 x64 ساخته می‌شود. درایور گرافیک/صوت و کتابخانه‌های سیستمی خود ویندوز جزو runtime قابل‌جایگزینی برنامه نیستند.
- Artifact فقط پس از عبور تست‌ها، بررسی decoderها و audit وابستگی‌های DLL آپلود می‌شود.
- فایل Setup در این پیکربندی امضای کد تجاری ندارد؛ ممکن است Windows SmartScreen هنگام اولین اجرا هشدار ناشر ناشناس نشان دهد.

## 6) عیب‌یابی سریع

| خطا | اقدام |
|---|---|
| `libfuse.so.2` در Fedora | `sudo dnf install fuse-libs` |
| ساخت به‌دلیل نبود `node` یا `npm` متوقف شد | مرحلهٔ Setup در Workflow از Node.js روی runner استفاده می‌کند؛ اجرای محلی اسکریپت بدون Node پشتیبانی نمی‌شود |
| `mpv/client.h` یا import library پیدا نشد | دانلود/استخراج SDK در مرحلهٔ Prepare را بررسی کن؛ build تا رفع مشکل متوقف می‌شود |
| `SDL2Config.cmake` پیدا نشد | نصب بستهٔ SDL2 در مرحلهٔ MSYS2 و مسیر UCRT64 runner را بررسی کن |
| وابستگی DLL حل‌نشده | Build عمداً قبل از تولید Installer متوقف می‌شود؛ dependency گزارش‌شده باید به runtime closure اضافه شود |
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

- [mpv 0.42.0 — Windows libmpv LGPL build](https://github.com/mpv-player/mpv/releases/tag/v0.42.0)
- [MSYS2 UCRT64 SDL2 package](https://packages.msys2.org/packages/mingw-w64-ucrt-x86_64-SDL2)
- [MSYS2 setup action](https://github.com/msys2/setup-msys2)
- [Electron Builder — NSIS](https://www.electron.build/nsis)
