const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { fork } = require('node:child_process')

const APP_NAME = 'bit-write'
const SERVER_PORT = Number(process.env.COVER_CONVERTER_PORT || 8787)
const DEV_RENDERER_URL = process.env.ELECTRON_RENDERER_URL || 'http://127.0.0.1:5173'
const DEBUG_APP_SUFFIX = String(process.env.BIT_WRITE_DEBUG_APP_SUFFIX || '').trim()
const APP_FOLDER_NAME = DEBUG_APP_SUFFIX ? `${APP_NAME}-${DEBUG_APP_SUFFIX}` : APP_NAME
const FALLBACK_APPDATA_ROOT =
  process.env.APPDATA ||
  process.env.LOCALAPPDATA ||
  path.join(os.homedir(), 'AppData', 'Roaming')
const FALLBACK_USER_DATA_DIR = path.join(FALLBACK_APPDATA_ROOT, APP_FOLDER_NAME)
const STABLE_MAIN_LOG_PATH = path.join(FALLBACK_USER_DATA_DIR, 'electron-main.log')
const STABLE_CHROMIUM_LOG_PATH = path.join(FALLBACK_USER_DATA_DIR, 'chromium.log')
const RUNTIME_INFO_PATH = path.join(FALLBACK_USER_DATA_DIR, 'runtime-info.json')

let mainWindow = null
let serverProcess = null
let quitting = false
let sessionLogFilePath = ''
let backendReadyPromise = null

if (DEBUG_APP_SUFFIX) {
  app.setName(APP_FOLDER_NAME)
  app.setPath('userData', FALLBACK_USER_DATA_DIR)
}

app.commandLine.appendSwitch('enable-logging')
app.commandLine.appendSwitch('log-file', STABLE_CHROMIUM_LOG_PATH)
// Work around a Windows-native startup crash in packaged builds where
// Electron's crash handler registration hits access-denied and aborts.
app.commandLine.appendSwitch('disable-breakpad')
// Electron on some mapped / non-system drives can fail before renderer startup
// because Chromium child process sandboxing rejects the launch path.
app.commandLine.appendSwitch('no-sandbox')
// Some Windows installs crash immediately after launch because Chromium's GPU
// child process cannot initialize on that target disk / driver combination.
// Force software rendering to keep packaged builds stable across drives.
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-gpu-compositing')

// The app is document-centric and does not need GPU acceleration; disabling it
// reduces Windows-specific native startup failures around renderer initialization.
app.disableHardwareAcceleration()

