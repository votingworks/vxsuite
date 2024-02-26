import styled, { ThemeProvider } from 'styled-components';
import { H1 } from './typography';
import { makeTheme } from './themes/make_theme';

const TestingModeContainer = styled.div`
  /* https://stripesgenerator.com/stripe/5302 */
  background-image: linear-gradient(
    135deg,
    #ff8c00 21.43%,
    #333 21.43%,
    #333 50%,
    #ff8c00 50%,
    #ff8c00 71.43%,
    #333 71.43%,
    #333 100%
  );
  background-size: 98.99px 98.99px;
  width: 100%;
  font-size: 48px;
  padding: 0.5em 0;
`;

const Heading = styled(H1)`
  background: #ff8c00;
  color: #333;
  font-size: inherit;
  margin: 0;
  padding: 0.1em 0;
  text-align: center;
`;

export function TestMode(): JSX.Element {
  return (
    // Lock the test mode banner to "small" mode to keep its size from getting
    // out of had at larger text sizes.
    <ThemeProvider
      theme={(theme) =>
        makeTheme({
          colorMode: theme.colorMode,
          screenType: theme.screenType,
          sizeMode: 'touchSmall',
        })
      }
    >
      <TestingModeContainer>
        <div>
          <Heading>Test Ballot Mode</Heading>
        </div>
      </TestingModeContainer>
    </ThemeProvider>
  );
}
