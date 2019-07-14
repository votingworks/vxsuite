import React from 'react'

import { OptionalElection } from '../config/types'

import Button from '../components/Button'
import Text from '../components/Text'
import Main, { MainChild } from '../components/Main'
import MainNav from '../components/MainNav'
import Screen from '../components/Screen'

interface Props {
  election: OptionalElection
  fetchElection: () => void
  isLoadingElection: boolean
  unconfigure: () => void
}

const AdminScreen = ({
  election,
  fetchElection,
  isLoadingElection,
  unconfigure,
}: Props) => {
  return (
    <Screen>
      <Main>
        <MainChild>
          <h1>Configuration</h1>
          {isLoadingElection ? (
            <p>Loading Election Definition from Clerk Card…</p>
          ) : (
            <React.Fragment>
              <p>
                <Text as="span" voteIcon={!!election} warningIcon={!election}>
                  {election ? (
                    'Election definition file is loaded.'
                  ) : (
                    <span>
                      Election definition file is <strong>not Loaded</strong>.
                    </span>
                  )}
                </Text>
              </p>
              <p>
                {election ? (
                  <Button onClick={unconfigure}>Clear all election data</Button>
                ) : (
                  <Button onClick={fetchElection}>
                    Load Election Definition
                  </Button>
                )}
              </p>
            </React.Fragment>
          )}
        </MainChild>
      </Main>
      <MainNav title="Clerk Actions" />
    </Screen>
  )
}

export default AdminScreen
