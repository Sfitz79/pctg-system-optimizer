# PCTG System Optimizer Pro

Optimise, clean and tune Windows PCs — built by [PCTechGuy](https://pctechguyonline.com).

A portable Windows desktop app (Electron) that runs clean-up, performance, security and
deep-tuning toolkits. Windows 10/11, 64-bit.

## Download & Install

Grab the latest **portable ZIP** from the [Releases page](../../releases):

1. Download `PCTG-Optimizer-<version>-portable.zip`
2. Right-click → **Extract All** to a folder (e.g. `C:\PCTG Optimizer`)
3. Run `PCTG Optimizer Pro.exe` (allow admin prompt — it needs elevated access to optimise Windows)

No installation required. The `.exe` installer variant (`PCTG-Optimizer-Pro-Setup-vX.Y.Z.exe`)
does the same via the Inno Setup wizard if you prefer.

> **Licence**: PCTG System Optimizer Pro is paid software. Activation is validated online
> against the PCTechGuy licence server, so you need a licence key to unlock features.
> See [pctechguyonline.com](https://pctechguyonline.com) to buy.

## Build from source

Requires Node.js (18+) and Inno Setup 6 (only if building the installer).

```powershell
npm ci                # install dependencies
npm run build         # produces dist\PCTG Optimizer.zip (portable) + dist\PCTG Optimizer Pro-win32-x64\
npm run build:installer  # produces dist\PCTG-Optimizer-Pro-Setup-vX.Y.Z.exe (needs Inno Setup 6)
```

## Release pipeline (GitHub Actions)

[`.github/workflows/build-release.yml`](.github/workflows/build-release.yml) builds the app
in the cloud and attaches the portable ZIP + installer to a GitHub Release, so customers can
download and install from the Releases page.

Two ways to ship a new version:

1. **Manual** — on GitHub go to **Actions → Build & Release → Run workflow**, enter the
   version (or leave blank to use `package.json`), hit Run. The ZIP is published as a new
   release within ~15 minutes.
2. **Version tag** — push a tag `v1.2.0` (for the version in `package.json`):

   ```powershell
   git tag v1.2.0
   git push origin v1.2.0
   ```

   or use the local helper which bumps the version, commits, tags and pushes:

   ```powershell
   .\release.ps1 1.2.1
   ```

## Structure

```
main.js          Electron main process (windows, licence, PayPal, phases)
preload.js       context-isolated bridge
app/             renderer UI (HTML/CSS/JS)
scripts/         PowerShell tool scripts the app invokes
report/          system info + report generation
license/         licence key handling (runtime files are gitignored)
assets/          icons / static assets
```

## Notes

- `npm run build` obfuscates the JS before packaging (anti-tamper). The build is
  CI-safe: if the Electron download cache isn't present it falls back to
  `node_modules/electron/dist`.
- `paypal-config.json` and runtime licence state are gitignored — never commit live keys.