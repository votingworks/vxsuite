import React, { useState } from 'react'
import styled, { css, StyledComponent } from 'styled-components'
import { EventTargetFunction } from '@votingworks/types'

export interface ButtonInterface {
  readonly large?: boolean
  readonly danger?: boolean
  readonly fullWidth?: boolean
  readonly noFocus?: boolean
  readonly noWrap?: boolean
  readonly primary?: boolean
  readonly small?: boolean
  readonly textAlign?: 'left' | 'center' | 'right'
  readonly warning?: boolean
}

export interface StyledButtonProps
  extends ButtonInterface,
    React.PropsWithoutRef<JSX.IntrinsicElements['button']> {}

export const buttonNoFocusOutlineStyle = css`
  outline: none;
`

const buttonStyles = css<StyledButtonProps>`
  display: inline-block;
  border: none;
  border-radius: 0.25em;
  box-shadow: 0 0 0 0 rgba(71, 167, 75, 1);
  box-sizing: border-box;
  background: ${({ disabled, danger, warning, primary }) =>
    (disabled && 'rgb(211, 211, 211)') ||
    (danger && 'red') ||
    (warning && 'darkorange') ||
    (primary && 'rgb(71, 167, 75)') ||
    'rgb(211, 211, 211)'};
  cursor: ${({ disabled = false }) => (disabled ? undefined : 'pointer')};
  width: ${({ fullWidth = false }) => (fullWidth ? '100%' : undefined)};
  padding: ${({ large = false, small = false }) =>
    small ? '0.35em 0.5em' : large ? '1em 1.75em' : '0.75em 1em'};
  text-align: ${({ textAlign }) => textAlign};
  line-height: 1.25;
  color: ${({ disabled, danger, warning, primary }) =>
    (disabled && 'rgb(160, 160, 160)') ||
    (danger && '#FFFFFF') ||
    (warning && '#FFFFFF') ||
    (primary && '#FFFFFF') ||
    'black'};
  font-size: ${({ large = false }) => (large ? '1.25em' : undefined)};
  touch-action: manipulation;
  &:focus {
    /* stylelint-disable-next-line value-keyword-case */
    ${({ noFocus = false }) =>
      noFocus ? buttonNoFocusOutlineStyle : undefined}
  }
  &:hover,
  &:active {
    outline: none;
  }
`

export const DecoyButton = styled.div`
  ${buttonStyles}/* stylelint-disable-line value-keyword-case */
`

const StyledButton = styled('button').attrs(({ type = 'button' }) => ({
  type,
}))`
  ${buttonStyles}/* stylelint-disable-line value-keyword-case */
`

export interface Props extends StyledButtonProps {
  component?: StyledComponent<'button', never, StyledButtonProps, never>
  onPress: EventTargetFunction
  ref?: React.Ref<HTMLButtonElement>
}

export const Button = React.forwardRef<HTMLButtonElement, Props>(
  ({ component: Component = StyledButton, onPress, ...rest }, ref) => {
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
        onPress(event)
        event.preventDefault()
      }
    }

    return (
      <Component
        {...rest}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onClick={onPress}
        ref={ref}
      />
    )
  }
)

Button.displayName = 'Button'

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

export const LabelButton = styled.label`
  ${buttonStyles}/* stylelint-disable-line value-keyword-case */
`
