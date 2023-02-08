import React from 'react';
import styled from 'styled-components';

interface NavProps {
  isTestMode?: boolean;
}

const NavWrapper = styled('div')<NavProps>`
  padding: ${({ isTestMode }) => isTestMode && '1rem 0'};

  /* https://stripesgenerator.com/stripe/5302 */
  background-image: ${({ isTestMode }) =>
    isTestMode &&
    'linear-gradient( 135deg, #ff8c00 21.43%, #333333 21.43%, #333333 50%, #ff8c00 50%, #ff8c00 71.43%, #333333 71.43%, #333333 100% ) '};
  background-size: ${({ isTestMode }) => isTestMode && '98.99px 98.99px'};
  background-color: ${({ isTestMode }) => !isTestMode && '#455a64'};
  order: -1;
`;

const Nav = styled('nav')<NavProps>`
  display: flex;
  flex-wrap: nowrap;
  justify-content: space-between;
  align-items: center;
  background-color: ${({ isTestMode }) => isTestMode && '#ff8c00'};
`;

const Brand = styled.div`
  display: inline-block;
  margin: 0.75rem 1rem;
  white-space: nowrap;
  color: #ffffff;
  font-size: 1.3rem;
  font-weight: 600;
  & span {
    font-weight: 400;
  }
`;
const MakeName = styled.div`
  font-size: 0.75rem;
  font-weight: 700;
`;
const ModelName = styled.div``;

const NavButtons = styled.div`
  margin-right: 1em;
  button {
    margin-left: 0.5em;
  }
`;
const TestMode = styled.span`
  flex: 1;
  background: #ff8c00;
  color: #333333;
  font-size: 2rem;
  font-weight: 900;
  text-align: center;
`;

interface Props extends NavProps {
  children?: React.ReactNode;
}

export function MainNav({ children, isTestMode = false }: Props): JSX.Element {
  return (
    <NavWrapper isTestMode={isTestMode}>
      <Nav isTestMode={isTestMode}>
        <Brand>
          <MakeName>
            Voting<span>Works</span>
          </MakeName>
          <ModelName>VxCentralScan</ModelName>
        </Brand>
        {isTestMode && <TestMode>Machine is in Testing Mode</TestMode>}
        <NavButtons>{children}</NavButtons>
      </Nav>
    </NavWrapper>
  );
}
