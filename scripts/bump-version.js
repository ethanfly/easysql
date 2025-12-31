#!/usr/bin/env node
/**
 * 版本号自动递增脚本
 * 用法：
 *   node scripts/bump-version.js          # 递增补丁版本 (patch): 1.0.0 -> 1.0.1
 *   node scripts/bump-version.js minor    # 递增次版本 (minor): 1.0.0 -> 1.1.0
 *   node scripts/bump-version.js major    # 递增主版本 (major): 1.0.0 -> 2.0.0
 *   node scripts/bump-version.js 2.1.0    # 设置指定版本
 */

import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const packagePath = join(__dirname, '..', 'package.json')
const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'))

const currentVersion = pkg.version
const [major, minor, patch] = currentVersion.split('.').map(Number)

const arg = process.argv[2] || 'patch'
let newVersion

if (/^\d+\.\d+\.\d+$/.test(arg)) {
  // 直接指定版本号
  newVersion = arg
} else {
  switch (arg) {
    case 'major':
      newVersion = `${major + 1}.0.0`
      break
    case 'minor':
      newVersion = `${major}.${minor + 1}.0`
      break
    case 'patch':
    default:
      newVersion = `${major}.${minor}.${patch + 1}`
      break
  }
}

pkg.version = newVersion
writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n')

console.log(`\x1b[32m✓ 版本号已更新: ${currentVersion} -> ${newVersion}\x1b[0m`)
