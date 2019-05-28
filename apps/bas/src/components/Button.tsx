import styled, { css } from 'styled-components'

interface Attrs extends HTMLButtonElement {
  readonly type: string
}

export interface ButtonInterface {
  readonly danger?: boolean
  readonly primary?: boolean
  readonly fullWidth?: boolean
  readonly small?: boolean
}

interface Props
  extends ButtonInterface,
    React.PropsWithoutRef<JSX.IntrinsicElements['button']> {}

const buttonStyles = css<Props>`
  border: none;
  border-radius: 0.25rem;
  box-sizing: border-box;
  background: ${({ danger = false, primary = false }) =>
    (danger && 'red') ||
    (primary && 'rgb(71, 167, 75)') ||
    'rgb(211, 211, 211)'};
  cursor: ${({ disabled = false }) => (disabled ? undefined : 'pointer')};
  width: ${({ fullWidth = false }) => (fullWidth ? '100%' : undefined)};
  padding: ${({ small = false }) =>
    small ? '0.35rem 0.5rem' : '0.75rem 1rem'};
  line-height: 1;
  white-space: nowrap;
  color: ${({ disabled = false, danger = false, primary = false }) =>
    (disabled && 'rgb(169, 169, 169)') ||
    (danger && '#FFFFFF') ||
    (primary && '#FFFFFF') ||
    'black'};
`

export const DecoyButton = styled.div`
  ${buttonStyles} /* stylelint-disable-line value-keyword-case */
`

const Button = styled('button').attrs((props: Attrs) => ({
  type: props.type || 'button',
}))`
  ${buttonStyles} /* stylelint-disable-line value-keyword-case */
`

export default Button
