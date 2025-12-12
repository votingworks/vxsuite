import styled from 'styled-components';

const ellipsisWidth = '1em';

interface ProgressEllipsisProps {
  animationDurationS?: number;
}

export const ProgressEllipsis = styled.span<ProgressEllipsisProps>`
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
    animation: loading-ellipsis steps(4, end)
      ${(p) => (p.animationDurationS ? `${p.animationDurationS}s` : '2s')}
      infinite;
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
