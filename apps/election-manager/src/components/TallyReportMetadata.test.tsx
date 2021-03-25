import React from 'react'
import { render } from '@testing-library/react'
import MockDate from 'mockdate'

import { electionWithMsEitherNeither } from '@votingworks/fixtures'

import TallyReportMetadata from './TallyReportMetadata'

beforeEach(() => {
  MockDate.set(new Date('2020-11-03T22:22:00'))
})

afterEach(() => {
  MockDate.reset()
})

test('Renders report metadata', () => {
  const { getByText } = render(
    <TallyReportMetadata
      election={electionWithMsEitherNeither}
      generatedAtTime={new Date()}
    />
  )
  getByText(/Wednesday, August 26, 2020/)
  getByText(/Choctaw County/)
  getByText(/State of Mississippi/)
  getByText(
    /This report was created on Tuesday, November 3, 2020, 10:22:00 PM PST/
  )
})
