/* stylelint-disable value-keyword-case */
import styled, { css } from 'styled-components';

export interface Props {
  readonly arrowLeft?: boolean;
  readonly arrowRight?: boolean;
  readonly white?: boolean;
  readonly small?: boolean;
}

// const size = large ? '1.375rem' : '1rem';

const arrowLeftStyles = css<Props>`
  white-space: nowrap;
  &::before {
    display: inline-block;
    margin-right: 0.5rem;
    background: url('/images/arrow-left-open-black.svg') no-repeat;
    width: ${({ small }) => (small ? '1rem' : '1.375rem')};
    height: ${({ small }) => (small ? '1rem' : '1.375rem')};
    vertical-align: text-bottom;
    content: '';
  }
`;
const arrowRightStyles = css<Props>`
  white-space: nowrap;
  &::after {
    display: inline-block;
    margin-left: 0.5rem;
    background: ${({ white }) =>
        white
          ? "url('/images/arrow-right-open-white.svg')"
          : "url('/images/arrow-right-open-black.svg')"}
      no-repeat;
    width: ${({ small }) => (small ? '1rem' : '1.375rem')};
    height: ${({ small }) => (small ? '1rem' : '1.375rem')};
    vertical-align: text-bottom;
    content: '';
  }
`;

export const TextIcon = styled.span<Props>`
  ${({ arrowLeft }) => arrowLeft && arrowLeftStyles}
  ${({ arrowRight }) => arrowRight && arrowRightStyles}
`;
