import React from 'react';
import styled, { css } from 'styled-components';

import { buttonStyles, ButtonVariant } from './button';
import { Checkbox } from './checkbox';
import { Icons } from './icons';
import { Caption, Font, H1, H2, H3, H4, H5, HeadingProps, P } from './typography';

export interface ContestVote {
  caption?: string;
  id: string;
  label: string;
}

export interface ContestVoterSummaryProps {
  districtName: string;
  title: string;
  titleType: HeadingProps['as'];
  undervoteWarning?: string;
  votes: ContestVote[];
}

type StyleProps = {
  gridArea?: string;
  isSelected: boolean;
  variant?: ButtonVariant;
};

const StyledDistrictName = styled(Caption)`
  display: block;
  margin-bottom: 0;
`;

const StyledListItem = styled(P)`
  margin-bottom: 0.2rem;
`;

const StyledVoteLabel = styled.span`
  vertical-align: middle;
`;

const StyledCheckboxContainer = styled.span`
  font-size: 0.65rem;
  margin-right: 0.5em;
  vertical-align: middle;
`;

export function ContestVoterSummary(
  props: ContestVoterSummaryProps
): JSX.Element {
  const { districtName, title, titleType, undervoteWarning, votes } = props;

  return (
    <div>
      <H5 as={titleType}>
        <StyledDistrictName weight="regular">{districtName}</StyledDistrictName>
        {title}
      </H5>
      {undervoteWarning && (
        <P color="warning">
          <Caption>
            <Icons.Warning /> {undervoteWarning}
          </Caption>
        </P>
      )}
      {votes.map((v) => (
        <StyledListItem key={v.id}>
          <StyledCheckboxContainer>
            <Font color="success">
              <Checkbox checked />
            </Font>
          </StyledCheckboxContainer>
          <StyledVoteLabel>
            <Font>{v.label}</Font>
            {v.caption && (
              <>
                {' '}
                / <Caption weight="light">{v.caption}</Caption>
              </>
            )}
          </StyledVoteLabel>
        </StyledListItem>
      ))}
    </div>
  );
}
