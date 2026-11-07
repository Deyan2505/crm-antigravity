import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Which API a build talks to. The committed client/.env.local points at the PRODUCTION API, and a variable that already exists in the process
// (set in the Vercel project) wins over any .env file, so a Preview build is steered like this:
//   Preview + its own VITE_API_URL   -> real preview backend (isolated test database); the demo mode is off
//   Preview without VITE_API_URL     -> demo mode (src/utils/demoApi.js): sample data in memory, no API at all
//   Preview + the PRODUCTION API URL -> the build FAILS (a preview must never write to production)
//   production / local build         -> unchanged (.env.local as before); the demo code is not even bundled
const PRODUCTION_API_HOST = 'crm-server-w6ye.onrender.com'
const isPreview = process.env.VERCEL_ENV === 'preview'
const previewApi = isPreview ? (process.env.VITE_API_URL || '').trim() : ''
if (previewApi.includes(PRODUCTION_API_HOST)) throw new Error('A Vercel Preview build must never point at the production API (VITE_API_URL)')
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
