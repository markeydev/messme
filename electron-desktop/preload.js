const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('messmeDesktop', {
  platform: process.platform,
})
