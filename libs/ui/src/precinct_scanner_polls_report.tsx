import {
  Election,
  PrecinctSelection,
  PrecinctSelectionKind,
} from '@votingworks/types';
import {
  find,
  formatFullDateTimeZone,
  formatLongDate,
} from '@votingworks/utils';
import { DateTime } from 'luxon';
import React from 'react';
import styled from 'styled-components';
import { PrintableContainer } from './tally_report';

import { Prose } from './prose';

const SealImage = styled.img`
  max-width: 1in;
`;

const Header = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  border-bottom: 0.2rem solid #000000;
  & > .seal {
    margin: 0.25rem 0;
    width: 1in;
  }
  & h2 {
    margin-bottom: 0;
  }
  & h3 {
    margin-top: 0;
  }
  & > .ballot-header-content {
    flex: 4;
    margin: 0 1rem;
    max-width: 100%;
  }
`;
const Content = styled.div`
  padding-top: 2rem;
  & dd {
    margin: 0 0 2rem;
    & > span {
      font-size: 2rem;
      font-weight: 600;
    }
  }
`;

const Certification = styled.div`
  margin-top: 0.5rem;
  width: 50%;
  font-weight: 600;
`;
const SignatureLine = styled.div`
  display: flex;
  align-items: flex-end;
  border-bottom: 1px solid #000000;
  width: 50%;
  min-height: 4em;
  &::before {
    font-size: 1.5rem;
    content: '⨉';
  }
`;

interface Props {
  ballotCount: number;
  currentTime: number;
  election: Election;
  isLiveMode: boolean;
  isPollsOpen: boolean;
  precinctScannerMachineId: string;
  timeTallySaved?: number;
  precinctSelection: PrecinctSelection;
  reportPurpose: string;
}

export function PrecinctScannerPollsReport({
  ballotCount,
  currentTime,
  election,
  isLiveMode,
  isPollsOpen,
  precinctScannerMachineId,
  timeTallySaved,
  precinctSelection,
  reportPurpose,
}: Props): JSX.Element {
  const {
    title,
    date,
    county,
    precincts,
    state,
    seal,
    sealURL: sealUrl,
  } = election;
  const precinctName =
    precinctSelection.kind === PrecinctSelectionKind.AllPrecincts
      ? 'All Precincts'
      : find(precincts, (p) => p.id === precinctSelection.precinctId).name;
  const machineSection = (
    <React.Fragment>
      <dt>Machine ID</dt>
      <dd>
        <span>Precinct Scanner #{precinctScannerMachineId}</span>
      </dd>
    </React.Fragment>
  );

  return (
    <PrintableContainer>
      <Header>
        {
          /* istanbul ignore next */
          seal && !sealUrl ? (
            <div
              className="seal"
              // TODO: Sanitize the SVG content: https://github.com/votingworks/bmd/issues/99
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: seal }}
            />
          ) : (
            <React.Fragment />
          )
        }
        {
          /* istanbul ignore next */
          sealUrl && !seal ? (
            <div className="seal">
              <SealImage src={sealUrl} alt="" />
            </div>
          ) : (
            <React.Fragment />
          )
        }
        <Prose className="ballot-header-content">
          <h2>
            {precinctName}{' '}
            {
              /* istanbul ignore next */
              !isLiveMode ? 'Unofficial TEST' : 'Official'
            }{' '}
            {isPollsOpen ? 'Polls Opened Report' : 'Polls Closed Report'}
          </h2>
          <h3>{title}</h3>
          <p>
            {formatLongDate(DateTime.fromISO(date))}
            <br />
            {county.name}, {state}
          </p>
        </Prose>
      </Header>
      <Content>
        <Prose maxWidth={false}>
          <p>
            This report should be <strong>{reportPurpose}</strong>.
          </p>
          <dl>
            {machineSection}
            <dt>Status</dt>
            <dd>
              <span>{isPollsOpen ? 'Opened' : 'Closed'}</span>
            </dd>
            {timeTallySaved && (
              <React.Fragment>
                <dt>Report Saved Time</dt>
                <dd>
                  <span>
                    {formatFullDateTimeZone(
                      DateTime.fromMillis(timeTallySaved)
                    )}
                  </span>
                </dd>
              </React.Fragment>
            )}
            <dt>Report Printed Time</dt>
            <dd>
              <span>
                {formatFullDateTimeZone(DateTime.fromMillis(currentTime))}
              </span>
            </dd>
            <dt>Ballots Scanned Count</dt>
            <dd>
              <span>{ballotCount}</span>
            </dd>
            <dt>Certification Signatures</dt>
            <dd>
              <Certification>
                <Prose>
                  <p>
                    <em>
                      We, the undersigned, do hereby certify the election was
                      conducted in accordance with the laws of the state.
                    </em>
                  </p>
                </Prose>
              </Certification>
              <SignatureLine />
              <SignatureLine />
              <SignatureLine />
            </dd>
          </dl>
        </Prose>
      </Content>
    </PrintableContainer>
  );
}
