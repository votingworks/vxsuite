import React from 'react'

import { Prose, Text, contrastTheme, NoWrap } from '@votingworks/ui'
import { Bar, BarSpacer } from './Bar'

export type InfoBarMode = 'voter' | 'pollworker' | 'admin'

interface Props {
  mode?: InfoBarMode
}

const ElectionInfoBar: React.FC<Props> = ({ mode = 'voter' }) => (
  <Bar theme={{ ...contrastTheme.dark }}>
    <Prose maxWidth={false} compact>
      <NoWrap as="strong">2020 Republican Primary Election</NoWrap> —{' '}
      <NoWrap>Tuesday, Nov 8, 2020</NoWrap>
      <Text as="div" small>
        <NoWrap>Town Hall Precinct</NoWrap> —{' '}
        <NoWrap>Franklin County, State of Hamilton</NoWrap>
      </Text>
    </Prose>
    <BarSpacer />
    {mode !== 'voter' && (
      <React.Fragment>
        <Prose maxWidth={false} compact textRight>
          <Text as="div" small>
            Software Version
          </Text>
          <strong>2020-05-05-JS6D8K3N</strong>
        </Prose>
        <Prose maxWidth={false} compact textRight>
          <Text as="div" small>
            Machine ID
          </Text>
          <strong>057</strong>
        </Prose>
      </React.Fragment>
    )}
    <Prose maxWidth={false} compact textRight>
      <Text as="div" small>
        Election ID
      </Text>
      <strong>6RK8NWD34K</strong>
    </Prose>
  </Bar>
)

export default ElectionInfoBar
