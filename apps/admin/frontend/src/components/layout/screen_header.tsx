import { Caption, H1 } from '@votingworks/ui';
import React from 'react';
import styled, { css } from 'styled-components';
import { Logo } from './logo';
import { SIDEBAR_WIDTH_REM } from './constants';

export interface ScreenHeaderProps {
  actions?: React.ReactNode;
  noBorder?: boolean;
  title?: React.ReactNode;
  titleCaption?: React.ReactNode;
}

type ContainerProps = Pick<ScreenHeaderProps, 'noBorder'>;

const containerBorderStyles = css`
  border-bottom: ${(p) => p.theme.sizes.bordersRem.medium}rem solid
    ${(p) => p.theme.colors.foreground};
`;

const Container = styled.div<ContainerProps>`
  align-items: center;
  display: flex;
  gap: 0.7rem;
  padding: 0.5rem 0;

  ${(p) => (p.noBorder ? undefined : containerBorderStyles)};
`;
const LogoContainer = styled.div`
  box-sizing: border-box;
  display: flex;
  flex-shrink: 0;
  justify-content: center;
  margin-bottom: -0.5rem; /* Make the logo feel visually centered with title. */
  width: ${SIDEBAR_WIDTH_REM}rem;
`;

const TitleContainer = styled.div`
  align-self: end;
  flex-grow: 1;
`;

const Title = styled(H1)`
  line-height: 1;
  margin: 0;
`;

const TitleCaption = styled(Caption)`
  display: block;
  line-height: 1;
`;

const Actions = styled.div`
  align-items: center;
  display: flex;
  flex-shrink: 1;
  gap: 0.5rem;
  justify-content: end;
  padding-right: 0.5rem;
  white-space: nowrap;
`;

export function ScreenHeader(props: ScreenHeaderProps): JSX.Element {
  const { actions, noBorder, title, titleCaption } = props;

  return (
    <Container noBorder={noBorder}>
      <LogoContainer>
        <Logo />
      </LogoContainer>
      <TitleContainer>
        <Title>
          {titleCaption && <TitleCaption>{titleCaption}</TitleCaption>}
          {title}
        </Title>
      </TitleContainer>
      <Actions>{actions}</Actions>
    </Container>
  );
}
