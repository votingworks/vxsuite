import React, { useState } from 'react'
import styled from 'styled-components'

import { OptionalElection } from '../config/types'

import Button from '../components/Button'
import Main, { MainChild } from '../components/Main'
import MainNav from '../components/MainNav'
import Modal from '../components/Modal'
import Prose from '../components/Prose'
import Text from '../components/Text'

const Report = styled.div`
  margin: 0;
  page-break-before: always;
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
  ballotsPrintedCount: number
  election: OptionalElection
  isPollsOpen: boolean
  isLiveMode: boolean
  machineId: string
  togglePollsOpen: () => void
}

const PollWorkerScreen = ({
  ballotsPrintedCount,
  election,
  isPollsOpen,
  isLiveMode,
  machineId,
  togglePollsOpen,
}: Props) => {
  const { title, date, county, state, seal, sealURL } = election!
  const [isModalOpen, setIsModalOpen] = useState(false)
  const showModal = () => setIsModalOpen(true)
  const hideModal = () => setIsModalOpen(false)
  const printStatus = () => {
    window.print()
    togglePollsOpen()
    hideModal()
  }
  const currentDateTime = new Date().toLocaleString()
  const reportIds = [1, 2, 3]
  return (
    <React.Fragment>
      <Main>
        <MainChild>
          <Prose className="no-print">
            <p>Remove card when finished making changes.</p>
            <Text as="h2" warningIcon={!isPollsOpen} voteIcon={isPollsOpen}>
              {isPollsOpen ? 'Polls are open.' : 'Polls are closed.'}
            </Text>
            <p>A summary will be printed when toggling open/closed.</p>
            <p>
              <Button onPress={showModal}>
                {isPollsOpen ? 'Close Polls' : 'Open Polls'}
              </Button>
            </p>
          </Prose>
          {reportIds.map(id => (
            <Report key={id} className="print-only">
              <Header>
                {seal ? (
                  <div
                    className="seal"
                    // TODO: Sanitize the SVG content: https://github.com/votingworks/bmd/issues/99
                    dangerouslySetInnerHTML={{ __html: seal }} // eslint-disable-line react/no-danger
                  />
                ) : sealURL ? (
                  <div className="seal">
                    <SealImage src={sealURL} alt="" />
                  </div>
                ) : (
                  <React.Fragment />
                )}
                <Prose className="ballot-header-content">
                  <h2>
                    {!isLiveMode ? 'Unofficial TEST' : 'Official'}{' '}
                    {isPollsOpen
                      ? `Polls Closed Report`
                      : `Polls Opened Report`}
                  </h2>
                  <h3>{title}</h3>
                  <p>
                    {date}
                    <br />
                    {county.name}, {state}
                  </p>
                </Prose>
              </Header>
              <Content>
                <Prose maxWidth={false}>
                  <p>
                    Report <strong>#{id}</strong> of {reportIds.length} printed.
                  </p>
                  <dl>
                    <dt>Voting Machine ID</dt>
                    <dd>
                      <span>VxMark #{machineId}</span>
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
                              We, the undersigned, do hereby certify the
                              election was conducted in accordance with the laws
                              of the state.
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
          ))}
        </MainChild>
      </Main>
      <MainNav title="Poll Worker" />
      <Modal
        isOpen={isModalOpen}
        centerContent
        content={
          <Prose textCenter>
            <p>
              {isPollsOpen
                ? 'Close Polls and print report?'
                : 'Open polls and print report?'}
            </p>
          </Prose>
        }
        actions={
          <>
            <Button primary onPress={printStatus}>
              Yes
            </Button>
            <Button onPress={hideModal}>Cancel</Button>
          </>
        }
      />
    </React.Fragment>
  )
}

export default PollWorkerScreen
