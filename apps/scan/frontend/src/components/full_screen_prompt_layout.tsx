/* stylelint-disable order/properties-order */
import { H1, WithScrollButtons } from '@votingworks/ui';
import React from 'react';
import styled from 'styled-components';

interface FullScreenPromptLayoutProps {
  actionButtons?: React.ReactNode;
  children?: React.ReactNode;
  image: React.ReactNode;
  title: React.ReactNode;
}

const HORIZONTAL_PADDING_REM = 0.75;

const OuterContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
`;

const Body = styled.div`
  display: flex;
  height: 100%;
  justify-content: center;
  overflow: hidden;
  margin-bottom: 0.5rem;
  width: 100%;
`;

const ImageContainer = styled.div`
  align-items: center;
  border-right: ${(p) => p.theme.sizes.bordersRem.thin}rem dotted
    ${(p) => p.theme.colors.foreground};
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 0 ${HORIZONTAL_PADDING_REM}rem;
`;

const Content = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
`;

const Text = styled.div`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  justify-content: center;
  padding: 0 ${HORIZONTAL_PADDING_REM}rem;
`;

const Footer = styled.div`
  display: flex;
  gap: ${HORIZONTAL_PADDING_REM}rem;
  justify-content: end;
  padding: 0 ${HORIZONTAL_PADDING_REM}rem 0.5rem;
  width: 100%;

  & > * {
    flex-grow: 1;
    max-width: 50%;
  }
`;

export function FullScreenPromptLayout(
  props: FullScreenPromptLayoutProps
): JSX.Element {
  const { actionButtons, children, image, title } = props;

  return (
    <OuterContainer>
      <Body>
        <ImageContainer>{image}</ImageContainer>
        <Content>
          <WithScrollButtons noPadding>
            <Text>
              <H1>{title}</H1>
              {children}
            </Text>
          </WithScrollButtons>
        </Content>
      </Body>
      {actionButtons && <Footer>{actionButtons}</Footer>}
    </OuterContainer>
  );
}
