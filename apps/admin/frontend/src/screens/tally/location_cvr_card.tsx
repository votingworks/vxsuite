/* istanbul ignore file - shared base, tested via concrete components */

import React from 'react';
import styled from 'styled-components';

import { Caption } from '@votingworks/ui';
import { format } from '@votingworks/utils';

import { BORDER_LIGHT, GAP, INSET_FOCUS_OUTLINE } from './styles';

interface LocationCvrCardProps {
  caption: React.ReactNode;
  count: number;
  disabled?: boolean;
  header?: React.ReactNode;
  icon: React.ReactNode;
  iconLabel?: React.ReactNode;
  id: string;
  name: React.ReactNode;
  onClick: (id: string) => void;
  selected?: boolean;
}

const ContentSection = styled.div`
  align-items: center;
  display: grid;
  grid-template-columns: 1fr;
  min-width: 0;
  padding: ${GAP};
`;

export const IconLabel = styled(Caption)`
  font-size: 0.6rem;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
`;

export const IconSection = styled.div`
  align-items: center;
  background-color: #f7f7f7;
  display: grid;
  font-size: 1.25rem;
  gap: 0.25rem;
  grid-template-rows: min-content min-content;
  height: 100%;
  justify-items: center;
  padding: 1rem;

  /* Expand padding when icon label is present, for more square appearance. */
  :has(${IconLabel}) {
    padding: 1rem 1.5rem;
  }
`;

const Meta = styled(Caption)`
  color: ${(p) => p.theme.colors.onBackgroundMuted};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Title = styled.div`
  color: ${(p) => p.theme.colors.onBackground};
`;

const TotalSection = styled.div`
  align-items: end;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: ${GAP} 1rem;
  white-space: nowrap;
`;

const TotalNumber = styled.div`
  color: ${(p) => p.theme.colors.onBackgroundMuted};
  font-size: 1rem;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  line-height: 1;
`;

export const CardContainer = styled.button`
  ${BORDER_LIGHT}

  background-color: ${(p) => p.theme.colors.background};
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  cursor: pointer;
  display: grid;
  grid-template-columns: min-content 1fr min-content;
  margin: 0;
  overflow: hidden;
  padding: 0;
  text-align: left;
  transition: 100ms ease-out;
  transition-property: background-color, color, border-color;
  width: 100%;

  :focus:focus-visible {
    ${INSET_FOCUS_OUTLINE}
  }

  :hover {
    background-color: ${(p) => p.theme.colors.primaryContainer};
  }

  :disabled {
    background-color: ${(p) => p.theme.colors.containerLow};
    color: ${(p) => p.theme.colors.onBackgroundMuted};
    cursor: not-allowed;

    ${IconSection},
    ${Title},
    ${TotalNumber} {
      color: ${(p) => p.theme.colors.onBackgroundMuted};
    }
  }

  &[aria-selected='true'] {
    background-color: ${(p) => p.theme.colors.primaryContainer};

    ${Title},
    ${TotalNumber} {
      color: ${(p) => p.theme.colors.primary};
    }

    ${Title} {
      font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
    }

    ${Meta} {
      color: ${(p) => p.theme.colors.onBackground};
    }
  }
`;

export function LocationCvrCard(props: LocationCvrCardProps): React.ReactNode {
  const {
    caption,
    count,
    disabled,
    header,
    icon,
    iconLabel,
    id,
    name,
    onClick,
    selected = false,
  } = props;

  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (!selected) return;

    ref.current?.scrollIntoView({
      behavior: 'auto',
      block: 'nearest',
    });
  }, [selected]);

  return (
    <CardContainer
      aria-selected={selected}
      disabled={disabled}
      onClick={() => onClick(id)}
      ref={ref}
      // selected={selected}
    >
      <IconSection>
        {icon}
        {iconLabel && <IconLabel>{iconLabel}</IconLabel>}
      </IconSection>

      <ContentSection>
        {header && <Caption>{header}</Caption>}
        <Title>{name}</Title>
        <Meta>{caption}</Meta>
      </ContentSection>

      <TotalSection>
        <TotalNumber>{format.count(count)}</TotalNumber>
      </TotalSection>
    </CardContainer>
  );
}
