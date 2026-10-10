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
let trayMenu = null;
let paused = false;
let freeMode = false;            // false = gravity/fall, true = cat stays where placed

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
    // Without this macOS clamps the window below the menu bar, so the cat's
    // 176px of dead margin can never overhang the top edge.
    enableLargerThanScreen: true,
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
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;   // a bad frame must not crash the app
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

// Stream the OS cursor's screen position to the renderer so the cat can react
// (startle / bite / chase). ~12fps is plenty for these gestures.
let cursorTimer = null;
function startCursorStream() {
  cursorTimer = setInterval(() => {
    if (!win || win.isDestroyed() || paused) return;
    const p = screen.getCursorScreenPoint();
    win.webContents.send('cursor', { x: p.x, y: p.y });
  }, 80);
}

/* ---------- fullscreen props layer: poop ---------- */

let propsWin = null;
const world = { poops: [], nextId: 1 };

function screenBounds() {
  return screen.getPrimaryDisplay().bounds;   // full screen, incl. menu bar
}

function sendToProps(channel, payload) {
  if (propsWin && !propsWin.isDestroyed()) propsWin.webContents.send(channel, payload);
}

function ensurePropsWin() {
  if (propsWin && !propsWin.isDestroyed()) return propsWin;
  const b = screenBounds();
  propsWin = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height,
    transparent: true, frame: false, resizable: false, hasShadow: false,
    alwaysOnTop: true, skipTaskbar: true, enableLargerThanScreen: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  propsWin.setAlwaysOnTop(true, 'screen-saver');
  propsWin.setIgnoreMouseEvents(true, { forward: true });
  propsWin.loadFile(path.join(__dirname, 'renderer', 'props.html'));
  return propsWin;
}

function pushProps() {
  sendToProps('props', { poops: world.poops });
}

ipcMain.on('props-ready', () => {
  pushProps();                                   // catch up on anything queued
});

ipcMain.on('spawn-poop', (e, { x, y }) => {
  ensurePropsWin();
  if (world.poops.length >= 5) return;         // cap the pile
  world.poops.push({ id: world.nextId++, x: Math.round(x), y: Math.round(y) });
  pushProps();
});

ipcMain.on('prop-click', (e, { type, id }) => {
  if (type === 'poop') {
    world.poops = world.poops.filter((p) => p.id !== id);
    pushProps();
    sendToRenderer('poop-cleaned', { id });
  }
});

ipcMain.on('props-hover', (e, hover) => {
  if (propsWin && !propsWin.isDestroyed()) {
    propsWin.setIgnoreMouseEvents(!hover, { forward: true });
  }
});

ipcMain.on('sync-free-mode', (e, v) => {      // the pet auto-switched mode -> update the checkbox
  freeMode = !!v;
  if (trayMenu) {
    const it = trayMenu.getMenuItemById('freemode');
    if (it) it.checked = freeMode;
  }
});

function buildTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  tray = new Tray(icon.resize({ width: 18, height: 18 }));
  tray.setToolTip('卓卓桌宠');
  trayMenu = Menu.buildFromTemplate([
    {
      label: '暂停/继续',
      click: () => {
        paused = !paused;
        sendToRenderer('set-paused', paused);
      },
    },
    { label: '催它说句话', click: () => sendToRenderer('force-speak') },
    { label: '投喂小鱼干', click: () => sendToRenderer('offer-food') },
    { label: '逗它追鼠标', click: () => sendToRenderer('trigger-hunt') },
    { type: 'separator' },
    {
      id: 'freemode',
      label: '自由放置（放哪停哪，不掉）',
      type: 'checkbox',
      checked: freeMode,
      click: (it) => { freeMode = it.checked; sendToRenderer('set-free-mode', freeMode); },
    },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]);
  tray.setContextMenu(trayMenu);
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
  startCursorStream();
});

app.on('window-all-closed', () => app.quit());
