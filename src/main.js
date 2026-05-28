// RoboCopier - main Electron process
// Handles window creation, splash screen, auto-update, IPC bridges to renderer.

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const log = require('electron-log');
const { autoUpdater } = require('electron-updater');

const ConfigStore = require('./core/config');
const Refresh = require('./core/refresh');
const Schedule = require('./core/schedule');
const Telemetry = require('./core/telemetry');

log.transports.file.level = 'info';
autoUpdater.logger = log;
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

const isDev = process.argv.includes('--dev') || !app.isPackaged;

let mainWindow = null;
let splashWindow = null;
let tray = null;
let configStore = null;

// ============================================================
// Path resolution
// ============================================================

function getUserDataDir() {
  return app.getPath('userData');
}

function getConfigPath() {
  return path.join(getUserDataDir(), 'config.json');
}

function getResourcePath(file) {
  // In packaged builds, assets live next to the .exe under resources/assets.
  // In dev, they're in the project's assets/ folder.
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'assets', file);
  }
  return path.join(__dirname, '..', 'assets', file);
}

// ============================================================
// Splash window
// ============================================================

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 460,
    height: 460,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  splashWindow.loadFile(path.join(__dirname, 'renderer', 'splash.html'));
  splashWindow.once('ready-to-show', () => splashWindow.show());

  // Auto-close after the splash animation finishes
  setTimeout(() => {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
  }, 2600);
}

// ============================================================
// Main window
// ============================================================

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 680,
    minWidth: 880,
    minHeight: 560,
    title: 'RoboCopier',
    icon: getResourcePath('icon.ico'),
    backgroundColor: '#08090d',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenu(null); // hide default menubar

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
    mainWindow.show();
  });

  mainWindow.on('close', (e) => {
    // Minimize to tray instead of closing
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
}

// ============================================================
// System tray
// ============================================================

function createTray() {
  const iconPath = getResourcePath('icon.ico');
  const trayIcon = nativeImage.createFromPath(iconPath);
  tray = new Tray(trayIcon);
  tray.setToolTip('RoboCopier');
  const menu = Menu.buildFromTemplate([
    { label: 'Open RoboCopier', click: () => { if (mainWindow) mainWindow.show(); } },
    { type: 'separator' },
    { label: 'Refresh all tasks', click: async () => {
        const cfg = configStore.get();
        for (const t of cfg.tasks || []) {
          await Refresh.runTask(t, cfg, false);
        }
        configStore.save();
        if (mainWindow) mainWindow.webContents.send('tasks-updated');
    }},
    { type: 'separator' },
    { label: 'Check for updates', click: () => autoUpdater.checkForUpdatesAndNotify() },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  tray.on('double-click', () => { if (mainWindow) mainWindow.show(); });
}

// ============================================================
// IPC handlers - bridge from renderer to core logic
// ============================================================

function registerIpc() {
  ipcMain.handle('config:get', () => configStore.get());
  ipcMain.handle('config:save', (_e, data) => { configStore.set(data); configStore.save(); return true; });

  ipcMain.handle('task:add', (_e, task) => {
    const cfg = configStore.get();
    if ((cfg.tasks || []).find(t => t.name === task.name)) {
      return { success: false, message: `A task named '${task.name}' already exists.` };
    }
    cfg.tasks = [...(cfg.tasks || []), task];
    configStore.set(cfg);
    configStore.save();
    const sr = Schedule.sync(task.name, task.schedule, app);
    return { success: true, scheduleResult: sr };
  });

  ipcMain.handle('task:update', (_e, originalName, task) => {
    const cfg = configStore.get();
    const idx = (cfg.tasks || []).findIndex(t => t.name === originalName);
    if (idx === -1) return { success: false, message: 'Task not found' };
    cfg.tasks[idx] = task;
    configStore.set(cfg);
    configStore.save();
    const sr = Schedule.sync(task.name, task.schedule, app);
    return { success: true, scheduleResult: sr };
  });

  ipcMain.handle('task:remove', (_e, names) => {
    const cfg = configStore.get();
    for (const n of names) Schedule.remove(n);
    cfg.tasks = (cfg.tasks || []).filter(t => !names.includes(t.name));
    configStore.set(cfg);
    configStore.save();
    return { success: true };
  });

  ipcMain.handle('task:refresh', async (_e, names) => {
    const cfg = configStore.get();
    const results = [];
    for (const name of names) {
      const t = (cfg.tasks || []).find(t => t.name === name);
      if (!t) { results.push({ name, success: false, message: 'not found' }); continue; }
      const r = await Refresh.runTask(t, cfg, true);
      results.push({ name, ...r });
    }
    configStore.save();
    return results;
  });

  ipcMain.handle('task:refresh-all', async () => {
    const cfg = configStore.get();
    const results = [];
    for (const t of cfg.tasks || []) {
      const r = await Refresh.runTask(t, cfg, true);
      results.push({ name: t.name, ...r });
    }
    configStore.save();
    return results;
  });

  ipcMain.handle('dialog:pick-folder', async (_e, defaultPath) => {
    const r = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      defaultPath: defaultPath || undefined,
    });
    if (r.canceled || !r.filePaths.length) return null;
    return r.filePaths[0];
  });

  ipcMain.handle('dialog:confirm', async (_e, message, title) => {
    const r = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      title: title || 'Confirm',
      message,
      buttons: ['Yes', 'No'],
      defaultId: 1,
      cancelId: 1,
    });
    return r.response === 0;
  });

  ipcMain.handle('dialog:warn', async (_e, message, title) => {
    await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: title || 'Warning',
      message,
      buttons: ['OK'],
    });
  });

  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('app:check-updates', () => autoUpdater.checkForUpdatesAndNotify());
  ipcMain.handle('shell:open-folder', (_e, p) => shell.openPath(p));
}

