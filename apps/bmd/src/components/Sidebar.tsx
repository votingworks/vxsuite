import React from 'react'
import styled from 'styled-components'
import Prose from './Prose'
import Text from './Text'

interface Props {
  appName?: string
  centerContent?: boolean
  children?: React.ReactNode
  footer?: React.ReactNode
  title?: string
}

const StyledSidebar = styled.nav`
  display: flex;
  flex-direction: column;
  background-color: #333333;
  color: #ffffff;
`

const Header = styled.div`
  margin: 2rem 1rem 1rem;
`

const Content = styled.div<Props>`
  display: flex;
  flex: 1;
  flex-direction: column;
  margin: ${({ centerContent }) => (centerContent ? '0 auto' : undefined)};
  max-width: ${({ centerContent }) => (centerContent ? '20rem' : undefined)};
  padding: 1rem;
  p > button {
    width: 100%;
  }
`

const Footer = styled.div`
  margin: 1rem 1rem 1.5rem;
`

const Sidebar = ({
  appName,
  centerContent,
  footer,
  children,
  title,
}: Props) => {
  return (
    <StyledSidebar>
      {title && (
        <Header>
          <Prose>
            <Text as="h1" center>
              {appName}
              <Text as="span" light noWrap>
                {appName && ' / '}
                {title}
              </Text>
            </Text>
          </Prose>
        </Header>
      )}
      <Content centerContent={centerContent}>{children}</Content>
      {footer && <Footer>{footer}</Footer>}
    </StyledSidebar>
  )
}

export default Sidebar
