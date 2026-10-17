import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
 
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [
    react({
      babel: {
        plugins: [],
      },
    }),
  ],
  optimizeDeps: {
    include: [
      'framer-motion',
      '@xyflow/react',
      'zustand',
      'lucide-react',
      'axios',
      'clsx',
      'react-router-dom',
    ],
  },
})