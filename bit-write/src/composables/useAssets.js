import { apiFetch } from '../utils/api.js'

export function useAssets({
  mode,
  formDoc,
  parseNotice,
  imageUploadStatus,
  uploadingImageBlockId,
  assetLibrary,
  assetLibraryLoading,
  assetLibraryStatus,
  assetLibraryDirectory,
  assetLibraryDirectoryDraft,
  assetLibraryDirectoryDefault,
  assetLibraryDirectoryLoading,
  assetLibraryDirectorySaving,
  assetLibraryCanPickDirectory,
  assetUploadInputRef,
  assetContextMenu,
  renamingAssetPath,
  renamingAssetName,
  renamingAssetLoading,
  assetPanelCollapsed,
  addBlock,
  resolveImagePathForUse,
  closeAssetContextMenu,
}) {
  async function loadAssetConfig() {
    assetLibraryDirectoryLoading.value = true
    try {
      const response = await apiFetch('/api/assets/config')
      if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`)
      const result = await response.json()
      assetLibraryDirectory.value = String(result.assetDirectory || '')
      assetLibraryDirectoryDraft.value = assetLibraryDirectory.value
      assetLibraryDirectoryDefault.value = String(result.defaultAssetDirectory || '')
      assetLibraryCanPickDirectory.value = !!result.canPickDirectory
    } catch (error) {
      assetLibraryStatus.value = '素材库配置加载失败：' + String(error.message || error)
    } finally {
      assetLibraryDirectoryLoading.value = false
    }
  }

  function formatAssetSize(size) {
    const num = Number(size) || 0
    if (num < 1024) return num + ' B'
    if (num < 1024 * 1024) return (num / 1024).toFixed(1) + ' KB'
    return (num / (1024 * 1024)).toFixed(1) + ' MB'
  }

  function formatAssetTime(value) {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '-'
    return date.toLocaleString('zh-CN', { hour12: false })
  }

  function getAssetByPath(assetPath) {
    const target = String(assetPath || '')
    return assetLibrary.value.find((item) => String(item.path || '') === target) || null
  }

  async function copyAssetPath(assetPath) {
    await navigator.clipboard.writeText(String(assetPath || ''))
    parseNotice.value = `已复制素材路径：${String(assetPath || '')}`
  }

  function isEditingAsset(asset) {
    return renamingAssetPath.value && renamingAssetPath.value === String(asset?.path || '')
  }

  function startRenameAsset(asset) {
    const currentName = String(asset?.name || '').trim()
    const currentPath = String(asset?.path || '').trim()
    if (!currentName || !currentPath) return
    renamingAssetPath.value = currentPath
    renamingAssetName.value = currentName
  }

  function cancelRenameAsset() {
    renamingAssetPath.value = ''
    renamingAssetName.value = ''
    renamingAssetLoading.value = false
  }

  async function submitRenameAsset(asset) {
    const currentName = String(asset?.name || '').trim()
    const currentPath = String(asset?.path || '').trim()
    if (!currentName || !currentPath) return

    const nextName = String(renamingAssetName.value || '').trim()
    if (!nextName) {
      assetLibraryStatus.value = '重命名已取消：新名称不能为空。'
      return
    }

    renamingAssetLoading.value = true
    try {
      const response = await apiFetch('/api/assets/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: currentPath, name: nextName }),
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || `HTTP ${response.status}`)
      }

      const result = await response.json()
      const oldPath = String(result.oldPath || currentPath)
      const newPath = String(result.newPath || '')
      const oldName = String(oldPath).split('/').pop() || currentName
      const newName = String(result.newName || '').trim() || String(newPath).split('/').pop() || currentName

      for (const block of formDoc.blocks) {
        if (block.type !== 'image') continue
        const rawPath = String(block.path || '').trim()
        if (!rawPath) continue
        if (rawPath === oldName || rawPath === oldPath) block.path = newName
      }

      await loadAssetLibrary()
      parseNotice.value = `素材已重命名：${oldName} -> ${newName}`
      cancelRenameAsset()
    } catch (error) {
      assetLibraryStatus.value = '素材重命名失败：' + String(error.message || error)
    } finally {
      renamingAssetLoading.value = false
    }
  }

  async function submitRenameCurrentAsset() {
    const asset = getAssetByPath(renamingAssetPath.value)
    if (!asset) {
      assetLibraryStatus.value = '当前重命名目标不存在，请刷新素材库后重试。'
      cancelRenameAsset()
      return
    }
    await submitRenameAsset(asset)
  }

  function toggleAssetPanel() {
    assetPanelCollapsed.value = !assetPanelCollapsed.value
    if (assetPanelCollapsed.value) {
      cancelRenameAsset()
      closeAssetContextMenu?.()
    }
  }

  function triggerAssetUpload() {
    assetUploadInputRef.value?.click()
  }

  async function applyAssetDirectory(nextDirectory = assetLibraryDirectoryDraft.value) {
    const candidate = String(nextDirectory || '').trim()
    if (!candidate) {
      assetLibraryStatus.value = '素材库目录不能为空。'
      return false
    }

    assetLibraryDirectorySaving.value = true
    try {
      const response = await apiFetch('/api/assets/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetDirectory: candidate }),
      })
      if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`)
      const result = await response.json()
      assetLibraryDirectory.value = String(result.assetDirectory || candidate)
      assetLibraryDirectoryDraft.value = assetLibraryDirectory.value
      assetLibraryDirectoryDefault.value = String(result.defaultAssetDirectory || assetLibraryDirectoryDefault.value || '')
      assetLibraryCanPickDirectory.value = result.canPickDirectory ?? assetLibraryCanPickDirectory.value
      await loadAssetLibrary()
      parseNotice.value = `素材库目录已切换：${assetLibraryDirectory.value}`
      return true
    } catch (error) {
      assetLibraryStatus.value = '素材库目录设置失败：' + String(error.message || error)
      return false
    } finally {
      assetLibraryDirectorySaving.value = false
    }
  }

  async function resetAssetDirectory() {
    const fallback = String(assetLibraryDirectoryDefault.value || '').trim()
    if (!fallback) {
      assetLibraryStatus.value = '默认素材目录不可用。'
      return
    }
    assetLibraryDirectoryDraft.value = fallback
    await applyAssetDirectory(fallback)
  }

  async function pickAssetDirectory() {
    assetLibraryDirectorySaving.value = true
    try {
      const response = await apiFetch('/api/assets/pick-directory', { method: 'POST' })
      if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`)
      const result = await response.json()
      const selected = String(result.assetDirectory || '')
      if (!selected) return
      assetLibraryDirectoryDraft.value = selected
      assetLibraryDirectory.value = selected
      assetLibraryDirectoryDefault.value = String(result.defaultAssetDirectory || assetLibraryDirectoryDefault.value || '')
      assetLibraryCanPickDirectory.value = result.canPickDirectory ?? assetLibraryCanPickDirectory.value
      await loadAssetLibrary()
      parseNotice.value = `素材库目录已选择：${selected}`
    } catch (error) {
      assetLibraryStatus.value = '选择素材库目录失败：' + String(error.message || error)
    } finally {
      assetLibraryDirectorySaving.value = false
    }
  }

  async function onAssetLibraryUpload(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!String(file.type || '').startsWith('image/')) {
      assetLibraryStatus.value = '请选择图片文件。'
      return
    }

    assetLibraryLoading.value = true
    try {
      await uploadImageToAsset(file)
      await loadAssetLibrary()
      imageUploadStatus.value = `素材已上传并缓存：${file.name}`
    } catch (error) {
      assetLibraryStatus.value = '素材上传失败：' + String(error.message || error)
    } finally {
      assetLibraryLoading.value = false
    }
  }

  function insertImageBlockFromAsset(asset) {
    if (mode.value !== 'form') {
      parseNotice.value = '请先切换到填空模式，再插入素材图片。'
      return
    }
    addBlock(formDoc.blocks.length - 1, 'image', {
      path: asset.name || String(asset.path || '').split('/').pop() || '',
      caption: asset.name || '图片说明',
      width: '100%',
      autoFigure: true,
      captionPosition: 'bottom',
    })
    parseNotice.value = '已从素材库插入图片块：' + String(asset.name || '')
  }

  async function loadAssetLibrary() {
    assetLibraryLoading.value = true
    try {
      const response = await apiFetch('/api/assets/list')
      if (!response.ok) {
        const text = await response.text()
        if (response.status === 404 && text.includes('Cannot GET /api/assets/list')) {
          throw new Error('未检测到素材库接口，请启动转换服务：npm run dev:converter')
        }
        throw new Error(text || `HTTP ${response.status}`)
      }
      const result = await response.json()
      assetLibrary.value = Array.isArray(result.items) ? result.items : []
      if (result.assetDirectory) {
        assetLibraryDirectory.value = String(result.assetDirectory)
        assetLibraryDirectoryDraft.value = assetLibraryDirectory.value
      }
      if (result.defaultAssetDirectory) assetLibraryDirectoryDefault.value = String(result.defaultAssetDirectory)
      if (typeof result.canPickDirectory === 'boolean') assetLibraryCanPickDirectory.value = result.canPickDirectory
      assetLibraryStatus.value = assetLibrary.value.length
        ? `已加载 ${assetLibrary.value.length} 个素材。`
        : '素材库为空。'
    } catch (error) {
      assetLibraryStatus.value = '素材库加载失败：' + String(error.message || error)
    } finally {
      assetLibraryLoading.value = false
    }
  }

  async function onAssetMenuCopyPath() {
    const asset = getAssetByPath(assetContextMenu.path)
    if (!asset) return
    await copyAssetPath(asset.path)
    closeAssetContextMenu?.()
  }

  function onAssetMenuInsertImageBlock() {
    const asset = getAssetByPath(assetContextMenu.path)
    if (!asset) return
    insertImageBlockFromAsset(asset)
    closeAssetContextMenu?.()
  }

  function onAssetMenuRename() {
    const asset = getAssetByPath(assetContextMenu.path)
    if (!asset) return
    startRenameAsset(asset)
    closeAssetContextMenu?.()
  }

  async function onAssetMenuDelete() {
    const asset = getAssetByPath(assetContextMenu.path)
    if (!asset) return

    const sure = window.confirm(`确认删除素材“${asset.name}”？此操作不可撤销。`)
    if (!sure) return

    try {
      const response = await apiFetch('/api/assets/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: asset.path }),
      })
      if (!response.ok) {
        const text = await response.text()
        if (response.status === 404 && text.includes('Cannot POST /api/assets/delete')) {
          throw new Error('未检测到素材删除接口，请重启转换服务：npm run dev:converter')
        }
        throw new Error(text || `HTTP ${response.status}`)
      }

      const oldPath = String(asset.path || '')
      const oldName = String(asset.name || '')
      for (const block of formDoc.blocks) {
        if (block.type !== 'image') continue
        const rawPath = String(block.path || '').trim()
        if (!rawPath) continue
        if (rawPath === oldName || rawPath === oldPath) block.path = ''
      }

      if (renamingAssetPath.value === oldPath) cancelRenameAsset()
      await loadAssetLibrary()
      parseNotice.value = '素材已删除：' + oldName
    } catch (error) {
      assetLibraryStatus.value = '删除素材失败：' + String(error.message || error)
    } finally {
      closeAssetContextMenu?.()
    }
  }

  function getLinkedAssetForImageBlock(block) {
    const resolvedPath = resolveImagePathForUse(block?.path)
    if (!resolvedPath || !resolvedPath.startsWith('assets-cache/')) return null
    return getAssetByPath(resolvedPath)
  }

  function canRenameLinkedAsset(block) {
    return !!getLinkedAssetForImageBlock(block)
  }

  function isEditingLinkedAsset(block) {
    const linked = getLinkedAssetForImageBlock(block)
    if (!linked) return false
    return isEditingAsset(linked)
  }

  function startRenameLinkedAsset(block) {
    const linked = getLinkedAssetForImageBlock(block)
    if (!linked) {
      parseNotice.value = '当前图片未连接到素材库，暂不支持重命名。'
      return
    }
    startRenameAsset(linked)
  }

  async function submitRenameLinkedAsset(block) {
    const linked = getLinkedAssetForImageBlock(block)
    if (!linked) {
      assetLibraryStatus.value = '当前图片未连接到素材库，无法重命名。'
      return
    }
    await submitRenameAsset(linked)
  }

  async function onImageFileChange(event, block) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!String(file.type || '').startsWith('image/')) {
      imageUploadStatus.value = '请选择图片文件。'
      return
    }

    uploadingImageBlockId.value = block.id
    imageUploadStatus.value = `正在上传并缓存图片：${file.name}`
    try {
      const result = await uploadImageToAsset(file)
      await loadAssetLibrary()
      block.path = String(result.path || '').split('/').pop() || ''
      if (!block.caption) block.caption = file.name
      imageUploadStatus.value = `图片已缓存：${file.name}`
    } catch (error) {
      imageUploadStatus.value = `图片上传失败：${error.message}`
    } finally {
      uploadingImageBlockId.value = ''
    }
  }

  async function uploadImageToAsset(file, fileNameOverride = '') {
    const formData = new FormData()
    const fallbackName = `image-${Date.now()}.png`
    const uploadName = String(fileNameOverride || file?.name || fallbackName)
    formData.append('file', file, uploadName)

    const response = await apiFetch('/api/assets/upload-image', {
      method: 'POST',
      body: formData,
    })
    if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`)
    return await response.json()
  }

  return {
    loadAssetConfig,
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
    applyAssetDirectory,
    resetAssetDirectory,
    pickAssetDirectory,
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
  }
}
