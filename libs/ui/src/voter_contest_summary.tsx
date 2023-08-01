import styled from 'styled-components';

import { Checkbox } from './checkbox';
import { Icons } from './icons';
import { Caption, Font, H5, HeadingProps, P } from './typography';

export interface VoterContestSummaryProps {
  districtName: string;
  title: string;
  titleType: HeadingProps['as'];
  undervoteWarning?: string;
  votes: ContestVote[];
  'data-testid'?: string;
}

export interface ContestVote {
  caption?: string;
  label: string;
}

const ListContainer = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
`;

const DistrictName = styled(Caption)`
  display: block;
  margin-bottom: 0;
`;

const VoteInfo = styled.li`
  align-items: start;
  display: flex;
  flex-wrap: nowrap;
  gap: 0.25rem;
  margin-bottom: 0.25rem;
`;

const CheckboxContainer = styled(Font)`
  font-size: 0.65rem;
`;

/** Vote summary list for a single contest, for a single voter session. */
export function VoterContestSummary(
  props: VoterContestSummaryProps
): JSX.Element {
  const {
    districtName,
    title,
    titleType,
    undervoteWarning,
    votes,
    'data-testid': testId,
  } = props;

  return (
    <div data-testid={testId}>
      <H5 as={titleType}>
        <DistrictName weight="regular">{districtName}</DistrictName>
        {title}
      </H5>
      {undervoteWarning && (
        <P color="warning">
          <Caption>
            <Icons.Warning /> {undervoteWarning}
          </Caption>
        </P>
      )}
      <ListContainer>
        {votes.map((v) => (
          <VoteInfo key={v.label}>
            <CheckboxContainer color="success">
              <Checkbox checked />
            </CheckboxContainer>
            <span>
              <Font>{v.label}</Font>
              {v.caption && (
                <Caption noWrap weight="light">
                  {' '}
                  | {v.caption}
                </Caption>
              )}
            </span>
          </VoteInfo>
        ))}
      </ListContainer>
    </div>
  );
}
