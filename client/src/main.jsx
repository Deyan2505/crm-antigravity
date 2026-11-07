import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/main.css'
import './styles/hub.css'
import './styles/shell-mobile.css'

// Dark is the default; the light theme (chosen in Settings) must apply on every page from the first paint, not only in Settings.
try { if (localStorage.getItem('crm_theme') === 'light') document.body.className = 'light-theme'; } catch { /* storage unavailable */ }

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)
