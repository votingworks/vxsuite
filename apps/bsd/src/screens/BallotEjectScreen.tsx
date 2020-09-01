import React from 'react'
import styled from 'styled-components'

import Main, { MainChild } from '../components/Main'
import Prose from '../components/Prose'
import Button from '../components/Button'
import MainNav from '../components/MainNav'

const Columns = styled.div`
  display: flex;
  > div {
    margin-right: 1em;
    &:first-child {
      flex: 1;
    }
    &:last-child {
      margin-right: 0;
    }
    img {
      max-width: 100%;
      height: 83vh;
    }
  }
`

const RectoVerso = styled.div`
  display: flex;
  & > * {
    &:first-child {
      margin-right: 1em;
    }
  }
  img {
    max-width: 100%;
    height: 83vh;
  }
`

interface Props {
  continueScanning: () => void
}

const BallotEjectScreen = ({ continueScanning }: Props) => {
  return (
    <React.Fragment>
      <MainNav>
        <Button small onPress={continueScanning}>
          Continue Scanning Batch
        </Button>
      </MainNav>
      <Main>
        <MainChild maxWidth={false}>
          <Columns>
            <Prose maxWidth={false}>
              <h1>Remove This Ballot</h1>
              <p>
                Human review is required for this last scanned ballot.{' '}
                <strong>This ballot was not tabulated.</strong>
              </p>
              <p>
                Once this ballot has been removed, press the button to continue
                scanning.
              </p>
            </Prose>
            <RectoVerso>
              <Prose>
                <h4>Front</h4>
                <p>
                  <img src="/eject/p1.jpg" alt="p1" />
                </p>
              </Prose>
              <Prose>
                <h4>Back</h4>
                <p>
                  <img src="/eject/p2.jpg" alt="p2" />
                </p>
              </Prose>
            </RectoVerso>
          </Columns>
        </MainChild>
      </Main>
    </React.Fragment>
  )
}
export default BallotEjectScreen
