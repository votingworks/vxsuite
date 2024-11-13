import React from 'react';

import { Card, FullScreenIconWrapper, H2 } from '@votingworks/ui';
import styled from 'styled-components';
import {
  CenteredPageLayout,
  CenteredPageLayoutProps,
} from './centered_page_layout';

export type CenteredCardPageLayoutProps = Omit<
  CenteredPageLayoutProps,
  'textAlign'
> & {
  icon: React.ReactNode;
  titleCentered?: boolean;
  title: React.ReactNode;
};

const Content = styled.div<{ withExtraPadding?: boolean }>`
  padding: 0.5rem;
  position: relative;
  text-align: left;
  width: 100%;
`;

const IconContainer = styled(FullScreenIconWrapper)`
  background: ${(p) => p.theme.colors.background};
  font-size: 5rem;
  left: 50%;
  position: absolute;
  text-align: center;
  top: 0.125rem;
  transform: translate(-50%, -50%);
`;

const ContentCard = styled(Card)`
  padding: 0.25rem;
  padding-top: 2.125rem;
  width: 100%;
`;

export function CenteredCardPageLayout(
  props: CenteredCardPageLayoutProps
): JSX.Element {
  const { children, icon, title, titleCentered, ...rest } = props;

  const content = (
    <Content>
      <ContentCard>
        <H2 as="h1" align={titleCentered ? 'center' : undefined}>
          {title}
        </H2>
        {children}
      </ContentCard>
      {icon && <IconContainer>{icon}</IconContainer>}
    </Content>
  );

  return <CenteredPageLayout {...rest}>{content}</CenteredPageLayout>;
}
