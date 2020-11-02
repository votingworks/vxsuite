/* stylelint-disable value-keyword-case */
import styled, { css } from 'styled-components'

export interface Props {
  readonly arrowLeft?: boolean
  readonly arrowRight?: boolean
  readonly white?: boolean
}

const arrowLeftStyles = css<Props>`
  &::before {
    display: inline-block;
    margin-right: 0.5rem;
    background: url('/images/arrow-left-open-black.svg') no-repeat;
    width: 1rem;
    height: 1rem;
    vertical-align: text-bottom;
    content: '';
  }
`
const arrowRightStyles = css<Props>`
  &::after {
    display: inline-block;
    margin-left: 0.5rem;
    background: ${({ white }) =>
        white
          ? "url('/images/arrow-right-open-white.svg')"
          : "url('/images/arrow-right-open-black.svg')"}
      no-repeat;
    width: 1.375rem;
    height: 1.375rem;
    vertical-align: text-bottom;
    content: '';
  }
`

const TextIcon = styled.span<Props>`
  ${({ arrowLeft }) => arrowLeft && arrowLeftStyles}
  ${({ arrowRight }) => arrowRight && arrowRightStyles}
`

export default TextIcon
