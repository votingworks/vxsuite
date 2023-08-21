import styled from 'styled-components';

import { AnyContest } from '@votingworks/types';

import pluralize from 'pluralize';
import { ContestList } from './contest_list';
import { useLayoutConfig } from './use_layout_config_hook';
import { MisvoteWarningsProps } from './types';

interface ContainerProps {
  numCardsPerRow: number;
}

const Container = styled.div<ContainerProps>`
  display: grid;
  flex-direction: column;
  grid-template-columns: repeat(${(p) => p.numCardsPerRow}, 1fr);
  grid-gap: 0.5rem;
`;

function pluralizeThisContestPhrase(contests: readonly AnyContest[]) {
  return `${pluralize('this', contests.length)} ${pluralize(
    'contest',
    contests.length
  )}`;
}

export function WarningDetails(props: MisvoteWarningsProps): JSX.Element {
  const { blankContests, overvoteContests, partiallyVotedContests } = props;
  const layout = useLayoutConfig(props);

  return (
    <Container numCardsPerRow={layout.numCardsPerRow}>
      {blankContests.length > 0 && (
        <ContestList
          contests={blankContests}
          maxColumns={layout.maxColumnsPerCard}
          title="No votes marked:"
          helpNote={`Did you mean to leave ${pluralizeThisContestPhrase(
            blankContests
          )} blank?`}
        />
      )}

      {partiallyVotedContests.length > 0 && (
        <ContestList
          contests={partiallyVotedContests}
          maxColumns={layout.maxColumnsPerCard}
          title="You may add one or more votes:"
          helpNote={`All other votes in ${pluralizeThisContestPhrase(
            partiallyVotedContests
          )} will count, even if you leave some blank.`}
        />
      )}

      {overvoteContests.length > 0 && (
        <ContestList
          contests={overvoteContests}
          maxColumns={layout.maxColumnsPerCard}
          title="Too many votes marked:"
          helpNote={`Your votes in ${pluralizeThisContestPhrase(
            overvoteContests
          )} will not be counted.`}
        />
      )}
    </Container>
  );
}
