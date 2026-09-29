const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } = require('electron');
const path = require('path');

const WIN_W = 320;
const WIN_H = 280;

// The cat is 96x104, anchored bottom-left at (112, WIN_H-104) inside the
// 320x280 window. To let the CAT reach the physical screen edges, the window
// itself must be allowed to overhang by the surrounding dead margin.
const CAT = { left: 112, right: 112 + 96, top: WIN_H - 104, bottom: WIN_H };

let win = null;
let tray = null;
let paused = false;

function workArea() {
  return screen.getPrimaryDisplay().workArea;
}

function floorY() {
  const wa = workArea();
  return wa.y + wa.height - WIN_H;
}

function createWindow() {
  const wa = workArea();
  win = new BrowserWindow({
    width: WIN_W,
    height: WIN_H,
    x: wa.x + Math.round(wa.width * 0.6),
    y: floorY(),
    transparent: true,
    frame: false,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Start click-through; the renderer re-enables mouse when the pointer
  // is actually over the cat.
  win.setIgnoreMouseEvents(true, { forward: true });

  win.on('closed', () => { win = null; });
}

ipcMain.on('win-get-bounds', (e) => {
  const [x, y] = win.getPosition();
  e.reply('win-bounds', { x, y, w: WIN_W, h: WIN_H, workArea: workArea() });
});

ipcMain.on('win-move', (e, { x, y }) => {
  if (!win) return;
  const wa = workArea();
  const minX = wa.x - CAT.left;
  const maxX = wa.x + wa.width - CAT.right;
  const minY = wa.y - CAT.top;
  const maxY = wa.y + wa.height - CAT.bottom;
  const cx = Math.max(minX, Math.min(maxX, Math.round(x)));
  const cy = Math.max(minY, Math.min(maxY, Math.round(y)));
  win.setPosition(cx, cy);
});

ipcMain.on('set-cat-hover', (e, hover) => {
  if (!win) return;
  if (hover) win.setIgnoreMouseEvents(false);
  else win.setIgnoreMouseEvents(true, { forward: true });
});

function sendToRenderer(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function buildTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  tray = new Tray(icon.resize({ width: 18, height: 18 }));
  tray.setToolTip('卓卓桌宠');
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: '暂停/继续',
      click: () => {
        paused = !paused;
        sendToRenderer('set-paused', paused);
      },
    },
    { label: '催它说句话', click: () => sendToRenderer('force-speak') },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]));
}

const singleton = app.requestSingleInstanceLock();
if (!singleton) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // A second launch was attempted — just make the existing pet visible.
    if (win && !win.isVisible()) win.show();
  });
}

app.whenReady().then(() => {
  if (!singleton) return;
  createWindow();
  buildTray();
});

app.on('window-all-closed', () => app.quit());
