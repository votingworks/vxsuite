/* istanbul ignore file */

import { Caption, Icons, StyledButtonProps } from '@votingworks/ui';
import { format } from '@votingworks/utils';
import React, { type ReactNode } from 'react';
import styled, { css } from 'styled-components';
import { PollingPlaceType, pollingPlaceTypeName } from '@votingworks/types';
import { useShadedBg } from './00_hooks';

interface CvrCardProps {
  count: number;
  fileCount: number;
  id: string;
  machineIds: Set<string>;
  onSelect: (placeId: string) => void;
  selected: boolean;
  showTotalSection?: boolean;
  title: ReactNode;
  type: PollingPlaceType;
}

const BORDER_COLOR = '#ddd';

const IconSection = styled.div`
  align-items: center;
  border-right: 1px solid ${BORDER_COLOR};
  display: flex;
  font-size: 1.25rem;
  height: 100%;
  justify-content: center;
  padding: 1rem;
`;

const TotalSection = styled.div`
  align-items: end;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 0.5rem 1rem;
  white-space: nowrap;
`;

const TotalNumber = styled.div`
  color: ${(p) => p.theme.colors.onBackgroundMuted};
  font-size: 1rem;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  line-height: 1.2;
`;

const ContentSection = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  padding: 0.5rem;
`;

const Title = styled.div`
  color: ${(p) => p.theme.colors.onBackground};
`;

const MachineInfo = styled(Caption)`
  color: #666;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const NoDataNotice = styled(Caption)`
  color: #666;
`;

const PlaceType = styled(Caption)`
  color: #666;
`;

const Meta = styled.div`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Header = styled.div`
  color: #666;
  display: flex;
  flex-direction: column;
`;

const selectedCardCss = css`
  background-color: ${(p) => p.theme.colors.primaryContainer} !important;

  ${Title},
  ${TotalNumber} {
    color: ${(p) => p.theme.colors.primary};
  }
`;

const CardContainer = styled.button<
  { selected: boolean; usingShadedBg?: boolean } & StyledButtonProps
>`
  padding: 0;
  background-color: ${(p) => p.theme.colors.background};
  border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  border: 1px solid ${BORDER_COLOR};
  cursor: pointer;
  display: grid;
  grid-template-columns: min-content 1fr;
  outline-offset: -${(p) => p.theme.sizes.bordersRem.medium}rem;
  overflow: hidden;
  text-align: left;
  transition: all 100ms ease-in;
  width: 100%;

  ${IconSection} {
    background-color: ${(p) =>
      p.usingShadedBg ? p.theme.colors.background : '#f7f7f7'};
  }

  :hover {
    background-color: ${(p) => p.theme.colors.containerLow};
  }

  ${(p) => (p.selected ? selectedCardCss : undefined)}
`;

const CardContainerWithTotal = styled(CardContainer)`
  grid-template-columns: min-content 1fr min-content;
`;

// const TotalLabel = styled.div`
//   font-size: 0.6rem;
//   text-align: right;
// `;

export function CvrCard({
  count,
  fileCount,
  id,
  machineIds,
  onSelect,
  selected,
  showTotalSection = false,
  title,
  type,
}: CvrCardProps): React.ReactNode {
  const ref = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!selected) return;

    ref.current?.scrollIntoView({
      block: 'nearest',
      behavior: 'auto',
    });
  }, [selected]);

  const usingShadedBg = useShadedBg();

  const machineFileDescription = (() => {
    if (machineIds.size === 0) return null;

    const fileLabel = `${fileCount} ${pluralize(fileCount, 'file', 'files')}`;
    if (machineIds.size === 1) {
      const [machineId] = machineIds;
      return `${fileLabel} from scanner ${machineId}`;
    }

    return `${fileLabel} from ${machineIds.size} ${pluralize(
      machineIds.size,
      'scanner',
      'scanners'
    )}`;
  })();

  const Container = showTotalSection ? CardContainerWithTotal : CardContainer;

  return (
    <Container
      onClick={() => onSelect(id)}
      ref={ref}
      usingShadedBg={usingShadedBg}
      selected={selected}
    >
      <IconSection>
        {machineIds.size > 0 ? (
          <Icons.Done color="primary" />
        ) : (
          <Icons.Info color="inverseWarning" />
        )}
      </IconSection>

      <ContentSection>
        <Header>
          <Title>{title}</Title>
        </Header>

        <Meta>
          <PlaceType>{pollingPlaceTypeName(type)} &bull; </PlaceType>
          {machineIds.size > 0 ? (
            <MachineInfo>{machineFileDescription}</MachineInfo>
          ) : (
            <NoDataNotice>No CVRs loaded yet</NoDataNotice>
          )}
        </Meta>
      </ContentSection>

      {showTotalSection && (
        <TotalSection>
          <TotalNumber>{format.count(count)}</TotalNumber>
        </TotalSection>
      )}
    </Container>
  );
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}
