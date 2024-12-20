import styled from 'styled-components';

const ellipsisWidth = '1em';
export const ProgressEllipsis = styled.span`
  margin-left: -${ellipsisWidth};
  text-align: center;
  white-space: nowrap;

  &::before,
  &::after {
    display: inline-block;
    width: 0;
    overflow: hidden;
    vertical-align: bottom;
    text-align: left;
    content: '…';
    animation: loading-ellipsis steps(4, end) 2s infinite;
  }

  &::before {
    color: transparent;
  }

  @keyframes loading-ellipsis {
    to {
      width: ${ellipsisWidth};
    }
  }
`;
