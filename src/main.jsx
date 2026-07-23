import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './components/App'
import Aria from './components/Aria'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)
const ariaDiv = document.createElement('div')
ariaDiv.id = 'aria-root'
document.body.appendChild(ariaDiv)
ReactDOM.createRoot(ariaDiv).render(<Aria />)
