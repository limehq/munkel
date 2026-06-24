import { fileURLToPath } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

const srcDir = fileURLToPath(new URL('./src', import.meta.url))
const rootDir = fileURLToPath(new URL('.', import.meta.url))

const config = defineConfig(({ mode }) => {
  // DEV_ALLOWED_HOSTS (.env, gitignored): extra hostnames the dev server accepts
  // besides localhost, comma-separated — e.g. opening `bun run dev` over a
  // LAN/mDNS name. Empty/unset leaves Vite's default host check untouched.
  const allowedHosts = loadEnv(mode, rootDir, '')
    .DEV_ALLOWED_HOSTS?.split(',')
    .map((host) => host.trim())
    .filter(Boolean)

  return {
    resolve: { alias: { '@': srcDir } },
    ...(allowedHosts?.length ? { server: { allowedHosts } } : {}),
    plugins: [
      devtools(),
      cloudflare({ viteEnvironment: { name: 'ssr' } }),
      tailwindcss(),
      tanstackStart(),
      viteReact(),
    ],
  }
})

export default config
