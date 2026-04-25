import cors from 'cors'
import express from 'express'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import multer from 'multer'

const execFileAsync = promisify(execFile)
const app = express()
const port = Number(process.env.COVER_CONVERTER_PORT || process.env.PORT || 8787)

const serverDir = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(serverDir, '..')
const workspaceRoot = path.resolve(appRoot, '..')
const appDataDir = resolveAppDataDir()
const appCacheDir = appDataDir
const defaultImageCacheDir = process.env.BIT_WRITE_DEFAULT_ASSET_DIR
  ? path.resolve(process.env.BIT_WRITE_DEFAULT_ASSET_DIR)
  : path.join(appDataDir, 'images')
const templateCandidatePaths = buildResourceCandidatePaths(
  process.env.BIT_WRITE_TEMPLATE_PATH,
  'template_for_bit_graduate_project.typ',
)
const cslCandidatePaths = buildResourceCandidatePaths(
  process.env.BIT_WRITE_CSL_PATH,
  'china-national-standard-gb-t-7714-2015-numeric.csl',
)
const typstBinaryCandidatePaths = buildTypstBinaryCandidatePaths(process.env.BIT_WRITE_TYPST_PATH)
const assetConfigPath = path.join(appCacheDir, 'asset-library.json')
let imageCacheDir = defaultImageCacheDir

const COMMON_CHAR_FIX_REPLACEMENTS = Object.freeze({
  '⻠': '饣',
  '⻌': '辶',
  '⻍': '辶',
  '⻖': '阝',
  '⺁': '厂',
  '⺮': '竹',
  '⺾': '艹',
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '—': '-',
  '–': '-',
  '…': '...',
})

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
})

app.use(cors())
app.use(express.json({ limit: '2mb' }))

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    features: {
      coverUpload: 'pdf-only',
      bodyPreview: 'typst',
      imageCache: true,
      assetRename: true,
      assetDelete: true,
      assetDirectoryConfig: true,
      assetDirectoryPicker: isWindows(),
    },
  })
})

app.get('/api/assets-cache/:fileName', async (req, res) => {
  const fileName = safeAssetFileName(req.params.fileName)
  if (!fileName) {
    res.status(400).send('素材文件名无效。')
    return
  }

  const targetPath = path.join(imageCacheDir, fileName)
  try {
    await fs.access(targetPath)
    res.sendFile(targetPath)
  } catch {
    res.status(404).send('素材不存在。')
  }
})

app.get('/api/assets/config', async (_req, res) => {
  try {
    await ensureAssetDirectoryReady()
    res.json(buildAssetConfigResponse())
  } catch (error) {
    res.status(500).send('读取素材库配置失败：' + String(error?.message || error))
  }
})

app.post('/api/assets/config', async (req, res) => {
  try {
    const nextDirectory = await setAssetDirectory(req.body?.assetDirectory)
    res.json({
      ok: true,
      ...buildAssetConfigResponse(),
      assetDirectory: nextDirectory,
    })
  } catch (error) {
    res.status(400).send(String(error?.message || error))
  }
})

app.post('/api/assets/pick-directory', async (_req, res) => {
  if (!isWindows()) {
    res.status(501).send('当前环境暂不支持系统文件夹选择器，请手动输入路径。')
    return
  }

  try {
    const selectedPath = await pickDirectoryWithNativeDialog()
    if (!selectedPath) {
      res.json({
        ok: true,
        cancelled: true,
        ...buildAssetConfigResponse(),
      })
      return
    }

    const nextDirectory = await setAssetDirectory(selectedPath)
    res.json({
      ok: true,
      cancelled: false,
      ...buildAssetConfigResponse(),
      assetDirectory: nextDirectory,
    })
  } catch (error) {
    res.status(500).send('打开文件夹选择器失败：' + String(error?.message || error))
  }
})

app.post('/api/assets/upload-image', upload.single('file'), async (req, res) => {
  const file = req.file
  if (!file) {
    res.status(400).send('缺少图片文件。')
    return
  }

  if (!String(file.mimetype || '').startsWith('image/')) {
    res.status(400).send('仅支持图片文件。')
    return
  }

  const sourceName = String(file.originalname || '')
  const ext = normalizeImageExt(path.extname(sourceName), file.mimetype)
  const fileName = `${Date.now()}-${randomUUID()}${ext}`
  const outputPath = path.join(imageCacheDir, fileName)

  try {
    await ensureAssetDirectoryReady()
    await fs.writeFile(outputPath, file.buffer)
    res.json(buildAssetFileResponse(fileName))
  } catch (error) {
    res.status(500).send('素材上传失败：' + String(error?.message || error))
  }
})

