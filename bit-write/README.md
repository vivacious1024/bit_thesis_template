# bit-write

`bit-write` is an offline Typst writing tool with a structured editing UI, live PDF preview, local asset library, and Windows desktop packaging.

## Core Features

- Structured form mode and raw Typst mode with two-way switching
- Real-time Typst-to-PDF body preview
- Cover PDF upload
- Local image asset library with upload, rename, delete, and custom storage directory
- Export body PDF only, or merge cover PDF with body PDF
- Electron desktop packaging for Windows
- Bundled Typst runtime and template resources

## Project Structure

- `src/`
  Frontend source code built with Vue.
- `src/composables/`
  Main business logic modules for editing, preview, assets, export, and lifecycle handling.
- `src/utils/`
  Shared frontend helpers such as API URL handling and text normalization.
- `server/`
  Local service for Typst rendering and asset library APIs.
- `electron/`
  Electron main/preload process code for the desktop app.
- `resources/`
  Bundled template and CSL resources used by rendering.
- `vendor/`
  Third-party runtime assets bundled with the app, including `Typst`.
- `build/icons/`
  App icon source files used for packaging.
- `build/installer.nsh`
  NSIS installer customization for shortcut/icon behavior.
- `scripts/`
  Helper scripts such as icon generation.
- `docs/`
  Supplementary documentation:
  `FEATURE_CHECKLIST.md` and `ARCHITECTURE.md`
- `public/`
  Static frontend assets.
- `dist/`
  Frontend build output.
- `dist-electron/`
  Desktop packaging output.
- `.cache/`
  Local development cache. Do not commit this directory.

## Development

Terminal A:

```bash
npm run dev:converter
```

Terminal B:

```bash
npm run dev:web
```

Desktop development:

```bash
npm run desktop:dev
```

Frontend build:

```bash
npm run build
```

Desktop installer build:

```bash
npm run desktop:build
```

## Scripts

- `npm run dev`
  Start the frontend dev server.
- `npm run dev:web`
  Start the frontend dev server.
- `npm run dev:converter`
  Start the local Typst render service.
- `npm run dev:all`
  Start frontend and backend together.
- `npm run electron:dev`
  Start Electron in development mode.
- `npm run desktop:dev`
  Start frontend and Electron together.
- `npm run build`
  Build the frontend.
- `npm run preview`
  Preview the built frontend.
- `npm run desktop:build`
  Build the Windows desktop installer.

## Packaging Notes

The desktop app is built with `Electron + electron-builder`.

Current packaging capabilities:

- Windows installer build
- User-selectable installation path
- Desktop and Start Menu shortcuts
- Custom shortcut icon
- Bundled Typst runtime

Default packaging output:

- `dist-electron/bit-write Setup x.y.z.exe`
- `dist-electron/win-unpacked/`

## Runtime Data

The desktop app stores runtime data under the system user directory instead of the repo.

Typical data includes:

- app logs
- asset library configuration
- uploaded image assets
- cached runtime files

## Before Uploading To GitHub

Do not commit:

- `node_modules/`
- `dist/`
- `dist-electron/`
- `.cache/`

## Documents

- [Feature Checklist](./docs/FEATURE_CHECKLIST.md)
- [Architecture](./docs/ARCHITECTURE.md)
