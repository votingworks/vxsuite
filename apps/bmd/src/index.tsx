import 'abortcontroller-polyfill/dist/polyfill-patch-fetch'
import React from 'react'
import ReactDOM from 'react-dom'
import App from './App'
import SampleApp from './SampleApp'

import * as serviceWorker from './serviceWorker'

ReactDOM.render(
  window.location.hash === '#sample' ? <SampleApp /> : <App />,
  document.getElementById('root')!
)

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: http://bit.ly/CRA-PWA
serviceWorker.unregister()
