/**
 * Сборка для Windows одной командой: `npm run win:pack`.
 *
 * `npm run neu:build` на Windows не работает (в нём `cp`) и кладёт в dist
 * бинарники под все системы. Здесь то же самое, но по шагам на Node, плюс
 * помощник камеры Canon, а на выходе — папка только с тем, что нужно панели:
 *
 *   dist/max-mascot-win/
 *     max-mascot-win_x64.exe, resources.neu   приложение
 *     Запуск MAX.bat, Автозапуск MAX.vbs      запуск
 *     canon/canon-bridge.exe                  помощник камеры
 *
 * Библиотек Canon (EDSDK.dll, EdsImage.dll) в сборке нет: их кладут в папку
 * canon из своего официального комплекта EDSDK.
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'dist', 'max-mascot-win')

function run(command, args) {
  // Одной строкой через оболочку: npm и npx на Windows — это .cmd, напрямую они не запускаются.
  const result = spawnSync([command, ...args].join(' '), { cwd: root, stdio: 'inherit', shell: true })
  if (result.status !== 0) {
    console.error(`Не выполнилось: ${command} ${args.join(' ')}`)
    process.exit(result.status ?? 1)
  }
}

if (!existsSync(join(root, 'bin', 'neutralino-win_x64.exe'))) {
  console.error('Нет бинарников Neutralino в bin/. Сначала: npx neu update '
    + '(после него верните public/neutralino.js: git checkout -- public/neutralino.js)')
  process.exit(1)
}

run('npm', ['run', 'build'])
run('npx', ['neu', 'build', '--release'])
run('node', ['tools/build-bridge.mjs'])

rmSync(out, { recursive: true, force: true })
mkdirSync(join(out, 'canon'), { recursive: true })

const built = join(root, 'dist', 'max-mascot')
for (const name of ['max-mascot-win_x64.exe', 'resources.neu']) copyFileSync(join(built, name), join(out, name))
for (const name of readdirSync(join(root, 'launcher'))) copyFileSync(join(root, 'launcher', name), join(out, name))
copyFileSync(join(root, 'canon-bridge', 'bin', 'canon-bridge.exe'), join(out, 'canon', 'canon-bridge.exe'))

// С BOM и CRLF: файл откроют Блокнотом на чужом компьютере.
writeFileSync(join(out, 'canon', 'Положите сюда EDSDK.dll и EdsImage.dll.txt'), '﻿' + [
  'Для съёмки зеркалкой Canon напрямую по USB в эту папку нужно положить две',
  'библиотеки из официального комплекта Canon EDSDK, обе 64-битные (x64) и из',
  'одного комплекта:',
  '',
  '    EDSDK.dll',
  '    EdsImage.dll',
  '',
  'Рядом должен лежать canon-bridge.exe. В System32 ничего копировать не нужно,',
  'регистрировать библиотеки тоже.',
  '',
  'Что происходит с камерой, пишется в файл canon-bridge.log в этой же папке.',
  '',
].join('\r\n'))

console.log(`\nГотово: ${out}`)
