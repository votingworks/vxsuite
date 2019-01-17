import React from 'react'
import ReactDOM from 'react-dom'
import App from './App'

import election from './data/election.json'

it('renders without crashing', () => {
  const div = document.createElement('div')
  ReactDOM.render(<App election={election} />, div)
  ReactDOM.unmountComponentAtNode(div)
})
