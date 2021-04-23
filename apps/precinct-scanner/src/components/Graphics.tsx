import React from 'react'
import styled from 'styled-components'

export const PlaceholderGraphic = styled.div`
  margin: 0 auto 1rem;
  border-radius: 1rem;
  background: #6638b6;
  width: 250px;
  height: 250px;
`

export const Graphic = styled.img`
  margin: 0 auto 1rem;
  width: 250px;
`

export const QuestionCircle: React.FC = () => (
  <Graphic
    src={`${process.env.PUBLIC_URL}/assets/question-circle.svg`}
    alt="question-circle"
    aria-hidden
  />
)

export const DoNotEnter: React.FC = () => (
  <Graphic
    src={`${process.env.PUBLIC_URL}/assets/do-not-enter.svg`}
    alt="do-not-enter"
    aria-hidden
  />
)

export const CircleCheck: React.FC = () => (
  <Graphic
    src={`${process.env.PUBLIC_URL}/assets/check-circle.svg`}
    alt="check-circle"
    aria-hidden
  />
)

export const TimesCircle: React.FC = () => (
  <Graphic
    src={`${process.env.PUBLIC_URL}/assets/times-circle.svg`}
    alt="times-circle"
    aria-hidden
    style={{ height: '400px' }}
  />
)

export const ExclamationTriangle: React.FC = () => (
  <Graphic
    src={`${process.env.PUBLIC_URL}/assets/exclamation-triangle.svg`}
    alt="exclamation-triangle"
    aria-hidden
  />
)

export const InsertBallot: React.FC = () => (
  <Graphic
    src={`${process.env.PUBLIC_URL}/assets/insert-ballot.svg`}
    alt="insert-ballot"
    aria-hidden
    style={{ width: '600px' }}
  />
)

export const IndeterminateProgressBar: React.FC = () => (
  <Graphic
    src={`${process.env.PUBLIC_URL}/assets/indeterminate-progress-bar.svg`}
    alt="indeterminate-progress-bar"
    aria-hidden
    style={{ width: '400px' }}
  />
)
