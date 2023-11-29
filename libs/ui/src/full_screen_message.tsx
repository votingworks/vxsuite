import styled from 'styled-components';
import React from 'react';
import { H1 } from './typography';
import { ScreenInfo, useScreenInfo } from './hooks/use_screen_info';

const Container = styled.div<{ screenInfo: ScreenInfo }>`
  padding: 1.5rem;
  display: flex;
  flex-direction: ${(p) => (p.screenInfo.isPortrait ? 'column' : 'row')};
  align-items: center;
  justify-content: center;
  gap: 1.5rem;

  h1 {
    font-size: ${(p) =>
      p.screenInfo.isPortrait && `${p.theme.sizes.headingsRem.h2}rem`};
  }
`;

const ImageContainer = styled.div<{ screenInfo: ScreenInfo }>`
  flex-shrink: 0;
  width: ${(p) => (p.screenInfo.isPortrait ? '12rem' : '7.5rem')};

  svg {
    width: 100%;
  }
`;

export function FullScreenMessage({
  title,
  image,
  children,
}: {
  title: React.ReactNode;
  image?: React.ReactNode;
  children?: React.ReactNode;
}): JSX.Element {
  const screenInfo = useScreenInfo();
  return (
    <Container screenInfo={screenInfo}>
      <ImageContainer screenInfo={screenInfo}>{image}</ImageContainer>
      <div>
        <H1>{title}</H1>
        {children}
      </div>
    </Container>
  );
}
