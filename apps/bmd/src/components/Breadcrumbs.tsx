import React from 'react'
import styled from 'styled-components'

const BreadcrumbContainer = styled.div`
  margin: 0 auto 2rem;
  max-width: 600px;
  padding-bottom: 2rem;
  @media print {
    display: none;
  }
`

const StepContainer = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  position: relative;
  &::before {
    position: absolute;
    top: 45%;
    right: 12%;
    left: 12%;
    z-index: -1;
    background-color: #c7d7df;
    height: 10%;
    content: '';
  }
`

interface StepProps {
  current: boolean
  completed: boolean
}

const Step = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  position: relative;
  padding: 0 4%;
`

const StepCircle = styled.div<StepProps>`
  position: relative;
  border-radius: 50%;
  background: ${({ completed, current }) =>
    completed ? '#ffffff' : current ? '#35809c' : '#c7d7df'};
  width: 100%;
  height: 0;
  padding-top: 100%;
  & > span {
    display: flex;
    align-items: center;
    justify-content: center;
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    text-align: center;
    color: ${({ completed }) => (completed ? '#35809c' : '#ffffff')};
    font-size: 7vw;
    font-weight: 700;
    @media (min-width: 686px) {
      font-size: 2rem;
    }
  }
`

const StepLabel = styled.div<StepProps>`
  position: absolute;
  margin: 0.25rem -1rem 0;
  width: calc(100% + 2rem);
  text-align: center;
  color: ${({ current }) => (current ? undefined : '#c7d7df')};
  font-weight: ${({ current }) => (current ? '600' : undefined)};
`

const Breadcrumbs = ({ step }: { step: number }) => (
  <BreadcrumbContainer aria-label={`Step ${step} of 4.`}>
    <StepContainer>
      {['Mark', 'Review', 'Print', 'Cast'].map((label, i) => {
        const stepNumber = i + 1
        const completed = stepNumber < step
        return (
          <Step key={label}>
            <StepCircle current={stepNumber === step} completed={completed}>
              <span>{completed ? '✓' : stepNumber}</span>
              <StepLabel current={stepNumber === step} completed={completed}>
                {label}
              </StepLabel>
            </StepCircle>
          </Step>
        )
      })}
    </StepContainer>
  </BreadcrumbContainer>
)

export default Breadcrumbs