async function createMainWindow() {
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
  logLine(`browser window created: icon=${windowIconPath}`)

  mainWindow.once('ready-to-show', () => {
    logLine('window ready-to-show')
  })
  mainWindow.on('show', () => {
    logLine('window show')
  })
  mainWindow.webContents.on('did-finish-load', () => {
    logLine('renderer did-finish-load')
  })
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logLine(`renderer did-fail-load: code=${errorCode} desc=${errorDescription} url=${validatedURL}`)
  })
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logLine(`renderer gone: reason=${details?.reason} exitCode=${details?.exitCode}`)
  })
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    logLine(`renderer console: level=${level} source=${sourceId || 'unknown'} line=${line} message=${message}`)
  })
  mainWindow.on('unresponsive', () => {
    logLine('window unresponsive')
  })

  if (isDev()) {
    logLine(`loading dev url: ${DEV_RENDERER_URL}`)
    await mainWindow.loadURL(DEV_RENDERER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    const indexHtmlPath = path.join(__dirname, '..', 'dist', 'index.html')
    logLine(`loading index file: ${indexHtmlPath}`)
    await mainWindow.loadFile(indexHtmlPath)
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  void ensureBackendServerReady()
}

async function startBackendServer() {
  if (serverProcess && !serverProcess.killed) return

  const serverScriptPath = resolveServerScriptPath()
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
  serverProcess.on('error', (error) => {
    logLine(`backend process error: ${error?.stack || error}`)
  })
}

function ensureBackendServerReady() {
  if (backendReadyPromise) return backendReadyPromise

  backendReadyPromise = (async () => {
    await startBackendServer()
    await waitForServerReady()
    logLine('backend ready')
  })().catch((error) => {
    logLine(`backend ready failed: ${error?.stack || error}`)
    return null
  }).finally(() => {
    backendReadyPromise = null
  })

  return backendReadyPromise
}

async function waitForServerReady() {
  const deadline = Date.now() + 20_000
  let lastError = null

  while (Date.now() < deadline) {
    let timeoutId = null
    try {
      const controller = new AbortController()
      timeoutId = setTimeout(() => controller.abort(), 1500)
      const response = await fetch(`http://127.0.0.1:${SERVER_PORT}/health`, {
        signal: controller.signal,
      })
      if (response.ok) return
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
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

logLine(`main entry: packaged=${app.isPackaged} argv=${process.argv.join(' | ')}`)

const singleInstanceLock = app.requestSingleInstanceLock()

if (!singleInstanceLock) {
  logLine('single-instance lock denied')
  app.quit()
} else {
  app.on('second-instance', async () => {
    logLine('second-instance')
    if (!mainWindow) {
      await createMainWindow()
      return
    }
    if (mainWindow.isMinimized()) mainWindow.restore()
    if (!mainWindow.isVisible()) mainWindow.show()
    mainWindow.focus()
  })

  app.whenReady().then(async () => {
    logLine('app ready')
    writeRuntimeInfoFile()
    logLine(`startup paths: userData=${app.getPath('userData')} resources=${process.resourcesPath} exec=${process.execPath}`)
    logLine(`startup versions: electron=${process.versions.electron} chrome=${process.versions.chrome} node=${process.versions.node}`)
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
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  quitting = true
  logLine('before quit')
  stopBackendServer()
})

app.on('child-process-gone', (_event, details) => {
  logLine(`child-process-gone: type=${details?.type} reason=${details?.reason} exitCode=${details?.exitCode} name=${details?.name || ''}`)
})

app.on('browser-window-created', (_event, window) => {
  logLine(`browser-window-created: id=${window.id}`)
})

process.on('uncaughtException', (error) => {
  logLine(`uncaught exception: ${error?.stack || error}`)
})

process.on('unhandledRejection', (error) => {
  logLine(`unhandled rejection: ${error?.stack || error}`)
})

ipcMain.on('bit-write:renderer-log', (_event, payload) => {
  const level = payload?.level || 'info'
  const message = payload?.message || ''
  const source = payload?.source || 'renderer'
  logLine(`[renderer ${level}] ${source}: ${message}`)
})

ipcMain.handle('bit-write:get-diagnostics', () => {
  return {
    appName: app.getName(),
    version: app.getVersion(),
    isPackaged: app.isPackaged,
    platform: process.platform,
    arch: process.arch,
    userDataPath: app.getPath('userData'),
    mainLogPath: STABLE_MAIN_LOG_PATH,
    chromiumLogPath: STABLE_CHROMIUM_LOG_PATH,
    runtimeInfoPath: RUNTIME_INFO_PATH,
    processId: process.pid,
    execPath: process.execPath,
  }
})

function logLine(message) {
  try {
    const logPaths = [resolveSessionLogPath(), STABLE_MAIN_LOG_PATH]
    for (const logPath of logPaths) {
      if (!logPath) continue
      fs.mkdirSync(path.dirname(logPath), { recursive: true })
      fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`)
    }
  } catch {
    // ignore logging errors
  }
}

function resolveSessionLogPath() {
  if (sessionLogFilePath) return sessionLogFilePath

  try {
    if (app.isReady()) {
      sessionLogFilePath = path.join(app.getPath('userData'), `electron-main-${process.pid}.log`)
      return sessionLogFilePath
    }
  } catch {
    // ignore and fall back to APPDATA
  }

  sessionLogFilePath = path.join(FALLBACK_USER_DATA_DIR, `electron-main-${process.pid}.log`)
  return sessionLogFilePath
}

function resolveServerScriptPath() {
  if (!app.isPackaged) {
    return path.join(__dirname, '..', 'server', 'cover-convert-server.mjs')
  }

  const packagedCandidates = [
    path.join(process.resourcesPath, 'app.asar', 'server', 'cover-convert-server.mjs'),
    path.join(process.resourcesPath, 'app.asar.unpacked', 'server', 'cover-convert-server.mjs'),
  ]

  for (const candidate of packagedCandidates) {
    if (fs.existsSync(candidate)) return candidate
  }

  return packagedCandidates[0]
}

function writeRuntimeInfoFile() {
  try {
    const runtimeInfo = {
      appName: app.getName(),
      version: app.getVersion(),
      isPackaged: app.isPackaged,
      pid: process.pid,
      platform: process.platform,
      arch: process.arch,
      execPath: process.execPath,
      cwd: process.cwd(),
      argv: process.argv,
      chromeVersion: process.versions.chrome,
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      userDataPath: app.getPath('userData'),
      resourcesPath: process.resourcesPath,
      locale: app.getLocale(),
      timestamp: new Date().toISOString(),
    }
    fs.mkdirSync(path.dirname(RUNTIME_INFO_PATH), { recursive: true })
    fs.writeFileSync(RUNTIME_INFO_PATH, JSON.stringify(runtimeInfo, null, 2))
    logLine(`runtime info written: ${RUNTIME_INFO_PATH}`)
  } catch (error) {
    logLine(`runtime info write failed: ${error?.stack || error}`)
  }
}
