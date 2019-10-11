import React, { PointerEventHandler } from 'react'
import styled from 'styled-components'

import Button from './Button'

const Keyboard = styled.div`
  & div {
    display: flex;
    &:nth-child(2) {
      margin-right: 0;
      margin-left: 0.25rem;
      @media (min-width: 480px) {
        margin-right: 0;
        margin-left: 0.5rem;
      }
    }
    &:nth-child(3) {
      margin-right: 0.25rem;
      margin-left: 0.5rem;
      @media (min-width: 480px) {
        margin-right: 0.5rem;
        margin-left: 1rem;
      }
    }
  }
  & button {
    flex: 1;
    margin: 4px;
    box-sizing: content-box;
    background: #ffffff;
    padding: 2vw 0;
    white-space: nowrap;
    color: #000000;
    @media (min-width: 480px) {
      min-width: 1rem;
    }
    @media (min-width: 850px) {
      padding: 0.75rem 0;
    }
  }
`

interface Props {
  onKeyPress: PointerEventHandler
}

const VirtualKeyboard = ({ onKeyPress }: Props) => (
  <Keyboard data-testid="virtual-keyboard">
    {[
      ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
      ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', "'", '"'],
      ['Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '-'],
      ['space', '⌫ delete'],
    ].map(row => {
      return (
        <div key={`row-${row.join()}`}>
          {row.map(key => (
            <Button
              key={key}
              data-key={key}
              aria-label={key.toLowerCase()}
              onPress={onKeyPress}
            >
              {key}
            </Button>
          ))}
        </div>
      )
    })}
  </Keyboard>
)

export default VirtualKeyboard
