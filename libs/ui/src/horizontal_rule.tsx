import styled from 'styled-components';
import { P } from './typography';

export const HorizontalRule = styled(P)`
  display: flex;
  align-items: center;

  &::after,
  &::before {
    flex: 1;
    border-top: 1px solid;
    content: '';
  }

  &::before {
    margin-right: ${({ children }) => (children ? '0.5rem' : undefined)};
  }

  &::after {
    margin-left: ${({ children }) => (children ? '0.5rem' : undefined)};
  }
`;
