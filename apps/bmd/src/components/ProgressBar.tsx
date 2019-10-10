import styled from 'styled-components'

interface Props {
  progress?: number // 0–1
  duration?: number // milliseconds
}

const ProgressBar = styled.span<Props>`
  display: block;
  margin: 0 auto;
  border: 0.4rem solid #000000;
  border-radius: 10rem;
  width: 30vw;
  &::before {
    display: block;
    border: 0.35rem solid #ffffff;
    border-radius: 10rem;
    background: #9958a4;
    width: ${({ progress = 0.5 }) => `${progress * 100}%`};
    min-width: 3rem;
    height: 2.4rem;
    content: '';
    transition: width ${({ duration = 1500 }) => duration}ms ease-out;
  }
`

export default ProgressBar
