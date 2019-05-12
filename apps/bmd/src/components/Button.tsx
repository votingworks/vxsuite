import styled, { css } from 'styled-components'

interface Attrs extends HTMLButtonElement {
  readonly type: string
}

// @ts-ignore: 'T' triggers noUnusedParameters, but must exist for this interface to be 'generic'.
export interface ButtonInterface<T> {
  readonly danger?: boolean
  readonly primary?: boolean
  readonly fullWidth?: boolean
}

interface Props
  extends ButtonInterface<{}>,
    React.PropsWithoutRef<JSX.IntrinsicElements['button']> {}

const buttonStyles = css<Props>`
  border: none;
  border-radius: 0.25rem;
  box-sizing: border-box;
  background: ${({ danger = false, primary = false }) =>
    (danger && 'red') ||
    (primary && 'rgb(71, 167, 75)') ||
    'rgb(211, 211, 211)'};
  cursor: pointer;
  width: ${({ fullWidth = false }) => (fullWidth ? '100%' : undefined)};
  padding: 0.4rem 0.7rem;
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
