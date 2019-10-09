import React, { MouseEventHandler, useState } from 'react'
import styled, { css, StyledComponent } from 'styled-components'

interface Attrs extends HTMLButtonElement {
  readonly type: string
}

export interface ButtonInterface {
  readonly big?: boolean
  readonly danger?: boolean
  readonly fullWidth?: boolean
  readonly primary?: boolean
  readonly small?: boolean
}

interface StyledButtonProps
  extends ButtonInterface,
    React.PropsWithoutRef<JSX.IntrinsicElements['button']> {}

const buttonStyles = css<StyledButtonProps>`
  border: none;
  border-radius: 0.25rem;
  box-shadow: 0 0 0 0 rgba(71, 167, 75, 1);
  box-sizing: border-box;
  background: ${({ danger = false, primary = false }) =>
    (danger && 'red') ||
    (primary && 'rgb(71, 167, 75)') ||
    'rgb(211, 211, 211)'};
  cursor: ${({ disabled = false }) => (disabled ? undefined : 'pointer')};
  width: ${({ fullWidth = false }) => (fullWidth ? '100%' : undefined)};
  padding: ${({ big = false, small = false }) =>
    small ? '0.35rem 0.5rem' : big ? '1rem 1.75rem' : '0.75rem 1rem'};
  line-height: 1.25;
  color: ${({ disabled = false, danger = false, primary = false }) =>
    (disabled && 'rgb(169, 169, 169)') ||
    (danger && '#FFFFFF') ||
    (primary && '#FFFFFF') ||
    'black'};
  font-size: ${({ big = false }) => (big ? '1.25rem' : undefined)};
  touch-action: manipulation;
`

export const DecoyButton = styled.div`
  ${buttonStyles} /* stylelint-disable-line value-keyword-case */
`
const StyledButton = styled('button').attrs((props: Attrs) => ({
  type: props.type || 'button',
}))`
  ${buttonStyles} /* stylelint-disable-line value-keyword-case */
`

export interface Props extends StyledButtonProps {
  component?: StyledComponent<'button', never, StyledButtonProps, never>
  onPress: MouseEventHandler
}

const Button = ({
  component: Component = StyledButton,
  onPress,
  ...rest
}: Props) => {
  const [startCoordinates, setStartCoordinates] = useState([0, 0])

  const onTouchStart = (event: React.TouchEvent) => {
    const { clientX, clientY } = event.touches[0]
    setStartCoordinates([clientX, clientY])
  }

  const onTouchEnd = (event: React.TouchEvent) => {
    const maxMove = 30
    const { clientX, clientY } = event.changedTouches[0]
    if (
      Math.abs(startCoordinates[0] - clientX) < maxMove &&
      Math.abs(startCoordinates[1] - clientY) < maxMove
    ) {
      onPress(event as any)
      event.preventDefault()
    }
  }

  return (
    <Component
      {...rest}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onClick={onPress}
    />
  )
}

export const SegmentedButton = styled.span`
  display: inline-flex;
  white-space: nowrap;
  & > button {
    box-shadow: inset 1px 0 0 rgb(190, 190, 190);
  }
  & > button:first-child {
    box-shadow: none;
  }
  & > button:not(:last-child) {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }
  & > button:not(:first-child) {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }
  & > button:disabled {
    background: #028099;
    color: #ffffff;
  }
`

export default Button
