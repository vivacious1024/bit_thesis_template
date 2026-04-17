<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch, watchEffect } from 'vue'
import { PDFDocument } from 'pdf-lib'

const mode = ref('form')
const parseNotice = ref('')
const typstSource = ref('')

const formDoc = reactive({
  blocks: [
    { id: crypto.randomUUID(), type: 'heading', level: 1, text: '论文标题' },
    { id: crypto.randomUUID(), type: 'paragraph', text: '在填空模式中编辑正文，右键可插入段落、标题、图片、公式和三线表。' },
  ],
})

const contextMenu = reactive({ visible: false, x: 0, y: 0, targetIndex: -1 })

const coverFileName = ref('')
const coverPdfBytes = ref(null)
const coverStatus = ref('尚未选择封面文件。')

const bodyPdfFileName = ref('')
const bodyPdfBytes = ref(null)
const bodyStatus = ref('尚未上传正文 PDF，将优先使用实时渲染结果。')

const renderedBodyPdfBytes = ref(null)
const previewPdfUrl = ref('')
const previewStatus = ref('等待首次渲染...')
const isRenderingPreview = ref(false)

const mergeStatus = ref('')
const isMerging = ref(false)

let previewTimer = null
let previewRequestSeq = 0

const modeLabel = computed(() => (mode.value === 'form' ? '填空模式' : 'Typst 模式'))
const generatedTypst = computed(() => (mode.value === 'typst' ? typstSource.value : buildTypstFromForm()))

watchEffect(() => {
  if (mode.value === 'form') typstSource.value = buildTypstFromForm()
})

watch(generatedTypst, () => schedulePreviewRender(), { immediate: true })

function schedulePreviewRender() {
  if (previewTimer) clearTimeout(previewTimer)
  previewTimer = setTimeout(() => {
    renderBodyPdfPreview()
  }, 500)
}

async function renderBodyPdfPreview() {
  const source = generatedTypst.value.trim()
  if (!source) {
    renderedBodyPdfBytes.value = null
    previewStatus.value = '正文内容为空，无法渲染。'
    return
  }

  const requestId = ++previewRequestSeq
  isRenderingPreview.value = true
  previewStatus.value = '正在实时渲染正文 PDF...'

  try {
    const response = await fetch('/api/body/render-typst', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: source, title: '论文正文预览', author: 'bit-thesis 用户', date: '' }),
    })

    if (!response.ok) {
      const message = await response.text()
      throw new Error(message || `HTTP ${response.status}`)
    }

    const blob = await response.blob()
    const bytes = await blob.arrayBuffer()
    if (requestId !== previewRequestSeq) return

    renderedBodyPdfBytes.value = bytes
    if (previewPdfUrl.value) URL.revokeObjectURL(previewPdfUrl.value)
    previewPdfUrl.value = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
    previewStatus.value = '正文 PDF 已实时更新。'
  } catch (error) {
    if (requestId !== previewRequestSeq) return
    previewStatus.value = `实时预览失败：${error.message}`
  } finally {
    if (requestId === previewRequestSeq) isRenderingPreview.value = false
  }
}

function buildTypstFromForm() {
  const lines = ['// 由 bit-thesis 编辑器自动生成', '']

  for (const block of formDoc.blocks) {
    if (block.type === 'paragraph') {
      const paragraph = (block.text || '').trim()
      if (paragraph) lines.push(paragraph, '')
      continue
    }
    if (block.type === 'heading') {
      const title = (block.text || '').trim() || '未命名标题'
      const level = Math.max(1, Math.min(4, Number(block.level) || 1))
      lines.push(`${'='.repeat(level)} ${title}`, '')
      continue
    }
    if (block.type === 'image') {
      const path = (block.path || '').trim() || 'images/placeholder.png'
      const caption = (block.caption || '').trim() || '图片说明'
      const width = (block.width || '').trim()
      const widthExpr = width ? `, width: ${width}` : ''
      lines.push(`#figure(image("${escapeString(path)}"${widthExpr}), caption: [${escapeContent(caption)}])`, '')
      continue
    }
    if (block.type === 'equation') {
      const equation = (block.text || '').trim() || 'a^2 + b^2 = c^2'
      lines.push('$', equation, '$', '')
      continue
    }
    if (block.type === 'table') {
      lines.push(...buildThreeLineTableTypst(block), '')
    }
  }

  return `${lines.join('\n').trim()}\n`
}

