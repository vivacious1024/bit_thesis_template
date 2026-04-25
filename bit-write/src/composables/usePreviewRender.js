import { markRaw, nextTick, ref, shallowRef } from 'vue'
import { getDocument } from 'pdfjs-dist'
import { apiFetch } from '../utils/api.js'

export function usePreviewRender({
  generatedTypst,
  thesisTitle,
  previewContainerRef,
  previewSingleCanvasRef,
  previewLocationPage,
  previewScaleMode,
  previewPageHeight,
  previewTextAnchors,
  previewPageLayouts,
  previewPageCount,
  normalizeLocatorText,
  lastCursorRatio,
  scrollPreviewToRatio,
  scheduleStickyOffsetUpdate,
}) {
  const renderedBodyPdfBytes = ref(null)
  const previewStatus = ref('等待首次渲染...')
  const isRenderingPreview = ref(false)

  const previewTimer = ref(null)
  const previewRequestSeq = ref(0)
  const previewResizeTimer = ref(null)
  const previewCanvasRenderSeq = ref(0)
  const activePreviewRenderTask = ref(null)
  const previewPdfDocRef = shallowRef(null)

  function schedulePreviewRender() {
    if (previewTimer.value) clearTimeout(previewTimer.value)
    previewTimer.value = setTimeout(() => {
      void renderBodyPdfPreview()
    }, 500)
  }

  async function renderBodyPdfPreview() {
    const source = generatedTypst.value.trim()
    if (!source) {
      cancelActivePreviewRenderTask()
      renderedBodyPdfBytes.value = null
      previewPdfDocRef.value = null
      previewPageLayouts.value = []
      previewPageHeight.value = 0
      previewPageCount.value = 1
      previewLocationPage.value = 1
      previewStatus.value = '正文内容为空，无法渲染。'
      return
    }

    const requestId = ++previewRequestSeq.value
    isRenderingPreview.value = true
    previewStatus.value = '正在实时渲染正文 PDF...'

    try {
      const response = await apiFetch('/api/body/render-typst', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: source,
          title: thesisTitle.value.trim(),
          author: 'bit-write 用户',
          date: '',
        }),
      })

      if (!response.ok) {
        const message = await response.text()
        throw new Error(message || `HTTP ${response.status}`)
      }

      const bytes = await response.arrayBuffer()
      if (requestId !== previewRequestSeq.value) return

      renderedBodyPdfBytes.value = bytes.slice(0)
      await loadPreviewPdf(bytes)
      await nextTick()
      await scrollPreviewToRatio(lastCursorRatio.value)
      previewStatus.value = '正文 PDF 已实时更新。'
    } catch (error) {
      if (requestId !== previewRequestSeq.value) return
      previewStatus.value = `实时预览失败：${error.message}`
    } finally {
      if (requestId === previewRequestSeq.value) isRenderingPreview.value = false
    }
  }

  async function loadPreviewPdf(bytes) {
    const loadingTask = getDocument({ data: bytes })
    const pdf = await loadingTask.promise
    previewPdfDocRef.value = markRaw(pdf)
    previewPageCount.value = Math.max(1, pdf.numPages)
    previewLocationPage.value = Math.min(previewLocationPage.value, previewPageCount.value)
    await nextTick()
    await renderCurrentPreviewPage(previewLocationPage.value)
  }

  async function renderCurrentPreviewPage(pageNumber = previewLocationPage.value) {
    void pageNumber
    const previewPdfDoc = previewPdfDocRef.value
    if (!previewPdfDoc) return
    const seq = ++previewCanvasRenderSeq.value
    const container = previewContainerRef.value
    const canvas = previewSingleCanvasRef.value
    if (!container || !canvas) return

    cancelActivePreviewRenderTask()
    await nextTick()

    const firstPage = await previewPdfDoc.getPage(1)
    if (seq !== previewCanvasRenderSeq.value) return
    const baseViewport = firstPage.getViewport({ scale: 1 })
    const horizontalPadding = 12
    const verticalPadding = 12
    const availableWidth = Math.max(200, container.clientWidth - horizontalPadding)
    const availableHeight = Math.max(200, container.clientHeight - verticalPadding)
    const widthScale = availableWidth / baseViewport.width
    const pageScale = Math.min(availableWidth / baseViewport.width, availableHeight / baseViewport.height) * 0.985
    const fitScale = Math.max(0.1, previewScaleMode.value === 'page' ? pageScale : widthScale)
    const deviceScale = Math.min(2, Math.max(1, window.devicePixelRatio || 1))
    const renderScale = fitScale * deviceScale

    const pageGapCss = 8
    const pageGapRender = Math.round(pageGapCss * deviceScale)
    const layouts = []
    let maxRenderWidth = 0
    let totalRenderHeight = 0
    let totalCssHeight = 0

    for (let p = 1; p <= previewPageCount.value; p += 1) {
      const page = p === 1 ? firstPage : await previewPdfDoc.getPage(p)
      if (seq !== previewCanvasRenderSeq.value) return
      const v = page.getViewport({ scale: renderScale })
      const cssWidth = v.width / deviceScale
      const cssHeight = v.height / deviceScale

      if (p > 1) {
        totalRenderHeight += pageGapRender
        totalCssHeight += pageGapCss
      }

      layouts.push({
        page: p,
        renderTop: totalRenderHeight,
        renderWidth: Math.ceil(v.width),
        renderHeight: Math.ceil(v.height),
        cssTop: totalCssHeight,
        cssWidth,
        cssHeight,
      })

      maxRenderWidth = Math.max(maxRenderWidth, Math.ceil(v.width))
      totalRenderHeight += Math.ceil(v.height)
      totalCssHeight += cssHeight
    }

    const context = canvas.getContext('2d')
    if (!context) return

    canvas.width = Math.max(1, maxRenderWidth)
    canvas.height = Math.max(1, totalRenderHeight)
    canvas.style.width = `${Math.max(120, Math.floor(maxRenderWidth / deviceScale))}px`
    canvas.style.height = `${Math.max(120, Math.floor(totalCssHeight))}px`

    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    const textAnchors = []

    for (const item of layouts) {
      if (seq !== previewCanvasRenderSeq.value) return
      const page = item.page === 1 ? firstPage : await previewPdfDoc.getPage(item.page)
      const viewport = page.getViewport({ scale: renderScale })

      const pageCanvas = document.createElement('canvas')
      pageCanvas.width = Math.max(1, Math.ceil(viewport.width))
      pageCanvas.height = Math.max(1, Math.ceil(viewport.height))
      const pageCtx = pageCanvas.getContext('2d')
      if (!pageCtx) continue

      const renderTask = page.render({
        canvasContext: pageCtx,
        viewport,
      })
      activePreviewRenderTask.value = renderTask
      try {
        await renderTask.promise
      } catch (error) {
        if (error?.name === 'RenderingCancelledException') return
        throw error
      } finally {
        if (activePreviewRenderTask.value === renderTask) activePreviewRenderTask.value = null
      }

      context.drawImage(pageCanvas, 0, item.renderTop)

      try {
        const textContent = await page.getTextContent()
        for (const t of textContent.items || []) {
          const str = String(t?.str || '').trim()
          if (!str) continue
          const normText = normalizeLocatorText(str)
          if (!normText) continue
          const ty = Number(t?.transform?.[5] || 0)
          const yInPage = Math.max(0, viewport.height - ty)
          textAnchors.push({
            page: item.page,
            yRender: item.renderTop + yInPage,
            normText,
          })
        }
      } catch {
        // 忽略文本锚点提取失败
      }
    }

    previewPageLayouts.value = layouts
    previewTextAnchors.value = textAnchors

    await nextTick()
    const displayedHeight = canvas.clientHeight || canvas.offsetHeight || 0
    if (displayedHeight > 0) previewPageHeight.value = displayedHeight
  }

  function cancelActivePreviewRenderTask() {
    const task = activePreviewRenderTask.value
    if (!task) return
    try {
      task.cancel()
    } catch {
      // ignore
    }
    activePreviewRenderTask.value = null
  }

  function setPreviewScaleMode(modeValue) {
    if (modeValue !== 'width' && modeValue !== 'page') return
    if (previewScaleMode.value === modeValue) return
    previewScaleMode.value = modeValue
    void nextTick(() => {
      void renderCurrentPreviewPage(previewLocationPage.value)
    })
  }

  function onPreviewResize() {
    if (previewResizeTimer.value) clearTimeout(previewResizeTimer.value)
    previewResizeTimer.value = setTimeout(() => {
      scheduleStickyOffsetUpdate()
      void renderCurrentPreviewPage(previewLocationPage.value)
    }, 180)
  }

  function cleanupPreviewRender() {
    if (previewTimer.value) clearTimeout(previewTimer.value)
    if (previewResizeTimer.value) clearTimeout(previewResizeTimer.value)
    cancelActivePreviewRenderTask()
  }

  return {
    renderedBodyPdfBytes,
    previewStatus,
    isRenderingPreview,
    previewTimer,
    previewRequestSeq,
    previewResizeTimer,
    previewCanvasRenderSeq,
    activePreviewRenderTask,
    previewPdfDocRef,
    schedulePreviewRender,
    renderBodyPdfPreview,
    loadPreviewPdf,
    renderCurrentPreviewPage,
    cancelActivePreviewRenderTask,
    setPreviewScaleMode,
    onPreviewResize,
    cleanupPreviewRender,
  }
}
