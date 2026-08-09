import { assert, assertDefined, find } from '@votingworks/basics';
import {
  getPartyForBallotStyle,
  isCombinedBallotPrimary,
  type BallotStyleId,
  type Election,
  type PrecinctId,
  type PrecinctOrSplit,
  type PrecinctSplitId,
} from '@votingworks/types';
import { Button, Font, P, SearchSelect } from '@votingworks/ui';
import { getBallotStyleGroupsForPrecinctOrSplit } from '@votingworks/utils';
import { useState } from 'react';
import { ButtonGrid } from './elements.js';

export type OnBallotStyleSelect = (
  precinctId: PrecinctId,
  ballotStyleId: BallotStyleId
) => void;

export interface BallotStyleSelectProps {
  election: Election;
  configuredPrecinctsAndSplits: PrecinctOrSplit[];
  onSelect: OnBallotStyleSelect;
  disabled?: boolean;
  /** Highlights the button for this ballot style, if any, as selected. */
  selectedBallotStyleId?: BallotStyleId;
}

export function BallotStyleSelect(props: BallotStyleSelectProps): JSX.Element {
  const {
    election,
    configuredPrecinctsAndSplits,
    onSelect,
    disabled,
    selectedBallotStyleId,
  } = props;

  // Only used for primary elections
  const [selectedPrecinctOrSplitId, setSelectedPrecinctOrSplitId] = useState<
    PrecinctId | PrecinctSplitId
  >();

  function getBallotStyleForPrecinctOrSplit(precinctOrSplit: PrecinctOrSplit) {
    const ballotStyleGroups = getBallotStyleGroupsForPrecinctOrSplit({
      election,
      precinctOrSplit,
    });
    assert(
      ballotStyleGroups.length === 1,
      'Expected exactly one ballot style group per precinct or split'
    );
    return ballotStyleGroups[0].defaultLanguageBallotStyle;
  }

  if (election.type === 'general' || isCombinedBallotPrimary(election)) {
    if (configuredPrecinctsAndSplits.length === 1) {
      const [precinctOrSplit] = configuredPrecinctsAndSplits;
      const { precinct } = precinctOrSplit;
      const ballotStyleId =
        getBallotStyleForPrecinctOrSplit(precinctOrSplit).id;
      return (
        <Button
          onPress={() => onSelect(precinct.id, ballotStyleId)}
          rightIcon="Next"
          disabled={disabled}
          variant={
            ballotStyleId === selectedBallotStyleId ? 'primary' : 'neutral'
          }
        >
          {precinct.name}
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
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
                    onSelect(selectedPrecinctOrSplit.precinct.id, ballotStyleId)
                  }
                  disabled={disabled}
                  variant={
                    ballotStyleId === selectedBallotStyleId
                      ? 'primary'
                      : 'neutral'
                  }
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
