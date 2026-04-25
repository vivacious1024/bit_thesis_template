import {
  COMMON_CHAR_FIX_REPLACEMENTS,
  isKnownProblemGlyph,
  isSuspiciousForTemplate,
  isTemplateSafeChar,
  normalizeRichTextInput,
} from '../utils/text-normalization.js'

export function useTextNormalization({
  mode,
  typstSource,
  formDoc,
  parseNotice,
}) {
  function normalizePastedTextForTypst(input) {
    return normalizeRichTextInput(input)
  }

  function onEditorPlainTextPaste(event) {
    if (event.defaultPrevented) return

    const target = event.target
    const isTextArea = target instanceof HTMLTextAreaElement
    const isTextInput =
      target instanceof HTMLInputElement &&
      ['text', 'search', 'url', 'tel', 'email', 'password', 'number'].includes(String(target.type || 'text'))
    if (!isTextArea && !isTextInput) return
    if (target.readOnly || target.disabled) return

    const plain = event.clipboardData?.getData('text/plain')
    if (plain == null) return

    event.preventDefault()
    const normalized = normalizePastedTextForTypst(plain)

    const rawValue = String(target.value || '')
    const start = typeof target.selectionStart === 'number' ? target.selectionStart : rawValue.length
    const end = typeof target.selectionEnd === 'number' ? target.selectionEnd : start

    if (typeof target.setRangeText === 'function') {
      target.setRangeText(normalized, start, end, 'end')
    } else {
      target.value = rawValue.slice(0, start) + normalized + rawValue.slice(end)
    }

    target.dispatchEvent(new Event('input', { bubbles: true }))
  }

  function collectTextsForNormalization() {
    if (mode.value === 'typst') {
      return [{ label: 'Typst 源码', value: String(typstSource.value || '') }]
    }

    const rows = []
    for (const block of formDoc.blocks) {
      if (block.type === 'text') rows.push({ label: '文本', block, key: 'text', value: String(block.text || '') })
      if (block.type === 'typst') rows.push({ label: 'Typst 卡片', block, key: 'code', value: String(block.code || '') })
      if (block.type === 'heading') rows.push({ label: '标题', block, key: 'text', value: String(block.text || '') })
      if (block.type === 'equation') rows.push({ label: '公式', block, key: 'text', value: String(block.text || '') })
      if (block.type === 'image') rows.push({ label: '图片说明', block, key: 'caption', value: String(block.caption || '') })
      if (block.type === 'table') {
        rows.push({ label: '表题', block, key: 'caption', value: String(block.caption || '') })
        rows.push({ label: '表头', block, key: 'headersText', value: String(block.headersText || '') })
        rows.push({ label: '表格内容', block, key: 'rowsText', value: String(block.rowsText || '') })
      }
    }
    return rows
  }

  function buildTextNormalizationSummary() {
    const rows = collectTextsForNormalization()
    let count = 0
    const samples = []
    for (const row of rows) {
      const text = String(row.value || '')
      for (const ch of text) {
        if (!isSuspiciousForTemplate(ch) && !isKnownProblemGlyph(ch)) continue
        count += 1
        if (samples.length < 5) {
          const cp = ch.codePointAt(0) || 0
          samples.push(`${row.label}: U+${cp.toString(16).toUpperCase().padStart(4, '0')}`)
        }
      }
    }
    return { count, samples }
  }

  function applyTextNormalizationFix() {
    if (mode.value === 'typst') {
      typstSource.value = normalizeRichTextInput(typstSource.value)
      parseNotice.value = '已对 Typst 源码执行文本规范化。'
      return
    }

    for (const row of collectTextsForNormalization()) {
      row.block[row.key] = normalizeRichTextInput(row.value)
    }
    parseNotice.value = '已完成文本规范化，异常字符已按兼容规则修复。'
  }

  function enforceStrictFontUniformText(input) {
    const normalized = normalizeRichTextInput(input)
    const chars = []
    for (const ch of normalized) {
      const cp = ch.codePointAt(0) || 0
      if ((cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0xe0100 && cp <= 0xe01ef)) continue
      chars.push(isTemplateSafeChar(ch) ? ch : '□')
    }
    return chars.join('')
  }

  function applyStrictFontUniformFix() {
    if (mode.value === 'typst') {
      typstSource.value = enforceStrictFontUniformText(typstSource.value)
      parseNotice.value = '已执行强制统一字体处理，异常字符已替换为 □。'
      return
    }

    for (const row of collectTextsForNormalization()) {
      row.block[row.key] = enforceStrictFontUniformText(row.value)
    }
    parseNotice.value = '已执行强制统一字体处理，异常字符已替换为 □。'
  }

  return {
    normalizePastedTextForTypst,
    onEditorPlainTextPaste,
    collectTextsForNormalization,
    buildTextNormalizationSummary,
    applyTextNormalizationFix,
    enforceStrictFontUniformText,
    applyStrictFontUniformFix,
    COMMON_CHAR_FIX_REPLACEMENTS,
    isKnownProblemGlyph,
    normalizeRichTextInput,
    isSuspiciousForTemplate,
    isTemplateSafeChar,
  }
}
