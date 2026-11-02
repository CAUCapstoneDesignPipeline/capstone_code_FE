import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { THEME_BOOT_SCRIPT } from './src/lib/themeBoot.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      // 첫 그림 전에 테마를 정한다 (src/lib/themeBoot.ts)
      name: 'theme-boot',
      transformIndexHtml: () => [
        { tag: 'script', children: THEME_BOOT_SCRIPT, injectTo: 'head' },
      ],
    },
  ],
})
