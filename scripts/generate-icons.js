/**
 * 图标生成脚本
 * 
 * 使用方法：
 * 1. 安装依赖：npm install sharp png-to-ico --save-dev
 * 2. 运行脚本：node scripts/generate-icons.js
 * 
 * 或者使用在线工具：
 * - https://convertio.co/svg-png/
 * - https://cloudconvert.com/svg-to-ico
 * - https://www.aconvert.com/icon/svg-to-icns/
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function generateIcons() {
  try {
    // 动态导入 sharp（可能未安装）
    const sharp = (await import('sharp')).default
    
    const svgPath = path.join(__dirname, '../public/icon.svg')
    const publicDir = path.join(__dirname, '../public')
    
    if (!fs.existsSync(svgPath)) {
      console.error('❌ 未找到 public/icon.svg')
      return
    }
    
    const svgBuffer = fs.readFileSync(svgPath)
    
    // 生成不同尺寸的 PNG
    const sizes = [16, 32, 48, 64, 128, 256, 512, 1024]
    
    console.log('🎨 开始生成图标...\n')
    
    for (const size of sizes) {
      const outputPath = path.join(publicDir, `icon-${size}.png`)
      await sharp(svgBuffer)
        .resize(size, size)
        .png()
        .toFile(outputPath)
      console.log(`✅ 生成 icon-${size}.png`)
    }
    
    // 生成主图标 (256x256)
    const mainIconPath = path.join(publicDir, 'icon.png')
    await sharp(svgBuffer)
      .resize(256, 256)
      .png()
      .toFile(mainIconPath)
    console.log('✅ 生成 icon.png (256x256)')
    
    // 尝试生成 ICO 文件
    try {
      const pngToIco = (await import('png-to-ico')).default
      const pngBuffer = await sharp(svgBuffer)
        .resize(256, 256)
        .png()
        .toBuffer()
      
      const icoBuffer = await pngToIco(pngBuffer)
      fs.writeFileSync(path.join(publicDir, 'icon.ico'), icoBuffer)
      console.log('✅ 生成 icon.ico')
    } catch (e) {
      console.log('⚠️  未能生成 ICO 文件，请安装 png-to-ico: npm install png-to-ico --save-dev')
    }
    
    console.log('\n🎉 图标生成完成！')
    console.log('\n📝 注意：macOS 的 .icns 文件需要使用其他工具生成：')
    console.log('   - 使用 iconutil (macOS 自带)')
    console.log('   - 或在线转换：https://cloudconvert.com/png-to-icns')
    
  } catch (e) {
    if (e.code === 'ERR_MODULE_NOT_FOUND') {
      console.log('❌ 缺少依赖，请先安装：')
      console.log('   npm install sharp png-to-ico --save-dev')
      console.log('\n📝 或者使用在线工具转换 public/icon.svg：')
      console.log('   - PNG: https://convertio.co/svg-png/')
      console.log('   - ICO: https://convertio.co/png-ico/')
      console.log('   - ICNS: https://cloudconvert.com/png-to-icns/')
    } else {
      console.error('❌ 错误:', e.message)
    }
  }
}

generateIcons()
