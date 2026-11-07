import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Preview-only demo mode (src/utils/demoApi.js): the whole app runs on sample data, with no API. __DEMO_PREVIEW__ is true for Vercel Preview
// builds (VERCEL_ENV=preview), or locally with DEMO_PREVIEW=1; NEVER for a production build, where the demo code is not even bundled.
const demoPreview = process.env.VERCEL_ENV !== 'production' && (process.env.VERCEL_ENV === 'preview' || process.env.DEMO_PREVIEW === '1')

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
