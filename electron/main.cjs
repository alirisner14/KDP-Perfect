'use strict';

const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const DEV_URL = process.env.KDP_DEV_SERVER_URL; // set by `npm run dev:desktop`
const DIST_INDEX = path.join(__dirname, '..', 'dist', 'index.html');
const APP_ORIGIN = DEV_URL ? new URL(DEV_URL).origin : pathToFileURL(DIST_INDEX).href;

const SAVE_TYPES = { '.png': 'PNG image', '.jpg': 'JPEG image', '.pdf': 'PDF document', '.svg': 'SVG image', '.txt': 'Text file' };
const MAX_FILE_BYTES = 256 * 1024 * 1024;

/** True when a URL belongs to this app (and not to some page the window navigated to). */
const isAppUrl = (url) => (DEV_URL ? url.startsWith(APP_ORIGIN) : url === APP_ORIGIN || url.startsWith(APP_ORIGIN + '#'));

let lastDir = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 640,
    show: false,
    title: 'KDP Perfect',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#14151a' : '#f5f6f8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => win.show());

  // The app never needs to open or navigate to anything else.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });

  if (DEV_URL) win.loadURL(DEV_URL);
  else win.loadFile(DIST_INDEX);
  return win;
}

function buildMenu() {
  const template = [
    { label: 'File', submenu: [{ role: 'quit' }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' }]),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---- IPC: save a file chosen by the user ---------------------------------------------------------
ipcMain.handle('kdp:save-file', async (event, payload) => {
  if (!event.senderFrame || !isAppUrl(event.senderFrame.url)) throw new Error('Untrusted sender.');
  const { suggestedName, data } = payload ?? {};
  if (typeof suggestedName !== 'string' || !(data instanceof Uint8Array)) throw new Error('Invalid save request.');
  if (data.byteLength === 0 || data.byteLength > MAX_FILE_BYTES) throw new Error('Unsupported file size.');

  const name = path.basename(suggestedName);
  const ext = path.extname(name).toLowerCase();
  if (!SAVE_TYPES[ext]) throw new Error(`Unsupported file type: ${ext || '(none)'}`);

  let target;
  if (process.env.KDP_SMOKE_DIR) {
    // Automated smoke test only (npm run smoke): write without opening a dialog.
    target = path.join(process.env.KDP_SMOKE_DIR, name);
  } else {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showSaveDialog(win, {
      defaultPath: path.join(lastDir ?? app.getPath('documents'), name),
      filters: [{ name: SAVE_TYPES[ext], extensions: [ext.slice(1)] }],
    });
    if (result.canceled || !result.filePath) return { saved: false };
    target = result.filePath;
  }

  await fs.writeFile(target, data);
  lastDir = path.dirname(target);
  return { saved: true, path: target };
});

// ---- lifecycle -----------------------------------------------------------------------------------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    buildMenu();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
