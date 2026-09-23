import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')

const standaloneDir = resolve(projectRoot, '.next', 'standalone')

if (!existsSync(standaloneDir)) {
  console.error('✗ .next/standalone not found. Run "next build" first.')
  process.exit(1)
}

const staticSrc = resolve(projectRoot, '.next', 'static')
const staticDest = resolve(standaloneDir, '.next', 'static')
if (existsSync(staticSrc)) {
  mkdirSync(dirname(staticDest), { recursive: true })
  cpSync(staticSrc, staticDest, { recursive: true })
  console.log('✓ Copied .next/static → .next/standalone/.next/static')
}

const publicSrc = resolve(projectRoot, 'public')
const publicDest = resolve(standaloneDir, 'public')
if (existsSync(publicSrc)) {
  cpSync(publicSrc, publicDest, { recursive: true })
  console.log('✓ Copied public → .next/standalone/public')
}

console.log('✓ Standalone bundle ready')