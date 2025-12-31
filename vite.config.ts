import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { readFileSync } from 'fs'

// 从 package.json 读取版本号
const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'))
const appVersion = packageJson.version

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  define: {
    // 注入版本号到应用
    __APP_VERSION__: JSON.stringify(appVersion)
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    target: 'chrome105',
    minify: 'esbuild',
    sourcemap: false,
  },
  // Electron 需要的配置
  base: './'
})
