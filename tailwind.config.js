/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 简约浅色科技主题 - Clean Light
        light: {
          // 背景层次 - 从白到浅灰
          bg: '#ffffff',           // 主背景白色
          surface: '#f8fafc',      // 表面浅灰
          elevated: '#f1f5f9',     // 浮起层
          muted: '#e2e8f0',        // 静音背景
          hover: '#f1f5f9',        // 悬停
          active: '#e2e8f0',       // 激活
        },
        // 边框颜色
        border: {
          light: '#f1f5f9',
          default: '#e2e8f0',
          strong: '#cbd5e1',
        },
        // 主色调 - 现代蓝
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',         // 主色
          600: '#2563eb',
          700: '#1d4ed8',
        },
        // 成功绿
        success: {
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#22c55e',
          600: '#16a34a',
        },
        // 警告橙
        warning: {
          50: '#fffbeb',
          100: '#fef3c7',
          500: '#f59e0b',
          600: '#d97706',
        },
        // 错误红
        danger: {
          50: '#fef2f2',
          100: '#fee2e2',
          500: '#ef4444',
          600: '#dc2626',
        },
        // 信息紫
        info: {
          50: '#faf5ff',
          100: '#f3e8ff',
          500: '#a855f7',
          600: '#9333ea',
        },
        // 青色 - 数据库/表
        teal: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          500: '#14b8a6',
          600: '#0d9488',
        },
        // 数据库品牌色
        db: {
          mysql: '#00758f',
          postgresql: '#336791',
          sqlite: '#003b57',
          sqlserver: '#cc2927',
          mongodb: '#47a248',
          redis: '#dc382d',
          mariadb: '#003545',
        },
        // 文字颜色 - 加深以提高可读性
        text: {
          primary: '#0f172a',      // 深色主文字
          secondary: '#334155',    // 次要文字 (加深)
          tertiary: '#475569',     // 第三级文字 (加深)
          muted: '#64748b',        // 静音文字 (加深)
          disabled: '#94a3b8',     // 禁用文字
          inverse: '#ffffff',      // 反色文字
        },
      },
      fontFamily: {
        sans: ['Inter', 'SF Pro Display', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Consolas', 'monospace'],
      },
      boxShadow: {
        // 现代阴影系统
        'xs': '0 1px 2px rgba(0, 0, 0, 0.03)',
        'sm': '0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.03)',
        'md': '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
        'lg': '0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.03)',
        'xl': '0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 10px 10px -5px rgba(0, 0, 0, 0.02)',
        // 卡片阴影
        'card': '0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)',
        'card-hover': '0 4px 12px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04)',
        // 按钮阴影
        'btn': '0 1px 2px rgba(59, 130, 246, 0.1), 0 1px 3px rgba(59, 130, 246, 0.08)',
        'btn-hover': '0 4px 12px rgba(59, 130, 246, 0.2), 0 2px 4px rgba(59, 130, 246, 0.1)',
        // 弹窗阴影
        'modal': '0 25px 50px -12px rgba(0, 0, 0, 0.12)',
        // 输入框聚焦
        'focus': '0 0 0 3px rgba(59, 130, 246, 0.15)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.25s ease-out',
        'slide-down': 'slideDown 0.25s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'spin-slow': 'spin 1.5s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
}
