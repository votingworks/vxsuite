import React from 'react'
import ReactDOM from 'react-dom'
import App from './App'

it('renders without crashing', () => {
  const div = document.createElement('div')
  ReactDOM.render(<App election={undefined} />, div)
  ReactDOM.unmountComponentAtNode(div)
})
