// Desktop qobiq: sayt (server.js) ni alohida oynada ochadi.
// Server manzili: RATING_URL muhit o'zgaruvchisi, bo'lmasa http://localhost:3000
const { app, BrowserWindow, shell } = require('electron');

const START_URL = process.env.RATING_URL || 'http://localhost:3000';

function createWindow() {
  const win = new BrowserWindow({
    width: 1100, height: 760, backgroundColor: '#0e1013', title: 'csreyting.uz',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.loadURL(START_URL);

  const origin = new URL(START_URL).origin;
  // Steam login sahifasi shu oynada ochiladi, boshqa tashqi havolalar brauzerda
  const allowed = u => u.startsWith(origin) || u.startsWith('https://steamcommunity.com/');
  win.webContents.setWindowOpenHandler(({ url }) => { if (!allowed(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!allowed(url)) { e.preventDefault(); shell.openExternal(url); } });
}

app.whenReady().then(() => { createWindow(); try { require('./watcher').start(); } catch (e) { console.log(e.message); } });
app.on('window-all-closed', () => app.quit());
