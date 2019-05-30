import React from 'react'

import Text from './Text'

interface Props {
  isLiveMode: boolean
}

const TestMode = ({ isLiveMode }: Props) =>
  isLiveMode ? null : ( // eslint-disable-line no-null/no-null
    <Text error warningIcon>
      WARNING: Testing Mode
    </Text>
  )

export default TestMode
