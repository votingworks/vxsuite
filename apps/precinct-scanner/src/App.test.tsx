import React from 'react'
import { render } from '@testing-library/react'
import App from './App'

test('app can load with local storage', () => {
  const { getByText } = render(<App />)
  getByText('Precinct Scanner is Not Configured')
})
