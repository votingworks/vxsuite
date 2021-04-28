import React from 'react'
import styled from 'styled-components'

import { ProgressEllipsis } from '@votingworks/ui'
import Prose from './Prose'

const Fullscreen = styled.div`
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
`

interface Props {
  children?: string | string[]
  isFullscreen?: boolean
  as?: keyof JSX.IntrinsicElements
}

const Loading: React.FC<Props> = ({
  as = 'h1',
  children = 'Loading',
  isFullscreen = false,
}: Props) => {
  const content = (
    <Prose>
      {/* FIXME: Workaround for https://github.com/jamesmfriedman/rmwc/issues/501 */}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <ProgressEllipsis as={as as any} aria-label={`${children}.`}>
        {children}
      </ProgressEllipsis>
    </Prose>
  )
  if (isFullscreen) {
    return <Fullscreen>{content}</Fullscreen>
  }
  return content
}

export default Loading