function buildThreeLineTableTypst(block) {
  const headers = splitRow(block.headersText || '列1|列2|列3')
  const bodyRows = splitRows(block.rowsText || '数据1|数据2|数据3\n数据4|数据5|数据6')
  const columnCount = Math.max(1, Number(block.columns) || headers.length || Math.max(...bodyRows.map((row) => row.length), 1))

  const normalizedHeaders = normalizeRow(headers, columnCount, '列')
  const normalizedRows = bodyRows.length
    ? bodyRows.map((row, rowIndex) => normalizeRow(row, columnCount, `数据${rowIndex + 1}-`))
    : [Array.from({ length: columnCount }, (_, i) => `数据${i + 1}`)]

  const totalRows = normalizedRows.length + 1
  const caption = (block.caption || '').trim() || '三线表示例'
  const marker = {
    caption,
    columns: columnCount,
    headersText: normalizedHeaders.join('|'),
    rowsText: normalizedRows.map((row) => row.join('|')).join('\n'),
  }

  const lines = [
    `// BIT_TABLE_META ${JSON.stringify(marker)}`,
    '#figure(',
    '  table(',
    `    columns: ${columnCount},`,
    '    align: center + horizon,',
    '    stroke: none,',
    '    table.hline(y: 0, stroke: 1.5pt),',
    '    table.hline(y: 1, stroke: 0.75pt),',
    `    table.hline(y: ${totalRows}, stroke: 1.5pt),`,
    `    table.header(${normalizedHeaders.map((cell) => `[${escapeContent(cell)}]`).join(', ')}),`,
  ]

  for (const row of normalizedRows) {
    lines.push(`    ${row.map((cell) => `[${escapeContent(cell)}]`).join(', ')},`)
  }

  lines.push('  ),')
  lines.push(`  caption: [${escapeContent(caption)}],`)
  lines.push('  kind: table,')
  lines.push(')')
  return lines
}

function splitRow(text) {
  return String(text)
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

function splitRows(text) {
  return String(text)
    .split(/\r?\n/)
    .map((line) => splitRow(line))
    .filter((row) => row.length > 0)
}

function normalizeRow(row, targetLength, prefix) {
  const next = row.slice(0, targetLength)
  while (next.length < targetLength) next.push(`${prefix}${next.length + 1}`)
  return next
}

function escapeString(input) {
  return String(input).replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}

function escapeContent(input) {
  return String(input).replaceAll(']', '\\]').replaceAll('[', '\\[')
}

function switchMode(nextMode) {
  if (nextMode === mode.value) return

  if (nextMode === 'typst') {
    typstSource.value = buildTypstFromForm()
    parseNotice.value = '已将填空内容转换为 Typst。'
    mode.value = 'typst'
    return
  }

  const parsed = parseTypstToBlocks(typstSource.value)
  formDoc.blocks = parsed
  parseNotice.value = '已将 Typst 解析为可编辑结构。未识别语法会保留为段落。'
  mode.value = 'form'
}

function parseTypstToBlocks(raw) {
  const text = String(raw || '')
  const lines = text.split(/\r?\n/)
  const result = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) {
      i += 1
      continue
    }

    if (trimmed.startsWith('// BIT_TABLE_META')) {
      const tableBlock = parseTableMarker(trimmed)
      if (tableBlock) result.push(tableBlock)
      i += 1
      while (i < lines.length && !lines[i].trim().startsWith('#figure(')) i += 1
      if (i < lines.length && lines[i].trim().startsWith('#figure(')) {
        i += 1
        while (i < lines.length && lines[i].trim() !== ')') i += 1
      }
      i += 1
      continue
    }

    if (trimmed.startsWith('//')) {
      i += 1
      continue
    }

    const headingMatch = trimmed.match(/^(=+)\s+(.+)$/)
    if (headingMatch) {
      result.push({ id: crypto.randomUUID(), type: 'heading', level: Math.min(4, headingMatch[1].length), text: headingMatch[2].trim() })
      i += 1
      continue
    }

    if (trimmed.startsWith('#figure(image(')) {
      const pathMatch = trimmed.match(/image\("([^"]+)"/)
      const widthMatch = trimmed.match(/,\s*width:\s*([^)]+)\)/)
      const captionMatch = trimmed.match(/caption:\s*\[(.*)\]/)
      result.push({
        id: crypto.randomUUID(),
        type: 'image',
        path: pathMatch?.[1] || '',
        width: widthMatch?.[1]?.trim() || '',
        caption: captionMatch?.[1]?.trim() || '',
      })
      i += 1
      continue
    }

    if (trimmed === '$') {
      const equationLines = []
      i += 1
      while (i < lines.length && lines[i].trim() !== '$') {
        equationLines.push(lines[i])
        i += 1
      }
      if (i < lines.length && lines[i].trim() === '$') i += 1
      result.push({ id: crypto.randomUUID(), type: 'equation', text: equationLines.join('\n').trim() })
      continue
    }

    const inlineEquation = trimmed.match(/^\$(.+)\$$/)
    if (inlineEquation) {
      result.push({ id: crypto.randomUUID(), type: 'equation', text: inlineEquation[1].trim() })
      i += 1
      continue
    }

    const paragraphLines = [line]
    i += 1
    while (i < lines.length) {
      const nextTrim = lines[i].trim()
      if (!nextTrim || nextTrim.startsWith('//') || nextTrim.startsWith('#figure(image(') || nextTrim === '$' || /^\$(.+)\$$/.test(nextTrim) || /^(=+)\s+(.+)$/.test(nextTrim)) break
      paragraphLines.push(lines[i])
      i += 1
    }

    result.push({ id: crypto.randomUUID(), type: 'paragraph', text: paragraphLines.join('\n').trim() })
  }

  if (!result.length) result.push({ id: crypto.randomUUID(), type: 'paragraph', text: '' })
  return result
}

