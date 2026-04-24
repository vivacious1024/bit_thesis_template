import { nextTick, ref } from 'vue'

export function useContextMenus({
  mode,
  formDoc,
  formEditorRef,
  contextMenu,
  contextMenuRef,
  typstSelectionState,
  textSelectionStateByBlockId,
  activeInsertSubmenu,
  activeAssetPreviewMenu,
  insertSubmenuAfterRef,
  insertSubmenuCaretRef,
  insertSubmenuSelectionRef,
  insertSubmenuTypstAfterRef,
  insertSubmenuTypstCaretRef,
  insertSubmenuStyles,
  assetPreviewAfterRef,
  assetPreviewCaretRef,
  assetPreviewTypstAfterRef,
  assetPreviewTypstCaretRef,
  assetPreviewStyles,
  assetContextMenu,
}) {
  const insertSubmenuHideTimer = ref(null)
  const assetPreviewHideTimer = ref(null)

  function closeAssetContextMenu() {
    assetContextMenu.visible = false
    assetContextMenu.path = ''
  }

  function cancelHideInsertSubmenu() {
    if (insertSubmenuHideTimer.value) {
      clearTimeout(insertSubmenuHideTimer.value)
      insertSubmenuHideTimer.value = null
    }
  }

  function cancelHideAssetPreviewSubmenu() {
    if (assetPreviewHideTimer.value) {
      clearTimeout(assetPreviewHideTimer.value)
      assetPreviewHideTimer.value = null
    }
  }

  function closeContextMenu() {
    contextMenu.visible = false
    contextMenu.isTypstMode = false
    contextMenu.targetBlockId = ''
    contextMenu.targetCaret = -1
    contextMenu.targetSelectionStart = -1
    contextMenu.targetSelectionEnd = -1
    contextMenu.selectedText = ''
    contextMenu.targetTypstStart = -1
    contextMenu.targetTypstEnd = -1
    contextMenu.canInsertTypstAtCaret = false
    contextMenu.canInsertAtCaret = false
    contextMenu.submenuLeft = false
    cancelHideInsertSubmenu()
    activeInsertSubmenu.value = ''
    cancelHideAssetPreviewSubmenu()
    activeAssetPreviewMenu.value = ''
  }

  function repositionContextMenuToViewport() {
    const el = contextMenuRef.value
    if (!el) return
    const margin = 10
    const viewportW = window.innerWidth
    const viewportH = window.innerHeight
    const menuW = el.offsetWidth || 220
    const menuH = el.offsetHeight || 240

    const nextX = Math.max(margin, Math.min(contextMenu.x, viewportW - menuW - margin))
    const nextY = Math.max(margin, Math.min(contextMenu.y, viewportH - menuH - margin))
    contextMenu.x = nextX
    contextMenu.y = nextY
  }

  function openContextMenu(event) {
    if (mode.value !== 'form' && mode.value !== 'typst') return
    event.preventDefault()
    closeAssetContextMenu()

    let targetIndex = formDoc.blocks.length - 1
    const blockEl = event.target?.closest?.('[data-block-index]')
    if (blockEl) {
      const fromBlock = Number(blockEl.dataset?.blockIndex)
      if (Number.isFinite(fromBlock)) targetIndex = fromBlock
    } else {
      const firstBlock = formEditorRef.value?.querySelector?.('[data-block-index="0"]')
      if (firstBlock) {
        const rect = firstBlock.getBoundingClientRect()
        if (event.clientY < rect.top) targetIndex = -1
      }
    }

    contextMenu.visible = true
    contextMenu.x = event.clientX
    contextMenu.y = event.clientY
    contextMenu.isTypstMode = mode.value === 'typst'
    contextMenu.targetIndex = Number.isFinite(targetIndex) ? targetIndex : formDoc.blocks.length - 1
    contextMenu.targetBlockId = ''
    contextMenu.targetCaret = -1
    contextMenu.targetSelectionStart = -1
    contextMenu.targetSelectionEnd = -1
    contextMenu.selectedText = ''
    contextMenu.targetTypstStart = -1
    contextMenu.targetTypstEnd = -1
    contextMenu.canInsertTypstAtCaret = false
    contextMenu.canInsertAtCaret = false
    contextMenu.submenuLeft = false
    cancelHideInsertSubmenu()
    activeInsertSubmenu.value = ''
    cancelHideAssetPreviewSubmenu()
    activeAssetPreviewMenu.value = ''

    if (mode.value === 'typst') {
      const rawTarget = event.target
      let start = -1
      let end = -1
      if (rawTarget instanceof HTMLTextAreaElement && typeof rawTarget.selectionStart === 'number') {
        start = Math.max(0, Number(rawTarget.selectionStart) || 0)
        end = Math.max(start, Number(rawTarget.selectionEnd) || start)
      } else {
        const remembered = typstSelectionState.value || { start: 0, end: 0 }
        start = Math.max(0, Number(remembered.start) || 0)
        end = Math.max(start, Number(remembered.end) || start)
      }
      contextMenu.targetTypstStart = start
      contextMenu.targetTypstEnd = end
      contextMenu.canInsertTypstAtCaret = true
    } else if (Number.isFinite(targetIndex) && targetIndex >= 0) {
      const targetBlock = formDoc.blocks[targetIndex]
      const rawTarget = event.target
      const isTextArea = rawTarget instanceof HTMLTextAreaElement
      if (targetBlock?.type === 'text') {
        let caretSource = null
        if (isTextArea && typeof rawTarget.selectionStart === 'number') {
          caretSource = {
            value: String(rawTarget.value || ''),
            start: Math.max(0, Number(rawTarget.selectionStart) || 0),
            end: Math.max(0, Number(rawTarget.selectionEnd) || 0),
          }
        }

        if (!caretSource && blockEl instanceof HTMLElement) {
          const textAreaInBlock = blockEl.querySelector('textarea')
          if (textAreaInBlock instanceof HTMLTextAreaElement && typeof textAreaInBlock.selectionStart === 'number') {
            caretSource = {
              value: String(textAreaInBlock.value || ''),
              start: Math.max(0, Number(textAreaInBlock.selectionStart) || 0),
              end: Math.max(0, Number(textAreaInBlock.selectionEnd) || 0),
            }
          }
        }

        if (!caretSource) {
          const remembered = textSelectionStateByBlockId[targetBlock.id]
          if (remembered && Number.isFinite(remembered.start)) {
            caretSource = {
              value: String(targetBlock.text || ''),
              start: Math.max(0, Number(remembered.start) || 0),
              end: Math.max(0, Number(remembered.end) || Number(remembered.start) || 0),
            }
          }
        }

        if (!caretSource) {
          const fallbackPos = String(targetBlock.text || '').length
          caretSource = {
            value: String(targetBlock.text || ''),
            start: fallbackPos,
            end: fallbackPos,
          }
        }

        contextMenu.targetBlockId = targetBlock.id
        contextMenu.targetCaret = Math.max(0, Math.min(caretSource.value.length, Number(caretSource.start) || 0))
        contextMenu.targetSelectionStart = contextMenu.targetCaret
        contextMenu.targetSelectionEnd = Math.max(
          contextMenu.targetSelectionStart,
          Math.min(caretSource.value.length, Number(caretSource.end) || contextMenu.targetSelectionStart),
        )
        if (contextMenu.targetSelectionEnd > contextMenu.targetSelectionStart) {
          contextMenu.selectedText = String(caretSource.value || '').slice(
            contextMenu.targetSelectionStart,
            contextMenu.targetSelectionEnd,
          )
        }
        contextMenu.canInsertAtCaret = true
      }
    }

    void nextTick(() => {
      repositionContextMenuToViewport()
      const menuEl = contextMenuRef.value
      if (menuEl) {
        const estimatedSubmenuWidth = 188
        const rightRemain = window.innerWidth - (contextMenu.x + menuEl.offsetWidth + estimatedSubmenuWidth + 12)
        contextMenu.submenuLeft = rightRemain < 0
      }
    })
  }

  function positionInsertSubmenu(event, modeValue) {
    const trigger = event?.currentTarget
    const submenuEl =
      modeValue === 'after'
        ? insertSubmenuAfterRef.value
        : modeValue === 'typst-after'
          ? insertSubmenuTypstAfterRef.value
          : modeValue === 'typst-caret'
            ? insertSubmenuTypstCaretRef.value
            : modeValue === 'selection-heading'
              ? insertSubmenuSelectionRef.value
              : insertSubmenuCaretRef.value
    if (!(trigger instanceof HTMLElement) || !submenuEl) return
    requestAnimationFrame(() => {
      const triggerRect = trigger.getBoundingClientRect()
      const submenuRect = submenuEl.getBoundingClientRect()
      if (submenuRect.width < 8 || submenuRect.height < 8) return
      const margin = 10
      const viewportW = window.innerWidth
      const viewportH = window.innerHeight

      let left = triggerRect.right + 6
      if (left + submenuRect.width > viewportW - margin) {
        left = triggerRect.left - submenuRect.width - 6
      }
      left = Math.max(margin, Math.min(left, viewportW - submenuRect.width - margin))

      let top = triggerRect.top - 2
      top = Math.max(margin, Math.min(top, viewportH - submenuRect.height - margin))

      const target =
        modeValue === 'after'
          ? insertSubmenuStyles.after
          : modeValue === 'typst-after'
            ? insertSubmenuStyles.typstAfter
            : modeValue === 'typst-caret'
              ? insertSubmenuStyles.typstCaret
              : modeValue === 'selection-heading'
                ? insertSubmenuStyles.selection
                : insertSubmenuStyles.caret
      target.left = `${Math.round(left)}px`
      target.top = `${Math.round(top)}px`
      target.maxHeight = `${Math.max(120, Math.min(520, viewportH - 2 * margin))}px`
      target.right = 'auto'
    })
  }

  function openInsertSubmenu(modeValue, event) {
    cancelHideInsertSubmenu()
    cancelHideAssetPreviewSubmenu()
    activeInsertSubmenu.value = modeValue
    positionInsertSubmenu(event, modeValue)
  }

  function scheduleHideInsertSubmenu() {
    cancelHideInsertSubmenu()
    insertSubmenuHideTimer.value = setTimeout(() => {
      activeInsertSubmenu.value = ''
      activeAssetPreviewMenu.value = ''
    }, 120)
  }

  function positionAssetPreviewSubmenu(event, modeValue) {
    const trigger = event?.currentTarget
    const submenuEl =
      modeValue === 'after'
        ? assetPreviewAfterRef.value
        : modeValue === 'caret'
          ? assetPreviewCaretRef.value
          : modeValue === 'typst-after'
            ? assetPreviewTypstAfterRef.value
            : assetPreviewTypstCaretRef.value
    if (!(trigger instanceof HTMLElement) || !submenuEl) return
    requestAnimationFrame(() => {
      const triggerRect = trigger.getBoundingClientRect()
      const submenuRect = submenuEl.getBoundingClientRect()
      if (submenuRect.width < 8 || submenuRect.height < 8) return
      const margin = 10
      const viewportW = window.innerWidth
      const viewportH = window.innerHeight

      let left = triggerRect.right + 8
      if (left + submenuRect.width > viewportW - margin) {
        left = triggerRect.left - submenuRect.width - 8
      }
      left = Math.max(margin, Math.min(left, viewportW - submenuRect.width - margin))

      let top = triggerRect.top
      top = Math.max(margin, Math.min(top, viewportH - submenuRect.height - margin))

      const target =
        modeValue === 'after'
          ? assetPreviewStyles.after
          : modeValue === 'caret'
            ? assetPreviewStyles.caret
            : modeValue === 'typst-after'
              ? assetPreviewStyles.typstAfter
              : assetPreviewStyles.typstCaret
      target.left = `${Math.round(left)}px`
      target.top = `${Math.round(top)}px`
      target.maxHeight = `${Math.max(160, Math.min(520, viewportH - 2 * margin))}px`
      target.right = 'auto'
    })
  }

  function openAssetPreviewSubmenu(modeValue, event) {
    cancelHideAssetPreviewSubmenu()
    cancelHideInsertSubmenu()
    activeAssetPreviewMenu.value = modeValue
    positionAssetPreviewSubmenu(event, modeValue)
  }

  function scheduleHideAssetPreviewSubmenu() {
    cancelHideAssetPreviewSubmenu()
    assetPreviewHideTimer.value = setTimeout(() => {
      activeAssetPreviewMenu.value = ''
    }, 140)
  }

  function openAssetContextMenu(event, asset) {
    event.preventDefault()
    event.stopPropagation()
    closeContextMenu()
    const path = String(asset?.path || '')
    if (!path) return

    assetContextMenu.visible = true
    assetContextMenu.x = event.clientX
    assetContextMenu.y = event.clientY
    assetContextMenu.path = path
  }

  function onGlobalClick() {
    if (contextMenu.visible) closeContextMenu()
    if (assetContextMenu.visible) closeAssetContextMenu()
  }

  function onKeydown(event) {
    if (event.key === 'Escape') {
      closeContextMenu()
      closeAssetContextMenu()
    }
  }

  return {
    openContextMenu,
    closeContextMenu,
    repositionContextMenuToViewport,
    positionInsertSubmenu,
    openInsertSubmenu,
    scheduleHideInsertSubmenu,
    cancelHideInsertSubmenu,
    positionAssetPreviewSubmenu,
    openAssetPreviewSubmenu,
    scheduleHideAssetPreviewSubmenu,
    cancelHideAssetPreviewSubmenu,
    openAssetContextMenu,
    closeAssetContextMenu,
    onGlobalClick,
    onKeydown,
    insertSubmenuHideTimer,
    assetPreviewHideTimer,
  }
}

