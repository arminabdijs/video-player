'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const RELEASE = path.join(ROOT, 'release');

function run(command, args) {
  console.log(`\n[Aura Player] $ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
    windowsHide: true,
  });
  if (result.error) throw new Error(`${command} could not start: ${result.error.message}`);
  if (result.signal) throw new Error(`${command} terminated by ${result.signal}`);
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status ?? 1}`);
}

function listArtifacts(platform) {
  if (!fs.existsSync(RELEASE)) throw new Error('The release directory was not created.');
  const files = fs.readdirSync(RELEASE).filter((name) => {
    if (platform === 'linux') return /\.(AppImage|deb)$/i.test(name);
    return /-Setup-.*-x64\.exe$/i.test(name);
  }).sort();
  if (!files.length) throw new Error(`Build finished but no expected ${platform} installer artifacts were found in release/.`);
  console.log('\n[Aura Player] Installer artifacts:');
  for (const file of files) console.log(`  ${path.join(RELEASE, file)}`);
}

function main() {
  if (process.platform === 'linux') {
    run('npm', ['test']);
    run('npm', ['run', 'desktop:dist:linux']);
    listArtifacts('linux');
    return;
  }

  if (process.platform === 'win32') {
    const powershell = process.env.SystemRoot
      ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      : 'powershell.exe';
    run(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'scripts', 'Build-Windows-Setup.ps1')]);
    listArtifacts('windows');
    return;
  }

  throw new Error(`Unsupported build host: ${process.platform}. Build Linux on Linux and Windows on Windows.`);
}

try { main(); }
catch (error) {
  console.error(`[Aura Player] Installer build failed: ${error.message}`);
  process.exitCode = 1;
}
