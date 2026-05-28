# RoboCopier (Electron edition)

A polished Windows desktop app for one-way folder mirroring. Source folders stay untouched; destinations get refreshed on demand or on a schedule. Built with Electron so the UI is modern and the install experience is one double-click.

```
  Title:  ROBOCOPIER
  Build:  Electron + Node.js
  Style:  Detroit P.D. (dark steel + safety yellow + police red)
  Ships:  one .exe installer, ~80-150 MB, includes everything
  Update: auto, via GitHub Releases
```

## What's in this folder (dev / source)

```
robocopier-app/
├── package.json                       # npm config + electron-builder config
├── README.md                          # this file
├── .gitignore
├── telemetry-script-template.js       # Google Apps Script for the roster sheet
├── assets/
│   ├── icon.ico                       # app icon (helmet + red visor)
│   ├── icon.png
│   └── splash.jpg                     # splash screen image
└── src/
    ├── main.js                        # Electron main process
    ├── preload.js                     # IPC bridge
    ├── core/
    │   ├── config.js                  # config.json read/write
    │   ├── refresh.js                 # robocopy invocation + size safeguards
    │   ├── schedule.js                # Windows Task Scheduler integration
    │   └── telemetry.js               # roster check-in (Google Sheet)
    └── renderer/
        ├── index.html                 # main window
        ├── splash.html                # splash with visor-slit loading bar
        ├── styles.css                 # gritty Detroit P.D. theme
        └── renderer.js                # UI logic
```

## First-time dev setup (you, on your machine)

You only do this once. After it's set up, building a new version is one command.

### 1. Install Node.js

Download the LTS installer from <https://nodejs.org>. Run it. Accept defaults. Verify by opening a fresh terminal and running:

```
node --version
npm --version
```

### 2. Install dependencies

In a terminal, navigate to this folder:

```
cd "C:\Users\cisaaks.MPA\Desktop\Claude Cowork\scripts\robocopier-app"
npm install
```

This downloads Electron (~250 MB) and electron-builder. Takes a few minutes the first time. Subsequent installs are seconds because of caching.

### 3. Test it works

```
npm start
```

Splash plays, main window opens, you should see your existing tasks if you have a `config.json` from the PowerShell version. (The Electron app uses its own config in `%APPDATA%\RoboCopier\config.json`, so the first launch starts empty.)

### 4. Build your first .exe (no GitHub yet)

```
npm run dist
```

`dist/RoboCopier-Setup-1.0.0.exe` appears. Run it on yourself first - it installs to your Start Menu and Desktop, runs like any normal Windows app. Uninstall via Settings -> Apps if you want to clean up.

### 5. Set up the GitHub repo (for sharing + auto-update)

This is the magic that lets coworkers download and auto-update.

1. Create a free GitHub account at <https://github.com> if you don't have one.
2. On GitHub, create a new public repo named `robocopier` (or any name you want, but match it to the `repo` field in `package.json`).
3. In `package.json`, find the `publish` block and replace `REPLACE_WITH_YOUR_GITHUB_USERNAME` with your actual GitHub username. If you named the repo something other than `robocopier`, also update the `repo` field to match.
4. Get a "Personal Access Token" for publishing:
   - GitHub -> Settings (top right avatar) -> Developer settings -> Personal access tokens -> Tokens (classic)
   - Generate new token (classic). Name: "RoboCopier release". Expiration: 1 year. Scope: check `repo`.
   - Generate, copy the token (looks like `ghp_xxxxxxxxxxxxxxxxxxxx`). You won't see it again.
5. In your terminal, before running release, set the token as an env variable:
   ```
   set GH_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
   ```
6. Initialize git and push:
   ```
   git init
   git add .
   git commit -m "Initial RoboCopier release"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/robocopier.git
   git push -u origin main
   ```
7. Build and publish a release:
   ```
   npm run release
   ```
   This builds the installer AND uploads it to GitHub Releases automatically. After it finishes, your release shows up at `https://github.com/YOUR_USERNAME/robocopier/releases`.

### 6. Share with coworkers

Send them the link to the `.exe` from the GitHub Releases page, e.g.:

```
https://github.com/YOUR_USERNAME/robocopier/releases/latest/download/RoboCopier-Setup-1.0.0.exe
```

They click, download, double-click, installer runs, app appears in Start Menu and Desktop. No Node, no PowerShell, no setup on their side.

## Auto-update workflow

Once a coworker has RoboCopier installed, the app silently checks GitHub Releases on every launch (after a 5-second delay so the UI shows first). When you publish a new version:

