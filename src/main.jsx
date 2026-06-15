import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import Aria from './Aria'
import './index.css'
import { migrateLegacyKeys } from './utils/migrateLegacyKeys'

// One-time migration of legacy bare localStorage keys to the ts360_ prefix (audit C-4).
// Runs before render so every component sees the namespaced keys on first paint.
migrateLegacyKeys()

ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)
const ariaDiv=document.createElement('div')
ariaDiv.id='aria-root'
document.body.appendChild(ariaDiv)
ReactDOM.createRoot(ariaDiv).render(<Aria />)