function parseTableMarker(line) {
  const raw = line.replace('// BIT_TABLE_META', '').trim()
  if (!raw) return { id: crypto.randomUUID(), type: 'table', ...defaultBlockPayload('table') }

  try {
    const parsed = JSON.parse(raw)
    return {
      id: crypto.randomUUID(),
      type: 'table',
      caption: parsed.caption || '三线表示例',
      columns: Number(parsed.columns) || 3,
      headersText: parsed.headersText || '列1|列2|列3',
      rowsText: parsed.rowsText || '数据1|数据2|数据3\n数据4|数据5|数据6',
    }
  } catch (_error) {
    return { id: crypto.randomUUID(), type: 'table', ...defaultBlockPayload('table') }
  }
}

function addBlock(afterIndex, type, initial = {}) {
  const block = { id: crypto.randomUUID(), type, ...defaultBlockPayload(type), ...initial }
  const index = Math.max(-1, Math.min(afterIndex, formDoc.blocks.length - 1))
  formDoc.blocks.splice(index + 1, 0, block)
}

function defaultBlockPayload(type) {
  if (type === 'heading') return { level: 2, text: '新标题' }
  if (type === 'image') return { path: '', caption: '', width: '80%' }
  if (type === 'equation') return { text: '' }
  if (type === 'table') {
    return {
      caption: '三线表示例',
      columns: 3,
      headersText: '列1|列2|列3',
      rowsText: '数据1|数据2|数据3\n数据4|数据5|数据6',
    }
  }
  return { text: '' }
}

function removeBlock(index) {
  if (formDoc.blocks.length <= 1) return
  formDoc.blocks.splice(index, 1)
}

function openContextMenu(event) {
  if (mode.value !== 'form') return
  event.preventDefault()
  const blockEl = event.target?.closest?.('[data-block-index]')
  const targetIndex = Number(blockEl?.dataset?.blockIndex ?? formDoc.blocks.length - 1)

  contextMenu.visible = true
  contextMenu.x = event.clientX
  contextMenu.y = event.clientY
  contextMenu.targetIndex = Number.isFinite(targetIndex) ? targetIndex : formDoc.blocks.length - 1
}

function closeContextMenu() {
  contextMenu.visible = false
}

function onGlobalClick() {
  if (contextMenu.visible) closeContextMenu()
}

function onKeydown(event) {
  if (event.key === 'Escape') closeContextMenu()
}

function insertFromMenu(type, opts = {}) {
  addBlock(contextMenu.targetIndex, type, opts)
  closeContextMenu()
}

function blockTypeText(type) {
  const map = { paragraph: '段落', heading: '标题', image: '图片', equation: '公式', table: '三线表' }
  return map[type] || type
}

async function copyTypst() {
  await navigator.clipboard.writeText(generatedTypst.value)
  parseNotice.value = '已复制 Typst 源码。'
}

function downloadTypst() {
  const blob = new Blob([generatedTypst.value], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'thesis.typ'
  a.click()
  URL.revokeObjectURL(url)
  parseNotice.value = '已下载 thesis.typ。'
}

async function onCoverFileChange(event) {
  const file = event.target.files?.[0]
  if (!file) return

  coverFileName.value = file.name
  mergeStatus.value = ''

  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf')) {
    coverPdfBytes.value = await file.arrayBuffer()
    coverStatus.value = `已加载封面 PDF：${file.name}`
    return
  }

  coverPdfBytes.value = null
  coverStatus.value = '封面格式不支持，请上传 .pdf'
}

