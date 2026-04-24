import { PDFDocument } from 'pdf-lib'

export function useExportActions({
  coverFileName,
  coverPdfBytes,
  coverStatus,
  bodyPdfFileName,
  bodyPdfBytes,
  bodyStatus,
  renderedBodyPdfBytes,
  mergeStatus,
  isMerging,
}) {
  async function onCoverFileChange(event) {
    const file = event.target.files?.[0]
    if (!file) return

    coverFileName.value = file.name
    mergeStatus.value = ''

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      coverPdfBytes.value = null
      coverStatus.value = '封面格式不支持，请上传 .pdf'
      return
    }

    const bytes = await file.arrayBuffer()
    coverPdfBytes.value = bytes.slice(0)
    coverStatus.value = `已加载封面 PDF：${file.name}`
  }

  async function onBodyPdfChange(event) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      bodyPdfBytes.value = null
      bodyPdfFileName.value = ''
      bodyStatus.value = '正文文件必须是 PDF。'
      return
    }

    const bytes = await file.arrayBuffer()
    bodyPdfFileName.value = file.name
    bodyPdfBytes.value = bytes.slice(0)
    bodyStatus.value = `已加载外部正文 PDF：${file.name}`
    mergeStatus.value = ''
  }

  async function mergeCoverAndBody() {
    const bodyBytes = bodyPdfBytes.value || renderedBodyPdfBytes.value
    if (!bodyBytes) {
      mergeStatus.value = '正文 PDF 不可用，请先等待实时渲染完成或手动上传正文 PDF。'
      return
    }

    if (!coverPdfBytes.value) {
      downloadBytes(bodyBytes, '论文正文.pdf')
      mergeStatus.value = '未上传封面，已直接导出正文 PDF：论文正文.pdf'
      return
    }

    isMerging.value = true
    mergeStatus.value = '正在合并 PDF...'

    try {
      const mergedDoc = await PDFDocument.create()
      const coverDoc = await PDFDocument.load(copyPdfBytes(coverPdfBytes.value))
      const bodyDoc = await PDFDocument.load(copyPdfBytes(bodyBytes))

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

  function exportBodyPdfOnly() {
    const bodyBytes = bodyPdfBytes.value || renderedBodyPdfBytes.value
    if (!bodyBytes) {
      mergeStatus.value = '正文 PDF 不可用，请先等待实时渲染完成或手动上传正文 PDF。'
      return
    }
    downloadBytes(bodyBytes, '论文正文.pdf')
    mergeStatus.value = '已导出正文 PDF：论文正文.pdf'
  }

  function downloadBytes(bytes, fileName) {
    const normalized =
      bytes instanceof Uint8Array ? bytes
      : bytes instanceof ArrayBuffer ? new Uint8Array(bytes)
      : bytes

    const blob = new Blob([normalized], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)

    setTimeout(() => {
      URL.revokeObjectURL(url)
    }, 1000)
  }

  function copyPdfBytes(bytes) {
    if (bytes instanceof Uint8Array) {
      return new Uint8Array(bytes)
    }
    if (bytes instanceof ArrayBuffer) {
      return bytes.slice(0)
    }
    throw new Error('PDF 数据类型不正确')
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

  return {
    onCoverFileChange,
    onBodyPdfChange,
    mergeCoverAndBody,
    exportBodyPdfOnly,
    downloadBytes,
    clearCover,
    clearBodyPdf,
  }
}