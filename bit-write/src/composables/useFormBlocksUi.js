import { nextTick } from 'vue'

export function useFormBlocksUi({
  formDoc,
  blockRefMap,
  parseNotice,
  draggingBlockId,
  dragInsertIndex,
  onFormCursorActivity,
}) {
  function isParagraphExpanded(block) {
    return !!block?.expanded
  }

  function getParagraphRows(block) {
    if (!isParagraphExpanded(block)) return 4
    return Math.max(8, String(block?.text || '').split('\n').length + 1)
  }

  function autoResizeTextarea(el) {
    if (!(el instanceof HTMLTextAreaElement)) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }

  function resetTextareaHeight(el) {
    if (!(el instanceof HTMLTextAreaElement)) return
    el.style.height = ''
  }

  function toggleParagraphExpanded(block) {
    block.expanded = !block.expanded
    void nextTick(() => {
      const blockEl = blockRefMap.get(block.id)
      const textarea = blockEl?.querySelector?.('textarea')
      if (!textarea) return
      if (block.expanded) autoResizeTextarea(textarea)
      else resetTextareaHeight(textarea)
    })
  }

  function onParagraphInput(event, block) {
    onFormCursorActivity(event, block)
    if (isParagraphExpanded(block)) autoResizeTextarea(event?.target)
  }

  function onParagraphFocus(event, block) {
    if (isParagraphExpanded(block)) autoResizeTextarea(event?.target)
    onFormCursorActivity(event, block)
  }

  function onBlockDragStart(event, index) {
    const block = formDoc.blocks[index]
    if (!block) return
    draggingBlockId.value = block.id
    dragInsertIndex.value = index

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', block.id)
    }
  }

  function onBlockDragOver(event, index) {
    if (!draggingBlockId.value) return
    event.preventDefault()

    const el = event.currentTarget
    if (!(el instanceof HTMLElement)) return
    const rect = el.getBoundingClientRect()
    const half = rect.top + rect.height / 2
    dragInsertIndex.value = event.clientY > half ? index + 1 : index
  }

  function onBlockDragOverEnd(event) {
    if (!draggingBlockId.value) return
    event.preventDefault()
    dragInsertIndex.value = formDoc.blocks.length
  }

  function finishBlockDrop(targetInsertIndex) {
    if (!draggingBlockId.value) return
    const fromIndex = formDoc.blocks.findIndex((item) => item.id === draggingBlockId.value)
    if (fromIndex < 0) {
      draggingBlockId.value = ''
      dragInsertIndex.value = -1
      return
    }

    let insertAt = Math.max(0, Math.min(targetInsertIndex, formDoc.blocks.length))
    if (insertAt === fromIndex || insertAt === fromIndex + 1) {
      draggingBlockId.value = ''
      dragInsertIndex.value = -1
      return
    }

    const [moved] = formDoc.blocks.splice(fromIndex, 1)
    if (fromIndex < insertAt) insertAt -= 1
    formDoc.blocks.splice(insertAt, 0, moved)

    draggingBlockId.value = ''
    dragInsertIndex.value = -1
    parseNotice.value = '已调整卡片顺序。'
  }

  function onBlockDrop(event, index) {
    if (!draggingBlockId.value) return
    event.preventDefault()

    const el = event.currentTarget
    if (el instanceof HTMLElement) {
      const rect = el.getBoundingClientRect()
      const half = rect.top + rect.height / 2
      const insertAt = event.clientY > half ? index + 1 : index
      finishBlockDrop(insertAt)
      return
    }

    finishBlockDrop(index)
  }

  function onBlockDropEnd(event) {
    if (!draggingBlockId.value) return
    event.preventDefault()
    finishBlockDrop(formDoc.blocks.length)
  }

  function onBlockDragEnd() {
    draggingBlockId.value = ''
    dragInsertIndex.value = -1
  }

  function onParagraphKeydown(event, block, index) {
    void event
    void block
    void index
  }

  return {
    isParagraphExpanded,
    getParagraphRows,
    autoResizeTextarea,
    resetTextareaHeight,
    toggleParagraphExpanded,
    onParagraphInput,
    onParagraphFocus,
    onBlockDragStart,
    onBlockDragOver,
    onBlockDragOverEnd,
    finishBlockDrop,
    onBlockDrop,
    onBlockDropEnd,
    onBlockDragEnd,
    onParagraphKeydown,
  }
}

