# bit-write

`bit-write` 是一个基于 `Typst` 模板的轻量离线写作工具，提供图形化界面，适合进行便捷的论文/报告编辑、预览与导出。

当前项目已经支持桌面应用打包，核心特性包括：

- 填空式结构化编辑与 Typst 源码编辑双向切换
- 正文实时渲染预览
- 封面 PDF 上传
- 图片素材库管理
- 封面 PDF 与正文 PDF 合并导出
- Electron 桌面应用打包
- 内置 `Typst`，目标电脑无需额外安装运行环境

## 项目结构

下面是仓库中主要文件夹和文件的作用：

- `src/`
  前端界面源码，基于 Vue。
- `src/components/`
  页面组件。
- `src/composables/`
  业务逻辑拆分，包含编辑、预览、素材库、生命周期等功能。
- `src/utils/`
  前端工具函数，例如 API 地址封装。
- `server/`
  本地服务端代码，负责 Typst 渲染、素材上传、素材目录管理等。
- `electron/`
  Electron 桌面壳代码。
  `main.cjs` 负责启动窗口和本地服务，`preload.cjs` 负责桌面侧桥接。
- `resources/`
  项目内置资源文件。
  当前包含 Typst 模板文件和 CSL 引用样式文件，保证仓库可自包含构建。
- `vendor/`
  随项目分发的第三方运行时资源。
  当前主要是内置的 `Typst` 可执行文件。
- `build/icons/`
  应用图标源文件和打包所需的 `.ico` / `.png` 图标。
- `scripts/`
  辅助脚本。
  当前包含图标生成脚本。
- `docs/`
  项目补充文档。
  `FEATURE_CHECKLIST.md` 是功能清单，`ARCHITECTURE.md` 是架构说明。
- `public/`
  前端静态资源目录。
- `dist/`
  前端构建产物。
  这是运行桌面版前端页面时会被 Electron 加载的内容。
- `dist-electron/`
  桌面应用打包产物目录。
  包含安装包和 `win-unpacked` 免安装目录。
- `.cache/`
  本地开发时的缓存目录。
  不建议提交到 GitHub。
- `package.json`
  项目依赖、脚本和 Electron Builder 打包配置。
- `vite.config.js`
  Vite 前端构建配置。
- `electron-builder-hooks.cjs`
  Electron Builder 打包后的处理钩子，目前用于补充 exe 图标。

## 运行方式

### 1. 前端 + 本地服务开发模式

适合调试前端和服务端逻辑。

终端 A：

```bash
npm run dev:converter
```

终端 B：

```bash
npm run dev:web
```

### 2. 桌面应用开发模式

适合调试 Electron 桌面壳。

```bash
npm run desktop:dev
```

### 3. 构建前端

```bash
npm run build
```

### 4. 构建桌面安装包

```bash
npm run desktop:build
```

构建完成后，安装包默认输出到：

```text
dist-electron/
```

## 常用脚本

- `npm run dev`
  启动前端开发服务器。
- `npm run dev:web`
  启动前端开发服务器。
- `npm run dev:converter`
  启动本地渲染服务。
- `npm run dev:all`
  并发启动前端和本地服务。
- `npm run electron:dev`
  启动 Electron 开发模式。
- `npm run desktop:dev`
  并发启动前端和 Electron。
- `npm run build`
  构建前端。
- `npm run preview`
  预览前端构建结果。
- `npm run desktop:build`
  构建桌面应用安装包。

## 打包说明

当前桌面版基于 `Electron + Electron Builder`。

已完成的打包能力：

- Windows 安装包构建
- 安装时可选择安装路径
- 自动创建桌面快捷方式
- 内置 Typst 可执行文件
- 自定义应用图标

默认打包产物：

- `dist-electron/bit-write Setup x.y.z.exe`
  Windows 安装包
- `dist-electron/win-unpacked/`
  Windows 免安装目录

## 本地数据与素材库

桌面版运行时会把应用数据放到系统用户目录中，而不是项目源码目录中。

素材库支持：

- 上传图片
- 重命名
- 删除
- 自定义素材库存储路径

开发模式下，如果没有显式传入桌面环境数据目录，服务端会回退到项目内 `.cache/`。

## 上传 GitHub 前建议

建议不要提交以下内容：

- `node_modules/`
- `dist/`
- `dist-electron/`
- `.cache/`

当前 `.gitignore` 已经处理了这些常见产物。

如果你要把这个项目单独上传为一个独立仓库，当前结构已经可以自包含构建，不再依赖仓库外层目录的模板和 CSL 文件。

## 相关文档

- [功能清单](./docs/FEATURE_CHECKLIST.md)
- [架构说明](./docs/ARCHITECTURE.md)
