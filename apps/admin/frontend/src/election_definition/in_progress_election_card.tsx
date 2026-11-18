import React from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import type { ElectionInfo } from '@votingworks/election-definition-backend';
import { Icons } from '@votingworks/ui';
import {
  ElectionCard,
  type ElectionCardProps,
} from '../components/election_card.js';
import { routerPaths } from '../router_paths.js';

const EditLabel = styled.span`
  align-items: center;
  color: ${(p) => p.theme.colors.primary};
  display: flex;
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
  gap: 0.5rem;
  margin-left: auto;
  opacity: 0;
`;

const CardLink = styled(Link)`
  color: inherit;
  display: block;
  text-decoration: none;

  &:hover ${EditLabel}, &:focus-visible ${EditLabel} {
    opacity: 1;
  }
`;

export function ElectionCardLink({
  to,
  action,
  ...cardProps
}: ElectionCardProps & {
  to: string;
  action: 'edit' | 'view';
}): JSX.Element {
  return (
    <CardLink to={to}>
      <ElectionCard {...cardProps}>
        <EditLabel>
          {action === 'view' ? (
            <React.Fragment>
              <Icons.Eye /> View
            </React.Fragment>
          ) : (
            <React.Fragment>
              <Icons.Edit /> Edit
            </React.Fragment>
          )}
        </EditLabel>
      </ElectionCard>
    </CardLink>
  );
}

export function InProgressElectionCard({
  electionInfo,
}: {
  electionInfo: ElectionInfo;
}): JSX.Element {
  return (
    <ElectionCardLink
      to={routerPaths.electionDefinitionInfo(electionInfo.electionId)}
      action="edit"
      seal={electionInfo.seal}
      title={electionInfo.title || 'Untitled Election'}
      jurisdictionName={electionInfo.jurisdictionName}
      state={electionInfo.state}
      date={electionInfo.date}
    />
  );
}
