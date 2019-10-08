import React, { useContext } from 'react'
import styled from 'styled-components'

import BallotContext from '../contexts/ballotContext'

import { getPartyPrimaryAdjectiveFromBallotStyle } from '../utils/election'

import { Wobble } from '../components/Animations'
import ElectionInfo from '../components/ElectionInfo'
import LinkButton from '../components/LinkButton'
import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'
import Sidebar from '../components/Sidebar'
import Screen from '../components/Screen'
import SettingsTextSize from '../components/SettingsTextSize'

const SidebarSpacer = styled.div`
  height: 90px;
`

const StartPage = () => {
  const {
    ballotStyleId,
    contests,
    election,
    precinctId,
    setUserSettings,
    userSettings,
  } = useContext(BallotContext)
  const { title } = election
  const partyPrimaryAdjective = getPartyPrimaryAdjectiveFromBallotStyle({
    election,
    ballotStyleId,
  })

  return (
    <Screen>
      <Main>
        <MainChild center>
          <Prose textCenter>
            <h1>
              {partyPrimaryAdjective} {title}
            </h1>
            <hr />
            <p>
              Your ballot has <strong>{contests.length} contests</strong>.
            </p>
          </Prose>
        </MainChild>
      </Main>
      <Sidebar
        footer={
          <React.Fragment>
            <SettingsTextSize
              userSettings={userSettings}
              setUserSettings={setUserSettings}
            />
            <ElectionInfo
              election={election}
              ballotStyleId={ballotStyleId}
              precinctId={precinctId}
              horizontal
            />
          </React.Fragment>
        }
      >
        <Prose>
          <SidebarSpacer />
          <Wobble as="p">
            <LinkButton
              big
              primary
              to="/contests/0"
              id="next"
              aria-label="Select next to start voting."
            >
              Start Voting
            </LinkButton>
          </Wobble>
        </Prose>
      </Sidebar>
    </Screen>
  )
}

export default StartPage
