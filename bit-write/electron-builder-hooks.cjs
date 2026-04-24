const path = require('node:path')
const { execFileSync } = require('node:child_process')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return

  const exeName = `${context.packager.appInfo.productFilename}.exe`
  const executablePath = path.join(context.appOutDir, exeName)
  const iconPath = path.join(context.packager.projectDir, 'build', 'icons', 'icon.ico')
  const rceditPath = path.join(
    context.packager.projectDir,
    'node_modules',
    'electron-winstaller',
    'vendor',
    'rcedit.exe',
  )

  execFileSync(rceditPath, [executablePath, '--set-icon', iconPath], {
    stdio: 'inherit',
  })
}
