import React from 'react';
import styled from 'styled-components';

import { Election, ContestId } from '@votingworks/types';

import { Table, TD } from './table';
import { Prose } from './prose';
import { Text } from './text';

interface ContestProps {
  dim?: boolean;
}

const Contest = styled.div<ContestProps>`
  margin: 1rem 0;
  color: ${({ dim }) => (dim ? '#cccccc' : undefined)};
  page-break-inside: avoid;
  p:first-child {
    margin-bottom: 0;
  }
  h3 {
    margin-top: 0;
    margin-bottom: 0.5em;
    & + p {
      margin-top: -0.8em;
      margin-bottom: 0.25em;
    }
    & + table {
      margin-top: -0.5em;
    }
  }
`;

interface Props {
  election: Election;
  writeInCounts: Map<ContestId, Map<string, number>>;
}

export function ContestWriteInTally({
  election,
  writeInCounts,
}: Props): JSX.Element {
  return (
    <React.Fragment>
      {election.contests.map((contest) => {
        const contestWriteInCounts = writeInCounts.get(contest.id);
        if (!contestWriteInCounts) {
          return null;
        }

        const contestOptionTableRows: JSX.Element[] = [];
        switch (contest.type) {
          case 'candidate': {
            for (const [transcribedValue, count] of contestWriteInCounts) {
              const key = `${contest.id}-${transcribedValue}`;
              contestOptionTableRows.push(
                <tr key={key} data-testid={key}>
                  <td>{transcribedValue}</td>
                  <TD narrow textAlign="right">
                    {count}
                  </TD>
                </tr>
              );
            }
            break;
          }
          default:
            break;
        }

        return (
          <Contest key={`div-${contest.id}`}>
            <Prose maxWidth={false} data-testid={`results-table-${contest.id}`}>
              {contest.section !== contest.title && (
                <Text small>{contest.section}</Text>
              )}
              <h3>{contest.title}</h3>
              <Table borderTop condensed>
                <tbody>{contestOptionTableRows}</tbody>
              </Table>
            </Prose>
          </Contest>
        );
      })}
    </React.Fragment>
  );
}
