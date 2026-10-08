/*
 * Заворачивает собранный бинарник Neutralino в настоящий .app-бандл.
 *
 * Зачем. `neu build` отдаёт голый исполняемый файл, а macOS выдаёт доступ
 * к камере и микрофону только приложению с бандлом: ей нужен
 * CFBundleIdentifier, чтобы запомнить решение, и NSCameraUsageDescription,
 * чтобы объяснить человеку, зачем спрашиваем. У голого бинарника ни того,
 * ни другого нет — система молча отказывает, и камера просто не находится.
 *
 * Подпись ad-hoc (`codesign -s -`): без неё бандл считается «сломанным»
 * и запрос разрешения не показывается вовсе. Она не для распространения,
 * а ровно для того, чтобы приложение можно было проверить на своей машине.
 *
 *   node tools/mac-app.mjs
 */
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const APP_NAME = process.env.APP_NAME ?? "MAX"
const BUNDLE_ID = process.env.BUNDLE_ID ?? 'tech.alavenir.max.mascot'
const BIN = process.env.BIN ?? 'dist/max-mascot/max-mascot-mac_arm64'
const RESOURCES = process.env.RESOURCES ?? 'dist/max-mascot/resources.neu'
const OUT = process.env.OUT ?? `dist/${APP_NAME}.app`

for (const file of [BIN, RESOURCES]) {
  if (!existsSync(file)) {
    console.error(`нет файла ${file} — сначала npm run neu:build`)
    process.exit(1)
  }
}

const macos = join(OUT, 'Contents', 'MacOS')
rmSync(OUT, { recursive: true, force: true })
mkdirSync(macos, { recursive: true })

const exe = BIN.split('/').pop()
cpSync(BIN, join(macos, exe))
// resources.neu Neutralino ищет рядом с исполняемым файлом, а не в корне бандла.
cpSync(RESOURCES, join(macos, 'resources.neu'))

writeFileSync(join(OUT, 'Contents', 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>${APP_NAME}</string>
  <key>CFBundleDisplayName</key><string>${APP_NAME}</string>
  <key>CFBundleIdentifier</key><string>${BUNDLE_ID}</string>
  <key>CFBundleExecutable</key><string>${exe}</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleVersion</key><string>1.0.0</string>
  <key>CFBundleShortVersionString</key><string>1.0.0</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSCameraUsageDescription</key><string>Камера нужна, чтобы снять кадр для маскота.</string>
  <key>NSMicrophoneUsageDescription</key><string>Микрофон не используется.</string>
</dict>
</plist>
`)

execFileSync('codesign', ['--force', '--deep', '--sign', '-', OUT], { stdio: 'inherit' })
console.log(`готово: ${OUT}`)
console.log('Первый запуск спросит доступ к камере. Если не спросил — System Settings → Privacy & Security → Camera.')
