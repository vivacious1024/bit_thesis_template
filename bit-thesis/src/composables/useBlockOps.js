export function useBlockOps({
  formDoc,
  mode,
  typstSource,
  parseNotice,
  assetLibrary,
  getFormBuildResult,
}) {
  function buildFormTypstResult() {
    const lines = ['// 由 bit-thesis 编辑器自动生成', '']
    const spans = []

    for (const block of formDoc.blocks) {
      const startLine = lines.length

      if (block.type === 'text') {
        const textValue = String(block.text || '').trim()
        if (textValue) lines.push(textValue, '')
      } else if (block.type === 'typst') {
        const code = String(block.code || '').trim()
        if (code) lines.push(code, '')
      } else if (block.type === 'heading') {
        const title = String(block.text || '').trim() || '未命名标题'
        const level = Math.max(1, Math.min(4, Number(block.level) || 1))
        lines.push(`${'='.repeat(level)} ${title}`, '')
      } else if (block.type === 'image') {
        lines.push(...buildImageTypst(block), '')
      } else if (block.type === 'equation') {
        const equation = String(block.text || '').trim() || 'a^2 + b^2 = c^2'
        lines.push('$', equation, '$', '')
      } else if (block.type === 'table') {
        lines.push(...buildThreeLineTableTypst(block), '')
      }

      spans.push({ id: block.id, startLine, endLine: Math.max(startLine, lines.length - 1) })
    }

    const text = `${lines.join('\n').trim()}\n`
    return { text, spans, totalLines: Math.max(1, text.split(/\r?\n/).length) }
  }

  function blockToTypstSnippet(block) {
    if (!block) return ''
    if (block.type === 'typst') return String(block.code || '').trim()
    if (block.type === 'text') return String(block.text || '').trim()
    if (block.type === 'heading') {
      const title = String(block.text || '').trim() || '未命名标题'
      const level = Math.max(1, Math.min(4, Number(block.level) || 1))
      return `${'='.repeat(level)} ${title}`
    }
    if (block.type === 'image') return buildImageTypst(block).join('\n')
    if (block.type === 'equation') {
      const equation = String(block.text || '').trim() || 'a^2 + b^2 = c^2'
      return ['$', equation, '$'].join('\n')
    }
    if (block.type === 'table') return buildThreeLineTableTypst(block).join('\n')
    return ''
  }

  function convertBlockToTypst(index) {
    const block = formDoc.blocks[index]
    if (!block) return
    if (block.type === 'typst') {
      parseNotice.value = '当前卡片已经是 Typst 卡片。'
      return
    }
    const snippet = blockToTypstSnippet(block)
    formDoc.blocks.splice(index, 1, {
      id: crypto.randomUUID(),
      type: 'typst',
      code: snippet || '// 空 Typst 卡片',
      expanded: true,
    })
    parseNotice.value = `已将“${blockTypeText(block.type)}”转换为 Typst 卡片。`
  }

  function parseTypstSnippetToStructuredBlocks(code) {
    const source = String(code || '').trim()
    if (!source) return [{ id: crypto.randomUUID(), type: 'text', text: '', expanded: true }]
    const parsed = parseTypstToFormBlocks(source)
    if (!Array.isArray(parsed) || !parsed.length) {
      return [{ id: crypto.randomUUID(), type: 'text', text: source, expanded: true }]
    }
    return parsed
  }

  function convertTypstBlockToStructured(index) {
    const block = formDoc.blocks[index]
    if (!block || block.type !== 'typst') return
    const parsedBlocks = parseTypstSnippetToStructuredBlocks(block.code)
    formDoc.blocks.splice(index, 1, ...parsedBlocks)
    parseNotice.value = '已将 Typst 卡片解析为结构化卡片。'
  }

  function buildThreeLineTableTypst(block) {
    const headers = splitRow(block.headersText || '列1|列2|列3')
    const bodyRows = splitRows(block.rowsText || '数据1|数据2|数据3\n数据4|数据5|数据6')
    const columnCount = Math.max(
      1,
      Number(block.columns) || headers.length || Math.max(...bodyRows.map((row) => row.length), 1),
    )
    const normalizedHeaders = normalizeRow(headers, columnCount, '列')
    const normalizedRows = bodyRows.length
      ? bodyRows.map((row, rowIndex) => normalizeRow(row, columnCount, `数据${rowIndex + 1}-`))
      : [Array.from({ length: columnCount }, (_, i) => `数据${i + 1}`)]

    const caption = normalizeManualCaptionText(String(block?.caption || '').trim()) || '三线表示例'
    const autoFigure = blockUseAutoFigure(block, true)
    const captionPosition = normalizeCaptionPosition(block?.captionPosition, 'top')

    if (!autoFigure) {
      const tableCoreLines = buildThreeLineTableCoreLines(columnCount, normalizedHeaders, normalizedRows)
      return [
        '#{',
        `  set figure.caption(position: ${captionPosition})`,
        '  set figure(numbering: none, supplement: none)',
        '  figure(',
        ...indentTypstLines(tableCoreLines, 4),
        `    caption: [${escapeContent(caption)}],`,
        '    kind: table,',
        '  )',
        '}',
      ]
    }

    return [
      '#{',
      `  set figure.caption(position: ${captionPosition})`,
      '  bit_three_line_table(',
      `    columns: ${columnCount},`,
      `    header: (${normalizedHeaders.map((cell) => `[${escapeContent(cell)}]`).join(', ')}),`,
      `    body: (${normalizedRows.flat().map((cell) => `[${escapeContent(cell)}]`).join(', ')}),`,
      `    caption: [${escapeContent(caption)}],`,
      '  )',
      '}',
    ]
  }

  function buildThreeLineTableCoreLines(columnCount, headers, rows) {
    const totalRows = rows.length + 1
    const lines = [
      'table(',
      `  columns: ${columnCount},`,
      '  align: center + horizon,',
      '  stroke: none,',
      '  table.hline(y: 0, stroke: 1.5pt),',
      '  table.hline(y: 1, stroke: 0.75pt),',
      `  table.hline(y: ${totalRows}, stroke: 1.5pt),`,
      `  table.header(${headers.map((cell) => `[${escapeContent(cell)}]`).join(', ')}),`,
    ]
    for (const row of rows) {
      lines.push(`  ${row.map((cell) => `[${escapeContent(cell)}]`).join(', ')},`)
    }
    lines.push(')')
    return lines
  }

  function buildImageTypst(block) {
    const imagePath = resolveImagePathForUse(block?.path)
    const caption = normalizeManualCaptionText(String(block?.caption || '').trim()) || '图片说明'
    if (!imagePath) return [`// 图片未设置路径：${caption}`]

    const width = String(block?.width || '').trim()
    const widthExpr = width ? `, width: ${width}` : ''
    const autoFigure = blockUseAutoFigure(block, true)
    const captionPosition = normalizeCaptionPosition(block?.captionPosition, 'bottom')

    if (!autoFigure) {
      return [
        '#{',
        `  set figure.caption(position: ${captionPosition})`,
        '  set figure(numbering: none, supplement: none)',
        `  figure(image("${escapeString(imagePath)}"${widthExpr}), caption: [${escapeContent(caption)}])`,
        '}',
      ]
    }

    return [
      '#{',
      `  set figure.caption(position: ${captionPosition})`,
      `  figure(image("${escapeString(imagePath)}"${widthExpr}), caption: [${escapeContent(caption)}])`,
      '}',
    ]
  }

  function blockUseAutoFigure(block, fallback = true) {
    if (!block || block.autoFigure === undefined || block.autoFigure === null) return !!fallback
    return !!block.autoFigure
  }

  function normalizeCaptionPosition(position, fallback = 'bottom') {
    const raw = String(position || '').toLowerCase()
    if (raw === 'top' || raw === 'bottom') return raw
    return fallback
  }

  function normalizeManualCaptionText(input) {
    let value = String(input || '').trim()
    if (!value) return ''
    if ((value.startsWith('[') && value.endsWith(']')) || (value.startsWith('【') && value.endsWith('】'))) {
      value = value.slice(1, -1).trim()
    }
    return value
  }

  function indentTypstLines(lines, spaces = 2) {
    const pad = ' '.repeat(Math.max(0, spaces))
    return (Array.isArray(lines) ? lines : []).map((line) => `${pad}${line}`)
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

  function normalizeInlineText(text) {
    return String(text || '').trim()
  }

  function normalizeImageInputForForm(pathValue) {
    const normalized = String(pathValue || '').trim().replaceAll('\\', '/')
    if (normalized.startsWith('assets-cache/')) return normalized.slice('assets-cache/'.length)
    return normalized
  }

  function parseTypstToFormBlocks(source) {
    const lines = String(source || '').replace(/\r\n/g, '\n').split('\n')
    const blocks = []
    let textBuffer = []
    let i = 0

    const flushText = () => {
      const text = textBuffer.join('\n').trim()
      textBuffer = []
      if (!text) return
      blocks.push({ id: crypto.randomUUID(), type: 'text', text, expanded: true })
    }

    while (i < lines.length) {
      const rawLine = lines[i]
      const line = rawLine.trim()

      if (line.startsWith('//')) {
        flushText()
        i += 1
        continue
      }

      const headingMatch = line.match(/^(=+)\s+(.+)$/)
      if (headingMatch) {
        flushText()
        blocks.push({
          id: crypto.randomUUID(),
          type: 'heading',
          level: Math.max(1, Math.min(4, headingMatch[1].length)),
          text: normalizeInlineText(headingMatch[2]),
        })
        i += 1
        continue
      }

      if (line === '$') {
        flushText()
        const equationLines = []
        i += 1
        while (i < lines.length && lines[i].trim() !== '$') {
          equationLines.push(lines[i])
          i += 1
        }
        if (i < lines.length && lines[i].trim() === '$') i += 1
        blocks.push({
          id: crypto.randomUUID(),
          type: 'equation',
          text: equationLines.join('\n').trim(),
        })
        continue
      }

      const singleLineEquation = line.match(/^\$(.+)\$$/)
      if (singleLineEquation) {
        flushText()
        blocks.push({
          id: crypto.randomUUID(),
          type: 'equation',
          text: normalizeInlineText(singleLineEquation[1]),
        })
        i += 1
        continue
      }

      if (line === '#{') {
        const figureLines = []
        let depth = 0
        let endIndex = i
        for (; endIndex < lines.length; endIndex += 1) {
          const segment = lines[endIndex]
          const trimmedSegment = segment.trim()
          figureLines.push(segment)
          if (trimmedSegment === '#{') depth += 1
          else if (trimmedSegment === '}') depth -= 1
          if (depth === 0) break
        }

        if (depth === 0) {
          const parsedFigureBlock = parseGeneratedFigureBlock(figureLines)
          if (parsedFigureBlock) {
            flushText()
            blocks.push(parsedFigureBlock)
            i = endIndex + 1
            continue
          }
        }
      }

      const imageFigureMatch = line.match(/^#figure\(image\("([^"]+)"(?:,\s*width:\s*([^)]+))?\),\s*caption:\s*\[([\s\S]*)\]\)$/)
      if (imageFigureMatch) {
        flushText()
        blocks.push({
          id: crypto.randomUUID(),
          type: 'image',
          path: normalizeImageInputForForm(imageFigureMatch[1]),
          width: normalizeInlineText(imageFigureMatch[2] || '100%'),
          caption: normalizeInlineText(imageFigureMatch[3] || ''),
          autoFigure: true,
          captionPosition: 'bottom',
        })
        i += 1
        continue
      }

      textBuffer.push(rawLine)
      i += 1
    }

    flushText()
    return blocks.length ? blocks : [{ id: crypto.randomUUID(), type: 'text', text: '（空文档）', expanded: true }]
  }

  function parseGeneratedFigureBlock(lines) {
    const content = Array.isArray(lines) ? lines.join('\n') : String(lines || '')
    const autoFigure = !/set figure\(numbering:\s*none,\s*supplement:\s*none\)/.test(content)
    const captionPosition = normalizeCaptionPosition(
      content.match(/set figure\.caption\(position:\s*(top|bottom)\)/)?.[1],
      'bottom',
    )

    const imageMatch = content.match(
      /figure\(image\("([^"]+)"(?:,\s*width:\s*([^)]+?))?\),\s*caption:\s*\[([\s\S]*?)\]\)/,
    )
    if (imageMatch) {
      return {
        id: crypto.randomUUID(),
        type: 'image',
        path: normalizeImageInputForForm(imageMatch[1]),
        width: normalizeInlineText(imageMatch[2] || '100%'),
        caption: normalizeInlineText(imageMatch[3] || ''),
        autoFigure,
        captionPosition,
      }
    }

    if (content.includes('bit_three_line_table(')) {
      const columns = Number(content.match(/columns:\s*(\d+)/)?.[1] || 0) || 3
      const headerTuple = content.match(/header:\s*\(([\s\S]*?)\)\s*,\s*body:/)?.[1] || ''
      const bodyTuple = content.match(/body:\s*\(([\s\S]*?)\)\s*,\s*caption:/)?.[1] || ''
      const caption = normalizeInlineText(content.match(/caption:\s*\[([\s\S]*?)\]/)?.[1] || '')
      const headers = parseBracketTupleCells(headerTuple)
      const bodyCells = parseBracketTupleCells(bodyTuple)
      const rows = []
      for (let index = 0; index < bodyCells.length; index += columns) {
        rows.push(bodyCells.slice(index, index + columns))
      }
      return {
        id: crypto.randomUUID(),
        type: 'table',
        caption,
        columns,
        headersText: normalizeRowsText([headers]),
        rowsText: normalizeRowsText(rows),
        autoFigure,
        captionPosition: normalizeCaptionPosition(captionPosition, 'top'),
      }
    }

    if (content.includes('figure(') && content.includes('table(')) {
      const columns = Number(content.match(/columns:\s*(\d+)/)?.[1] || 0) || 3
      const headerTuple = content.match(/table\.header\(([\s\S]*?)\)\s*,/)?.[1] || ''
      const caption = normalizeInlineText(content.match(/caption:\s*\[([\s\S]*?)\]\s*,\s*kind:\s*table/)?.[1] || '')
      const headers = parseBracketTupleCells(headerTuple)
      const rowMatches = [...content.matchAll(/^\s{2,}((?:\[[^\]]*\]\s*,\s*)+\[[^\]]*\])\s*,\s*$/gm)]
      const rows = rowMatches.map((match) => parseBracketTupleCells(match[1]))
      return {
        id: crypto.randomUUID(),
        type: 'table',
        caption,
        columns,
        headersText: normalizeRowsText([headers]),
        rowsText: normalizeRowsText(rows),
        autoFigure,
        captionPosition: normalizeCaptionPosition(captionPosition, 'top'),
      }
    }

    return null
  }

  function parseBracketTupleCells(source) {
    const matches = [...String(source || '').matchAll(/\[((?:\\.|[^\]])*)\]/g)]
    return matches.map((match) =>
      String(match[1] || '')
        .replaceAll('\\[', '[')
        .replaceAll('\\]', ']')
        .trim(),
    )
  }

  function normalizeRowsText(rows) {
    return (Array.isArray(rows) ? rows : [])
      .filter((row) => Array.isArray(row) && row.length > 0)
      .map((row) => row.map((cell) => String(cell || '').trim()).join('|'))
      .join('\n')
  }

  function switchMode(nextMode) {
    if (nextMode === mode.value) return
    if (nextMode === 'typst') {
      typstSource.value = getFormBuildResult().text
      parseNotice.value = '已将填空内容转换为 Typst。'
      mode.value = 'typst'
      return
    }
    const parsedBlocks = parseTypstToFormBlocks(typstSource.value)
    formDoc.blocks.splice(0, formDoc.blocks.length, ...parsedBlocks)
    parseNotice.value = '已将 Typst 内容转换为填空块。'
    mode.value = 'form'
  }

  function addBlock(afterIndex, type, initial = {}) {
    const block = {
      id: crypto.randomUUID(),
      type,
      ...defaultBlockPayload(type),
      ...initial,
    }
    const index = Math.max(-1, Math.min(afterIndex, formDoc.blocks.length - 1))
    formDoc.blocks.splice(index + 1, 0, block)
    return block
  }

  function defaultBlockPayload(type) {
    if (type === 'text') return { text: '', expanded: true }
    if (type === 'typst') return { code: '', expanded: true }
    if (type === 'heading') return { level: 2, text: '新标题' }
    if (type === 'image') return { path: '', caption: '', width: '100%', autoFigure: true, captionPosition: 'bottom' }
    if (type === 'equation') return { text: '' }
    if (type === 'table') {
      return {
        caption: '三线表示例',
        columns: 3,
        headersText: '列1|列2|列3',
        rowsText: '数据1|数据2|数据3\n数据4|数据5|数据6',
        autoFigure: true,
        captionPosition: 'top',
      }
    }
    return {}
  }

  function removeBlock(index) {
    if (formDoc.blocks.length > 1) formDoc.blocks.splice(index, 1)
  }

  function blockTypeText(type) {
    return (
      {
        text: '文本',
        heading: '标题',
        image: '图片',
        equation: '公式',
        table: '三线表',
        typst: 'Typst',
      }[type] || type
    )
  }

  function resolveImagePathForUse(inputPath) {
    const raw = String(inputPath || '').trim()
    if (!raw) return ''

    const normalized = raw.replaceAll('\\', '/')
    if (
      normalized.startsWith('http://') ||
      normalized.startsWith('https://') ||
      normalized.startsWith('data:') ||
      normalized.startsWith('/')
    ) return normalized
    if (normalized.startsWith('assets-cache/')) return normalized
    if (normalized.includes('/')) return normalized

    const exact = assetLibrary.value.find((item) => String(item.name || '').toLowerCase() === normalized.toLowerCase())
    if (exact?.path) return exact.path
    return 'assets-cache/' + normalized
  }

  function imagePreviewUrl(imagePath) {
    const next = resolveImagePathForUse(imagePath)
    if (!next) return ''
    if (next.startsWith('assets-cache/')) return `/api/${next}`
    return next
  }

  return {
    buildFormTypstResult,
    blockToTypstSnippet,
    convertBlockToTypst,
    parseTypstSnippetToStructuredBlocks,
    convertTypstBlockToStructured,
    buildThreeLineTableTypst,
    buildImageTypst,
    blockUseAutoFigure,
    normalizeCaptionPosition,
    parseTypstToFormBlocks,
    switchMode,
    addBlock,
    defaultBlockPayload,
    removeBlock,
    blockTypeText,
    resolveImagePathForUse,
    imagePreviewUrl,
  }
}