app.get('/api/assets/list', async (_req, res) => {
  try {
    await ensureAssetDirectoryReady()
    const entries = await fs.readdir(imageCacheDir, { withFileTypes: true })

    const files = []
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const fileName = entry.name
      const ext = path.extname(fileName).toLowerCase()
      if (!isImageExt(ext)) continue

      const fullPath = path.join(imageCacheDir, fileName)
      const stat = await fs.stat(fullPath)
      files.push({
        ...buildAssetFileResponse(fileName),
        size: stat.size,
        updatedAt: stat.mtime.toISOString(),
      })
    }

    files.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    res.json({
      ok: true,
      items: files,
      ...buildAssetConfigResponse(),
    })
  } catch (error) {
    res.status(500).send('读取素材库失败：' + String(error?.message || error))
  }
})

app.post('/api/assets/rename', async (req, res) => {
  const sourcePathRaw = String(req.body?.path || '').trim().replaceAll('\\', '/')
  const targetNameRaw = String(req.body?.name || '').trim()

  if (!sourcePathRaw.startsWith('assets-cache/')) {
    res.status(400).send('原素材路径无效。')
    return
  }

  if (!targetNameRaw) {
    res.status(400).send('新名称不能为空。')
    return
  }

  const oldName = path.basename(sourcePathRaw)
  const oldExt = path.extname(oldName).toLowerCase()
  if (!isImageExt(oldExt)) {
    res.status(400).send('仅支持图片素材重命名。')
    return
  }

  const normalizedBase = normalizeAssetBaseName(targetNameRaw)
  if (!normalizedBase) {
    res.status(400).send('文件名不合法，请避免使用 <>:"/\\|?* 等非法字符。')
    return
  }

  const incomingExt = path.extname(targetNameRaw).toLowerCase()
  if (incomingExt && incomingExt !== oldExt) {
    res.status(400).send('重命名时不允许修改文件扩展名。')
    return
  }

  const finalName = `${normalizedBase}${oldExt}`
  if (finalName === oldName) {
    res.json({
      ok: true,
      oldPath: 'assets-cache/' + oldName,
      newPath: 'assets-cache/' + finalName,
      newName: finalName,
      url: buildAssetUrl(finalName),
    })
    return
  }

  const oldFullPath = path.join(imageCacheDir, oldName)
  const newFullPath = path.join(imageCacheDir, finalName)

  try {
    await ensureAssetDirectoryReady()
    await fs.access(oldFullPath)

    try {
      await fs.access(newFullPath)
      res.status(409).send('目标文件名已存在，请换一个名称。')
      return
    } catch {
      // continue
    }

    await fs.rename(oldFullPath, newFullPath)
    res.json({
      ok: true,
      oldPath: 'assets-cache/' + oldName,
      newPath: 'assets-cache/' + finalName,
      newName: finalName,
      url: buildAssetUrl(finalName),
    })
  } catch (error) {
    res.status(500).send('素材重命名失败：' + String(error?.message || error))
  }
})

app.post('/api/assets/delete', async (req, res) => {
  const sourcePathRaw = String(req.body?.path || '').trim().replaceAll('\\', '/')
  if (!sourcePathRaw.startsWith('assets-cache/')) {
    res.status(400).send('素材路径无效。')
    return
  }

  const fileName = path.basename(sourcePathRaw)
  const ext = path.extname(fileName).toLowerCase()
  if (!isImageExt(ext)) {
    res.status(400).send('仅支持删除图片素材。')
    return
  }

  const fullPath = path.join(imageCacheDir, fileName)

  try {
    await ensureAssetDirectoryReady()
    await fs.access(fullPath)
    await fs.rm(fullPath, { force: true })
    res.json({
      ok: true,
      deletedPath: 'assets-cache/' + fileName,
      deletedName: fileName,
    })
  } catch (error) {
    res.status(500).send('删除素材失败：' + String(error?.message || error))
  }
})

