/* istanbul ignore file - @preserve - currently tested via apps. */

import {
  assert,
  assertDefined,
  find,
  throwIllegalValue,
} from '@votingworks/basics';
import {
  getPartyForBallotStyle,
  type BallotStyleId,
  type Election,
  type PrecinctId,
  type PrecinctOrSplit,
  type PrecinctSplitId,
} from '@votingworks/types';
import {
  Button,
  electionStrings,
  Font,
  P,
  SearchSelect,
} from '@votingworks/ui';
import { getBallotStyleGroupsForPrecinctOrSplit } from '@votingworks/utils';
import { useState } from 'react';
import { ButtonGrid } from './elements';

export type OnBallotStyleSelect = (
  precinctId: PrecinctId,
  ballotStyleId: BallotStyleId
) => void;

export interface BallotStyleSelectProps {
  election: Election;
  configuredPrecinctsAndSplits: PrecinctOrSplit[];
  onSelect: OnBallotStyleSelect;
  disabled?: boolean;
}

export function BallotStyleSelect(props: BallotStyleSelectProps): JSX.Element {
  const { election, configuredPrecinctsAndSplits, onSelect, disabled } = props;

  // Only used for primary elections
  const [selectedPrecinctOrSplitId, setSelectedPrecinctOrSplitId] = useState<
    PrecinctId | PrecinctSplitId
  >();

  switch (election.type) {
    case 'general': {
      // eslint-disable-next-line no-inner-declarations
      function getBallotStyleForPrecinctOrSplit(
        precinctOrSplit: PrecinctOrSplit
      ) {
        const ballotStyleGroups = getBallotStyleGroupsForPrecinctOrSplit({
          election,
          precinctOrSplit,
        });
        assert(
          ballotStyleGroups.length === 1,
          'General elections should have exactly one ballot style group per precinct or split'
        );
        return ballotStyleGroups[0].defaultLanguageBallotStyle;
      }

      if (configuredPrecinctsAndSplits.length === 1) {
        const [precinctOrSplit] = configuredPrecinctsAndSplits;
        const { precinct } = precinctOrSplit;
        return (
          <Button
            onPress={() =>
              onSelect(
                precinct.id,
                getBallotStyleForPrecinctOrSplit(precinctOrSplit).id
              )
            }
            rightIcon="Next"
            disabled={disabled}
            variant="primary"
          >
            Start Voting Session: {electionStrings.precinctName(precinct)}
          </Button>
        );
      }
      return (
        <SearchSelect
          aria-label="Select ballot precinct"
          placeholder="Select ballot style…"
          options={configuredPrecinctsAndSplits.map((precinctOrSplit) =>
            precinctOrSplit.split
              ? {
                  label: precinctOrSplit.split.name,
                  value: precinctOrSplit.split.id,
                }
              : {
                  label: precinctOrSplit.precinct.name,
                  value: precinctOrSplit.precinct.id,
                }
          )}
          value=""
          onChange={(value) => {
            const precinctOrSplit = find(
              configuredPrecinctsAndSplits,
              // eslint-disable-next-line @typescript-eslint/no-shadow
              (precinctOrSplit) =>
                value ===
                (precinctOrSplit.split?.id ?? precinctOrSplit.precinct.id)
            );
            onSelect(
              precinctOrSplit.precinct.id,
              getBallotStyleForPrecinctOrSplit(precinctOrSplit).id
            );
          }}
          style={{ width: '100%' }}
          disabled={disabled}
        />
      );
    }

    case 'primary': {
      const selectedPrecinctOrSplit =
        configuredPrecinctsAndSplits.length === 1
          ? configuredPrecinctsAndSplits[0]
          : selectedPrecinctOrSplitId &&
            find(
              configuredPrecinctsAndSplits,
              (precinctOrSplit) =>
                precinctOrSplit.split?.id === selectedPrecinctOrSplitId ||
                precinctOrSplit.precinct.id === selectedPrecinctOrSplitId
            );
      return (
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
        >
          {configuredPrecinctsAndSplits.length > 1 && (
            <SearchSelect
              aria-label="Select voter's precinct"
              placeholder="Select voter's precinct…"
              options={configuredPrecinctsAndSplits.map((precinctOrSplit) =>
                precinctOrSplit.split
                  ? {
                      label: precinctOrSplit.split.name,
                      value: precinctOrSplit.split.id,
                    }
                  : {
                      label: precinctOrSplit.precinct.name,
                      value: precinctOrSplit.precinct.id,
                    }
              )}
              value={selectedPrecinctOrSplitId}
              onChange={setSelectedPrecinctOrSplitId}
              style={{ width: '100%' }}
              disabled={disabled}
            />
          )}

          {selectedPrecinctOrSplit && (
            <P>
              <Font weight="semiBold">Select ballot style:</Font>
              <ButtonGrid>
                {getBallotStyleGroupsForPrecinctOrSplit({
                  election,
                  precinctOrSplit: selectedPrecinctOrSplit,
                }).map((ballotStyleGroup) => {
                  const ballotStyleId =
                    ballotStyleGroup.defaultLanguageBallotStyle.id;
                  return (
                    <Button
                      key={ballotStyleId}
                      onPress={() =>
                        onSelect(
                          selectedPrecinctOrSplit.precinct.id,
                          ballotStyleId
                        )
                      }
                      disabled={disabled}
                    >
                      {
                        assertDefined(
                          getPartyForBallotStyle({ election, ballotStyleId })
                        ).name
                      }
                    </Button>
                  );
                })}
              </ButtonGrid>
            </P>
          )}
        </div>
      );
    }

    default: {
      /* istanbul ignore next - @preserve */
      throwIllegalValue(election.type);
    }
  }
}