// ============================================================
// Auto-update
// ============================================================

function registerAutoUpdater() {
  autoUpdater.on('checking-for-update', () => log.info('Checking for update...'));
  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info.version);
    if (mainWindow) mainWindow.webContents.send('update-status', { status: 'available', version: info.version });
  });
  autoUpdater.on('update-not-available', () => {
    if (mainWindow) mainWindow.webContents.send('update-status', { status: 'none' });
  });
  autoUpdater.on('error', (err) => log.error('Update error:', err));
  autoUpdater.on('download-progress', (p) => {
    if (mainWindow) mainWindow.webContents.send('update-status', {
      status: 'downloading',
      percent: Math.round(p.percent),
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded:', info.version);
    if (mainWindow) mainWindow.webContents.send('update-status', { status: 'ready', version: info.version });
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update ready',
      message: `RoboCopier ${info.version} is ready to install.`,
      detail: 'The update will be applied the next time you quit and reopen the app. Quit now?',
      buttons: ['Quit and install', 'Later'],
      defaultId: 0,
      cancelId: 1,
    }).then(r => {
      if (r.response === 0) {
        app.isQuitting = true;
        autoUpdater.quitAndInstall();
      }
    });
  });

  // Check on startup (after a brief delay so the UI shows first)
  setTimeout(() => {
    if (!isDev) autoUpdater.checkForUpdatesAndNotify().catch(e => log.error(e));
  }, 5000);
}

// ============================================================
// CLI mode (used by Windows Task Scheduler when a scheduled task fires)
// ============================================================

function isCliMode() {
  return process.argv.includes('--task-cli') || process.argv.includes('--all');
}

async function runCliMode() {
  configStore = new ConfigStore(getConfigPath());
  const cfg = configStore.get();

  const args = process.argv;
  const taskNameIdx = args.indexOf('--task-name');
  const wantAll = args.includes('--all');

  let toRun = [];
  if (wantAll) {
    toRun = cfg.tasks || [];
  } else if (taskNameIdx >= 0 && args[taskNameIdx + 1]) {
    const name = args[taskNameIdx + 1];
    const t = (cfg.tasks || []).find(x => x.name === name);
    if (t) toRun = [t];
  }

  let anyFail = false;
  for (const t of toRun) {
    log.info(`CLI refresh: ${t.name}`);
    const r = await Refresh.runTask(t, cfg, false);
    log.info(`  -> ${r.success ? 'OK' : 'FAIL'}: ${r.message}`);
    if (!r.success) anyFail = true;
  }
  configStore.save();
  Telemetry.report({ version: app.getVersion(), event: 'cli-refresh' }).catch(() => {});
  app.exit(anyFail ? 1 : 0);
}

// ============================================================
// App lifecycle
// ============================================================

app.on('ready', () => {
  if (isCliMode()) {
    runCliMode().catch(e => { log.error(e); app.exit(1); });
    return;
  }

  configStore = new ConfigStore(getConfigPath());

  createSplash();
  setTimeout(createMainWindow, 1800);
  createTray();
  registerIpc();
  if (!isDev) registerAutoUpdater();

  // Fire telemetry on launch (non-blocking)
  Telemetry.report({ version: app.getVersion(), event: 'launch' }).catch(e => log.warn('telemetry:', e?.message));
});

app.on('window-all-closed', (e) => {
  // Don't quit when last window closes - keep tray running.
  // BUT if we're actually quitting (user picked Quit, or auto-updater fired
  // q