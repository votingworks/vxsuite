import styled from 'styled-components'

const ellipsisWidth = '1.4em'
const ProgressEllipsis = styled.span`
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
    animation: loadingEllipsis steps(4, end) 2s infinite;
  }
  &::before {
    color: transparent;
  }
  @keyframes loadingEllipsis {
    to {
      width: ${ellipsisWidth};
    }
  }
`

export default ProgressEllipsis
