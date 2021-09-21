import React, { useCallback, useEffect, useRef } from 'react'
import styled from 'styled-components'
import { Button } from './Button'

export const NumberPadContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  > button {
    margin: 2px;
    width: 26%;
  }
`

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
export interface NumberPadProps {
  onButtonPress: (buttonValue: number) => void
  onBackspace: () => void
  onClear: () => void
}

export const NumberPad = ({
  onButtonPress,
  onBackspace,
  onClear,
}: NumberPadProps): JSX.Element => {
  const container = useRef<HTMLDivElement>(null)
  const onKeyPress: React.KeyboardEventHandler = useCallback(
    (event) => {
      if (DIGITS.includes(event.key)) {
        onButtonPress(Number(event.key))
      } else if (event.key === 'x') {
        onClear()
      }
    },
    [onButtonPress, onClear]
  )
  const onKeyDown: React.KeyboardEventHandler = useCallback(
    (event) => {
      if (event.key === 'Backspace') {
        onBackspace()
      }
    },
    [onBackspace]
  )

  useEffect(() => {
    container.current?.focus()
  }, [])

  return (
    <NumberPadContainer
      tabIndex={0}
      ref={container}
      onKeyPress={onKeyPress}
      onKeyDown={onKeyDown}
    >
      <Button onPress={useCallback(() => onButtonPress(1), [onButtonPress])}>
        1
      </Button>
      <Button onPress={useCallback(() => onButtonPress(2), [onButtonPress])}>
        2
      </Button>
      <Button onPress={useCallback(() => onButtonPress(3), [onButtonPress])}>
        3
      </Button>
      <Button onPress={useCallback(() => onButtonPress(4), [onButtonPress])}>
        4
      </Button>
      <Button onPress={useCallback(() => onButtonPress(5), [onButtonPress])}>
        5
      </Button>
      <Button onPress={useCallback(() => onButtonPress(6), [onButtonPress])}>
        6
      </Button>
      <Button onPress={useCallback(() => onButtonPress(7), [onButtonPress])}>
        7
      </Button>
      <Button onPress={useCallback(() => onButtonPress(8), [onButtonPress])}>
        8
      </Button>
      <Button onPress={useCallback(() => onButtonPress(9), [onButtonPress])}>
        9
      </Button>
      <Button onPress={onClear}>
        <span role="img" aria-label="clear">
          ✖
        </span>
      </Button>
      <Button onPress={useCallback(() => onButtonPress(0), [onButtonPress])}>
        0
      </Button>
      <Button onPress={onBackspace}>
        <span role="img" aria-label="backspace">
          ⌫
        </span>
      </Button>
    </NumberPadContainer>
  )
}
