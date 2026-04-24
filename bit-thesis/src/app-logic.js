import { computed, nextTick, reactive, ref, watch, watchEffect } from 'vue'
import { GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import {
  useAppLifecycle,
  useAssets,
  useBlockInsertActions,
  useBlockOps,
  useContextMenus,
  useCursorSync,
  useExportActions,
  useFormBlocksUi,
  usePreviewRender,
  usePreviewSticky,
  useTextNormalization,
  useTypstInsert,
} from './composables/index.js'

export default {
  name: 'App',
  setup() {
    GlobalWorkerOptions.workerSrc = pdfWorker
    
    const mode = ref('form')
    const parseNotice = ref('')
    const thesisTitle = ref('论文标题')
    const typstSource = ref('')
    
    const formDoc = reactive({
      blocks: [
        { id: crypto.randomUUID(), type: 'heading', level: 1, text: '第一章 绪论' },
        { id: crypto.randomUUID(), type: 'text', text: '在填空模式中编辑正文，右键可插入文本模块、标题、图片、公式和三线表。', expanded: true },
      ],
    })
    
    const contextMenu = reactive({
      visible: false,
      x: 0,
      y: 0,
      isTypstMode: false,
      targetIndex: -1,
      targetBlockId: '',
      targetCaret: -1,
      targetSelectionStart: -1,
      targetSelectionEnd: -1,
      selectedText: '',
      targetTypstStart: -1,
      targetTypstEnd: -1,
      canInsertTypstAtCaret: false,
      canInsertAtCaret: false,
      submenuLeft: false,
    })
    const insertSubmenuAfterRef = ref(null)
    const insertSubmenuCaretRef = ref(null)
    const insertSubmenuSelectionRef = ref(null)
    const insertSubmenuTypstAfterRef = ref(null)
    const insertSubmenuTypstCaretRef = ref(null)
    const insertSubmenuStyles = reactive({
      after: { left: '0px', top: '0px', right: 'auto', maxHeight: '72vh' },
      caret: { left: '0px', top: '0px', right: 'auto', maxHeight: '72vh' },
      selection: { left: '0px', top: '0px', right: 'auto', maxHeight: '72vh' },
      typstAfter: { left: '0px', top: '0px', right: 'auto', maxHeight: '72vh' },
      typstCaret: { left: '0px', top: '0px', right: 'auto', maxHeight: '72vh' },
    })
    const activeInsertSubmenu = ref('')
    const assetPreviewAfterRef = ref(null)
    const assetPreviewCaretRef = ref(null)
    const assetPreviewTypstAfterRef = ref(null)
    const assetPreviewTypstCaretRef = ref(null)
    const assetPreviewStyles = reactive({
      after: { left: '0px', top: '0px', right: 'auto', maxHeight: '56vh' },
      caret: { left: '0px', top: '0px', right: 'auto', maxHeight: '56vh' },
      typstAfter: { left: '0px', top: '0px', right: 'auto', maxHeight: '56vh' },
      typstCaret: { left: '0px', top: '0px', right: 'auto', maxHeight: '56vh' },
    })
    const activeAssetPreviewMenu = ref('')
    const coverFileName = ref('')
    const coverPdfBytes = ref(null)
    const coverStatus = ref('尚未选择封面文件。')
    const bodyPdfFileName = ref('')
    const bodyPdfBytes = ref(null)
    const bodyStatus = ref('尚未上传正文 PDF，将优先使用实时渲染结果。')
    const imageUploadStatus = ref('')
    const uploadingImageBlockId = ref('')
    
    const assetLibrary = ref([])
    const assetLibraryLoading = ref(false)
    const assetLibraryStatus = ref('\u7d20\u6750\u5e93\u672a\u52a0\u8f7d\u3002')
    const assetLibraryKeyword = ref('')
    const assetUploadInputRef = ref(null)
    const assetContextMenu = reactive({ visible: false, x: 0, y: 0, path: '' })
    const renamingAssetPath = ref('')
    const renamingAssetName = ref('')
    const renamingAssetLoading = ref(false)
    const assetPanelCollapsed = ref(false)
    
    const previewPageCount = ref(1)
    const previewLocationPage = ref(1)
    const previewPageHeight = ref(0)
    const lastCursorRatio = ref(0)
    const previewScaleMode = ref('width')
    const previewTextAnchors = ref([])
    const currentCursorSentence = ref('')
    
    const mergeStatus = ref('')
    const isMerging = ref(false)
    
    const previewContainerRef = ref(null)
    const typstEditorRef = ref(null)
    const previewSingleCanvasRef = ref(null)
    const formEditorRef = ref(null)
    const assetsPanelRef = ref(null)
    const contextMenuRef = ref(null)
    const blockRefMap = new Map()
    const textSelectionStateByBlockId = reactive({})
    const previewPageLayouts = ref([])
    const draggingBlockId = ref('')
    const dragInsertIndex = ref(-1)
    
    const isSyncingFromPreviewClick = ref(false)
    const typstSelectionState = ref({ start: 0, end: 0 })

    const blockOps = useBlockOps({
      formDoc,
      mode,
      typstSource,
      parseNotice,
      assetLibrary,
      getFormBuildResult: () => formBuildResult.value,
    })
    const {
      buildFormTypstResult,
      blockToTypstSnippet,
      convertBlockToTypst,
      parseTypstSnippetToStructuredBlocks,
      convertTypstBlockToStructured,
      buildThreeLineTableTypst,
      buildImageTypst,
      blockUseAutoFigure,
      normalizeCaptionPosition,
      parseTypstToFormBlocks,
      switchMode,
      addBlock,
      defaultBlockPayload,
      removeBlock,
      blockTypeText,
      resolveImagePathForUse,
      imagePreviewUrl,
    } = blockOps

    const contextMenus = useContextMenus({
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
    })
    const {
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
    } = contextMenus

    const assets = useAssets({
      mode,
      formDoc,
      parseNotice,
      imageUploadStatus,
      uploadingImageBlockId,
      assetLibrary,
      assetLibraryLoading,
      assetLibraryStatus,
      assetUploadInputRef,
      assetContextMenu,
      renamingAssetPath,
      renamingAssetName,
      renamingAssetLoading,
      assetPanelCollapsed,
      addBlock,
      resolveImagePathForUse,
      closeAssetContextMenu,
    })
    const {
      formatAssetSize,
      formatAssetTime,
      getAssetByPath,
      copyAssetPath,
      isEditingAsset,
      startRenameAsset,
      cancelRenameAsset,
      submitRenameAsset,
      submitRenameCurrentAsset,
      toggleAssetPanel,
      triggerAssetUpload,
      onAssetLibraryUpload,
      insertImageBlockFromAsset,
      loadAssetLibrary,
      onAssetMenuCopyPath,
      onAssetMenuInsertImageBlock,
      onAssetMenuRename,
      onAssetMenuDelete,
      getLinkedAssetForImageBlock,
      canRenameLinkedAsset,
      isEditingLinkedAsset,
      startRenameLinkedAsset,
      submitRenameLinkedAsset,
      onImageFileChange,
      uploadImageToAsset,
    } = assets

    const textNormalization = useTextNormalization({
      mode,
      typstSource,
      formDoc,
      parseNotice,
    })
    const {
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
    } = textNormalization

    const typstInsert = useTypstInsert({
      mode,
      typstSource,
      contextMenu,
      typstSelectionState,
      typstEditorRef,
      parseNotice,
      closeContextMenu,
      buildImageTypst,
      buildThreeLineTableTypst,
    })
    const {
      buildTypstSnippetByType,
      normalizeSnippetForTypstInsert,
      insertTypstSnippet,
      insertTypstFromMenu,
      insertTypstImageFromAsset,
    } = typstInsert
    
    const modeLabel = computed(() => (mode.value === 'form' ? '填空模式' : 'Typst 模式'))
    const formBuildResult = computed(() => buildFormTypstResult())
    const generatedTypst = computed(() => (mode.value === 'typst' ? typstSource.value : formBuildResult.value.text))
    const textNormalizationSummary = computed(() => buildTextNormalizationSummary())
    const filteredAssetLibrary = computed(() => {
      const keyword = assetLibraryKeyword.value.trim().toLowerCase()
      if (!keyword) return assetLibrary.value
      return assetLibrary.value.filter((item) =>
        String(item.name || '').toLowerCase().includes(keyword) ||
        String(item.path || '').toLowerCase().includes(keyword),
      )
    })

    const previewSticky = usePreviewSticky({ assetsPanelRef })
    const {
      previewStickyTop,
      stickyOffsetRaf,
      updatePreviewStickyOffset,
      scheduleStickyOffsetUpdate,
      cleanupStickyOffset,
    } = previewSticky

    const cursorSync = useCursorSync({
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
    })
    const {
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
    } = cursorSync

    const previewRender = usePreviewRender({
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
    })
    const {
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
    } = previewRender

    const exportActions = useExportActions({
      coverFileName,
      coverPdfBytes,
      coverStatus,
      bodyPdfFileName,
      bodyPdfBytes,
      bodyStatus,
      renderedBodyPdfBytes,
      mergeStatus,
      isMerging,
    })
    const {
      onCoverFileChange,
      onBodyPdfChange,
      mergeCoverAndBody,
      exportBodyPdfOnly,
      downloadBytes,
      clearCover,
      clearBodyPdf,
    } = exportActions
    
    watchEffect(() => {
      if (mode.value === 'form') typstSource.value = formBuildResult.value.text
    })
    
    watch(generatedTypst, () => schedulePreviewRender(), { immediate: true })
    watch(assetPanelCollapsed, () => {
      void nextTick(() => {
        updatePreviewStickyOffset()
      })
    })
    
    function setBlockRef(blockId, element) {
      if (!element) {
        blockRefMap.delete(blockId)
        return
      }
      blockRefMap.set(blockId, element)
    }
    
    const formBlocksUi = useFormBlocksUi({
      formDoc,
      blockRefMap,
      parseNotice,
      draggingBlockId,
      dragInsertIndex,
      onFormCursorActivity,
    })
    const {
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
    } = formBlocksUi

    const blockInsertActions = useBlockInsertActions({
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
    })
    const {
      insertImageFromContextAsset,
      insertFromMenu,
      getContextTargetTextBlock,
      createTextBlockFromRaw,
      insertFromMenuAtCaret,
      convertSelectionToHeading,
      insertClipboardPayloadAtCaret,
      onParagraphPaste,
      pasteFromClipboardAtCaret,
    } = blockInsertActions
    
    async function copyTypst() {
      await navigator.clipboard.writeText(generatedTypst.value)
      parseNotice.value = '已复制 Typst 源码。'
    }
    
    function downloadTypst() {
      const blob = new Blob([generatedTypst.value], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'thesis.typ'
      a.click()
      URL.revokeObjectURL(url)
      parseNotice.value = '已下载 thesis.typ。'
    }
    
    
    
    const { assetsPanelResizeObserver } = useAppLifecycle({
      assetsPanelRef,
      onGlobalClick,
      onKeydown,
      onPreviewResize,
      scheduleStickyOffsetUpdate,
      updatePreviewStickyOffset,
      loadAssetLibrary,
      cleanupCursorSync,
      cleanupPreviewRender,
      cleanupStickyOffset,
      cancelHideInsertSubmenu,
      cancelHideAssetPreviewSubmenu,
    })
    
    return {
      mode,
      parseNotice,
      thesisTitle,
      typstSource,
      formDoc,
      contextMenu,
      insertSubmenuAfterRef,
      insertSubmenuCaretRef,
      insertSubmenuSelectionRef,
      insertSubmenuTypstAfterRef,
      insertSubmenuTypstCaretRef,
      insertSubmenuStyles,
      activeInsertSubmenu,
      assetPreviewAfterRef,
      assetPreviewCaretRef,
      assetPreviewTypstAfterRef,
      assetPreviewTypstCaretRef,
      assetPreviewStyles,
      activeAssetPreviewMenu,
      coverFileName,
      coverPdfBytes,
      coverStatus,
      bodyPdfFileName,
      bodyPdfBytes,
      bodyStatus,
      imageUploadStatus,
      uploadingImageBlockId,
      assetLibrary,
      assetLibraryLoading,
      assetLibraryStatus,
      assetLibraryKeyword,
      assetUploadInputRef,
      assetContextMenu,
      renamingAssetPath,
      renamingAssetName,
      renamingAssetLoading,
      assetPanelCollapsed,
      renderedBodyPdfBytes,
      previewStatus,
      isRenderingPreview,
      previewPageCount,
      previewLocationPage,
      previewPageHeight,
      lastCursorRatio,
      previewScaleMode,
      previewTextAnchors,
      currentCursorSentence,
      mergeStatus,
      isMerging,
      previewContainerRef,
      typstEditorRef,
      previewSingleCanvasRef,
      formEditorRef,
      assetsPanelRef,
      contextMenuRef,
      blockRefMap,
      textSelectionStateByBlockId,
      previewPdfDoc: previewPdfDocRef,
      previewPageLayouts,
      draggingBlockId,
      dragInsertIndex,
      previewStickyTop,
      isSyncingFromPreviewClick,
      previewTimer,
      previewRequestSeq,
      cursorSyncTimer,
      previewResizeTimer,
      previewCanvasRenderSeq,
      activePreviewRenderTask,
      assetsPanelResizeObserver,
      stickyOffsetRaf,
      insertSubmenuHideTimer,
      assetPreviewHideTimer,
      typstSelectionState,
      modeLabel,
      formBuildResult,
      generatedTypst,
      textNormalizationSummary,
      filteredAssetLibrary,
      schedulePreviewRender,
      renderBodyPdfPreview,
      loadPreviewPdf,
      renderCurrentPreviewPage,
      cancelActivePreviewRenderTask,
      setPreviewScaleMode,
      setBlockRef,
      updatePreviewStickyOffset,
      scheduleStickyOffsetUpdate,
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
      buildFormTypstResult,
      blockToTypstSnippet,
      convertBlockToTypst,
      parseTypstSnippetToStructuredBlocks,
      convertTypstBlockToStructured,
      buildThreeLineTableTypst,
      buildImageTypst,
      blockUseAutoFigure,
      normalizeCaptionPosition,
      parseTypstToFormBlocks,
      formatAssetSize,
      formatAssetTime,
      getAssetByPath,
      copyAssetPath,
      isEditingAsset,
      startRenameAsset,
      cancelRenameAsset,
      submitRenameAsset,
      submitRenameCurrentAsset,
      toggleAssetPanel,
      triggerAssetUpload,
      onAssetLibraryUpload,
      insertImageBlockFromAsset,
      loadAssetLibrary,
      switchMode,
      addBlock,
      defaultBlockPayload,
      isParagraphExpanded,
      getParagraphRows,
      autoResizeTextarea,
      resetTextareaHeight,
      toggleParagraphExpanded,
      onParagraphInput,
      onParagraphFocus,
      removeBlock,
      onBlockDragStart,
      onBlockDragOver,
      onBlockDragOverEnd,
      finishBlockDrop,
      onBlockDrop,
      onBlockDropEnd,
      onBlockDragEnd,
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
      onAssetMenuCopyPath,
      onAssetMenuInsertImageBlock,
      onAssetMenuRename,
      onAssetMenuDelete,
      insertImageFromContextAsset,
      buildTypstSnippetByType,
      normalizeSnippetForTypstInsert,
      insertTypstSnippet,
      insertTypstFromMenu,
      insertTypstImageFromAsset,
      insertFromMenu,
      getContextTargetTextBlock,
      createTextBlockFromRaw,
      insertFromMenuAtCaret,
      convertSelectionToHeading,
      blockTypeText,
      copyTypst,
      downloadTypst,
      resolveImagePathForUse,
      imagePreviewUrl,
      getLinkedAssetForImageBlock,
      canRenameLinkedAsset,
      isEditingLinkedAsset,
      startRenameLinkedAsset,
      submitRenameLinkedAsset,
      onImageFileChange,
      uploadImageToAsset,
      onParagraphKeydown,
      onParagraphPaste,
      insertClipboardPayloadAtCaret,
      pasteFromClipboardAtCaret,
      onEditorPlainTextPaste,
      normalizePastedTextForTypst,
      COMMON_CHAR_FIX_REPLACEMENTS,
      isKnownProblemGlyph,
      normalizeRichTextInput,
      isSuspiciousForTemplate,
      isTemplateSafeChar,
      collectTextsForNormalization,
      buildTextNormalizationSummary,
      applyTextNormalizationFix,
      enforceStrictFontUniformText,
      applyStrictFontUniformFix,
      onCoverFileChange,
      onBodyPdfChange,
      mergeCoverAndBody,
      exportBodyPdfOnly,
      downloadBytes,
      clearCover,
      clearBodyPdf,
      onPreviewResize
    }
  },
}



