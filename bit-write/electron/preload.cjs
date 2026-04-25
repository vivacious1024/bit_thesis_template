const { contextBridge, ipcRenderer } = require('electron')

function sendRendererLog(level, source, message) {
  try {
    ipcRenderer.send('bit-write:renderer-log', {
      level,
      source,
      message: String(message || ''),
    })
  } catch {
    // ignore logging failures in preload
  }
}

window.addEventListener('error', (event) => {
  const details = [
    event.message,
    event.filename ? `file=${event.filename}` : '',
    event.lineno ? `line=${event.lineno}` : '',
    event.colno ? `col=${event.colno}` : '',
    event.error?.stack || '',
  ].filter(Boolean).join(' | ')
  sendRendererLog('error', 'window.error', details)
})

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason?.stack || event.reason?.message || event.reason || 'unknown rejection'
  sendRendererLog('error', 'window.unhandledrejection', reason)
})

const originalConsoleError = console.error
console.error = (...args) => {
  sendRendererLog('error', 'console.error', args.map((item) => item?.stack || String(item)).join(' | '))
  originalConsoleError.apply(console, args)
}

contextBridge.exposeInMainWorld('bitWriteDesktop', {
  platform: process.platform,
  getDiagnostics: () => ipcRenderer.invoke('bit-write:get-diagnostics'),
})
