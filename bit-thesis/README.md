# bit-thesis

## 当前最小可用功能
- 正文编辑：填空模式 / Typst 模式双向切换
- 正文预览：实时渲染 Typst 到 PDF（右侧并排预览）
- 封面上传：仅支持 PDF
- 图片上传：本地图片上传后缓存到 `.cache/images`，正文可直接引用
- 成果导出：封面 PDF + 正文 PDF 一键合并导出

## 功能清单
- 详细功能总清单见：`docs/FEATURE_CHECKLIST.md`
- 代码架构说明见：`docs/ARCHITECTURE.md`

## 本地调试（推荐双终端）
终端 A：
```bash
npm run dev:converter
```

终端 B：
```bash
npm run dev
```

## 脚本说明
- `npm run dev`：启动前端（Vite）
- `npm run dev:converter`：启动本地渲染服务（Typst -> PDF）
- `npm run dev:all`：并发启动前后端（受限环境可能出现 `spawn EPERM`）
- `npm run build`：前端打包
- `npm run preview`：预览打包结果

## 环境变量
- `COVER_CONVERTER_PORT`：本地渲染服务端口（默认 `8787`）
- `VITE_API_TARGET`：前端代理目标（默认 `http://localhost:8787`）

当你修改服务端口时，可这样启动前端：

```bash
VITE_API_TARGET=http://localhost:9000 npm run dev
```

Windows PowerShell：

```powershell
$env:VITE_API_TARGET = "http://localhost:9000"
npm run dev
```

## 快速自检
```powershell
Invoke-RestMethod http://localhost:8787/health
```
返回 `ok: true` 说明服务正常。

## 常见问题
1. `/api/body/render-typst` 报错或预览为空
请确认 `npm run dev:converter` 已启动，且系统可执行 `typst --version`。

2. 前端出现 `ECONNREFUSED`
说明前端代理不到后端服务。检查 `COVER_CONVERTER_PORT` 与 `VITE_API_TARGET` 是否一致。

3. `spawn EPERM`
在受限环境下，请改用双终端分别启动，不要使用并发脚本。
