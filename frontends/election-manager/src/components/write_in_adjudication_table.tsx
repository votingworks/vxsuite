import { ContestOptionId, Id } from '@votingworks/types';
import {
  Button,
  Prose,
  Select,
  Table as TableUI,
  TD as TableDataUI,
  Text,
  TH,
} from '@votingworks/ui';
import { find, format } from '@votingworks/utils';
import React, { useState } from 'react';
import styled from 'styled-components';

export interface WriteInAdjudication {
  readonly id: Id;
  readonly adjudicatedValue: string;
  readonly transcribedValue: string;
  readonly writeInCount: number;
}

export interface AdjudicationGroup {
  readonly adjudicatedValue: string;
  readonly writeInCount: number;
  readonly writeInAdjudications: WriteInAdjudication[];
}

export interface PendingWriteInAdjudication {
  readonly transcribedValue: string;
  readonly writeInCount: number;
}

export interface AdjudicationOption {
  adjudicatedValue: string;
  adjudicatedOptionId?: ContestOptionId;
  hasAdjudication: boolean;
}

export interface Props {
  readonly adjudicatedGroups: readonly AdjudicationGroup[];
  readonly pendingAdjudications: readonly PendingWriteInAdjudication[];
  readonly adjudicationQueuePhrase: string;
  readonly adjudicationValues: readonly AdjudicationOption[];
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
  adjudicatedGroup: AdjudicationGroup;
}): JSX.Element {
  return (
    <StyledAdjudicatedRow>
      <TD nowrap>
        <Prose>
          <h3>{adjudicatedGroup.adjudicatedValue}</h3>
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
  options,
  defaultValue,
  small,
  onChange,
}: {
  options: readonly AdjudicationOption[];
  defaultValue?: AdjudicationOption;
  small?: boolean;
  onChange: (option: AdjudicationOption) => void;
}): JSX.Element {
  return (
    <Select
      defaultValue={defaultValue?.adjudicatedValue ?? ''}
      small={small}
      onChange={(event) =>
        onChange(
          find(
            options,
            ({ adjudicatedValue: name }) => name === event.target.value
          )
        )
      }
    >
      <option disabled value="">
        Select adjudicated candidate name…
      </option>
      {options.map((option) => (
        <option
          key={option.adjudicatedValue}
          value={option.adjudicatedValue}
          disabled={option.hasAdjudication}
        >
          {option.adjudicatedValue}
        </option>
      ))}
    </Select>
  );
}

function AdjudicationRow({
  adjudication,
  updateAdjudication,
  adjudicationValues,
}: {
  adjudication: WriteInAdjudication;
  updateAdjudication: Props['updateAdjudication'];
  adjudicationValues: Props['adjudicationValues'];
}): JSX.Element {
  const [isChanging, setIsChanging] = useState(false);

  return (
    <tr key={adjudication.transcribedValue} className="transcription-row">
      <TD nowrap>{adjudication.transcribedValue}</TD>
      <TD textAlign="center">{format.count(adjudication.writeInCount)}</TD>
      <TD nowrap>
        {isChanging ? (
          <AdjudicationSelect
            defaultValue={adjudicationValues.find(
              (option) =>
                option.adjudicatedValue === adjudication.adjudicatedValue
            )}
            small={!!adjudication.transcribedValue}
            options={adjudicationValues}
            onChange={(option) => {
              updateAdjudication(
                adjudication.id,
                option.adjudicatedValue,
                option.adjudicatedOptionId
              );
              setIsChanging(false);
            }}
          />
        ) : (
          <Button small onPress={() => setIsChanging(true)}>
            Change
          </Button>
        )}
      </TD>
    </tr>
  );
}

function PendingAdjudicationRow({
  pendingAdjudication,
  adjudicateTranscription,
  adjudicationValues,
}: {
  pendingAdjudication: PendingWriteInAdjudication;
  adjudicateTranscription: Props['adjudicateTranscription'];
  adjudicationValues: Props['adjudicationValues'];
}): JSX.Element {
  return (
    <tr
      key={pendingAdjudication.transcribedValue}
      className="transcription-row"
    >
      <TD nowrap>{pendingAdjudication.transcribedValue}</TD>
      <TD textAlign="center">
        {format.count(pendingAdjudication.writeInCount)}
      </TD>
      <TD nowrap>
        <AdjudicationSelect
          options={adjudicationValues}
          onChange={(option) =>
            adjudicateTranscription(
              pendingAdjudication.transcribedValue,
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
  adjudicatedGroups,
  pendingAdjudications,
  adjudicationQueuePhrase,
  adjudicationValues,
  adjudicateTranscription,
  updateAdjudication,
}: Props): JSX.Element {
  const hasAdjudicatedTranscriptions = adjudicatedGroups.length > 0;
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
        {adjudicatedGroups.map((adjudicatedGroup) => {
          return (
            <React.Fragment key={adjudicatedGroup.adjudicatedValue}>
              <AdjudicatedGroupHeaderRow adjudicatedGroup={adjudicatedGroup} />
              {adjudicatedGroup.writeInAdjudications.map((adjudication) => (
                <AdjudicationRow
                  key={adjudication.id}
                  adjudication={adjudication}
                  updateAdjudication={updateAdjudication}
                  adjudicationValues={adjudicationValues}
                />
              ))}
            </React.Fragment>
          );
        })}
        {pendingAdjudications.length > 0 && (
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
        {pendingAdjudications.map((pendingAdjudication) => (
          <PendingAdjudicationRow
            key={pendingAdjudication.transcribedValue}
            pendingAdjudication={pendingAdjudication}
            adjudicateTranscription={adjudicateTranscription}
            adjudicationValues={adjudicationValues}
          />
        ))}
      </tbody>
    </Table>
  );
}
