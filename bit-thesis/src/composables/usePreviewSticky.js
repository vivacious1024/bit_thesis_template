import { ref } from 'vue'

export function usePreviewSticky({ assetsPanelRef }) {
  const previewStickyTop = ref(10)
  const stickyOffsetRaf = ref(0)

  function updatePreviewStickyOffset() {
    const desktop = window.innerWidth > 1080
    if (!desktop) {
      previewStickyTop.value = 10
      return
    }

    const panel = assetsPanelRef.value
    if (!panel) {
      previewStickyTop.value = 10
      return
    }

    const rect = panel.getBoundingClientRect()
    const baseTop = 10
    const nextTop = rect.bottom > baseTop ? Math.ceil(rect.bottom + 8) : baseTop
    previewStickyTop.value = Math.min(nextTop, Math.max(baseTop, window.innerHeight - 260))
  }

  function scheduleStickyOffsetUpdate() {
    if (stickyOffsetRaf.value) return
    stickyOffsetRaf.value = requestAnimationFrame(() => {
      stickyOffsetRaf.value = 0
      updatePreviewStickyOffset()
    })
  }

  function cleanupStickyOffset() {
    if (stickyOffsetRaf.value) {
      cancelAnimationFrame(stickyOffsetRaf.value)
      stickyOffsetRaf.value = 0
    }
  }

  return {
    previewStickyTop,
    stickyOffsetRaf,
    updatePreviewStickyOffset,
    scheduleStickyOffsetUpdate,
    cleanupStickyOffset,
  }
}