1. Bump the version in `package.json` (e.g., `1.0.0` -> `1.0.1`).
2. `npm run release` again.
3. Within ~5 seconds of opening the app, each coworker gets an "Update available" banner. Once downloaded, they get a prompt to "Quit and install" or do it on next launch.

For an emergency hot-fix:
1. Fix the bug.
2. Bump version.
3. `npm run release`.
4. Tell coworkers to relaunch the app. Within 5 seconds, they get the update prompt.

## Telemetry / "who has it installed"

By default, telemetry is **off** in this codebase. To turn it on:

1. Follow the instructions in `telemetry-script-template.js` to create a Google Sheet roster + Apps Script endpoint.
2. Paste the Apps Script deployment URL into `src/core/telemetry.js` (the `TELEMETRY_URL` constant).
3. Rebuild and release.

After that, every launch (and every scheduled-task refresh) appends one row to your Google Sheet: timestamp, username, hostname, version, event, platform. You can see at a glance who's running which version.

**Important**: tell your coworkers this is happening. Don't ship surreptitious telemetry. A short note in your team chat is enough: "The app reports your username and machine name to me when it launches so I can see who's running it and what version - no file content or paths."

## What the app does (for coworkers who'll just use it)

Configure source-to-destination "tasks" through the GUI. Each task remembers a source folder, a destination folder, a copy mode (Replace or Archive), and an optional schedule.

When you refresh a task (manually or on schedule), `robocopy.exe` (built into Windows) walks the source, compares each file's size and timestamp against the destination, and only copies what changed. Fast incremental copy.

**Replace mode**: destination always matches source as of the last refresh. Files removed from source get removed from destination. Best for "I only care about the current version."

**Archive mode**: each refresh saves the source into a new dated subfolder. Previous refreshes stay. Best for version history.

**Schedule**: built into the GUI. Pick None / Daily / Weekly / Monthly + time. Behind the scenes the app creates a Windows Task Scheduler entry that fires `RoboCopier.exe --task-cli --task-name <name>` silently at the chosen time. Edit a task to change the schedule; remove the task to delete the scheduled entry.

## Size safeguards

This tool is for individual files and small folders - PDFs, spreadsheets, schedules, the occasional report. It is **not** for bulk drive backups or cloning hundreds of GB.

Every refresh does a pre-flight scan:

- **Warn threshold** (default 200 files OR 200 MB): GUI prompts before proceeding. CLI (scheduled tasks) logs a warning and proceeds.
- **Hard block** (10x the warn threshold = 2000 files OR 2 GB by default): refuses to copy in both modes.

The hard block protects against "I pointed at the wrong folder." Pre-flight scan short-circuits at the hard limit, so an accidental scan of C:\ bails out within seconds. To raise the limits, edit `warnFileCount` or `warnSizeMB` in `%APPDATA%\RoboCopier\config.json`.

## Where the app stores stuff

- **Config**: `%APPDATA%\RoboCopier\config.json` (per-user)
- **Logs**: `%APPDATA%\RoboCopier\logs\` (rotated by electron-log)
- **Default mirror destination**: `%USERPROFILE%\Desktop\RoboCopier-mirrored\` (changeable in the GUI)
- **Scheduled-task entries**: Windows Task Scheduler, under `RoboCopier_<taskname>`

## Troubleshooting

**The .exe won't launch on a coworker's machine.** Windows SmartScreen may warn because the .exe is unsigned. They click "More info" -> "Run anyway." For a smoother experience, code-sign the .exe (~$100/year for an authenticode cert, optional).

**Auto-update isn't kicking in.** Check that the version in `package.json` is higher than the installed version. Check that GitHub Releases shows your latest .exe. Check that the user's machine can reach `github.com`.

**Scheduled task doesn't fire.** Open Task Scheduler -> Task Scheduler Library -> look for `RoboCopier_<taskname>`. Verify the trigger and the action's "Program/script" path points to the installed `RoboCopier.exe`. User-scope tasks only run when the user is logged in.

**Telemetry isn't logging.** Check that `TELEMETRY_URL` in `src/core/telemetry.js` is set. Check that the Apps Script is deployed as "Anyone" access. Test the URL by visiting it in a browser - you should get `{"ok":true,...}`.

## Versioning

Bump `version` in `package.json` before each release. Semantic versioning (1.0.0 -> 1.0.1 for patches, 1.0.0 -> 1.1.0 for features). Don't skip versions - electron-updater compares numerically.
