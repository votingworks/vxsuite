import React from 'react';
import styled from 'styled-components';

const Nav = styled.nav`
  display: flex;
  flex-wrap: nowrap;
  justify-content: space-between;
  align-items: center;
  background: #455a64;
  order: -1;
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
  color: #ff8c00;
`;

interface Props {
  children?: React.ReactNode;
  isTestMode?: boolean;
}

export function MainNav({ children, isTestMode = false }: Props): JSX.Element {
  return (
    <Nav>
      <Brand>
        <MakeName>
          Voting<span>Works</span>
        </MakeName>
        <ModelName>
          VxCentralScan
          {isTestMode && <TestMode>&nbsp;TEST&nbsp;MODE</TestMode>}
        </ModelName>
      </Brand>
      <NavButtons>{children}</NavButtons>
    </Nav>
  );
}