app.post('/api/body/render-typst', async (req, res) => {
  const body = sanitizeRenderText(String(req.body?.body || '')).trim()
  const title = sanitizeRenderText(String(req.body?.title || '')).trim()
  const author = sanitizeRenderText(String(req.body?.author || 'bit-write 用户'))
  const date = sanitizeRenderText(String(req.body?.date || ''))

  if (!body) {
    res.status(400).send('正文 Typst 源码为空。')
    return
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-body-'))
  const templateSrc = await resolveExistingResourcePath(templateCandidatePaths, '模板文件')
  const cslSrc = await resolveExistingResourcePath(cslCandidatePaths, '参考文献样式文件')
  const mainTypPath = path.join(workDir, 'main.typ')
  const outPdfPath = path.join(workDir, 'body-preview.pdf')

  try {
    await ensureAssetDirectoryReady()
    await fs.copyFile(templateSrc, path.join(workDir, 'template_for_bit_graduate_project.typ'))

    try {
      await fs.copyFile(cslSrc, path.join(workDir, 'china-national-standard-gb-t-7714-2015-numeric.csl'))
    } catch {
      // optional resource
    }

    try {
      await fs.cp(imageCacheDir, path.join(workDir, 'assets-cache'), { recursive: true })
    } catch {
      // ignore asset copy failures
    }

    const wrapped = `#import "./template_for_bit_graduate_project.typ": project, bit_three_line_table\n\n#show: project.with(\n  title: "${escapeTypstString(
      title,
    )}",\n  authors: ("${escapeTypstString(author)}",),\n  date: "${escapeTypstString(
      date,
    )}",\n)\n\n${body}\n`

    await fs.writeFile(mainTypPath, wrapped)
    await compileWithTypst(mainTypPath, outPdfPath, workDir)

    const outputBytes = await fs.readFile(outPdfPath)
    res.setHeader('Content-Type', 'application/pdf')
    res.send(outputBytes)
  } catch (error) {
    const message = String(error?.message || '')
    if (message.includes('ENOENT')) {
      res.status(500).send('未检测到 Typst 可执行文件，请检查打包资源或本机环境。')
      return
    }
    if (message.includes('EPERM')) {
      res.status(500).send('正文渲染失败：无法启动 Typst，请检查可执行权限。')
      return
    }
    res.status(500).send(`正文渲染失败：${message}`)
  } finally {
    await fs.rm(workDir, { recursive: true, force: true })
  }
})

function buildAssetConfigResponse() {
  return {
    ok: true,
    assetDirectory: imageCacheDir,
    defaultAssetDirectory: defaultImageCacheDir,
    canPickDirectory: isWindows(),
  }
}

function buildAssetFileResponse(fileName) {
  return {
    name: fileName,
    path: 'assets-cache/' + fileName,
    url: buildAssetUrl(fileName),
  }
}

function buildAssetUrl(fileName) {
  return '/api/assets-cache/' + encodeURIComponent(fileName)
}

function resolveAppDataDir() {
  const explicit = String(process.env.BIT_WRITE_DATA_DIR || '').trim()
  if (explicit) return path.resolve(explicit)
  return path.join(appRoot, '.cache')
}

function buildResourceCandidatePaths(explicitPath, fileName) {
  const candidates = []
  if (String(explicitPath || '').trim()) candidates.push(path.resolve(String(explicitPath)))
  candidates.push(path.join(appRoot, 'resources', fileName))
  candidates.push(path.join(appRoot, fileName))
  candidates.push(path.join(workspaceRoot, fileName))
  return candidates
}

function buildTypstBinaryCandidatePaths(explicitPath) {
  const candidates = []
  if (String(explicitPath || '').trim()) candidates.push(path.resolve(String(explicitPath)))
  candidates.push(path.join(appRoot, 'vendor', 'typst', 'win-x64', 'typst.exe'))
  candidates.push(path.join(workspaceRoot, 'bit-write', 'vendor', 'typst', 'win-x64', 'typst.exe'))
  candidates.push(path.join(workspaceRoot, 'vendor', 'typst', 'win-x64', 'typst.exe'))
  candidates.push('typst')
  return candidates
}

async function resolveExistingResourcePath(candidates, label) {
  for (const candidate of candidates) {
    if (candidate === 'typst') return candidate
    try {
      await fs.access(candidate)
      return candidate
    } catch {
      // try next candidate
    }
  }
  throw new Error(`${label}不存在，请检查打包资源是否完整。`)
}

async function compileWithTypst(mainTypPath, outPdfPath, workDir) {
  const candidates = await resolveTypstCommandCandidates()
  const errors = []

  for (const candidate of candidates) {
    try {
      await runTypstCommand(candidate, ['compile', mainTypPath, outPdfPath, '--root', workDir])
      return
    } catch (error) {
      errors.push(`${candidate}: ${String(error?.message || error)}`)
    }
  }

  throw new Error(errors.join(' | ') || '无法启动 Typst。')
}

async function resolveTypstCommandCandidates() {
  const resolved = []
  for (const candidate of typstBinaryCandidatePaths) {
    if (candidate === 'typst') {
      resolved.push(candidate)
      continue
    }
    try {
      await fs.access(candidate)
      resolved.push(candidate)
    } catch {
      // ignore
    }
  }
  if (!resolved.includes('typst')) resolved.push('typst')
  return resolved
}

async function runTypstCommand(command, args) {
  try {
    await execFileAsync(command, args, { timeout: 90_000, windowsHide: true })
    return
  } catch (error) {
    if (isWindows() && String(error?.message || '').includes('EPERM') && command !== 'typst') {
      const psArgs = [buildPowerShellTypstCommand(command, args)]
      await execFileAsync('powershell.exe', ['-NoProfile', '-Command', ...psArgs], {
        timeout: 90_000,
        windowsHide: true,
      })
      return
    }
    throw error
  }
}

function buildPowerShellTypstCommand(command, args) {
  const escaped = [command, ...args].map((item) => `'${String(item).replaceAll("'", "''")}'`)
  return `& ${escaped[0]} ${escaped.slice(1).join(' ')}`
}

async function ensureAssetDirectoryReady() {
  await fs.mkdir(imageCacheDir, { recursive: true })
}

async function setAssetDirectory(inputPath) {
  const nextDirectory = normalizeAssetDirectoryInput(inputPath)
  await fs.mkdir(nextDirectory, { recursive: true })
  imageCacheDir = nextDirectory
  await saveAssetConfig({ assetDirectory: nextDirectory })
  return nextDirectory
}

function normalizeAssetDirectoryInput(inputPath) {
  const raw = String(inputPath || '').trim().replaceAll('"', '')
  if (!raw) throw new Error('素材库目录不能为空。')
  return path.resolve(raw)
}

async function loadAssetConfig() {
  try {
    const raw = await fs.readFile(assetConfigPath, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.assetDirectory === 'string' && parsed.assetDirectory.trim()) {
      imageCacheDir = normalizeAssetDirectoryInput(parsed.assetDirectory)
    } else {
      imageCacheDir = defaultImageCacheDir
    }
  } catch {
    imageCacheDir = defaultImageCacheDir
  }
  await ensureAssetDirectoryReady()
}

async function saveAssetConfig(config) {
  await fs.mkdir(appCacheDir, { recursive: true })
  await fs.writeFile(assetConfigPath, JSON.stringify(config, null, 2), 'utf8')
}

async function pickDirectoryWithNativeDialog() {
  const command = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
    '$dialog.Description = "选择素材库存储文件夹"',
    '$dialog.UseDescriptionForTitle = $true',
    '$dialog.ShowNewFolderButton = $true',
    `$dialog.SelectedPath = '${escapePowerShellString(imageCacheDir)}'`,
    'if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {',
    '  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    '  Write-Output $dialog.SelectedPath',
    '}',
  ].join('; ')

  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-STA', '-Command', command], {
    timeout: 120_000,
    windowsHide: true,
  })

  return String(stdout || '').trim()
}

