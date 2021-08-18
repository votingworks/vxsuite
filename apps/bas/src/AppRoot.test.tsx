import { MemoryCard, MemoryHardware } from '@votingworks/utils'
import React from 'react'
import ReactDOM from 'react-dom'
import AppRoot from './AppRoot'

it('renders without crashing', () => {
  const card = new MemoryCard()
  const hardware = new MemoryHardware()
  const div = document.createElement('div')
  ReactDOM.render(<AppRoot card={card} hardware={hardware} />, div)
  ReactDOM.unmountComponentAtNode(div)
})
