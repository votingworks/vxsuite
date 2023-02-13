import { Admin } from '@votingworks/api';
import { ContestOptionId, Id } from '@votingworks/types';
import {
  Button,
  Prose,
  Select,
  Table as TableUI,
  TD as TableDataUI,
  Text,
  TH,
} from '@votingworks/shared-frontend';
import { find } from '@votingworks/basics';
import { format } from '@votingworks/shared';
import React, { useState } from 'react';
import styled from 'styled-components';

export interface Props {
  readonly adjudicationTable: Admin.WriteInAdjudicationTable;
  readonly adjudicationQueuePhrase: string;
  readonly adjudicateTranscription: (
    transcribedValue: string,
    adjudicatedValue: string,
    adjudicatedOptionId?: ContestOptionId
  ) => void;
  readonly updateAdjudication: (
    id: Id,
    adjudicatedValue: string,
    adjudicatedOptionId?: ContestOptionId
  ) => void;
}

const InvertedTableRow = styled.tr<{ primary?: boolean }>`
  th,
  td {
    border-width: 1px 0;
    border-color: ${({ primary }) => (primary ? 'rgb(57 132 59)' : '#ffffff')};
    background: ${({ primary }) => (primary ? 'rgb(71, 167, 75)' : '#455a64')};
    color: #ffffff;
  }
`;

const StyledAdjudicatedRow = styled.tr`
  td {
    background: #dce1e5;
  }
`;

const Table = styled(TableUI)`
  tr:last-child {
    td,
    th {
      border-bottom: none;
    }
  }
`;

const TD = styled(TableDataUI)`
  width: 1%;
  .transcription-row &:nth-child(2) {
    width: 100%;
  }
`;

function AdjudicatedGroupHeaderRow({
  adjudicatedGroup,
}: {
  adjudicatedGroup: Admin.WriteInAdjudicationTableAdjudicatedRowGroup;
}): JSX.Element {
  return (
    <StyledAdjudicatedRow>
      <TD nowrap>
        <Prose>
          <h3>
            {adjudicatedGroup.adjudicatedValue}
            {adjudicatedGroup.adjudicatedOptionId && (
              <React.Fragment> (official candidate)</React.Fragment>
            )}
          </h3>
        </Prose>
      </TD>
      <TD textAlign="center">
        <Prose>
          <h3>{format.count(adjudicatedGroup.writeInCount)}</h3>
        </Prose>
      </TD>
      <TD> </TD>
    </StyledAdjudicatedRow>
  );
}

