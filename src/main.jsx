import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import Aria from './Aria'
import './index.css'
import { migrateLegacyKeys } from './utils/migrateLegacyKeys'

// One-time migration: renames bare localStorage keys to ts360_ prefix.
// Runs before render so every component sees namespaced keys on first paint.
// Idempotent — subsequent runs are no-ops once the guard flag is set.
//
// LIFECYCLE: Remove this call (and the import above) 90 days after first deploy.
// Removal criteria and steps are documented in src/utils/migrateLegacyKeys.js.
// Tracking: open GitHub issue "Remove migrateLegacyKeys" with 90-day due date.
migrateLegacyKeys()

ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)
const ariaDiv = document.createElement('div')
ariaDiv.id = 'aria-root'
document.body.appendChild(ariaDiv)
ReactDOM.createRoot(ariaDiv).render(<Aria />)
