import React from 'react'
import { RouteComponentProps } from 'react-router-dom'

import Breadcrumbs from '../components/Breadcrumbs'
import Button from '../components/Button'
import ButtonBar from '../components/ButtonBar'
import LinkButton from '../components/LinkButton'
import Main, { MainChild } from '../components/Main'
import Modal from '../components/Modal'
import Prose from '../components/Prose'
import Text from '../components/Text'
import PrintedBallot from '../components/PrintedBallot'

import BallotContext from '../contexts/ballotContext'

interface State {
  showConfirmModal: boolean
}

class PrintPage extends React.Component<RouteComponentProps, State> {
  public static contextType = BallotContext
  public state: State = {
    showConfirmModal: false,
  }
  public componentDidMount = () => {
    window.addEventListener('afterprint', this.afterPrint)
  }
  public componentWillUnmount = () => {
    window.removeEventListener('afterprint', this.afterPrint)
  }
  public afterPrint = () => {
    // setTimeout to prevent a React infinite recursion issue
    window.setTimeout(() => {
      this.context.incrementBallotsPrintedCount()
      this.context.resetBallot('/')
    }, 0)
  }
  public hideConfirm = () => {
    this.setState({ showConfirmModal: false })
  }
  public showConfirm = () => {
    this.setState({ showConfirmModal: true })
  }
  public print = () => {
    this.context.markVoterCardUsed().then((success: boolean) => {
      if (success) {
        window.print()
      }
    })
  }
  public render() {
    const { ballotStyleId, election, precinctId, votes } = this.context
    const { showHelpPage, showSettingsPage } = election.bmdConfig

    return (
      <React.Fragment>
        <Main>
          <MainChild centerVertical maxWidth={false}>
            <Breadcrumbs step={3} />
            <Prose textCenter className="no-print" id="audiofocus">
              <h1 aria-label="Print your official ballot.">
                Print your official ballot
              </h1>
              <Text narrow>
                If you have reviewed your selections and you are done voting,
                you are ready to print your official ballot.
              </Text>
              <span aria-label="First, press the down arrow, then" />
              <Button
                primary
                big
                onClick={this.showConfirm}
                aria-label="Use the select button to print your ballot."
              >
                Print Ballot
              </Button>
            </Prose>
          </MainChild>
        </Main>
        <ButtonBar>
          <div />
          <LinkButton to="/review" id="previous">
            Back
          </LinkButton>
          <div />
          <div />
        </ButtonBar>
        <ButtonBar secondary separatePrimaryButton>
          <div />
          {showHelpPage && <LinkButton to="/help">Help</LinkButton>}
          {showSettingsPage && <LinkButton to="/settings">Settings</LinkButton>}
        </ButtonBar>
        <Modal
          isOpen={this.state.showConfirmModal}
          centerContent
          ariaLabel=""
          content={
            <Prose id="modalaudiofocus">
              <Text center>
                You may not make any changes after you print your ballot.
              </Text>
              <Text center>Do you want to print your ballot?</Text>
              <span aria-label="Use the down arrow to continue." />
            </Prose>
          }
          actions={
            <>
              <Button
                role="link"
                aria-label="Use the select button to print your ballot."
                primary
                onClick={() => {
                  this.print()
                }}
              >
                Yes, print my ballot.
              </Button>
              <Button onClick={this.hideConfirm}>No, go back.</Button>
            </>
          }
        />
        <PrintedBallot
          ballotId={undefined} // TODO: add ballotId here: https://github.com/votingworks/bmd/issues/424
          ballotStyleId={ballotStyleId}
          election={election}
          isLiveMode={this.context.isLiveMode}
          precinctId={precinctId}
          votes={votes}
        />
      </React.Fragment>
    )
  }
}

export default PrintPage
