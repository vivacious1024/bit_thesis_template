# 代码架构说明（bit-write）

## 1. 目标

- 保持界面行为稳定
- 将业务逻辑从模板层剥离，降低单文件复杂度
- 便于对编辑、预览、素材库、导出、桌面打包做独立维护

## 2. 当前结构

```text
src/
  App.vue
  app-logic.js
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
    api.js
    text-normalization.js

server/
  cover-convert-server.mjs

electron/
  main.cjs
  preload.cjs
```

## 3. 模块职责

- `useBlockOps`
  负责结构化卡片与 Typst 源码的双向转换，以及图片 / 表格 Typst 生成。
- `useContextMenus`
  负责右键菜单、子菜单定位、菜单显示与隐藏。
- `useBlockInsertActions`
  负责在后方 / 光标处插入内容、选中文本转标题、粘贴拆卡与图文混合粘贴。
- `useAssets`
  负责素材库加载、上传、重命名、删除、目录切换以及与图片卡片联动。
- `useFormBlocksUi`
  负责文本卡片展开 / 折叠、自适应高度与拖拽排序交互。
- `useTypstInsert`
  负责 Typst 模式下的片段插入和素材图片插入。
- `usePreviewRender`
  负责 Typst -> PDF 渲染、PDF 加载、长图绘制与缩放切换。
- `useCursorSync`
  负责编辑区与 PDF 预览区的定位联动。
- `usePreviewSticky`
  负责预览区 sticky 偏移计算。
- `useAppLifecycle`
  负责全局事件绑定、初始化与统一清理。
- `useExportActions`
  负责封面 / 正文 PDF 读取与最终导出合并。
- `useTextNormalization`
  负责纯文本粘贴、异常字符检测、规范化与强制统一字体修复。

## 4. 数据流

1. 填空模式编辑
   通过 `useBlockOps.buildFormTypstResult` 生成 Typst 文本。
2. Typst 文本变化
   通过 `usePreviewRender.renderBodyPdfPreview` 渲染正文 PDF。
3. 光标移动或预览点击
   通过 `useCursorSync` 完成双向定位。
4. 图片上传与素材缓存
   通过 `useAssets` 统一进入素材库，再由图片卡片引用。
5. 最终导出
   通过 `useExportActions` 选择正文 PDF、合并封面并导出。

## 5. 桌面层

- `electron/main.cjs`
  启动 Electron 主进程、创建窗口，并拉起本地渲染服务。
- `electron/preload.cjs`
  预留桌面桥接层。
- `server/cover-convert-server.mjs`
  提供 Typst 渲染、素材库管理、目录选择等本地接口。

## 6. 维护原则

- 优先把新增能力放进对应 composable，不直接堆到 `app-logic.js`
- 尽量保持 composable 单一职责
- 模板层尽量只保留视图结构与事件绑定
- 每次重构后至少执行一次 `npm run build`
