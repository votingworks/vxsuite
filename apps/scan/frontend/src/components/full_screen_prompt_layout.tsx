import { H1, WithScrollButtons } from '@votingworks/ui';
import React from 'react';
import styled from 'styled-components';

interface FullScreenPromptLayoutProps {
  children?: React.ReactNode;
  image?: React.ReactNode;
  title: React.ReactNode;
}

const HORIZONTAL_PADDING_REM = 0.5;

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
  width: 100%;
`;

const ImageContainer = styled.div`
  align-items: center;
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

export function FullScreenPromptLayout(
  props: FullScreenPromptLayoutProps
): JSX.Element {
  const { children, image, title } = props;

  return (
    <OuterContainer>
      <Body>
        {image && <ImageContainer>{image}</ImageContainer>}
        <Content>
          <WithScrollButtons noPadding>
            <Text>
              <H1>{title}</H1>
              {children}
            </Text>
          </WithScrollButtons>
        </Content>
      </Body>
    </OuterContainer>
  );
}
