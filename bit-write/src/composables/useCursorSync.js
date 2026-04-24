import { ref } from 'vue'

export function useCursorSync({
  previewContainerRef,
  previewSingleCanvasRef,
  previewPageCount,
  previewLocationPage,
  previewPageHeight,
  previewTextAnchors,
  previewPageLayouts,
  currentCursorSentence,
  lastCursorRatio,
  isSyncingFromPreviewClick,
  mode,
  formBuildResult,
  blockRefMap,
  typstEditorRef,
  textSelectionStateByBlockId,
  typstSelectionState,
}) {
  const cursorSyncTimer = ref(null)

  function setCursorRatio(ratio) {
    const next = Math.max(0, Math.min(1, Number(ratio) || 0))
    lastCursorRatio.value = next
    if (isSyncingFromPreviewClick.value) return
    if (cursorSyncTimer.value) clearTimeout(cursorSyncTimer.value)
    cursorSyncTimer.value = setTimeout(() => {
      void scrollPreviewToRatio(next)
    }, 120)
  }

  function setCursorSentenceByValue(value, caretPos) {
    const sentence = extractSentenceAroundCaret(value, caretPos)
    currentCursorSentence.value = sentence
  }

  function normalizeLocatorText(text) {
    return String(text || '')
      .normalize('NFKC')
      .replace(/[^\p{L}\p{N}\u4E00-\u9FFF]+/gu, '')
      .toLowerCase()
  }

  function extractSentenceAroundCaret(value, caretPos) {
    const raw = String(value || '')
    if (!raw) return ''
    const pos = Math.max(0, Math.min(raw.length, Number(caretPos) || 0))
    const left = raw.slice(0, pos)
    const right = raw.slice(pos)
    const delimiters = /[。！？!?；;\n]/g

    let start = 0
    for (const m of left.matchAll(delimiters)) start = (m.index || 0) + 1

    let end = raw.length
    const rightDelimiters = /[。！？!?；;\n]/
    const nextMark = right.search(rightDelimiters)
    if (nextMark >= 0) end = pos + nextMark

    let sentence = raw.slice(start, end).trim()
    if (sentence.length > 100) sentence = sentence.slice(0, 100)
    if (sentence.length < 6) {
      const padStart = Math.max(0, pos - 32)
      const padEnd = Math.min(raw.length, pos + 32)
      sentence = raw.slice(padStart, padEnd).trim()
    }
    return sentence
  }

  function locateAnchorBySentence(querySentence) {
    const query = normalizeLocatorText(querySentence)
    if (!query || query.length < 2) return null
    const anchors = previewTextAnchors.value
    if (!anchors.length) return null

    let best = null
    let bestScore = -1
    for (const anchor of anchors) {
      const text = anchor.normText
      if (!text || text.length < 2) continue
      let score = 0
      if (text.includes(query)) score = 1200 + query.length
      else if (query.includes(text)) score = 800 + text.length
      else {
        let overlap = 0
        const set = new Set(text.split(''))
        for (const ch of query) if (set.has(ch)) overlap += 1
        score = overlap
      }
      if (score > bestScore) {
        bestScore = score
        best = anchor
      }
    }
    if (bestScore < 3) return null
    return best
  }

  async function scrollPreviewToRatio(ratio) {
    const container = previewContainerRef.value
    if (!container || previewPageCount.value <= 0) return

    const bounded = Math.max(0, Math.min(1, Number(ratio) || 0))
    const canvas = previewSingleCanvasRef.value
    if (!canvas) return
    const renderTotal = Math.max(1, canvas.height || 1)
    const cssTotal = Math.max(1, canvas.clientHeight || previewPageHeight.value || 1)
    const targetRenderY = bounded * renderTotal
    let finalRenderY = targetRenderY

    const matched = locateAnchorBySentence(currentCursorSentence.value)
    if (matched) finalRenderY = matched.yRender

    const targetCssY = finalRenderY * (cssTotal / renderTotal)
    const targetTop = targetCssY - container.clientHeight / 2
    container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' })

    const layouts = previewPageLayouts.value
    if (!layouts.length) return
    const hit = layouts.find((item) => finalRenderY >= item.renderTop && finalRenderY <= item.renderTop + item.renderHeight)
    if (hit) previewLocationPage.value = hit.page
  }

  function onPreviewPageClick(event) {
    const container = previewContainerRef.value
    if (!container) return
    const canvas = previewSingleCanvasRef.value
    if (!canvas) return
    const rect = container.getBoundingClientRect()
    const yInContainer = Math.max(0, Math.min(rect.height, event.clientY - rect.top))
    const yOnStrip = container.scrollTop + yInContainer
    const cssTotal = Math.max(1, canvas.clientHeight || previewPageHeight.value || 1)
    const renderTotal = Math.max(1, canvas.height || 1)
    const yRender = yOnStrip * (renderTotal / cssTotal)
    const ratio = Math.max(0, Math.min(1, yRender / renderTotal))

    let pageNumber = previewLocationPage.value
    for (const item of previewPageLayouts.value) {
      if (yRender >= item.renderTop && yRender <= item.renderTop + item.renderHeight) {
        pageNumber = item.page
        break
      }
    }

    isSyncingFromPreviewClick.value = true
    setCursorRatio(ratio)
    previewLocationPage.value = pageNumber

    if (mode.value === 'form') focusFormBlockByRatio(ratio)
    else focusTypstByRatio(ratio)

    setTimeout(() => {
      isSyncingFromPreviewClick.value = false
    }, 120)
  }

  function onPreviewScroll() {
    const container = previewContainerRef.value
    if (!container || previewPageCount.value <= 0) return
    const canvas = previewSingleCanvasRef.value
    if (!canvas) return
    const centerYCss = container.scrollTop + container.clientHeight / 2
    const cssTotal = Math.max(1, canvas.clientHeight || previewPageHeight.value || 1)
    const renderTotal = Math.max(1, canvas.height || 1)
    const centerY = centerYCss * (renderTotal / cssTotal)
    const layouts = previewPageLayouts.value
    if (!layouts.length) return

    let bestPage = previewLocationPage.value
    let bestDistance = Number.POSITIVE_INFINITY
    for (const item of layouts) {
      const mid = item.renderTop + item.renderHeight / 2
      const distance = Math.abs(mid - centerY)
      if (distance < bestDistance) {
        bestDistance = distance
        bestPage = item.page
      }
    }
    previewLocationPage.value = Math.max(1, Math.min(previewPageCount.value, bestPage))
  }

  function focusFormBlockByRatio(ratio) {
    const spans = formBuildResult.value.spans
    const totalLines = Math.max(1, formBuildResult.value.totalLines)
    const targetLine = ratio * totalLines

    let target = spans.find((span) => targetLine >= span.startLine && targetLine <= span.endLine)
    if (!target && spans.length) {
      target = spans
        .slice()
        .sort(
          (a, b) =>
            Math.abs((a.startLine + a.endLine) / 2 - targetLine) -
            Math.abs((b.startLine + b.endLine) / 2 - targetLine),
        )[0]
    }
    if (!target) return

    const blockElement = blockRefMap.get(target.id)
    if (!blockElement) return

    blockElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const focusTarget = blockElement.querySelector('textarea,input,select')
    if (focusTarget) focusTarget.focus({ preventScroll: true })
  }

  function focusTypstByRatio(ratio) {
    const el = typstEditorRef.value
    if (!el) return

    const text = String(el.value || '')
    const pos = Math.max(0, Math.min(text.length, Math.floor(text.length * ratio)))
    el.focus({ preventScroll: true })
    el.setSelectionRange(pos, pos)
    el.scrollTop = Math.max(0, el.scrollHeight * ratio - el.clientHeight / 2)
  }

  function onTypstCursorActivity(event) {
    const el = event?.target
    if (!el) return
    const total = Math.max(1, String(el.value || '').length)
    const caret = Math.max(0, Number(el.selectionStart) || 0)
    const end = Math.max(caret, Number(el.selectionEnd) || caret)
    typstSelectionState.value = { start: caret, end }
    setCursorSentenceByValue(el.value, caret)
    setCursorRatio(caret / total)
  }

  function onFormCursorActivity(event, block) {
    const spans = formBuildResult.value.spans
    const totalLines = Math.max(1, formBuildResult.value.totalLines)
    const span = spans.find((item) => item.id === block.id)
    if (!span) return

    const el = event?.target
    if (el && typeof el.selectionStart === 'number') {
      const total = Math.max(1, String(el.value || '').length)
      const caret = Math.max(0, Number(el.selectionStart) || 0)
      if (block?.id && block.type === 'text') {
        const start = Math.max(0, Number(el.selectionStart) || 0)
        const end = Math.max(start, Number(el.selectionEnd) || start)
        textSelectionStateByBlockId[block.id] = {
          caret: start,
          start,
          end,
          selectedText: end > start ? String(el.value || '').slice(start, end) : '',
        }
      }

      if (block?.type === 'heading') currentCursorSentence.value = String(block.text || el.value || '').trim()
      else setCursorSentenceByValue(el.value, caret)

      const line = span.startLine + (span.endLine - span.startLine) * (caret / total)
      setCursorRatio(line / totalLines)
      return
    }

    const midLine = (span.startLine + span.endLine) / 2
    if (block?.type === 'heading') currentCursorSentence.value = String(block.text || '').trim()
    setCursorRatio(midLine / totalLines)
  }

  function cleanupCursorSync() {
    if (cursorSyncTimer.value) clearTimeout(cursorSyncTimer.value)
  }

  return {
    cursorSyncTimer,
    setCursorRatio,
    setCursorSentenceByValue,
    normalizeLocatorText,
    extractSentenceAroundCaret,
    locateAnchorBySentence,
    scrollPreviewToRatio,
    onPreviewPageClick,
    onPreviewScroll,
    focusFormBlockByRatio,
    focusTypstByRatio,
    onTypstCursorActivity,
    onFormCursorActivity,
    cleanupCursorSync,
  }
}
