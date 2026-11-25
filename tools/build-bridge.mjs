/**
 * Builds canon-bridge.exe - the helper that keeps a Canon camera for the panel.
 *
 * The compiler is the one that ships with .NET Framework on every Windows
 * 10/11, so nothing has to be installed: neither Visual Studio nor the .NET
 * SDK. That is also why the sources stay within C# 5.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'canon-bridge')
const out = join(source, 'bin')

if (process.platform !== 'win32') {
  console.error('canon-bridge собирается только на Windows: нужен csc.exe из .NET Framework')
  process.exit(1)
}

const csc = join(process.env.WINDIR ?? 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe')
if (!existsSync(csc)) {
  console.error(`Не найден компилятор: ${csc}`)
  process.exit(1)
}

mkdirSync(out, { recursive: true })
const files = readdirSync(source).filter((name) => name.endsWith('.cs')).map((name) => join(source, name))

const result = spawnSync(csc, [
  '/nologo',
  // Без консольного окна: помощник стартует вместе с панелью и не должен мелькать.
  '/target:winexe',
  // EDSDK.dll берётся 64-битная, процесс обязан быть таким же.
  '/platform:x64',
  '/optimize+',
  '/warn:4',
  '/r:System.Drawing.dll',
  '/r:System.Windows.Forms.dll',
  `/out:${join(out, 'canon-bridge.exe')}`,
  ...files,
], { stdio: 'inherit' })

process.exit(result.status ?? 1)
