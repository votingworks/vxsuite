import React from 'react'
import { Prose, Text, contrastTheme } from '@votingworks/ui'
import { Absolute } from './Absolute'
import { Bar } from './Bar'

const ElectionInfoBar: React.FC = () => (
  <Absolute right bottom left>
    <Bar theme={{ ...contrastTheme.dark }}>
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
    </Bar>
  </Absolute>
)

export default ElectionInfoBar
