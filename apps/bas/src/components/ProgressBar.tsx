import React from 'react'
import styled from 'styled-components'

interface Props {
  progress: number // 0–1
  duration?: number // milliseconds
}

const StyledProgressBar = styled.span<Props>`
  display: block;
  margin: 0 auto;
  border: 0.4rem solid #000000;
  border-radius: 10rem;
  width: 30vw;
  & span {
    display: block;
  }
  & > span > span {
    border: 0.35rem solid #ffffff;
    border-radius: 10rem;
    background: #9958a4;
    width: ${({ progress }) => `${progress * 100}%`};
    min-width: 3rem;
    height: 2.4rem;
    transition: width ${({ duration }) => duration}ms ease-out;
  }
`

const ProgressBar = ({ duration = 1500, progress }: Props) => (
  <StyledProgressBar duration={duration} progress={progress}>
    <span>
      <span />
    </span>
  </StyledProgressBar>
)

export default ProgressBar
