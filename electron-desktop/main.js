const { app, BrowserWindow, shell, ipcMain, Notification, nativeImage, desktopCapturer } = require('electron')
const path = require('path')

const DEFAULT_START_URL = 'https://aty-market.ru'
const APP_ICON_PATH = path.join(__dirname, 'build', 'icon.png')
const APP_ICON = nativeImage.createFromPath(APP_ICON_PATH)
let mainWindowRef = null

const shouldOpenInternally = (rawUrl) => {
  try {
    const parsed = new URL(rawUrl)
    return parsed.hostname === 'aty-market.ru' || parsed.hostname.endsWith('.aty-market.ru')
  } catch {
    return false
  }
}

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
  mainWindowRef = mainWindow
  mainWindow.on('closed', () => {
    if (mainWindowRef === mainWindow) mainWindowRef = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (shouldOpenInternally(url) && !mainWindow.isDestroyed()) {
      mainWindow.loadURL(url)
      return { action: 'deny' }
    }
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

  ipcMain.handle('messme:get-desktop-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true,
    })
    return sources.map(source => ({
      id: source.id,
      name: source.name,
      displayId: source.display_id,
      thumbnail: source.thumbnail.toDataURL(),
      appIcon: source.appIcon ? source.appIcon.toDataURL() : null,
    }))
  })

  ipcMain.handle('messme:open-external', async (_event, rawUrl) => {
    try {
      const url = String(rawUrl ?? '')
      if (!/^https?:\/\//i.test(url)) return false
      if (shouldOpenInternally(url) && mainWindowRef && !mainWindowRef.isDestroyed()) {
        await mainWindowRef.loadURL(url)
        return true
      }
      await shell.openExternal(url)
      return true
    } catch {
      return false
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
