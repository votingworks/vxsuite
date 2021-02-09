import fetchMock from 'fetch-mock'
import React from 'react'
import { render } from '@testing-library/react'
import { act } from 'react-dom/test-utils'

import { BrowserRouter, Route } from 'react-router-dom'

// import { electionSample } from '@votingworks/fixtures'
import AppRoot, { AppStorage } from './AppRoot'
import { MemoryStorage } from './utils/Storage'

beforeEach(() => {
  fetchMock.get(/^\/convert/, {})
})

test('renders without crashing', async () => {
  await act(async () => {
    const storage = new MemoryStorage<AppStorage>()
    render(
      <BrowserRouter>
        <Route
          path="/"
          render={(props) => <AppRoot storage={storage} {...props} />}
        />
      </BrowserRouter>
    )
  })
})
