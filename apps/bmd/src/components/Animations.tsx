import styled, { keyframes } from 'styled-components'

const wobbleKeyframes = keyframes`
  0%, 90% { transform: translate3d(0, 0, 0); }
  91.5% { transform: translate3d(-2.5%, 0, 0) rotate3d(0, 0, 1, -5deg); }
  93.0% { transform: translate3d(2.0%, 0, 0) rotate3d(0, 0, 1, 3deg); }
  94.5% { transform: translate3d(-1.5%, 0, 0) rotate3d(0, 0, 1, -3deg); }
  96.0% { transform: translate3d(1.0%, 0, 0) rotate3d(0, 0, 1, 2deg); }
  97.5% { transform: translate3d(-.5%, 0, 0) rotate3d(0, 0, 1, -1deg); }
`
export const Wobble = styled.div`
  animation: ${wobbleKeyframes} 10s ease-in-out infinite;
`

const blinkKeyframes = keyframes`
  to { visibility: hidden }
`
export const Blink = styled.span`
  animation: ${blinkKeyframes} 1s steps(2, start) infinite;
`
