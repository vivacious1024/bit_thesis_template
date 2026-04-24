<script src="./app-logic.js"></script>

<template>
  <main class="editor-shell" @contextmenu="openContextMenu" @paste="onEditorPlainTextPaste">
    <header class="topbar">
      <div class="mode-switch">
        <button class="chip" :class="{ active: mode === 'form' }" type="button" @click="switchMode('form')">填空模式</button>
        <button class="chip" :class="{ active: mode === 'typst' }" type="button" @click="switchMode('typst')">Typst 模式</button>
      </div>
      <div class="actions">
        <button class="text-btn" type="button" @click="copyTypst">复制 Typst</button>
        <button class="text-btn" type="button" @click="downloadTypst">下载 .typ</button>
      </div>
    </header>

    <div class="title-editor">
      <label for="thesis-title">论文标题（模板标题）</label>
      <input id="thesis-title" v-model="thesisTitle" class="field" placeholder="请输入论文标题" />
    </div>

    <p class="notice">当前：{{ modeLabel }}。{{ parseNotice || '已启用正文 PDF 实时预览。' }}</p>
    <p v-if="textNormalizationSummary.count > 0" class="notice notice-warning">
      检测到 {{ textNormalizationSummary.count }} 个可能导致字体回退的异常字符（例如：{{ textNormalizationSummary.samples.join('，') }}）。
      <button type="button" class="text-btn notice-btn" @click="applyTextNormalizationFix">一键规范化</button>
      <button type="button" class="text-btn notice-btn" @click="applyStrictFontUniformFix">强制统一字体</button>
    </p>
    <p class="notice" v-if="imageUploadStatus">{{ imageUploadStatus }}</p>

    <section ref="assetsPanelRef" class="panel assets-panel" :class="{ collapsed: assetPanelCollapsed }">
      <div class="assets-header">
        <h2>&#39033;&#30446;&#32032;&#26448;&#24211;</h2>
        <div class="assets-actions">
          <button type="button" class="text-btn asset-toggle-btn" @click="toggleAssetPanel">{{ assetPanelCollapsed ? '展开素材库' : '收起素材库' }}</button>
          <input v-model="assetLibraryKeyword" class="field assets-search" placeholder="&#25628;&#32034;&#32032;&#26448;&#21517;&#25110;&#36335;&#24452;" :disabled="assetPanelCollapsed" />
          <button type="button" class="text-btn" @click="triggerAssetUpload" :disabled="assetPanelCollapsed">&#19978;&#20256;&#32032;&#26448;</button>
          <button type="button" class="text-btn" :disabled="assetLibraryLoading || assetPanelCollapsed" @click="loadAssetLibrary">
            {{ assetLibraryLoading ? '加载中...' : '刷新素材库' }}
          </button>
          <input ref="assetUploadInputRef" class="assets-upload-input" type="file" accept="image/*" @change="onAssetLibraryUpload" />
        </div>
      </div>
      <div v-if="!assetPanelCollapsed" class="asset-directory-panel">
        <label class="asset-directory-label" for="asset-directory-input">素材库存储路径</label>
        <div class="asset-directory-row">
          <input
            id="asset-directory-input"
            v-model="assetLibraryDirectoryDraft"
            class="field asset-directory-input"
            placeholder="请输入本地文件夹路径，例如 D:\\bit-write-assets"
            :disabled="assetLibraryDirectoryLoading || assetLibraryDirectorySaving"
            @keyup.enter="applyAssetDirectory"
          />
          <button
            type="button"
            class="text-btn"
            :disabled="assetLibraryDirectoryLoading || assetLibraryDirectorySaving || !assetLibraryCanPickDirectory"
            @click="pickAssetDirectory"
          >
            选择文件夹
          </button>
          <button
            type="button"
            class="text-btn"
            :disabled="assetLibraryDirectoryLoading || assetLibraryDirectorySaving"
            @click="applyAssetDirectory"
          >
            {{ assetLibraryDirectorySaving ? '保存中...' : '保存路径' }}
          </button>
          <button
            type="button"
            class="text-btn"
            :disabled="assetLibraryDirectoryLoading || assetLibraryDirectorySaving || !assetLibraryDirectoryDefault"
            @click="resetAssetDirectory"
          >
            恢复默认
          </button>
        </div>
        <p class="meta asset-directory-meta">当前目录：{{ assetLibraryDirectory || '未加载' }}</p>
      </div>
      <p class="meta assets-summary">{{ assetPanelCollapsed ? `素材 ${assetLibrary.length} 项（已收起）` : assetLibraryStatus }}</p>
      <div v-if="!assetPanelCollapsed && renamingAssetPath" class="asset-rename-external">
        <p class="asset-rename-title">重命名素材：{{ renamingAssetPath }}</p>
        <div class="asset-rename-row asset-rename-external-row">
          <input
            v-model="renamingAssetName"
            class="field asset-rename-input asset-rename-input-external"
            placeholder="请输入新文件名，例如 图1.png"
            @keyup.enter="submitRenameCurrentAsset"
            @keyup.esc="cancelRenameAsset"
          />
          <button type="button" class="text-btn asset-mini-btn" :disabled="renamingAssetLoading" @click="submitRenameCurrentAsset">
            {{ renamingAssetLoading ? '保存中' : '保存' }}
          </button>
          <button type="button" class="text-btn asset-mini-btn" :disabled="renamingAssetLoading" @click="cancelRenameAsset">取消</button>
        </div>
      </div>
      <div v-if="!assetPanelCollapsed" class="assets-content">
        <div v-if="filteredAssetLibrary.length" class="assets-grid">
          <article
            v-for="asset in filteredAssetLibrary"
            :key="asset.path"
            class="asset-card"
            @contextmenu.stop.prevent="(event) => openAssetContextMenu(event, asset)"
          >
            <img :src="asset.url" :alt="asset.name" class="asset-thumb" />
            <div class="asset-title-row">
              <p class="asset-name">{{ asset.name }}</p>
            </div>
            <p class="asset-meta">{{ formatAssetSize(asset.size) }} &middot; {{ formatAssetTime(asset.updatedAt) }}</p>
            <p class="asset-path">{{ asset.path }}</p>
            <p class="asset-hint">右键可操作</p>
          </article>
        </div>
        <div v-else class="preview-empty assets-empty" @click="triggerAssetUpload">&#26242;&#26080;&#53305;&#37197;&#32032;&#26448;&#65292;&#28857;&#20987;&#27492;&#22788;&#21487;&#30452;&#25509;&#19978;&#20256;&#24182;&#32531;&#23384;&#12290;</div>
      </div>
    </section>

    <section class="workspace editor-preview-workspace">
      <article class="panel">
        <h2>正文编辑</h2>
        <div v-if="mode === 'form'" ref="formEditorRef" class="form-editor">
          <div
            v-for="(block, index) in formDoc.blocks"
            :key="block.id"
            :ref="(el) => setBlockRef(block.id, el)"
            class="block"
            :class="{
              'dragging-block': draggingBlockId === block.id,
              'drag-over-before': draggingBlockId && dragInsertIndex === index,
            }"
            :data-block-index="index"
            @dragover="(event) => onBlockDragOver(event, index)"
            @drop="(event) => onBlockDrop(event, index)"
          >
            <div class="block-title">
              <div class="block-title-left">
                <button
                  type="button"
                  class="drag-handle"
                  draggable="true"
                  title="拖拽调整顺序"
                  @dragstart="(event) => onBlockDragStart(event, index)"
                  @dragend="onBlockDragEnd"
                >
                  ☰
                </button>
                <span>{{ blockTypeText(block.type) }}</span>
              </div>
              <div class="block-title-actions">
                <button
                  v-if="block.type === 'text'"
                  type="button"
                  class="text-btn paragraph-toggle-btn"
                  @click="toggleParagraphExpanded(block)"
                >
                  {{ isParagraphExpanded(block) ? '折叠' : '展开全文' }}
                </button>
                <button
                  v-if="block.type !== 'typst'"
                  type="button"
                  class="text-btn paragraph-toggle-btn"
                  @click="convertBlockToTypst(index)"
                >
                  转为 Typst
                </button>
                <button
                  v-if="block.type === 'typst'"
                  type="button"
                  class="text-btn paragraph-toggle-btn"
                  @click="convertTypstBlockToStructured(index)"
                >
                  转为结构化
                </button>
                <button type="button" class="danger" @click="removeBlock(index)">删除</button>
              </div>
            </div>

            <template v-if="block.type === 'text'">
              <textarea
                v-model="block.text"
                class="textarea"
                :rows="getParagraphRows(block)"
                :class="{ 'textarea-expanded': isParagraphExpanded(block) }"
                placeholder="输入文本内容..."
                @keydown="(event) => onParagraphKeydown(event, block, index)"
                @paste="(event) => onParagraphPaste(event, block, index)"
                @focus="(event) => onParagraphFocus(event, block)"
                @click="(event) => onFormCursorActivity(event, block)"
                @keyup="(event) => onFormCursorActivity(event, block)"
                @input="(event) => onParagraphInput(event, block)"
              />
            </template>

            <template v-else-if="block.type === 'typst'">
              <textarea
                v-model="block.code"
                class="textarea source"
                rows="8"
                placeholder="在此直接编辑当前卡片对应的 Typst 源码..."
                @click="(event) => onFormCursorActivity(event, block)"
                @keyup="(event) => onFormCursorActivity(event, block)"
                @input="(event) => onFormCursorActivity(event, block)"
              />
            </template>

            <template v-else-if="block.type === 'heading'">
              <div class="row">
                <select
                  v-model.number="block.level"
                  class="field small"
                  @change="(event) => onFormCursorActivity(event, block)"
                >
                  <option :value="1">一级标题</option>
                  <option :value="2">二级标题</option>
                  <option :value="3">三级标题</option>
                  <option :value="4">四级标题</option>
                </select>
                <input
                  v-model="block.text"
                  class="field"
                  placeholder="标题内容"
                  @click="(event) => onFormCursorActivity(event, block)"
                  @keyup="(event) => onFormCursorActivity(event, block)"
                  @input="(event) => onFormCursorActivity(event, block)"
                />
              </div>
            </template>

            <template v-else-if="block.type === 'image'">
              <div class="column">
                <div class="image-path-row">
                  <input
                    v-model="block.path"
                    class="field image-path-input"
                    placeholder="图片名称或路径，例如 xxx.png"
                    @click="(event) => onFormCursorActivity(event, block)"
                    @keyup="(event) => onFormCursorActivity(event, block)"
                    @input="(event) => onFormCursorActivity(event, block)"
                  />
                  <button
                    type="button"
                    class="text-btn image-rename-btn"
                    :disabled="!canRenameLinkedAsset(block) || renamingAssetLoading"
                    :title="canRenameLinkedAsset(block) ? '重命名素材库图片（同步更新卡片）' : '当前图片未连接素材库，无法重命名'"
                    @click="startRenameLinkedAsset(block)"
                  >
                    ✎
                  </button>
                </div>
                <div v-if="isEditingLinkedAsset(block)" class="asset-rename-row">
                  <input
                    v-model="renamingAssetName"
                    class="field asset-rename-input"
                    placeholder="请输入新文件名"
                    @keyup.enter="submitRenameLinkedAsset(block)"
                    @keyup.esc="cancelRenameAsset"
                  />
                  <button
                    type="button"
                    class="text-btn asset-mini-btn"
                    :disabled="renamingAssetLoading"
                    @click="submitRenameLinkedAsset(block)"
                  >
                    {{ renamingAssetLoading ? '保存中' : '保存' }}
                  </button>
                  <button
                    type="button"
                    class="text-btn asset-mini-btn"
                    :disabled="renamingAssetLoading"
                    @click="cancelRenameAsset"
                  >
                    取消
                  </button>
                </div>
                <input
                  v-model="block.caption"
                  class="field"
                  placeholder="图片说明"
                  @click="(event) => onFormCursorActivity(event, block)"
                  @keyup="(event) => onFormCursorActivity(event, block)"
                  @input="(event) => onFormCursorActivity(event, block)"
                />
                <input
                  v-model="block.width"
                  class="field"
                  placeholder="宽度，例如 100% 或 12cm"
                  @click="(event) => onFormCursorActivity(event, block)"
                  @keyup="(event) => onFormCursorActivity(event, block)"
                  @input="(event) => onFormCursorActivity(event, block)"
                />
                <label class="check-row">
                  <input
                    v-model="block.autoFigure"
                    type="checkbox"
                    @change="(event) => onFormCursorActivity(event, block)"
                  />
                  <span>使用自动编号（图 + 序号）</span>
                </label>
                <div class="row">
                  <select
                    v-model="block.captionPosition"
                    class="field small"
                    @change="(event) => onFormCursorActivity(event, block)"
                  >
                    <option value="bottom">题注在下方</option>
                    <option value="top">题注在上方</option>
                  </select>
                  <p class="meta inline-meta">默认使用自动编号；关闭后可在“图片说明”中手动填写编号。</p>
                </div>
                <label class="upload-label image-upload">
                  <span>上传本地图片并缓存（推荐）</span>
                  <input type="file" accept="image/*" @change="(event) => onImageFileChange(event, block)" />
                </label>
                <p class="meta" v-if="uploadingImageBlockId === block.id">图片上传中...</p>
                <img v-if="imagePreviewUrl(block.path)" :src="imagePreviewUrl(block.path)" alt="图片预览" class="image-preview" />
              </div>
            </template>

            <template v-else-if="block.type === 'equation'">
              <textarea
                v-model="block.text"
                class="textarea"
                rows="3"
                placeholder="输入公式，例如 sum_(i=1)^n i = n(n+1)/2"
                @click="(event) => onFormCursorActivity(event, block)"
                @keyup="(event) => onFormCursorActivity(event, block)"
                @input="(event) => onFormCursorActivity(event, block)"
              />
            </template>

            <template v-else-if="block.type === 'table'">
              <div class="column">
                <input
                  v-model="block.caption"
                  class="field"
                  placeholder="表题，例如 实验结果对比"
                  @click="(event) => onFormCursorActivity(event, block)"
                  @keyup="(event) => onFormCursorActivity(event, block)"
                  @input="(event) => onFormCursorActivity(event, block)"
                />
                <input
                  v-model.number="block.columns"
                  class="field"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="列数"
                  @click="(event) => onFormCursorActivity(event, block)"
                  @keyup="(event) => onFormCursorActivity(event, block)"
                  @input="(event) => onFormCursorActivity(event, block)"
                />
                <textarea
                  v-model="block.headersText"
                  class="textarea"
                  rows="2"
                  placeholder="表头，用 | 分隔，例如 项目|方法A|方法B"
                  @click="(event) => onFormCursorActivity(event, block)"
                  @keyup="(event) => onFormCursorActivity(event, block)"
                  @input="(event) => onFormCursorActivity(event, block)"
                />
                <textarea
                  v-model="block.rowsText"
                  class="textarea"
                  rows="4"
                  placeholder="每行一条记录，列用 | 分隔，例如\n准确率|90|92\n召回率|88|91"
                  @click="(event) => onFormCursorActivity(event, block)"
                  @keyup="(event) => onFormCursorActivity(event, block)"
                  @input="(event) => onFormCursorActivity(event, block)"
                />
                <label class="check-row">
                  <input
                    v-model="block.autoFigure"
                    type="checkbox"
                    @change="(event) => onFormCursorActivity(event, block)"
                  />
                  <span>使用自动编号（表 + 序号）</span>
                </label>
                <div class="row">
                  <select
                    v-model="block.captionPosition"
                    class="field small"
                    @change="(event) => onFormCursorActivity(event, block)"
                  >
                    <option value="top">题注在上方</option>
                    <option value="bottom">题注在下方</option>
                  </select>
                  <p class="meta inline-meta">默认使用自动编号；关闭后可在“表题”中手动填写编号。</p>
                </div>
                <p class="hint">默认生成三线表：上/下线 1.5pt，表头下线 0.75pt。</p>
              </div>
            </template>
          </div>
          <div
            v-if="draggingBlockId"
            class="block-drop-end"
            :class="{ active: dragInsertIndex === formDoc.blocks.length }"
            @dragover="onBlockDragOverEnd"
            @drop="onBlockDropEnd"
          >
            拖到此处可移动到末尾
          </div>
        </div>

        <div v-else class="typst-editor">
          <textarea
            ref="typstEditorRef"
            v-model="typstSource"
            class="textarea source"
            rows="30"
            placeholder="直接粘贴或编辑 Typst 源码..."
            @click="onTypstCursorActivity"
            @keyup="onTypstCursorActivity"
            @input="onTypstCursorActivity"
          />
        </div>
      </article>

      <article class="panel preview-panel" :style="{ '--preview-sticky-top': `${previewStickyTop}px` }">
        <div class="preview-header">
          <h2>正文 PDF 实时预览</h2>
          <div class="preview-header-actions">
            <div class="mode-switch preview-scale-switch">
              <button
                type="button"
                class="chip"
                :class="{ active: previewScaleMode === 'width' }"
                @click="setPreviewScaleMode('width')"
              >
                适应宽度
              </button>
              <button
                type="button"
                class="chip"
                :class="{ active: previewScaleMode === 'page' }"
                @click="setPreviewScaleMode('page')"
              >
                整页
              </button>
            </div>
            <button type="button" class="text-btn" :disabled="isRenderingPreview" @click="renderBodyPdfPreview">
              {{ isRenderingPreview ? '渲染中...' : '立即刷新' }}
            </button>
          </div>
        </div>

        <p class="meta">{{ previewStatus }}（定位页：{{ previewLocationPage }} / {{ previewPageCount }}）</p>

        <div v-if="renderedBodyPdfBytes" ref="previewContainerRef" class="preview-scroll" @scroll="onPreviewScroll">
          <div class="preview-page preview-page-strip" @click="onPreviewPageClick">
            <canvas ref="previewSingleCanvasRef" class="preview-page-canvas preview-strip-canvas" />
          </div>
        </div>
        <div v-else class="preview-empty">暂无可预览的正文 PDF，请检查 Typst 渲染服务状态。</div>
      </article>
    </section>

    <section class="workspace merge-workspace">
      <article class="panel">
        <h2>封面导入</h2>
        <label class="upload-label">
          <span>上传封面（仅 .pdf）</span>
          <input type="file" accept=".pdf,application/pdf" @change="onCoverFileChange" />
        </label>
        <p class="meta">已选文件：{{ coverFileName || '无' }}</p>
        <p class="meta">状态：{{ coverStatus }}</p>
        <button type="button" class="text-btn" @click="clearCover">清空封面</button>
      </article>

      <article class="panel">
        <h2>正文 PDF 与最终导出</h2>
        <label class="upload-label">
          <span>上传正文 PDF（可选，上传后优先使用）</span>
          <input type="file" accept=".pdf,application/pdf" @change="onBodyPdfChange" />
        </label>
        <p class="meta">已选文件：{{ bodyPdfFileName || '无（使用实时渲染结果）' }}</p>
        <p class="meta">状态：{{ bodyStatus }}</p>

        <div class="actions merge-actions">
          <button type="button" class="text-btn" @click="clearBodyPdf">清空正文 PDF</button>
          <button type="button" class="text-btn" :disabled="isMerging" @click="exportBodyPdfOnly">仅导出正文 PDF</button>
          <button type="button" class="chip active" :disabled="isMerging" @click="mergeCoverAndBody">
            {{ isMerging ? '处理中...' : '一键导出 PDF（有封面则合并）' }}
          </button>
        </div>

        <p class="meta" v-if="mergeStatus">{{ mergeStatus }}</p>
      </article>
    </section>

    <div
      v-if="contextMenu.visible"
      ref="contextMenuRef"
      class="context-menu form-context-menu"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      @mouseenter="cancelHideInsertSubmenu"
      @mouseleave="scheduleHideInsertSubmenu"
      @click.stop
    >
      <template v-if="mode === 'form'">
        <button v-if="contextMenu.canInsertAtCaret" type="button" @click="pasteFromClipboardAtCaret">粘贴到光标处</button>

        <div
          class="insert-group"
          @mouseenter="(event) => openInsertSubmenu('after', event)"
          @mouseleave="scheduleHideInsertSubmenu"
        >
          <button type="button" class="insert-group-trigger">在后方插入...</button>
          <div
            v-show="activeInsertSubmenu === 'after'"
            ref="insertSubmenuAfterRef"
            class="insert-submenu"
            :style="insertSubmenuStyles.after"
            @mouseenter="cancelHideInsertSubmenu"
            @mouseleave="scheduleHideInsertSubmenu"
          >
            <button type="button" @click="insertFromMenu('text')">文本模块</button>
            <button type="button" @click="insertFromMenu('heading', { level: 1, text: '一级标题' })">一级标题</button>
            <button type="button" @click="insertFromMenu('heading', { level: 2, text: '二级标题' })">二级标题</button>
            <button type="button" @click="insertFromMenu('heading', { level: 3, text: '三级标题' })">三级标题</button>
            <button type="button" @click="insertFromMenu('image')">图片（空白卡片）</button>
            <div
              class="context-image-item"
              @mouseenter="(event) => openAssetPreviewSubmenu('after', event)"
              @mouseleave="scheduleHideAssetPreviewSubmenu"
            >
              <button type="button">图片（素材库预览插入）</button>
              <div
                v-show="activeAssetPreviewMenu === 'after'"
                ref="assetPreviewAfterRef"
                class="context-image-submenu"
                :style="assetPreviewStyles.after"
                @mouseenter="cancelHideAssetPreviewSubmenu"
                @mouseleave="scheduleHideAssetPreviewSubmenu"
              >
                <div v-if="assetLibrary.length" class="context-image-grid">
                  <button
                    v-for="asset in assetLibrary.slice(0, 30)"
                    :key="`after-${asset.path}`"
                    type="button"
                    class="context-image-option"
                    @click.stop="insertImageFromContextAsset(asset)"
                  >
                    <img :src="asset.url" :alt="asset.name" class="context-image-thumb" />
                    <span class="context-image-name">{{ asset.name }}</span>
                  </button>
                </div>
                <p v-else class="context-image-empty">素材库为空，请先上传图片。</p>
              </div>
            </div>
            <button type="button" @click="insertFromMenu('equation')">公式</button>
            <button type="button" @click="insertFromMenu('table')">三线表</button>
          </div>
        </div>

        <div
          class="insert-group"
          v-if="contextMenu.canInsertAtCaret"
          @mouseenter="(event) => openInsertSubmenu('caret', event)"
          @mouseleave="scheduleHideInsertSubmenu"
        >
          <button type="button" class="insert-group-trigger">在光标处插入...</button>
          <div
            v-show="activeInsertSubmenu === 'caret'"
            ref="insertSubmenuCaretRef"
            class="insert-submenu"
            :style="insertSubmenuStyles.caret"
            @mouseenter="cancelHideInsertSubmenu"
            @mouseleave="scheduleHideInsertSubmenu"
          >
            <button type="button" @click="insertFromMenuAtCaret('text')">文本模块</button>
            <button type="button" @click="insertFromMenuAtCaret('heading', { level: 1, text: '一级标题' })">一级标题</button>
            <button type="button" @click="insertFromMenuAtCaret('heading', { level: 2, text: '二级标题' })">二级标题</button>
            <button type="button" @click="insertFromMenuAtCaret('heading', { level: 3, text: '三级标题' })">三级标题</button>
            <button type="button" @click="insertFromMenuAtCaret('image')">图片（空白卡片）</button>
            <div
              class="context-image-item"
              @mouseenter="(event) => openAssetPreviewSubmenu('caret', event)"
              @mouseleave="scheduleHideAssetPreviewSubmenu"
            >
              <button type="button">图片（素材库预览插入）</button>
              <div
                v-show="activeAssetPreviewMenu === 'caret'"
                ref="assetPreviewCaretRef"
                class="context-image-submenu"
                :style="assetPreviewStyles.caret"
                @mouseenter="cancelHideAssetPreviewSubmenu"
                @mouseleave="scheduleHideAssetPreviewSubmenu"
              >
                <div v-if="assetLibrary.length" class="context-image-grid">
                  <button
                    v-for="asset in assetLibrary.slice(0, 30)"
                    :key="`caret-${asset.path}`"
                    type="button"
                    class="context-image-option"
                    @click.stop="insertImageFromContextAsset(asset)"
                  >
                    <img :src="asset.url" :alt="asset.name" class="context-image-thumb" />
                    <span class="context-image-name">{{ asset.name }}</span>
                  </button>
                </div>
                <p v-else class="context-image-empty">素材库为空，请先上传图片。</p>
              </div>
            </div>
            <button type="button" @click="insertFromMenuAtCaret('equation')">公式</button>
            <button type="button" @click="insertFromMenuAtCaret('table')">三线表</button>
          </div>
        </div>

        <div
          class="insert-group"
          v-if="contextMenu.canInsertAtCaret && contextMenu.selectedText && contextMenu.selectedText.trim().length > 0"
          @mouseenter="(event) => openInsertSubmenu('selection-heading', event)"
          @mouseleave="scheduleHideInsertSubmenu"
        >
          <button type="button" class="insert-group-trigger">选中文本设为标题...</button>
          <div
            v-show="activeInsertSubmenu === 'selection-heading'"
            ref="insertSubmenuSelectionRef"
            class="insert-submenu"
            :style="insertSubmenuStyles.selection"
            @mouseenter="cancelHideInsertSubmenu"
            @mouseleave="scheduleHideInsertSubmenu"
          >
            <button type="button" @click="convertSelectionToHeading(1)">设为一级标题</button>
            <button type="button" @click="convertSelectionToHeading(2)">设为二级标题</button>
            <button type="button" @click="convertSelectionToHeading(3)">设为三级标题</button>
          </div>
        </div>
      </template>

      <template v-else-if="mode === 'typst'">
        <div
          class="insert-group"
          @mouseenter="(event) => openInsertSubmenu('typst-after', event)"
          @mouseleave="scheduleHideInsertSubmenu"
        >
          <button type="button" class="insert-group-trigger">在后方插入...</button>
          <div
            v-show="activeInsertSubmenu === 'typst-after'"
            ref="insertSubmenuTypstAfterRef"
            class="insert-submenu"
            :style="insertSubmenuStyles.typstAfter"
            @mouseenter="cancelHideInsertSubmenu"
            @mouseleave="scheduleHideInsertSubmenu"
          >
            <button type="button" @click="insertTypstFromMenu('text', { text: '新文本模块' }, false)">文本模块</button>
            <button type="button" @click="insertTypstFromMenu('heading', { level: 1, text: '一级标题' }, false)">一级标题</button>
            <button type="button" @click="insertTypstFromMenu('heading', { level: 2, text: '二级标题' }, false)">二级标题</button>
            <button type="button" @click="insertTypstFromMenu('heading', { level: 3, text: '三级标题' }, false)">三级标题</button>
            <button type="button" @click="insertTypstFromMenu('image', {}, false)">图片（空白卡片）</button>
            <div
              class="context-image-item"
              @mouseenter="(event) => openAssetPreviewSubmenu('typst-after', event)"
              @mouseleave="scheduleHideAssetPreviewSubmenu"
            >
              <button type="button">图片（素材库预览插入）</button>
              <div
                v-show="activeAssetPreviewMenu === 'typst-after'"
                ref="assetPreviewTypstAfterRef"
                class="context-image-submenu"
                :style="assetPreviewStyles.typstAfter"
                @mouseenter="cancelHideAssetPreviewSubmenu"
                @mouseleave="scheduleHideAssetPreviewSubmenu"
              >
                <div v-if="assetLibrary.length" class="context-image-grid">
                  <button
                    v-for="asset in assetLibrary.slice(0, 30)"
                    :key="`typst-after-${asset.path}`"
                    type="button"
                    class="context-image-option"
                    @click.stop="insertTypstImageFromAsset(asset, false)"
                  >
                    <img :src="asset.url" :alt="asset.name" class="context-image-thumb" />
                    <span class="context-image-name">{{ asset.name }}</span>
                  </button>
                </div>
                <p v-else class="context-image-empty">素材库为空，请先上传图片。</p>
              </div>
            </div>
            <button type="button" @click="insertTypstFromMenu('equation', {}, false)">公式</button>
            <button type="button" @click="insertTypstFromMenu('table', {}, false)">三线表</button>
          </div>
        </div>

        <div
          class="insert-group"
          @mouseenter="(event) => openInsertSubmenu('typst-caret', event)"
          @mouseleave="scheduleHideInsertSubmenu"
        >
          <button type="button" class="insert-group-trigger">在光标处插入...</button>
          <div
            v-show="activeInsertSubmenu === 'typst-caret'"
            ref="insertSubmenuTypstCaretRef"
            class="insert-submenu"
            :style="insertSubmenuStyles.typstCaret"
            @mouseenter="cancelHideInsertSubmenu"
            @mouseleave="scheduleHideInsertSubmenu"
          >
            <button type="button" @click="insertTypstFromMenu('text', { text: '新文本模块' }, true)">文本模块</button>
            <button type="button" @click="insertTypstFromMenu('heading', { level: 1, text: '一级标题' }, true)">一级标题</button>
            <button type="button" @click="insertTypstFromMenu('heading', { level: 2, text: '二级标题' }, true)">二级标题</button>
            <button type="button" @click="insertTypstFromMenu('heading', { level: 3, text: '三级标题' }, true)">三级标题</button>
            <button type="button" @click="insertTypstFromMenu('image', {}, true)">图片（空白卡片）</button>
            <div
              class="context-image-item"
              @mouseenter="(event) => openAssetPreviewSubmenu('typst-caret', event)"
              @mouseleave="scheduleHideAssetPreviewSubmenu"
            >
              <button type="button">图片（素材库预览插入）</button>
              <div
                v-show="activeAssetPreviewMenu === 'typst-caret'"
                ref="assetPreviewTypstCaretRef"
                class="context-image-submenu"
                :style="assetPreviewStyles.typstCaret"
                @mouseenter="cancelHideAssetPreviewSubmenu"
                @mouseleave="scheduleHideAssetPreviewSubmenu"
              >
                <div v-if="assetLibrary.length" class="context-image-grid">
                  <button
                    v-for="asset in assetLibrary.slice(0, 30)"
                    :key="`typst-caret-${asset.path}`"
                    type="button"
                    class="context-image-option"
                    @click.stop="insertTypstImageFromAsset(asset, true)"
                  >
                    <img :src="asset.url" :alt="asset.name" class="context-image-thumb" />
                    <span class="context-image-name">{{ asset.name }}</span>
                  </button>
                </div>
                <p v-else class="context-image-empty">素材库为空，请先上传图片。</p>
              </div>
            </div>
            <button type="button" @click="insertTypstFromMenu('equation', {}, true)">公式</button>
            <button type="button" @click="insertTypstFromMenu('table', {}, true)">三线表</button>
          </div>
        </div>
      </template>
    </div>

    <div
      v-if="assetContextMenu.visible"
      class="context-menu asset-context-menu"
      :style="{ left: `${assetContextMenu.x}px`, top: `${assetContextMenu.y}px` }"
      @click.stop
    >
      <button type="button" @click="onAssetMenuInsertImageBlock">插入图片块</button>
      <button type="button" @click="onAssetMenuCopyPath">复制路径</button>
      <button type="button" @click="onAssetMenuRename">重命名</button>
      <button type="button" class="danger" @click="onAssetMenuDelete">删除素材</button>
    </div>
  </main>
</template>







