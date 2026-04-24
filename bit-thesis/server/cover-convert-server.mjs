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
const projectRoot = path.resolve(serverDir, '..', '..')
const imageCacheDir = path.join(projectRoot, '.cache', 'images')

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
})

app.use(cors())
app.use(express.json({ limit: '2mb' }))
app.use('/api/assets-cache', express.static(imageCacheDir, { fallthrough: false }))

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    features: {
      coverUpload: 'pdf-only',
      bodyPreview: 'typst',
      imageCache: true,
      assetRename: true,
      assetDelete: true,
    },
  })
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
    await fs.mkdir(imageCacheDir, { recursive: true })
    await fs.writeFile(outputPath, file.buffer)
    res.json({
      ok: true,
      path: `assets-cache/${fileName}`,
      url: `/api/assets-cache/${fileName}`,
    })
  } catch (error) {
    res.status(500).send('素材上传失败：' + String(error?.message || error))
  }
})

app.get('/api/assets/list', async (_req, res) => {
  try {
    await fs.mkdir(imageCacheDir, { recursive: true })
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
        name: fileName,
        path: 'assets-cache/' + fileName,
        url: '/api/assets-cache/' + fileName,
        size: stat.size,
        updatedAt: stat.mtime.toISOString(),
      })
    }

    files.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    res.json({ ok: true, items: files })
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
    res.status(400).send('重命名不允许修改文件扩展名。')
    return
  }

  const finalName = `${normalizedBase}${oldExt}`
  if (finalName === oldName) {
    res.json({
      ok: true,
      oldPath: 'assets-cache/' + oldName,
      newPath: 'assets-cache/' + finalName,
      newName: finalName,
      url: '/api/assets-cache/' + finalName,
    })
    return
  }

  const oldFullPath = path.join(imageCacheDir, oldName)
  const newFullPath = path.join(imageCacheDir, finalName)

  try {
    await fs.mkdir(imageCacheDir, { recursive: true })
    await fs.access(oldFullPath)

    try {
      await fs.access(newFullPath)
      res.status(409).send('目标文件名已存在，请换一个名称。')
      return
    } catch {
      // 目标不存在，继续重命名
    }

    await fs.rename(oldFullPath, newFullPath)
    res.json({
      ok: true,
      oldPath: 'assets-cache/' + oldName,
      newPath: 'assets-cache/' + finalName,
      newName: finalName,
      url: '/api/assets-cache/' + finalName,
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
    await fs.mkdir(imageCacheDir, { recursive: true })
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
  const author = sanitizeRenderText(String(req.body?.author || 'bit-thesis 用户'))
  const date = sanitizeRenderText(String(req.body?.date || ''))

  if (!body) {
    res.status(400).send('正文 Typst 源码为空。')
    return
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-body-'))
  const templateSrc = path.join(projectRoot, 'template_for_bit_graduate_project.typ')
  const cslSrc = path.join(projectRoot, 'china-national-standard-gb-t-7714-2015-numeric.csl')
  const mainTypPath = path.join(workDir, 'main.typ')
  const outPdfPath = path.join(workDir, 'body-preview.pdf')

  try {
    await fs.copyFile(templateSrc, path.join(workDir, 'template_for_bit_graduate_project.typ'))

    try {
      await fs.copyFile(cslSrc, path.join(workDir, 'china-national-standard-gb-t-7714-2015-numeric.csl'))
    } catch {
      // 可选文件，不阻塞渲染
    }

    try {
      await fs.cp(imageCacheDir, path.join(workDir, 'assets-cache'), { recursive: true })
    } catch {
      // 缓存目录不存在时忽略
    }

    const wrapped = `#import "./template_for_bit_graduate_project.typ": project, bit_three_line_table\n\n#show: project.with(\n  title: "${escapeTypstString(
      title,
    )}",\n  authors: ("${escapeTypstString(author)}",),\n  date: "${escapeTypstString(
      date,
    )}",\n)\n\n${body}\n`

    await fs.writeFile(mainTypPath, wrapped)
    await execFileAsync('typst', ['compile', mainTypPath, outPdfPath, '--root', workDir], {
      timeout: 90_000,
    })

    const outputBytes = await fs.readFile(outPdfPath)
    res.setHeader('Content-Type', 'application/pdf')
    res.send(outputBytes)
  } catch (error) {
    const message = String(error?.message || '')
    if (message.includes('ENOENT')) {
      res.status(500).send('未检测到 typst 命令。请先安装 Typst 并加入 PATH。')
      return
    }
    if (message.includes('EPERM')) {
      res
        .status(500)
        .send(
          '正文渲染失败：无法启动 typst（EPERM）。请检查 typst 可执行权限、安装目录权限，或将 typst.exe 放到本机本地目录并加入 PATH。',
        )
      return
    }
    res.status(500).send(`正文渲染失败：${message}`)
  } finally {
    await fs.rm(workDir, { recursive: true, force: true })
  }
})

function escapeTypstString(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}

function isImageExt(ext) {
  return ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.gif' || ext === '.webp' || ext === '.svg'
}

function normalizeImageExt(rawExt, mimeType) {
  const ext = String(rawExt || '').toLowerCase()
  if (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.gif' || ext === '.webp' || ext === '.svg') {
    return ext
  }

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

const COMMON_CHAR_FIX_REPLACEMENTS = Object.freeze({
  '⻔': '门',
  '⻆': '角',
  '⻛': '风',
  '⻓': '长',
  '⻢': '马',
  '⻋': '车',
  '⻅': '见',
  '⻝': '食',
  '⻌': '辶',
  '⻍': '辶',
  '⺀': '冫',
  '⺁': '厂',
  '⺄': '乙',
  '⺈': '刀',
  '⺋': '卩',
  '⺌': '小',
  '⺕': '彐',
  '⺧': '牛',
  '⺪': '阝',
  '⺮': '竹',
  '⺼': '月',
  '⻂': '衣',
  '⻎': '辶',
  '⻏': '阝',
  '⻐': '钅',
  '⻑': '长',
  '⻒': '尢',
  '⻕': '阝',
  '⻖': '阝',
  '⻗': '雨',
  '⻘': '青',
  '⻙': '韦',
  '⻚': '页',
  '⻜': '飞',
  '⻟': '食',
  '⻠': '饣',
  '⻣': '骨',
  '⻤': '鬼',
  '⻥': '鱼',
  '⻦': '鸟',
  '⻧': '卤',
  '⻨': '麦',
  '⻩': '黄',
  '⻪': '黾',
  '⻫': '齐',
  '⻬': '齐',
  '⻭': '齿',
  '⻮': '齿',
  '︰': ':',
  '﹣': '-',
  '－': '-',
  '﹢': '+',
  '／': '/',
  '＼': '\\',
})

app.use((error, _req, res, _next) => {
  if (error?.type === 'entity.parse.failed') {
    res.status(400).send('请求 JSON 格式错误，请检查请求体。')
    return
  }
  res.status(500).send('服务内部异常：' + String(error?.message || error))
})

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`本地服务已启动：http://localhost:${port}`)
})
