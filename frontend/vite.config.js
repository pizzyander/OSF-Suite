import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

// tanstackRouter MUST come before react() in the plugins array — it
// generates routeTree.gen.ts from src/routes/ at build/dev time, which
// react() then compiles. Wrong order = stale or missing route tree.
export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory: './src/routes',
      generatedRouteTree: './src/routeTree.gen.ts',
    }),
    react(),
  ],
})
