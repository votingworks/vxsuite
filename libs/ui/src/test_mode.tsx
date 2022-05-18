import React from 'react';
import styled from 'styled-components';

const TestingModeContainer = styled.div`
  border: 10px solid #333333;
  border-width: 10px 0;

  /* https://stripesgenerator.com/stripe/5302 */
  background-image: linear-gradient(
    135deg,
    #ff8c00 21.43%,
    #333333 21.43%,
    #333333 50%,
    #ff8c00 50%,
    #ff8c00 71.43%,
    #333333 71.43%,
    #333333 100%
  );
  background-size: 98.99px 98.99px;
  width: 100%;
  & > div {
    margin: 0.5rem 0;
    background: #ff8c00;
    padding: 0.25rem 2rem;
    text-align: center;
    color: #333333;
    font-size: 2rem;
    font-weight: 900;
  }
`;

export function TestMode(): JSX.Element {
  return (
    <TestingModeContainer>
      <div>Machine is in Testing Mode</div>
    </TestingModeContainer>
  );
}
