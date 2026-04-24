import { nextTick } from 'vue'

export function useBlockInsertActions({
  mode,
  formDoc,
  contextMenu,
  parseNotice,
  blockRefMap,
  addBlock,
  defaultBlockPayload,
  blockTypeText,
  isParagraphExpanded,
  autoResizeTextarea,
  resetTextareaHeight,
  closeContextMenu,
  insertTypstImageFromAsset,
  normalizePastedTextForTypst,
  imageUploadStatus,
  uploadingImageBlockId,
  uploadImageToAsset,
  loadAssetLibrary,
}) {
  function insertImageFromContextAsset(asset) {
    if (mode.value === 'typst') {
      insertTypstImageFromAsset(asset, contextMenu.targetTypstStart >= 0)
      return
    }
    const fileName = asset?.name || String(asset?.path || '').split('/').pop() || ''
    const options = {
      path: fileName,
      caption: fileName || '图片说明',
      width: '100%',
      autoFigure: true,
      captionPosition: 'bottom',
    }
    if (contextMenu.canInsertAtCaret) {
      insertFromMenuAtCaret('image', options)
      return
    }
    insertFromMenu('image', options)
  }

  function insertFromMenu(type, opts = {}) {
    addBlock(contextMenu.targetIndex, type, opts)
    closeContextMenu()
  }

  function getContextTargetTextBlock() {
    const index = formDoc.blocks.findIndex((item) => item.id === contextMenu.targetBlockId)
    if (index < 0) return { index: -1, block: null }
    const block = formDoc.blocks[index]
    if (!block || block.type !== 'text') return { index: -1, block: null }
    return { index, block }
  }

  function createTextBlockFromRaw(text, blockId = '') {
    return {
      id: blockId || crypto.randomUUID(),
      type: 'text',
      text,
      expanded: true,
    }
  }

  function insertFromMenuAtCaret(type, opts = {}) {
    if (!contextMenu.canInsertAtCaret) {
      insertFromMenu(type, opts)
      return
    }
    const { index, block } = getContextTargetTextBlock()
    if (index < 0 || !block) {
      insertFromMenu(type, opts)
      return
    }

    const raw = String(block.text || '')
    const caret = Math.max(0, Math.min(raw.length, Number(contextMenu.targetCaret) || 0))
    const before = raw.slice(0, caret)
    const after = raw.slice(caret)
    block.text = before

    const insertIndex = index + 1
    formDoc.blocks.splice(insertIndex, 0, {
      id: crypto.randomUUID(),
      type,
      ...defaultBlockPayload(type),
      ...opts,
    })
    let afterTextBlockId = ''
    if (after.trim().length > 0) {
      afterTextBlockId = crypto.randomUUID()
      formDoc.blocks.splice(insertIndex + 1, 0, createTextBlockFromRaw(after, afterTextBlockId))
    }

    parseNotice.value = `已在光标处插入 ${blockTypeText(type)} 卡片。`
    void nextTick(() => {
      const blockEl = blockRefMap.get(block.id)
      const textarea = blockEl?.querySelector?.('textarea')
      if (textarea) {
        if (isParagraphExpanded(block)) autoResizeTextarea(textarea)
        else resetTextareaHeight(textarea)
      }
      if (afterTextBlockId) {
        const afterEl = blockRefMap.get(afterTextBlockId)
        const afterTextarea = afterEl?.querySelector?.('textarea')
        if (afterTextarea) autoResizeTextarea(afterTextarea)
      }
    })
    closeContextMenu()
  }

  function convertSelectionToHeading(level) {
    const { index, block } = getContextTargetTextBlock()
    if (index < 0 || !block) {
      parseNotice.value = '请先在文本卡片中选中要转换为标题的文字。'
      closeContextMenu()
      return
    }

    const raw = String(block.text || '')
    const start = Math.max(0, Math.min(raw.length, Number(contextMenu.targetSelectionStart) || 0))
    const end = Math.max(start, Math.min(raw.length, Number(contextMenu.targetSelectionEnd) || start))
    const selected = raw.slice(start, end)
    const headingText = String(selected || '').trim()
    if (!headingText) {
      parseNotice.value = '请先选中文本，再执行“设为标题”。'
      closeContextMenu()
      return
    }

    const before = raw.slice(0, start)
    const after = raw.slice(end)
    const replacement = []
    const keptId = block.id
    if (before.trim().length > 0) replacement.push(createTextBlockFromRaw(before, keptId))
    replacement.push({
      id: crypto.randomUUID(),
      type: 'heading',
      level: Math.max(1, Math.min(3, Number(level) || 1)),
      text: headingText,
    })
    if (after.trim().length > 0) replacement.push(createTextBlockFromRaw(after))
    if (replacement.length === 1) replacement.unshift(createTextBlockFromRaw(''))
    formDoc.blocks.splice(index, 1, ...replacement)

    parseNotice.value = `已将选中文本转换为 ${Math.max(1, Math.min(3, Number(level) || 1))} 级标题。`
    void nextTick(() => {
      for (const nextBlock of replacement) {
        if (nextBlock.type !== 'text') continue
        const el = blockRefMap.get(nextBlock.id)
        const textarea = el?.querySelector?.('textarea')
        if (textarea) autoResizeTextarea(textarea)
      }
    })
    closeContextMenu()
  }

  async function insertClipboardPayloadAtCaret({
    blockId = '',
    indexHint = -1,
    start = -1,
    end = -1,
    text = '',
    imageFiles = [],
    forceSplitTextCard = false,
  }) {
    const imageList = Array.isArray(imageFiles) ? imageFiles.filter(Boolean) : []
    const hasImages = imageList.length > 0
    const normalizedText = normalizePastedTextForTypst(text || '')
    const hasText = normalizedText.length > 0
    if (!hasImages && !hasText) return

    let index = formDoc.blocks.findIndex((item) => item.id === blockId)
    if (index < 0) index = Math.max(0, indexHint)
    const block = formDoc.blocks[index]
    if (!block || block.type !== 'text') return

    const raw = String(block.text || '')
    const safeStart = Math.max(0, Math.min(raw.length, Number(start) || 0))
    const safeEnd = Math.max(safeStart, Math.min(raw.length, Number(end) || safeStart))
    const before = raw.slice(0, safeStart)
    const after = raw.slice(safeEnd)

    if (!hasImages && !forceSplitTextCard) {
      block.text = before + normalizedText + after
      parseNotice.value = '已在光标处粘贴文本。'
      void nextTick(() => {
        const blockEl = blockRefMap.get(block.id)
        const textarea = blockEl?.querySelector?.('textarea')
        if (textarea && isParagraphExpanded(block)) autoResizeTextarea(textarea)
      })
      return
    }

    let insertIndexBase = index + 1
    let insertedTextIntoOwnCard = false
    if (forceSplitTextCard) {
      if (before.trim().length > 0) {
        block.text = before
        if (hasText) {
          formDoc.blocks.splice(insertIndexBase, 0, createTextBlockFromRaw(normalizedText))
          insertIndexBase += 1
          insertedTextIntoOwnCard = true
        }
      } else if (hasText) {
        block.text = normalizedText
      } else {
        block.text = before
      }
    } else {
      block.text = before + normalizedText
    }

    const insertedImageNames = []
    let insertOffset = 0
    for (let i = 0; i < imageList.length; i += 1) {
      const file = imageList[i]
      const mimeType = String(file.type || 'image/png')
      const ext =
        mimeType === 'image/jpeg'
          ? 'jpg'
          : mimeType === 'image/gif'
            ? 'gif'
            : mimeType === 'image/webp'
              ? 'webp'
              : mimeType === 'image/svg+xml'
                ? 'svg'
                : 'png'
      const fileName = file.name && file.name.trim() ? file.name.trim() : `粘贴图片-${Date.now()}-${i + 1}.${ext}`
      const result = await uploadImageToAsset(file, fileName)
      const pathName = String(result.path || '').split('/').pop() || fileName
      insertedImageNames.push(pathName)
      formDoc.blocks.splice(insertIndexBase + insertOffset, 0, {
        id: crypto.randomUUID(),
        type: 'image',
        path: pathName,
        caption: pathName,
        width: '100%',
        autoFigure: true,
        captionPosition: 'bottom',
      })
      insertOffset += 1
    }
    if (after.trim().length > 0) {
      formDoc.blocks.splice(insertIndexBase + insertOffset, 0, createTextBlockFromRaw(after))
    } else if (forceSplitTextCard && !insertedTextIntoOwnCard && !hasImages && !hasText) {
      block.text = before
    }

    if (hasImages) await loadAssetLibrary()
    parseNotice.value = insertedImageNames.length
      ? `已在光标处粘贴并插入 ${insertedImageNames.length} 张图片卡片。`
      : forceSplitTextCard
        ? '已在光标处粘贴并拆分为独立文本卡片。'
        : '已在光标处粘贴。'
    imageUploadStatus.value = hasText
      ? `已粘贴文本并缓存图片：${insertedImageNames.join('，')}`
      : `已缓存并插入图片：${insertedImageNames.join('，')}`

    void nextTick(() => {
      const blockEl = blockRefMap.get(block.id)
      const textarea = blockEl?.querySelector?.('textarea')
      if (textarea && isParagraphExpanded(block)) autoResizeTextarea(textarea)
    })
  }

  async function onParagraphPaste(event, block, index) {
    const data = event.clipboardData
    if (!data) return

    const items = Array.from(data.items || [])
    const imageFiles = []
    for (const item of items) {
      if (item?.kind !== 'file' || !String(item.type || '').startsWith('image/')) continue
      const file = item.getAsFile?.()
      if (file) imageFiles.push(file)
    }
    if (!imageFiles.length) {
      const fileList = Array.from(data.files || [])
      for (const file of fileList) {
        if (String(file.type || '').startsWith('image/')) imageFiles.push(file)
      }
    }
    if (!imageFiles.length) return

    event.preventDefault()
    imageUploadStatus.value = '正在处理粘贴内容...'
    uploadingImageBlockId.value = block.id

    try {
      const target = event.target
      const start = target instanceof HTMLTextAreaElement && typeof target.selectionStart === 'number'
        ? target.selectionStart
        : String(block.text || '').length
      const end = target instanceof HTMLTextAreaElement && typeof target.selectionEnd === 'number'
        ? target.selectionEnd
        : start
      const text = String(data.getData('text/plain') || '')
      await insertClipboardPayloadAtCaret({
        blockId: block.id,
        indexHint: index,
        start,
        end,
        text,
        imageFiles,
      })
    } catch (error) {
      imageUploadStatus.value = `粘贴图片失败：${error.message}`
    } finally {
      uploadingImageBlockId.value = ''
    }
  }

  async function pasteFromClipboardAtCaret() {
    if (!contextMenu.canInsertAtCaret || !contextMenu.targetBlockId) return
    try {
      let text = ''
      try {
        text = await navigator.clipboard.readText()
      } catch {
        text = ''
      }

      const imageFiles = []
      if (navigator.clipboard?.read) {
        try {
          const items = await navigator.clipboard.read()
          for (const item of items) {
            for (const type of item.types || []) {
              if (!String(type || '').startsWith('image/')) continue
              const blob = await item.getType(type)
              imageFiles.push(new File([blob], `粘贴图片-${Date.now()}.png`, { type: blob.type || type || 'image/png' }))
            }
          }
        } catch {
          // 忽略图片读取失败，保留文本粘贴
        }
      }

      await insertClipboardPayloadAtCaret({
        blockId: contextMenu.targetBlockId,
        indexHint: contextMenu.targetIndex,
        start: contextMenu.targetSelectionStart >= 0 ? contextMenu.targetSelectionStart : contextMenu.targetCaret,
        end: contextMenu.targetSelectionEnd >= 0 ? contextMenu.targetSelectionEnd : contextMenu.targetCaret,
        text,
        imageFiles,
        forceSplitTextCard: true,
      })
    } catch (error) {
      parseNotice.value = `右键粘贴失败：${String(error.message || error)}`
    } finally {
      closeContextMenu()
    }
  }

  return {
    insertImageFromContextAsset,
    insertFromMenu,
    getContextTargetTextBlock,
    createTextBlockFromRaw,
    insertFromMenuAtCaret,
    convertSelectionToHeading,
    insertClipboardPayloadAtCaret,
    onParagraphPaste,
    pasteFromClipboardAtCaret,
  }
}
