import cors from 'cors'
import express from 'express'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const app = express()
const port = Number(process.env.COVER_CONVERTER_PORT || process.env.PORT || 8787)
const serverDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(serverDir, '..', '..')

app.use(cors())
app.use(express.json({ limit: '2mb' }))

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    features: {
      coverUpload: 'pdf-only',
      bodyPreview: 'typst',
    },
  })
})

app.post('/api/body/render-typst', async (req, res) => {
  const body = String(req.body?.body || '').trim()
  const title = ''
  const author = String(req.body?.author || 'bit-thesis 用户')
  const date = String(req.body?.date || '')

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
    } catch (_error) {
      // 可选文件，不阻塞渲染
    }

    const wrapped = `#import "./template_for_bit_graduate_project.typ": project\n\n#show: project.with(\n  title: "${escapeTypstString(
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
    res.status(500).send(`正文渲染失败：${message}`)
  } finally {
    await fs.rm(workDir, { recursive: true, force: true })
  }
})

function escapeTypstString(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`本地服务已启动：http://localhost:${port}`)
})
