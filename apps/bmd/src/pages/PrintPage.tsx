import React from 'react'
import { RouteComponentProps } from 'react-router-dom'

import Breadcrumbs from '../components/Breadcrumbs'
import Button from '../components/Button'
import ButtonBar from '../components/ButtonBar'
import LinkButton from '../components/LinkButton'
import Main, { MainChild } from '../components/Main'
import Modal from '../components/Modal'
import PrintedBallot from '../components/PrintedBallot'
import Loading from '../components/Loading'
import Prose from '../components/Prose'
import Text from '../components/Text'

import BallotContext from '../contexts/ballotContext'

interface State {
  showConfirmModal: boolean
  showPrintingModal: boolean
}

export const printingModalDisplaySeconds = 7

class PrintPage extends React.Component<RouteComponentProps, State> {
  public static contextType = BallotContext
  public state: State = {
    showConfirmModal: false,
    showPrintingModal: false,
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
    }, 0)
    window.setTimeout(() => {
      this.context.resetBallot()
    }, printingModalDisplaySeconds * 1000)
  }
  public hideConfirm = () => {
    this.setState({ showConfirmModal: false })
  }
  public showConfirm = () => {
    this.setState({ showConfirmModal: true })
  }
  public print = () => {
    const { showPrintingModal } = this.state
    if (!showPrintingModal) {
      this.setState(
        {
          showConfirmModal: false,
          showPrintingModal: true,
        },
        () => {
          this.context.markVoterCardUsed().then((success: boolean) => {
            if (success) {
              window.print()
            }
          })
        }
      )
    }
  }
  public render() {
    const { ballotStyleId, election, precinctId, votes } = this.context
    const { showSettingsPage } = election.bmdConfig
    const { showConfirmModal, showPrintingModal } = this.state

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
                onPress={this.showConfirm}
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
          {showSettingsPage && <LinkButton to="/settings">Settings</LinkButton>}
        </ButtonBar>
        <Modal
          isOpen={showPrintingModal}
          content={<Loading>Printing</Loading>}
        />
        <Modal
          isOpen={showConfirmModal}
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
                onPress={this.print}
              >
                Yes, print my ballot.
              </Button>
              <Button onPress={this.hideConfirm}>No, go back.</Button>
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
