import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Относительные пути — чтобы этот же билд без правок открывался
  // из file:// внутри Neutralino.
  base: './',
  build: {
    // Собираем в web/, а не в dist/: dist занят сборкой Neutralino, и держать
    // их вместе нельзя — приложение упаковывало бы предыдущую свою сборку
    // в собственные ресурсы, разрастаясь с каждым разом.
    outDir: 'web',
    assetsInlineLimit: 0,
  },
  server: {
    host: true,
    port: 5173,
  },
})
