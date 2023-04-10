import React from 'react';
import styled, { ThemeProvider } from 'styled-components';
import { H2 } from './typography';
import { makeTheme } from './themes/make_theme';

const TestingModeContainer = styled.div`
  border-bottom: 4px solid #333333;

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
    padding: 0.125rem;
    text-align: center;
    color: #333333;
  }
`;

export function TestMode(): JSX.Element {
  return (
    // Lock the test mode banner to "small" mode to keep its size from getting
    // out of had at larger text sizes.
    <ThemeProvider
      theme={(theme) =>
        makeTheme({
          colorMode: theme.colorMode,
          sizeMode: theme.sizeMode === 'legacy' ? 'legacy' : 's',
        })
      }
    >
      <TestingModeContainer>
        <div>
          <H2 as="h1">Test Ballot Mode</H2>
        </div>
      </TestingModeContainer>
    </ThemeProvider>
  );
}
