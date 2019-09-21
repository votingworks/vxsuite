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

const tadaKeyframes = keyframes`
  0%, 90% {
    transform: scale3d(1, 1, 1);
  }

  91%, 92% {
    transform: scale3d(0.95, 0.95, 0.95) rotate3d(0, 0, 1, -2.5deg);
  }

  93%, 95%, 97%, 99% {
    transform: scale3d(1.05, 1.05, 1.05) rotate3d(0, 0, 1, 2.5deg);
  }

  94%, 96%, 98% {
    transform: scale3d(1.05, 1.05, 1.05) rotate3d(0, 0, 1, -2.5deg);
  }
`
export const Tada = styled.div`
  animation: ${tadaKeyframes} 10s ease-in-out infinite;
`

// const simpleBounce = keyframes`
//   0%, 90% {
//     transform: scale3d(1, 1, 1);
//   }
//   92%, 96% {
//     transform: scale3d(0.97, 0.77, 0.97);
//   }
//   94%, 98% {
//     transform: scale3d(1.05, 1.2, 1.05);
//   }
// `
// animation: ${simpleBounce} 7s ease-in-out infinite;

// const bounce = keyframes`
//   91% {
//     transform: scale3d(0.8, 0.8, 0.8);
//   }

//   92% {
//     transform: scale3d(1.1, 1.1, 1.1);
//   }

//   94% {
//     transform: scale3d(0.9, 0.9, 0.9);
//   }

//   96% {
//     transform: scale3d(1.03, 1.03, 1.03);
//   }

//   98% {
//     transform: scale3d(0.97, 0.97, 0.97);
//   }

//   90%, 100% {
//     transform: scale3d(1, 1, 1);
//   }
// `
// animation: ${bounce} 7s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;

// const shake = keyframes`
//   91%, 99% {
//     transform: translate3d(-1px, 0, 0);
//   }

//   92%, 98% {
//     transform: translate3d(2px, 0, 0);
//   }

//   93%, 95%, 97% {
//     transform: translate3d(-4px, 0, 0);
//   }

//   94%, 96% {
//     transform: translate3d(4px, 0, 0);
//   }
// `
// animation: ${ shake } 8.2s cubic - bezier(0.36, 0.07, 0.19, 0.97) infinite;

// const shake2 = keyframes`
//   0%, 90% {
//     transform: translate3d(0, 0, 0);
//   }

//   91%, 93%, 95%, 97%, 99% {
//     transform: translate3d(-0.3rem, 0, 0);
//   }

//   92%, 94%, 96%, 98% {
//     transform: translate3d(0.3rem, 0, 0);
//   }
// `
// animation: ${ shake2 } 10s ease-in-out infinite;
