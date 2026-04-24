import { nextTick } from 'vue'

export function useTypstInsert({
  mode,
  typstSource,
  contextMenu,
  typstSelectionState,
  typstEditorRef,
  parseNotice,
  closeContextMenu,
  buildImageTypst,
  buildThreeLineTableTypst,
}) {
  function buildTypstSnippetByType(type, opts = {}) {
    if (type === 'text') return String(opts.text || '新文本模块').trim() || '新文本模块'
    if (type === 'heading') {
      const level = Math.max(1, Math.min(3, Number(opts.level) || 1))
      const text = String(opts.text || '新标题').trim() || '新标题'
      return `${'='.repeat(level)} ${text}`
    }
    if (type === 'image') {
      const block = {
        type: 'image',
        path: String(opts.path || ''),
        caption: String(opts.caption || '图片说明'),
        width: String(opts.width || '100%'),
        autoFigure: opts.autoFigure !== false,
        captionPosition: String(opts.captionPosition || 'bottom'),
      }
      return buildImageTypst(block).join('\n')
    }
    if (type === 'equation') return ['$', String(opts.text || 'a^2 + b^2 = c^2'), '$'].join('\n')
    if (type === 'table') {
      const block = {
        type: 'table',
        caption: String(opts.caption || '三线表示例'),
        columns: Number(opts.columns) || 3,
        headersText: String(opts.headersText || '列1|列2|列3'),
        rowsText: String(opts.rowsText || '数据1|数据2|数据3\n数据4|数据5|数据6'),
        autoFigure: opts.autoFigure !== false,
        captionPosition: String(opts.captionPosition || 'top'),
      }
      return buildThreeLineTableTypst(block).join('\n')
    }
    return ''
  }

  function normalizeSnippetForTypstInsert(snippet, source, start, end) {
    const raw = String(snippet || '').trim()
    if (!raw) return ''
    const beforeChar = start > 0 ? source[start - 1] : ''
    const afterChar = end < source.length ? source[end] : ''
    const prefix = beforeChar && beforeChar !== '\n' ? '\n' : ''
    const suffix = afterChar && afterChar !== '\n' ? '\n' : '\n'
    return `${prefix}${raw}${suffix}`
  }

  function insertTypstSnippet(snippet, atCaret = true) {
    if (mode.value !== 'typst') return
    const source = String(typstSource.value || '')
    let start = source.length
    let end = source.length
    if (atCaret && contextMenu.targetTypstStart >= 0) {
      start = Math.max(0, Math.min(source.length, Number(contextMenu.targetTypstStart) || 0))
      end = Math.max(start, Math.min(source.length, Number(contextMenu.targetTypstEnd) || start))
    }
    const normalized = normalizeSnippetForTypstInsert(snippet, source, start, end)
    typstSource.value = source.slice(0, start) + normalized + source.slice(end)
    const caret = start + normalized.length
    typstSelectionState.value = { start: caret, end: caret }
    parseNotice.value = '已按 Typst 语法插入内容。'
    void nextTick(() => {
      const el = typstEditorRef.value
      if (!el) return
      el.focus({ preventScroll: true })
      el.setSelectionRange(caret, caret)
    })
    closeContextMenu()
  }

  function insertTypstFromMenu(type, opts = {}, atCaret = true) {
    const snippet = buildTypstSnippetByType(type, opts)
    insertTypstSnippet(snippet, atCaret)
  }

  function insertTypstImageFromAsset(asset, atCaret = true) {
    const fileName = asset?.name || String(asset?.path || '').split('/').pop() || ''
    const snippet = buildTypstSnippetByType('image', {
      path: fileName,
      caption: fileName || '图片说明',
      width: '100%',
      autoFigure: true,
      captionPosition: 'bottom',
    })
    insertTypstSnippet(snippet, atCaret)
  }

  return {
    buildTypstSnippetByType,
    normalizeSnippetForTypstInsert,
    insertTypstSnippet,
    insertTypstFromMenu,
    insertTypstImageFromAsset,
  }
}

