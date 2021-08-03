import React from 'react'
import ReactDOM from 'react-dom'
import App from './App'
import PreviewApp from './PreviewApp'
import * as serviceWorker from './serviceWorker'

ReactDOM.render(
  <React.StrictMode>
    {process.env.NODE_ENV === 'development' &&
    window.location.pathname.startsWith('/preview') ? (
      <PreviewApp />
    ) : (
      <App />
    )}
  </React.StrictMode>,
  document.getElementById('root')
)

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister()
