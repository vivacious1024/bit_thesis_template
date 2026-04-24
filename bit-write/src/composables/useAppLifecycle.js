import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

export function useAppLifecycle({
  assetsPanelRef,
  onGlobalClick,
  onKeydown,
  onPreviewResize,
  scheduleStickyOffsetUpdate,
  updatePreviewStickyOffset,
  loadAssetConfig,
  loadAssetLibrary,
  cleanupCursorSync,
  cleanupPreviewRender,
  cleanupStickyOffset,
  cancelHideInsertSubmenu,
  cancelHideAssetPreviewSubmenu,
}) {
  const assetsPanelResizeObserver = ref(null)

  onMounted(() => {
    document.addEventListener('click', onGlobalClick)
    document.addEventListener('keydown', onKeydown)
    window.addEventListener('resize', onPreviewResize)
    window.addEventListener('scroll', scheduleStickyOffsetUpdate, { passive: true })
    void nextTick(() => {
      updatePreviewStickyOffset()
      if (typeof ResizeObserver !== 'undefined' && assetsPanelRef.value) {
        assetsPanelResizeObserver.value = new ResizeObserver(() => {
          scheduleStickyOffsetUpdate()
        })
        assetsPanelResizeObserver.value.observe(assetsPanelRef.value)
      }
    })
    void (async () => {
      if (typeof loadAssetConfig === 'function') await loadAssetConfig()
      await loadAssetLibrary()
    })()
  })

  onBeforeUnmount(() => {
    document.removeEventListener('click', onGlobalClick)
    document.removeEventListener('keydown', onKeydown)
    window.removeEventListener('resize', onPreviewResize)
    window.removeEventListener('scroll', scheduleStickyOffsetUpdate)

    cleanupCursorSync()
    cleanupPreviewRender()
    if (assetsPanelResizeObserver.value) {
      assetsPanelResizeObserver.value.disconnect()
      assetsPanelResizeObserver.value = null
    }
    cleanupStickyOffset()
    cancelHideInsertSubmenu()
    cancelHideAssetPreviewSubmenu()
  })

  return {
    assetsPanelResizeObserver,
  }
}
