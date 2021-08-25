import React, {useContext, useState} from 'react';
import {Contest} from '@votingworks/types';
import styled from 'styled-components';

import {format} from '@votingworks/utils';

import AppContext from '../contexts/AppContext';

import routerPaths from '../routerPaths';

import NavigationScreen from '../components/NavigationScreen';
import LinkButton from '../components/LinkButton';
import Prose from '../components/Prose';
import Text from '../components/Text';
import RemoveElectionModal from '../components/RemoveElectionModal';

const ButtonListItem = styled.span`
  display: block;
  margin-bottom: 0.25em;
`;

interface ContestSection {
  name: string;
  contests: Contest[];
}

const DefinitionScreen: React.FC = () => {
  const {electionDefinition, configuredAt} = useContext(AppContext);
  const {election} = electionDefinition!;

  const [isRemovingElection, setIsRemovingElection] = useState(false);

  const electionsBySection = election.contests.reduce<ContestSection[]>(
    (prev, curr) => {
      const existingIndex = prev.findIndex(s => s.name === curr.section);
      if (existingIndex >= 0) {
        prev[existingIndex].contests.push(curr);
      } else {
        prev.push({
          name: curr.section,
          contests: [curr],
        });
      }
      return prev;
    },
    []
  );

  return (
    <React.Fragment>
      <NavigationScreen mainChildFlex>
        <Prose maxWidth={false}>
          <h1>Election Definition</h1>
          <Text small>
            Configured with the current election at{' '}
            <strong>
              {format.localeLongDateAndTime(new Date(configuredAt))}
            </strong>
          </Text>
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
          {electionsBySection.map(section => (
            <React.Fragment key={section.name}>
              <h3>{section.name}</h3>
              <p>
                {section.contests.map(contest => (
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
          <h1>Advanced Features</h1>
          <p>
            <ButtonListItem>
              <LinkButton to={routerPaths.definitionEditor}>
                View Definition JSON
              </LinkButton>
            </ButtonListItem>
            <ButtonListItem>
              <LinkButton
                danger
                to={routerPaths.definitionEditor}
                onPress={() => setIsRemovingElection(true)}
              >
                Remove Election
              </LinkButton>
            </ButtonListItem>
          </p>
        </Prose>
      </NavigationScreen>
      {isRemovingElection && (
        <RemoveElectionModal onClose={() => setIsRemovingElection(false)} />
      )}
    </React.Fragment>
  );
};

export default DefinitionScreen;
