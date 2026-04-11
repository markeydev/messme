const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('messmeDesktop', {
  platform: process.platform,
  notify: ({ title, body }) => {
    ipcRenderer.send('messme:notify', { title, body })
  },
})
