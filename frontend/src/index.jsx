
// Location: mixview/frontend/src/index.jsx
// Description: Main entry point for React application

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'  // Changed from './App.js' to './App.jsx'
import './App.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)