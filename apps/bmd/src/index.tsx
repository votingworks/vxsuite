import React from 'react'
import ReactDOM from 'react-dom'
import App from './App'

import 'normalize.css'
import './index.css'

// TODO: Load election from localStorage. https://github.com/votingworks/bmd/issues/24
import * as serviceWorker from './serviceWorker'

ReactDOM.render(<App election={undefined} />, document.getElementById(
  'root'
) as HTMLElement)

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: http://bit.ly/CRA-PWA
serviceWorker.unregister()
