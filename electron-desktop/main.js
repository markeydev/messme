const { app, BrowserWindow, shell, ipcMain, Notification, nativeImage } = require('electron')
const path = require('path')

const DEFAULT_START_URL = 'http://localhost:3000'
const APP_ICON_PATH = path.join(__dirname, 'build', 'icon.png')
const APP_ICON = nativeImage.createFromPath(APP_ICON_PATH)

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 620,
    autoHideMenuBar: true,
    backgroundColor: '#111112',
    icon: APP_ICON.isEmpty() ? undefined : APP_ICON_PATH,
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
  app.setName('Messme')
  createWindow()

  ipcMain.on('messme:notify', (_event, payload) => {
    if (!Notification.isSupported()) return
    const title = payload?.title || 'Messme'
    const body = payload?.body || 'Новое сообщение'
    const notification = new Notification({
      title,
      body,
      icon: APP_ICON.isEmpty() ? undefined : APP_ICON,
    })
    notification.show()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
