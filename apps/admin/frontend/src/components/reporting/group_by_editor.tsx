import { Tabulation } from '@votingworks/types';
import { CheckboxGroup } from '@votingworks/ui';

export type GroupByEditorOption =
  | keyof Tabulation.GroupBy
  | 'includeSheetCounts';

const GROUPING_LABEL: Record<GroupByEditorOption, string> = {
  groupByParty: 'Party',
  groupByPrecinct: 'Precinct',
  groupByBallotStyle: 'Ballot Style',
  groupByVotingMethod: 'Voting Method',
  groupByBatch: 'Batch',
  groupByScanner: 'Scanner',
  includeSheetCounts: 'Sheet',
};

export interface GroupByEditorProps {
  groupBy: Tabulation.GroupBy;
  includeSheetCounts?: boolean;
  setGroupBy: (groupBy: Tabulation.GroupBy) => void;
  setIncludeSheetCounts?: (includeSheetCounts: boolean) => void;
  allowedOptions: GroupByEditorOption[];
}

export function GroupByEditor({
  groupBy,
  includeSheetCounts,
  setGroupBy,
  setIncludeSheetCounts,
  allowedOptions: allowedGroupings,
}: GroupByEditorProps): JSX.Element {
  const checkboxValues: GroupByEditorOption[] = (
    Object.keys(groupBy) as Array<keyof Tabulation.GroupBy>
  ).filter((grouping) => groupBy[grouping]);
  if (includeSheetCounts) {
    checkboxValues.push('includeSheetCounts');
  }

  function onChange(newCheckboxValues: GroupByEditorOption[]): void {
    setGroupBy(
      Object.fromEntries(
        newCheckboxValues
          .filter((v) => v !== 'includeSheetCounts')
          .map((grouping) => [grouping, true])
      )
    );
    setIncludeSheetCounts?.(newCheckboxValues.includes('includeSheetCounts'));
  }

  return (
    <CheckboxGroup
      hideLabel
      label="Report By"
      direction="row"
      options={allowedGroupings.map((grouping) => ({
        value: grouping,
        label: GROUPING_LABEL[grouping],
      }))}
      value={checkboxValues}
      onChange={onChange}
    />
  );
}
