import React from 'react'
import styled from 'styled-components'
import { Precinct, Election } from '@votingworks/ballot-encoder'
import { AppModeNames, MachineConfig } from '../config/types'
import Prose from './Prose'

import { dateLong } from '../utils/date'

const Report = styled.div`
  margin: 0;
  page-break-after: always;
  @media screen {
    display: none;
  }
`

const SealImage = styled.img`
  max-width: 1in;
`

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
`
const Content = styled.div`
  padding-top: 2rem;
  & dd {
    margin: 0 0 2rem;
    & > span {
      font-size: 2rem;
      font-weight: 600;
    }
  }
`

const Certification = styled.div`
  margin-top: 0.5rem;
  width: 50%;
  font-weight: 600;
`
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
`

interface Props {
  appName: AppModeNames
  ballotsPrintedCount: number
  currentDateTime: string
  election: Election
  isLiveMode: boolean
  isPollsOpen: boolean
  machineConfig: MachineConfig
  precinctId: string
  reportPurpose: string
}

const PollsReport = ({
  appName,
  ballotsPrintedCount,
  currentDateTime,
  election,
  isLiveMode,
  isPollsOpen,
  machineConfig,
  precinctId,
  reportPurpose,
}: Props) => {
  const { title, date, county, precincts, state, seal, sealURL } = election
  const precinct = precincts.find((p) => p.id === precinctId) as Precinct
  return (
    <Report>
      <Header>
        {
          /* istanbul ignore next */
          seal && !sealURL ? (
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
          sealURL && !seal ? (
            <div className="seal">
              <SealImage src={sealURL} alt="" />
            </div>
          ) : (
            <React.Fragment />
          )
        }
        <Prose className="ballot-header-content">
          <h2>
            {precinct.name}{' '}
            {
              /* istanbul ignore next */
              !isLiveMode ? 'Unofficial TEST' : 'Official'
            }{' '}
            {isPollsOpen ? 'Polls Closed Report' : 'Polls Opened Report'}
          </h2>
          <h3>{title}</h3>
          <p>
            {dateLong(date)}
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
            <dt>Machine ID</dt>
            <dd>
              <span>
                {appName} #{machineConfig.machineId}
              </span>
            </dd>
            <dt>Status</dt>
            <dd>
              <span>{isPollsOpen ? 'Closed' : 'Opened'}</span>
            </dd>
            <dt>Report Time</dt>
            <dd>
              <span>{currentDateTime}</span>
            </dd>
            <dt>Ballots Printed Count</dt>
            <dd>
              <span>{ballotsPrintedCount}</span>
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
    </Report>
  )
}
export default PollsReport