function escapePowerShellString(value) {
  return String(value || '').replaceAll("'", "''")
}

function safeAssetFileName(input) {
  const raw = decodeURIComponent(String(input || ''))
  const fileName = path.basename(raw)
  if (!fileName || fileName === '.' || fileName === '..') return ''
  return fileName
}

function escapeTypstString(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}

function isImageExt(ext) {
  return ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.gif' || ext === '.webp' || ext === '.svg'
}

function normalizeImageExt(rawExt, mimeType) {
  const ext = String(rawExt || '').toLowerCase()
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) return ext
  if (mimeType === 'image/png') return '.png'
  if (mimeType === 'image/jpeg') return '.jpg'
  if (mimeType === 'image/gif') return '.gif'
  if (mimeType === 'image/webp') return '.webp'
  if (mimeType === 'image/svg+xml') return '.svg'
  return '.png'
}

function normalizeAssetBaseName(name) {
  const raw = String(name || '').trim().replaceAll('\\', '/').split('/').pop() || ''
  const noExt = raw.replace(/\.[^.]+$/, '')
  const compact = noExt.replace(/\s+/g, ' ').trim()
  const safe = compact
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\.+$/g, '')
    .trim()
  if (!safe || safe === '.' || safe === '..') return ''
  return safe.slice(0, 120)
}

function sanitizeRenderText(input) {
  let text = String(input || '')
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[\u00A0\u202F\u2007\u2000-\u200A\u205F]/g, ' ')
    .replace(/[\uE000-\uF8FF]/g, '')
  for (const [from, to] of Object.entries(COMMON_CHAR_FIX_REPLACEMENTS)) {
    if (!from || from === to) continue
    text = text.replaceAll(from, to)
  }
  return text
}

function isWindows() {
  return process.platform === 'win32'
}

app.use((error, _req, res, _next) => {
  if (error?.type === 'entity.parse.failed') {
    res.status(400).send('请求 JSON 格式错误，请检查请求体。')
    return
  }
  res.status(500).send('服务内部异常：' + String(error?.message || error))
})

await loadAssetConfig()

app.listen(port, () => {
  console.log(`本地服务已启动：http://localhost:${port}`)
  console.log(`素材库目录：${imageCacheDir}`)
})
