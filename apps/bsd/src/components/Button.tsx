import React, { useState } from 'react'
import styled, { css, StyledComponent } from 'styled-components'
import { EventTargetFunction } from '../config/types'

export interface ButtonInterface {
  readonly big?: boolean
  readonly danger?: boolean
  readonly fullWidth?: boolean
  readonly noWrap?: boolean
  readonly primary?: boolean
  readonly small?: boolean
  readonly textAlign?: 'left' | 'center' | 'right'
  readonly warning?: boolean
}

interface StyledButtonProps
  extends ButtonInterface,
    React.PropsWithoutRef<JSX.IntrinsicElements['button']> {}

export const buttonFocusStyle = css`
  outline: none;
`
const buttonStyles = css<StyledButtonProps>`
  display: inline-block;
  border: none;
  border-radius: 0.25rem;
  box-sizing: border-box;
  background: ${({ disabled, danger, warning, primary }) =>
    (disabled && 'rgb(211, 211, 211)') ||
    (danger && 'red') ||
    (warning && 'darkorange') ||
    (primary && 'rgb(71, 167, 75)') ||
    'rgb(211, 211, 211)'};
  cursor: ${({ disabled = false }) => (disabled ? undefined : 'pointer')};
  width: ${({ fullWidth = false }) => (fullWidth ? '100%' : undefined)};
  padding: ${({ big = false, small = false }) =>
    small ? '0.35rem 0.5rem' : big ? '1rem 1.75rem' : '0.75rem 1rem'};
  text-align: ${({ textAlign }) => textAlign};
  line-height: 1;
  white-space: ${({ noWrap = true }) => (noWrap ? 'nowrap' : undefined)};
  color: ${({ disabled = false, danger = false, primary = false }) =>
    (disabled && 'rgb(169, 169, 169)') ||
    (danger && '#FFFFFF') ||
    (primary && '#FFFFFF') ||
    'black'};
  font-size: ${({ big = false }) => (big ? '1.25rem' : undefined)};
  body.using-keyboard &:focus {
    outline: none;
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 1),
      0 0 0 4px rgba(100, 100, 100, 0.9);
  }
  &:focus {
    ${buttonFocusStyle}/* stylelint-disable-line value-keyword-case */
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

const Button = React.forwardRef<HTMLButtonElement, Props>(
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

export default Button
