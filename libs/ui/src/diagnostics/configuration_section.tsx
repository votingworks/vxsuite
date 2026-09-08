import React from 'react';

import {
  BallotStyle,
  Election,
  ElectionDefinition,
  MarkThresholds,
  formatElectionHashes,
  pollingPlaceBallotStyles,
  pollingPlaceFromElection,
  pollingPlaceTypeName,
} from '@votingworks/types';
import { assertDefined, iter } from '@votingworks/basics';
import { format, getGroupedBallotStyles } from '@votingworks/utils';
import { Caption, H2, P } from '../typography.js';
import { InfoIcon, SuccessIcon, WarningIcon } from './icons.js';
import { Table } from '../table.js';

function truncate(num: number, decimals: number): number {
  return Math.trunc(num * 10 ** decimals) / 10 ** decimals;
}

export interface AllBallotStylesSectionProps {
  election?: Election;
}

export function AllBallotStylesSection({
  election,
}: AllBallotStylesSectionProps): React.ReactNode {
  if (!election) return null;
  return <BallotStylesSection ballotStyles={election.ballotStyles} />;
}

interface BallotStylesSectionProps {
  ballotStyles: readonly BallotStyle[];
}

function BallotStylesSection(props: BallotStylesSectionProps): React.ReactNode {
  const { ballotStyles } = props;

  const ballotStyleGroups = getGroupedBallotStyles(ballotStyles);
  const isSingleLanguage = ballotStyleGroups.every(
    (bs) => bs.ballotStyles.length === 1
  );

  if (isSingleLanguage) {
    return (
      <P>
        <SuccessIcon /> Ballot Styles:{' '}
        {ballotStyles.map((bs) => bs.id).join(', ')}
      </P>
    );
  }

  return (
    <section style={{ marginBottom: '0.5rem' }}>
      <P>
        <SuccessIcon /> Ballot Styles:
      </P>
      <Table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Languages</th>
          </tr>
        </thead>
        <tbody>
          {ballotStyleGroups.map((group) => {
            const ballotStylesInGroup = group.ballotStyles;
            const languages = iter(ballotStylesInGroup)
              .flatMap((bs) => bs.languages)
              .map((code) =>
                format.languageDisplayName({
                  languageCode: code,
                  displayLanguageCode: 'en',
                })
              )
              .join(', ');
            return (
              <tr key={group.id}>
                <td>{group.id}</td>
                <td>{languages}</td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </section>
  );
}

export interface ConfigurationSectionProps {
  electionDefinition?: ElectionDefinition;
  electionPackageHash?: string;
}

export function ConfigurationSection({
  children,
  electionDefinition,
  electionPackageHash,
}: React.PropsWithChildren<ConfigurationSectionProps>): React.ReactNode {
  if (!electionDefinition) {
    return (
      <section>
        <H2>Configuration</H2>
        <P>
          <InfoIcon /> No election loaded on device
        </P>
      </section>
    );
  }

  const { ballotHash, election } = electionDefinition;

  return (
    <section>
      <H2>Configuration</H2>
      <P>
        <SuccessIcon /> Election: {election.title},{' '}
        {formatElectionHashes(ballotHash, assertDefined(electionPackageHash))}
      </P>
      {children}
    </section>
  );
}

export interface PollingPlaceSectionProps {
  election?: Election;
  pollingPlaceId?: string;
}

export function PollingPlaceSection({
  election,
  pollingPlaceId,
}: PollingPlaceSectionProps): React.ReactNode {
  if (!election) return null;

  if (!pollingPlaceId) {
    return (
      <P>
        <WarningIcon /> No polling place selected.
      </P>
    );
  }

  const place = pollingPlaceFromElection(election, pollingPlaceId);
  const ballotStyles = pollingPlaceBallotStyles(election, place);

  return (
    <React.Fragment>
      <P>
        <SuccessIcon /> Polling Place: {place.name}{' '}
        <Caption>({pollingPlaceTypeName(place.type)})</Caption>
      </P>
      <BallotStylesSection ballotStyles={ballotStyles} />
    </React.Fragment>
  );
}

export interface MarkThresholdsSectionProps {
  markThresholds?: MarkThresholds;
}

export function MarkThresholdsSection({
  markThresholds,
}: MarkThresholdsSectionProps): React.ReactNode {
  if (!markThresholds) return null;

  return (
    <React.Fragment>
      <P>
        <SuccessIcon /> Mark Threshold: {truncate(markThresholds.definite, 4)}
      </P>
      {markThresholds.writeInTextArea && (
        <P>
          <SuccessIcon /> Write-in Threshold:{' '}
          {truncate(markThresholds.writeInTextArea, 4)}
        </P>
      )}
    </React.Fragment>
  );
}
