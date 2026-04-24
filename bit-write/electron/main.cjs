const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { fork } = require('node:child_process')

const SERVER_PORT = Number(process.env.COVER_CONVERTER_PORT || 8787)
const DEV_RENDERER_URL = process.env.ELECTRON_RENDERER_URL || 'http://127.0.0.1:5173'

let mainWindow = null
let serverProcess = null
let quitting = false
let logFilePath = ''

async function createMainWindow() {
  await startBackendServer()
  await waitForServerReady()

  const windowIconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, '..', 'build', 'icons', 'icon.png')

  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    autoHideMenuBar: true,
    title: 'bit-write',
    backgroundColor: '#f4f3ef',
    icon: windowIconPath,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  if (isDev()) {
    await mainWindow.loadURL(DEV_RENDERER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    await mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

async function startBackendServer() {
  if (serverProcess && !serverProcess.killed) return

  const serverScriptPath = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'server', 'cover-convert-server.mjs')
    : path.join(__dirname, '..', 'server', 'cover-convert-server.mjs')
  const userDataDir = path.join(app.getPath('userData'), 'runtime-data')
  const resourceRoot = process.resourcesPath
  const templatePath = app.isPackaged
    ? path.join(resourceRoot, 'template_for_bit_graduate_project.typ')
    : path.join(__dirname, '..', 'resources', 'template_for_bit_graduate_project.typ')
  const cslPath = app.isPackaged
    ? path.join(resourceRoot, 'china-national-standard-gb-t-7714-2015-numeric.csl')
    : path.join(__dirname, '..', 'resources', 'china-national-standard-gb-t-7714-2015-numeric.csl')
  const typstBinaryPath = app.isPackaged
    ? path.join(resourceRoot, 'typst', 'win-x64', 'typst.exe')
    : path.join(__dirname, '..', 'vendor', 'typst', 'win-x64', 'typst.exe')

  serverProcess = fork(serverScriptPath, {
    cwd: app.isPackaged ? process.resourcesPath : path.join(__dirname, '..'),
    env: {
      ...process.env,
      COVER_CONVERTER_PORT: String(SERVER_PORT),
      BIT_WRITE_DATA_DIR: userDataDir,
      BIT_WRITE_DEFAULT_ASSET_DIR: path.join(userDataDir, 'images'),
      BIT_WRITE_TEMPLATE_PATH: templatePath,
      BIT_WRITE_CSL_PATH: cslPath,
      BIT_WRITE_TYPST_PATH: typstBinaryPath,
    },
    silent: true,
  })

  logLine(`backend spawn: ${serverScriptPath}`)

  if (serverProcess.stdout) {
    serverProcess.stdout.on('data', (chunk) => {
      logLine(`[backend stdout] ${String(chunk).trimEnd()}`)
    })
  }
  if (serverProcess.stderr) {
    serverProcess.stderr.on('data', (chunk) => {
      logLine(`[backend stderr] ${String(chunk).trimEnd()}`)
    })
  }

  serverProcess.on('exit', (code, signal) => {
    logLine(`backend exit: code=${code} signal=${signal}`)
    if (!quitting) {
      console.error(`[bit-write] backend exited unexpectedly: code=${code} signal=${signal}`)
    }
    serverProcess = null
  })
}

async function waitForServerReady() {
  const deadline = Date.now() + 20_000
  let lastError = null

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${SERVER_PORT}/health`)
      if (response.ok) return
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await sleep(300)
  }

  throw lastError || new Error('本地服务启动超时。')
}

function stopBackendServer() {
  if (!serverProcess || serverProcess.killed) return
  serverProcess.kill()
  serverProcess = null
}

function isDev() {
  return !app.isPackaged
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

app.whenReady().then(async () => {
  logLine('app ready')
  await createMainWindow()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow()
    }
  })
}).catch((error) => {
  logLine(`app startup error: ${error?.stack || error}`)
  app.quit()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  quitting = true
  logLine('before quit')
  stopBackendServer()
})

process.on('uncaughtException', (error) => {
  logLine(`uncaught exception: ${error?.stack || error}`)
})

process.on('unhandledRejection', (error) => {
  logLine(`unhandled rejection: ${error?.stack || error}`)
})

function logLine(message) {
  try {
    if (!logFilePath) logFilePath = resolveLogFilePath()
    if (!logFilePath) return
    fs.mkdirSync(path.dirname(logFilePath), { recursive: true })
    fs.appendFileSync(logFilePath, `[${new Date().toISOString()}] ${message}\n`)
  } catch {
    // ignore logging errors
  }
}

function resolveLogFilePath() {
  try {
    if (app.isReady()) {
      return path.join(app.getPath('userData'), 'electron-main.log')
    }
  } catch {
    // ignore and fall back to APPDATA
  }

  const appData = process.env.APPDATA || process.env.LOCALAPPDATA
  if (!appData) return ''
  return path.join(appData, 'bit-write', 'electron-main.log')
}