function AdjudicationSelect({
  groups,
  defaultValue,
  small,
  onChange,
  onBlur,
}: {
  groups: readonly Admin.WriteInAdjudicationTableOptionGroup[];
  defaultValue?: Admin.WriteInAdjudicationTableOption;
  small?: boolean;
  onChange: (option: Admin.WriteInAdjudicationTableOption) => void;
  onBlur?: () => void;
}): JSX.Element {
  return (
    <Select
      defaultValue={defaultValue?.adjudicatedValue ?? ''}
      small={small}
      onChange={(event) =>
        onChange(
          find(
            groups.flatMap((g) => g.options),
            ({ adjudicatedValue }) => adjudicatedValue === event.target.value
          )
        )
      }
      onBlur={onBlur}
    >
      <option disabled value="">
        Select adjudicated candidate name…
      </option>
      {groups.map((group) => (
        <optgroup key={group.title} label={group.title}>
          {group.options.map((option) => (
            <option
              key={option.adjudicatedValue}
              value={option.adjudicatedValue}
              disabled={!option.enabled}
            >
              {option.adjudicatedValue}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}

function AdjudicationRow({
  rowData,
  groupData,
  updateAdjudication,
}: {
  rowData: Admin.WriteInAdjudicationTableAdjudicatedRow;
  groupData: Admin.WriteInAdjudicationTableAdjudicatedRowGroup;
  updateAdjudication: Props['updateAdjudication'];
}): JSX.Element {
  const [isChanging, setIsChanging] = useState(false);

  return (
    <tr key={rowData.transcribedValue} className="transcription-row">
      <TD nowrap>{rowData.transcribedValue}</TD>
      <TD textAlign="center">{format.count(rowData.writeInCount)}</TD>
      <TD nowrap>
        {isChanging ? (
          <AdjudicationSelect
            defaultValue={rowData.adjudicationOptionGroups
              .flatMap((group) => group.options)
              .find(
                (option) =>
                  option.adjudicatedValue === groupData.adjudicatedValue
              )}
            small={!!rowData.transcribedValue}
            groups={rowData.adjudicationOptionGroups}
            onChange={(option) => {
              updateAdjudication(
                rowData.writeInAdjudicationId,
                option.adjudicatedValue,
                option.adjudicatedOptionId
              );
              setIsChanging(false);
            }}
            onBlur={() => setIsChanging(false)}
          />
        ) : (
          <Button
            small
            onPress={() => setIsChanging(true)}
            disabled={!rowData.editable}
          >
            Change
          </Button>
        )}
      </TD>
    </tr>
  );
}

function TranscriptionRow({
  rowData,
  adjudicateTranscription,
}: {
  rowData: Admin.WriteInAdjudicationTableTranscribedRow;
  adjudicateTranscription: Props['adjudicateTranscription'];
}): JSX.Element {
  return (
    <tr key={rowData.transcribedValue} className="transcription-row">
      <TD nowrap>{rowData.transcribedValue}</TD>
      <TD textAlign="center">{format.count(rowData.writeInCount)}</TD>
      <TD nowrap>
        <AdjudicationSelect
          groups={rowData.adjudicationOptionGroups}
          onChange={(option) =>
            adjudicateTranscription(
              rowData.transcribedValue,
              option.adjudicatedValue,
              option.adjudicatedOptionId
            )
          }
        />
      </TD>
    </tr>
  );
}

export function WriteInAdjudicationTable({
  adjudicationTable,
  adjudicationQueuePhrase,
  adjudicateTranscription,
  updateAdjudication,
}: Props): JSX.Element {
  const hasAdjudicatedTranscriptions = adjudicationTable.adjudicated.length > 0;
  return (
    <Table>
      <thead>
        {hasAdjudicatedTranscriptions && (
          <InvertedTableRow>
            <TH>Adjudicated Transcriptions</TH>
            <TH>Count</TH>
            <TH>Action</TH>
          </InvertedTableRow>
        )}
      </thead>
      <tbody>
        {adjudicationTable.adjudicated.map((adjudicatedGroup) => {
          return (
            <React.Fragment key={adjudicatedGroup.adjudicatedValue}>
              <AdjudicatedGroupHeaderRow adjudicatedGroup={adjudicatedGroup} />
              {adjudicatedGroup.rows.map((rowData) => (
                <AdjudicationRow
                  key={rowData.writeInAdjudicationId}
                  rowData={rowData}
                  groupData={adjudicatedGroup}
                  updateAdjudication={updateAdjudication}
                />
              ))}
            </React.Fragment>
          );
        })}
        {adjudicationTable.transcribed.rows.length > 0 && (
          <InvertedTableRow primary>
            <TH>
              <Text as="span" normal>
                {adjudicationQueuePhrase}…
              </Text>
            </TH>
            <TD as="th" nowrap>
              {!hasAdjudicatedTranscriptions && 'Count'}
            </TD>
            <TD as="th" nowrap>
              {!hasAdjudicatedTranscriptions && 'Action'}
            </TD>
          </InvertedTableRow>
        )}
        {adjudicationTable.transcribed.rows.map((rowData) => (
          <TranscriptionRow
            key={rowData.transcribedValue}
            rowData={rowData}
            adjudicateTranscription={adjudicateTranscription}
          />
        ))}
      </tbody>
    </Table>
  );
}
