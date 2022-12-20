import React from 'react';
import styled from 'styled-components';

export interface SidebarProps {
  children?: React.ReactNode;
  footer?: React.ReactNode;
}

const StyledSidebar = styled.nav`
  display: flex;
  flex: 0 1;
  flex-direction: column;
  background-color: #333333;
  color: #ffffff;
`;

const Content = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  padding: 1rem;
  p > button {
    width: 100%;
  }
`;

const Footer = styled.div`
  margin: 1rem;
`;

export function Sidebar({ footer, children }: SidebarProps): JSX.Element {
  return (
    <StyledSidebar>
      <Content>{children}</Content>
      {footer && <Footer>{footer}</Footer>}
    </StyledSidebar>
  );
}
