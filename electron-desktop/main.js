const { app, BrowserWindow, shell } = require('electron')
const path = require('path')

const DEFAULT_START_URL = 'http://localhost:3000'

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 620,
    autoHideMenuBar: true,
    backgroundColor: '#111112',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const startUrl = process.env.ELECTRON_START_URL || DEFAULT_START_URL
  mainWindow.loadURL(startUrl)

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
