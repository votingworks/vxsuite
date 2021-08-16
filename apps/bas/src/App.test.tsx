import { MemoryCard } from '@votingworks/utils'
import React from 'react'
import ReactDOM from 'react-dom'
import App from './App'

it('renders without crashing', () => {
  const card = new MemoryCard()
  const div = document.createElement('div')
  ReactDOM.render(<App card={card} />, div)
  ReactDOM.unmountComponentAtNode(div)
})
