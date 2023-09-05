import { Tabulation } from '@votingworks/types';
import styled from 'styled-components';
import { Checkbox, Font } from '@votingworks/ui';

type Grouping = keyof Tabulation.GroupBy;

function getAllowedGroupings(): Grouping[] {
  return ['groupByPrecinct', 'groupByVotingMethod', 'groupByBallotStyle'];
}

const GROUPING_LABEL: Record<Grouping, string> = {
  groupByParty: 'Party',
  groupByPrecinct: 'Precinct',
  groupByBallotStyle: 'Ballot Style',
  groupByVotingMethod: 'Voting Method',
  groupByBatch: 'Batch',
  groupByScanner: 'Scanner',
};

export interface GroupByEditorProps {
  groupBy: Tabulation.GroupBy;
  setGroupBy: (groupBy: Tabulation.GroupBy) => void;
}

const Container = styled.div`
  display: grid;
  grid-template-columns: repeat(4, min-content);
  gap: 0.75rem;
`;

const Item = styled.button`
  margin: 0;
  padding: 0.25rem;
  cursor: pointer;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 0.5rem;
  background: none;
  border: none;
  font-weight: 300;
  color: inherit;
`;

const ItemLabel = styled(Font)`
  white-space: nowrap;
`;

const CheckboxContainer = styled.div`
  border: none;
  background: none;
  padding: 0;
  margin: 0;
  flex-grow: 0;
  flex-shrink: 0;
  font-size: 0.8em;
`;

export function GroupByEditor({
  groupBy,
  setGroupBy,
}: GroupByEditorProps): JSX.Element {
  function toggleGrouping(grouping: Grouping): void {
    setGroupBy({
      ...groupBy,
      [grouping]: !groupBy[grouping],
    });
  }

  const allowedGroupings = getAllowedGroupings();
  return (
    <Container data-testid="group-by-editor">
      {allowedGroupings.map((grouping) => {
        const checked = Boolean(groupBy[grouping]);
        return (
          <Item
            key={grouping}
            onClick={() => toggleGrouping(grouping)}
            aria-label={`Report By ${GROUPING_LABEL[grouping]}`}
            aria-pressed={checked}
          >
            <CheckboxContainer>
              <Checkbox checked={checked} />
            </CheckboxContainer>
            <ItemLabel>{GROUPING_LABEL[grouping]}</ItemLabel>
          </Item>
        );
      })}
    </Container>
  );
}
