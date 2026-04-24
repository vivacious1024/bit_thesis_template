# 代码架构说明（bit-thesis）

## 1. 目标
- 保持 UI 不变、功能不减、行为一致。
- 将 `App.vue` 保持为纯模板壳。
- 将业务逻辑拆分到独立 composables，降低单文件复杂度与回归风险。

## 2. 当前结构
```text
src/
  App.vue                 # 仅模板
  app-logic.js            # 组合与装配层（主入口）
  composables/
    index.js
    useAppLifecycle.js
    useAssets.js
    useBlockInsertActions.js
    useBlockOps.js
    useContextMenus.js
    useCursorSync.js
    useExportActions.js
    useFormBlocksUi.js
    usePreviewRender.js
    usePreviewSticky.js
    useTextNormalization.js
    useTypstInsert.js
  utils/
    text-normalization.js
```

## 3. 模块职责
- `useBlockOps`：结构化卡片与 Typst 源码双向转换、三线表/图片 Typst 生成。
- `useContextMenus`：右键菜单、子菜单定位、菜单显示/隐藏与事件收拢。
- `useBlockInsertActions`：在后方/光标处插入、选中文本转标题、粘贴拆卡与图文粘贴逻辑。
- `useAssets`：素材库加载、上传、重命名、删除、素材与图片卡片联动。
- `useFormBlocksUi`：文本卡片展开/折叠、自适应高度、拖拽排序。
- `useTypstInsert`：Typst 模式插入片段、素材图片插入。
- `usePreviewRender`：Typst -> PDF 渲染、PDF 加载、长图绘制、缩放切换、渲染清理。
- `useCursorSync`：编辑光标与预览定位联动、预览点击反向定位、句子锚点匹配。
- `usePreviewSticky`：预览区 sticky 顶部偏移计算与调度。
- `useAppLifecycle`：全局事件绑定、素材库初始化、统一清理逻辑。
- `useExportActions`：封面/正文 PDF 读取与最终导出（含合并）。
- `useTextNormalization`：纯文本粘贴、异常字符检测、规范化与强制统一处理。

## 4. 数据流（简化）
1. 填空模式编辑 -> `useBlockOps.buildFormTypstResult` -> 生成 Typst。
2. Typst 源码变化 -> `usePreviewRender.renderBodyPdfPreview` -> 右侧 PDF 长图。
3. 光标变化 / 预览点击 -> `useCursorSync` 双向定位。
4. 图片上传与缓存 -> `useAssets` -> 卡片仅写素材名，运行时解析为路径。
5. 导出时 -> `useExportActions` 合并封面与正文或仅导出正文。

## 5. 维护原则
- 新功能优先新增 composable，不直接在 `app-logic.js` 堆叠实现。
- 保持 composable 单一职责，避免跨模块互相写状态。
- UI 事件名保持稳定，优先在 composable 内部重构而非改模板绑定。
- 每轮重构必须执行 `npm run build` 回归。

