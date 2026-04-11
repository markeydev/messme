const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('messmeDesktop', {
  platform: process.platform,
  notify: ({ title, body }) => {
    ipcRenderer.send('messme:notify', { title, body })
  },
  getDesktopSources: () => ipcRenderer.invoke('messme:get-desktop-sources'),
  openExternal: (url) => ipcRenderer.invoke('messme:open-external', url),
})