async function onBodyPdfChange(event) {
  const file = event.target.files?.[0]
  if (!file) return

  const name = file.name.toLowerCase()
  if (!name.endsWith('.pdf')) {
    bodyPdfBytes.value = null
    bodyPdfFileName.value = ''
    bodyStatus.value = '正文文件必须是 PDF。'
    return
  }

  bodyPdfFileName.value = file.name
  bodyPdfBytes.value = await file.arrayBuffer()
  bodyStatus.value = `已加载外部正文 PDF：${file.name}`
  mergeStatus.value = ''
}

async function mergeCoverAndBody() {
  if (!coverPdfBytes.value) {
    mergeStatus.value = '请先上传封面 PDF。'
    return
  }

  const bodyBytes = bodyPdfBytes.value || renderedBodyPdfBytes.value
  if (!bodyBytes) {
    mergeStatus.value = '正文 PDF 不可用，请先等待实时渲染完成或手动上传正文 PDF。'
    return
  }

  isMerging.value = true
  mergeStatus.value = '正在合并 PDF...'

  try {
    const mergedDoc = await PDFDocument.create()
    const coverDoc = await PDFDocument.load(coverPdfBytes.value)
    const bodyDoc = await PDFDocument.load(bodyBytes)

    const coverPages = await mergedDoc.copyPages(coverDoc, coverDoc.getPageIndices())
    const bodyPages = await mergedDoc.copyPages(bodyDoc, bodyDoc.getPageIndices())

    for (const page of coverPages) mergedDoc.addPage(page)
    for (const page of bodyPages) mergedDoc.addPage(page)

    const bytes = await mergedDoc.save()
    downloadBytes(bytes, '论文完整版.pdf')
    mergeStatus.value = '合并完成，已导出：论文完整版.pdf'
  } catch (error) {
    mergeStatus.value = `合并失败：${error.message}`
  } finally {
    isMerging.value = false
  }
}

function downloadBytes(bytes, fileName) {
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

function clearCover() {
  coverFileName.value = ''
  coverPdfBytes.value = null
  coverStatus.value = '已清空封面文件。'
}

function clearBodyPdf() {
  bodyPdfFileName.value = ''
  bodyPdfBytes.value = null
  bodyStatus.value = '已清空外部正文 PDF，将回退到实时渲染结果。'
}

onMounted(() => {
  document.addEventListener('click', onGlobalClick)
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onGlobalClick)
  document.removeEventListener('keydown', onKeydown)
  if (previewTimer) clearTimeout(previewTimer)
  if (previewPdfUrl.value) URL.revokeObjectURL(previewPdfUrl.value)
})
</script>

