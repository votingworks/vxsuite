import React, { useContext } from 'react'
import { Contest } from '@votingworks/ballot-encoder'
import styled from 'styled-components'

import AppContext from '../contexts/AppContext'

import routerPaths from '../routerPaths'

import NavigationScreen from '../components/NavigationScreen'
import LinkButton from '../components/LinkButton'
import Prose from '../components/Prose'

const ButtonListItem = styled.span`
  display: block;
  margin-bottom: 0.25em;
`

interface ContestSection {
  name: string
  contests: Contest[]
}

const DefinitionScreen = () => {
  const { election: e } = useContext(AppContext)
  const election = e!

  const electionsBySection = election.contests.reduce<ContestSection[]>(
    (prev, curr) => {
      const existingIndex = prev.findIndex((s) => s.name === curr.section)
      if (existingIndex >= 0) {
        prev[existingIndex].contests.push(curr)
      } else {
        prev.push({
          name: curr.section,
          contests: [curr],
        })
      }
      return prev
    },
    []
  )

  return (
    <React.Fragment>
      <NavigationScreen mainChildFlex>
        <Prose maxWidth={false}>
          <h2>Election Metadata</h2>
          <p>
            title: <strong>{election.title}</strong>
            <br />
            date: <strong>{election.date}</strong>
            <br />
            county name: <strong>{election.county.name}</strong>
            <br />
            state: <strong>{election.state}</strong>
            <br />
            seal: <strong>{election.sealURL || election.seal}</strong>
            <br />
          </p>
          <h2>Contests</h2>
          {electionsBySection.map((section) => (
            <React.Fragment key={section.name}>
              <h3>{section.name}</h3>
              <p>
                {section.contests.map((contest) => (
                  <ButtonListItem key={contest.id}>
                    <LinkButton
                      small
                      to={routerPaths.definitionContest({
                        contestId: contest.id,
                      })}
                    >
                      {contest.title}
                    </LinkButton>
                  </ButtonListItem>
                ))}
              </p>
            </React.Fragment>
          ))}
          <h2>Advanced</h2>
          <p>
            <LinkButton to={routerPaths.definitionEditor}>
              JSON Editor
            </LinkButton>
          </p>
        </Prose>
      </NavigationScreen>
    </React.Fragment>
  )
}

export default DefinitionScreen
