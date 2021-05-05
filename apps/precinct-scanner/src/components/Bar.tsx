import styled from 'styled-components'
import { Theme } from '@votingworks/ui'

interface Props {
  theme?: Theme
}

export const Bar = styled.div<Props>`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  background: ${({ theme: { background } }) => background};
  padding: 0.5rem 0.75rem;
  color: ${({ theme: { color } }) => color};
`
