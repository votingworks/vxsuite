import React from 'react'
import styled from 'styled-components'
import { Button } from './Button'

export const NumberPadContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  width: 300px;
  > button {
    margin: 2px;
    width: 26%;
  }
`

interface NumberPadProps {
  onButtonPress: (buttonValue: string) => void
}

export const NumberPad = ({ onButtonPress }: NumberPadProps): JSX.Element => {
  return (
    <NumberPadContainer>
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
