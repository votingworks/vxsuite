import React from 'react'
import styled from 'styled-components'

import Text from './Text'

const TestingModeContainer = styled(Text)`
  border: 0.5rem solid;
  padding: 0.5rem;
`

interface Props {
  isLiveMode: boolean
}

const TestMode = ({ isLiveMode }: Props) =>
  isLiveMode ? null : (
    <TestingModeContainer warning bold warningIcon center>
      Testing Mode
    </TestingModeContainer>
  )

export default TestMode
