import React from 'react'
import { Prose, Text } from '@votingworks/ui'
import { BottomBar } from './AbsoluteElements'

const ElectionInfoBar: React.FC = () => (
  <BottomBar>
    <Prose maxWidth={false}>
      <Text noWrap>
        <strong>General Election</strong> — Tuesday, Nov 8, 2020 — Town Hall
        Precinct, Franklin County, State of Hamilton
      </Text>
    </Prose>
    <Prose maxWidth={false}>
      <p>
        Election ID: <strong>6RK8NWD34K</strong>
      </p>
    </Prose>
  </BottomBar>
)

export default ElectionInfoBar
