import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Which API a build talks to. The committed client/.env.local, and a "Production and Preview" VITE_API_URL in the Vercel project, point at the
// PRODUCTION API. A variable that already exists in the process (set in Vercel) wins over any .env file. A Preview build is therefore steered like this:
//   Preview + its own VITE_API_URL (a branch-specific Preview variable) -> real preview backend (isolated test database); the demo mode is off
//   Preview without it, or with the PRODUCTION API address              -> demo mode (src/utils/demoApi.js): sample data in memory, no API at all
//   production / local build                                            -> unchanged (.env.local as before); the demo code is not even bundled
// A Preview build can never talk to the production API, whatever the variables say.
const PRODUCTION_API_HOST = 'crm-server-w6ye.onrender.com'
const isPreview = process.env.VERCEL_ENV === 'preview'
let previewApi = isPreview ? (process.env.VITE_API_URL || '').trim() : ''
if (previewApi.includes(PRODUCTION_API_HOST)) {
    console.warn('[vite.config] Preview build: VITE_API_URL is the PRODUCTION API, ignored; this preview runs in demo mode. Set a branch-specific Preview VITE_API_URL for a real preview backend.')
    previewApi = ''
}
// __DEMO_PREVIEW__: true for a Preview build without its own API, or locally with DEMO_PREVIEW=1; NEVER for a production build
const demoPreview = process.env.VERCEL_ENV !== 'production' && ((isPreview && !previewApi) || process.env.DEMO_PREVIEW === '1')

// https://vitejs.dev/config/
export default defineConfig({
    define: { __DEMO_PREVIEW__: JSON.stringify(demoPreview) },
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        proxy: {
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
                secure: false
            }
        }
    }
})