<template>
  <main class="editor-shell" @contextmenu="openContextMenu">
    <header class="topbar">
      <div class="mode-switch">
        <button class="chip" :class="{ active: mode === 'form' }" type="button" @click="switchMode('form')">填空模式</button>
        <button class="chip" :class="{ active: mode === 'typst' }" type="button" @click="switchMode('typst')">Typst 模式</button>
      </div>

      <div class="actions">
        <button class="text-btn" type="button" @click="copyTypst">复制 Typst</button>
        <button class="text-btn" type="button" @click="downloadTypst">下载 .typ</button>
      </div>
    </header>

    <p class="notice">当前：{{ modeLabel }}。{{ parseNotice || '已启用正文 PDF 实时预览。' }}</p>

    <section class="workspace editor-preview-workspace">
      <article class="panel">
        <h2>正文编辑</h2>

        <div v-if="mode === 'form'" class="form-editor">
          <div v-for="(block, index) in formDoc.blocks" :key="block.id" class="block" :data-block-index="index">
            <div class="block-title">
              <span>{{ blockTypeText(block.type) }}</span>
              <button type="button" class="danger" @click="removeBlock(index)">删除</button>
            </div>

            <template v-if="block.type === 'paragraph'">
              <textarea v-model="block.text" class="textarea" rows="4" placeholder="输入段落内容..." />
            </template>

            <template v-else-if="block.type === 'heading'">
              <div class="row">
                <select v-model.number="block.level" class="field small">
                  <option :value="1">一级标题</option>
                  <option :value="2">二级标题</option>
                  <option :value="3">三级标题</option>
                  <option :value="4">四级标题</option>
                </select>
                <input v-model="block.text" class="field" placeholder="标题内容" />
              </div>
            </template>

            <template v-else-if="block.type === 'image'">
              <div class="column">
                <input v-model="block.path" class="field" placeholder="图片路径，例如 images/figure1.png" />
                <input v-model="block.caption" class="field" placeholder="图片说明" />
                <input v-model="block.width" class="field" placeholder="宽度，例如 80% 或 12cm" />
              </div>
            </template>

            <template v-else-if="block.type === 'equation'">
              <textarea v-model="block.text" class="textarea" rows="3" placeholder="输入公式，例如 sum_(i=1)^n i = n(n+1)/2" />
            </template>

            <template v-else-if="block.type === 'table'">
              <div class="column">
                <input v-model="block.caption" class="field" placeholder="表题，例如 实验结果对比" />
                <input v-model.number="block.columns" class="field" type="number" min="1" step="1" placeholder="列数" />
                <textarea v-model="block.headersText" class="textarea" rows="2" placeholder="表头，用 | 分隔，例如 项目|方法A|方法B" />
                <textarea v-model="block.rowsText" class="textarea" rows="4" placeholder="每行一条记录，列用 | 分隔，例如\n准确率|90|92\n召回率|88|91" />
                <p class="hint">默认生成三线表：上/下线 1.5pt，表头下线 0.75pt。</p>
              </div>
            </template>
          </div>
        </div>

        <div v-else class="typst-editor">
          <textarea v-model="typstSource" class="textarea source" rows="30" placeholder="直接粘贴或编辑 Typst 源码..." />
        </div>
      </article>

      <article class="panel preview-panel">
        <div class="preview-header">
          <h2>正文 PDF 实时预览</h2>
          <button type="button" class="text-btn" :disabled="isRenderingPreview" @click="renderBodyPdfPreview">
            {{ isRenderingPreview ? '渲染中...' : '立即刷新' }}
          </button>
        </div>
        <p class="meta">{{ previewStatus }}</p>
        <iframe v-if="previewPdfUrl" :src="previewPdfUrl" class="preview-frame" title="正文 PDF 预览" />
        <div v-else class="preview-empty">暂无可预览的正文 PDF，请检查 Typst 渲染服务状态。</div>
      </article>
    </section>

    <section class="workspace merge-workspace">
      <article class="panel">
        <h2>封面导入</h2>
        <label class="upload-label">
          <span>上传封面（仅 .pdf）</span>
          <input type="file" accept=".pdf,application/pdf" @change="onCoverFileChange" />
        </label>
        <p class="meta">已选文件：{{ coverFileName || '无' }}</p>
        <p class="meta">状态：{{ coverStatus }}</p>
        <button type="button" class="text-btn" @click="clearCover">清空封面</button>
      </article>

      <article class="panel">
        <h2>正文 PDF 与最终导出</h2>
        <label class="upload-label">
          <span>上传正文 PDF（可选，上传后优先使用）</span>
          <input type="file" accept=".pdf,application/pdf" @change="onBodyPdfChange" />
        </label>
        <p class="meta">已选文件：{{ bodyPdfFileName || '无（使用实时渲染结果）' }}</p>
        <p class="meta">状态：{{ bodyStatus }}</p>

        <div class="actions merge-actions">
          <button type="button" class="text-btn" @click="clearBodyPdf">清空正文 PDF</button>
          <button type="button" class="chip active" :disabled="isMerging" @click="mergeCoverAndBody">
            {{ isMerging ? '正在合并...' : '一键导出完整 PDF' }}
          </button>
        </div>

        <p class="meta" v-if="mergeStatus">{{ mergeStatus }}</p>
      </article>
    </section>

    <div v-if="contextMenu.visible && mode === 'form'" class="context-menu" :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }" @click.stop>
      <button type="button" @click="insertFromMenu('paragraph')">插入段落</button>
      <button type="button" @click="insertFromMenu('heading', { level: 1, text: '一级标题' })">插入一级标题</button>
      <button type="button" @click="insertFromMenu('heading', { level: 2, text: '二级标题' })">插入二级标题</button>
      <button type="button" @click="insertFromMenu('heading', { level: 3, text: '三级标题' })">插入三级标题</button>
      <button type="button" @click="insertFromMenu('image')">插入图片</button>
      <button type="button" @click="insertFromMenu('equation')">插入公式</button>
      <button type="button" @click="insertFromMenu('table')">插入三线表</button>
    </div>
  </main>
</template>
