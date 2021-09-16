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
interface NumberPadProps {
  onButtonPress: (buttonValue: string) => void
}

export const NumberPad = ({ onButtonPress }: NumberPadProps): JSX.Element => {
  const container = useRef<HTMLDivElement>(null)
  const onKeyPress = useCallback(
    (event: React.KeyboardEvent) => {
      if (DIGITS.includes(event.key)) {
        onButtonPress(event.key)
      }
    },
    [onButtonPress]
  )

  useEffect(() => {
    if (container.current) {
      container.current.focus()
    }
  }, [container])

  return (
    <NumberPadContainer tabIndex={0} ref={container} onKeyPress={onKeyPress}>
      <Button onPress={() => onButtonPress('1')}>1</Button>
      <Button onPress={() => onButtonPress('2')}>2</Button>
      <Button onPress={() => onButtonPress('3')}>3</Button>
      <Button onPress={() => onButtonPress('4')}>4</Button>
      <Button onPress={() => onButtonPress('5')}>5</Button>
      <Button onPress={() => onButtonPress('6')}>6</Button>
      <Button onPress={() => onButtonPress('7')}>7</Button>
      <Button onPress={() => onButtonPress('8')}>8</Button>
      <Button onPress={() => onButtonPress('9')}>9</Button>
      <Button onPress={() => onButtonPress('0')}>0</Button>
    </NumberPadContainer>
  )
}
