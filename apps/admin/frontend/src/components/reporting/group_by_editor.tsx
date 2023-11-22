import { Tabulation } from '@votingworks/types';
import { CheckboxGroup } from '@votingworks/ui';

export type GroupByType = keyof Tabulation.GroupBy;

const GROUPING_LABEL: Record<GroupByType, string> = {
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
  allowedGroupings: GroupByType[];
}

export function GroupByEditor({
  groupBy,
  setGroupBy,
  allowedGroupings,
}: GroupByEditorProps): JSX.Element {
  return (
    <CheckboxGroup
      hideLabel
      label="Report By"
      direction="row"
      options={allowedGroupings.map((grouping) => ({
        value: grouping,
        label: GROUPING_LABEL[grouping],
      }))}
      value={
        Object.keys(groupBy).filter(
          (grouping) => groupBy[grouping as GroupByType]
        ) as GroupByType[]
      }
      onChange={(value) =>
        setGroupBy(
          Object.fromEntries(value.map((grouping) => [grouping, true]))
        )
      }
    />
  );
}
