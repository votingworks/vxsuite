import React, { MouseEventHandler } from 'react'
import styled from 'styled-components'

import * as GLOBALS from '../config/globals'

import Button from './Button'

interface Attrs extends HTMLButtonElement {
  readonly type: string
}

interface StyledChoiceButtonProps
  extends React.PropsWithoutRef<JSX.IntrinsicElements['button']> {
  isSelected: boolean
}

const StyledChoiceButton = styled('button').attrs((props: Attrs) => ({
  role: 'option',
  type: props.type || 'button',
}))<StyledChoiceButtonProps>`
  position: relative;
  border-radius: 0.125rem;
  box-shadow: 0 0.125rem 0.125rem 0 rgba(0, 0, 0, 0.14),
    0 0.1875rem 0.0625rem -0.125rem rgba(0, 0, 0, 0.12),
    0 0.0625rem 0.3125rem 0 rgba(0, 0, 0, 0.2);
  background: ${({ isSelected }) => (isSelected ? '#028099' : '#FFFFFF')};
  cursor: pointer;
  padding: 0.5rem 0.5rem 0.5rem 4rem;
  @media (min-width: 480px) {
    padding: 1rem 1rem 1rem 4rem;
  }
  text-align: left;
  color: ${({ isSelected }) => (isSelected ? '#FFFFFF' : undefined)};
  transition: background 0.25s, color 0.25s;
  ::before {
    display: flex;
    align-items: center;
    justify-content: center;
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    border-right: 1px solid;
    border-color: ${({ isSelected }) =>
      isSelected ? '#028099' : 'rgb(211, 211, 211)'};
    border-radius: 0.125rem 0 0 0.125rem;
    background: #FFFFFF;
    width: 3rem;
    text-align: center;
    color: #028099;
    font-size: 2rem;
    font-weight: 700;
    content: '${({ isSelected }) => (isSelected ? GLOBALS.CHECK_ICON : '')}';
  }
`

interface ChoiceButtonProps extends StyledChoiceButtonProps {
  onPress: MouseEventHandler
  dataSelected?: boolean
}

const ChoiceButton = ({ onPress, ...rest }: ChoiceButtonProps) => {
  return (
    <Button
      {...rest}
      component={StyledChoiceButton}
      data-selected={rest.isSelected}
      onPress={onPress}
    />
  )
}

export default ChoiceButton
