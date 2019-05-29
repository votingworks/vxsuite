// <Prose>
//   <h1 aria-label="Verify and Cast Your Ballot.">
//     Verify and Cast Your Ballot
//   </h1>
//   <Text center>Retrieve your printed ballot from the printer.</Text>
//   <Instructions>
//     {/* <li>
//       <h2>Collect Printed Ballot.</h2>
//       <p>The printer has printed your ballot.</p>
//     </li> */}
//     <li>
//       <h2>Verify Ballot Selections.</h2>
//       <p>Review and confirm all selections on your printed ballot.</p>
//     </li>
//     <li>
//       <h2>Cast in Ballot Box.</h2>
//       <p>Deposit your ballot into the secured ballot box.</p>
//     </li>
//   </Instructions>
//   <Text center>
//     I have verified my selections and will cast my ballot.
//   </Text>
//   <Text center>
//     <LinkButton primary to="/">
//       Start Over
//     </LinkButton>
//   </Text>
// </Prose>

import React, { useContext } from 'react'

import Breadcrumbs from '../components/Breadcrumbs'
import ButtonBar from '../components/ButtonBar'
import LinkButton from '../components/LinkButton'
import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'
import Text from '../components/Text'
import BallotContext from '../contexts/ballotContext'

const VoteInstructionsPage = () => {
  const { election } = useContext(BallotContext)
  const { bmdConfig } = election!
  const { showHelpPage, showSettingsPage } = bmdConfig!
  return (
    <React.Fragment>
      <Main>
        <MainChild center>
          <Breadcrumbs step={4} />
          <Prose textCenter id="audiofocus">
            <h1 aria-label="Cast your ballot.">Cast your printed ballot</h1>
            <Text narrow>
              Before you cast your official printed ballot in the ballot box,
              double-check your printed ballot to confirm your selections.
            </Text>
            <Text narrow>
              If you find a mistake, ask a poll worker for help.
            </Text>
            <div aria-label="Press the down arrow to continue, then" />
            <p>
              <LinkButton
                primary
                big
                to="/"
                aria-label="Press the select button to confirm that you will review and cast your printed ballot."
              >
                Okay, I will review and cast my printed ballot.
              </LinkButton>
            </p>
          </Prose>
        </MainChild>
      </Main>
      <ButtonBar secondary separatePrimaryButton>
        <div />
        {showHelpPage && <LinkButton to="/help">Help</LinkButton>}
        {showSettingsPage && <LinkButton to="/settings">Settings</LinkButton>}
      </ButtonBar>
    </React.Fragment>
  )
}

export default VoteInstructionsPage
