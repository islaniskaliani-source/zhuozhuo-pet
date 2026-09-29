const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petApi', {
  getBounds: () => new Promise((resolve) => {
    ipcRenderer.once('win-bounds', (e, b) => resolve(b));
    ipcRenderer.send('win-get-bounds');
  }),
  move: (x, y) => ipcRenderer.send('win-move', { x, y }),
  setCatHover: (hover) => ipcRenderer.send('set-cat-hover', hover),
  on: (channel, fn) => ipcRenderer.on(channel, (e, payload) => fn(payload)),
});
