const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('bitWriteDesktop', {
  platform: process.platform,
})
