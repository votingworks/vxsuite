import { electionGridLayoutNewHampshireHudsonFixtures } from '@votingworks/fixtures';
import * as accuvote from '../../accuvote';
import { readFixtureDefinition } from '../../../../test/fixtures';
import { readGridFromElectionDefinition } from './read_grid_from_election_definition';
import { asciiBubbleGrid } from '../../../../test/utils';

test('readGridFromElectionDefinition', () => {
  const definition = readFixtureDefinition(
    electionGridLayoutNewHampshireHudsonFixtures.definitionXml.asText()
  );
  const grid = readGridFromElectionDefinition(
    accuvote.parseXml(definition).unsafeUnwrap()
  );
  expect(asciiBubbleGrid(grid)).toMatchInlineSnapshot(`
    "                                  
                                      
                                      
                                      
                                      
                                      
                                      
                                      
                                      
                O      O      O       
                                      
                                     O
                                      
                                      
                                      
                O      O      O      O
                                      
                                      
                                      
                O      O      O      O
                                      
                                      
                                      
                O      O      O       
                                      
                                     O
                                      
                                      
                                      
                O      O             O
                                      
                                      
                                      
                O      O             O
                                      
                                      
                                      
                O      O             O
                                      
                O      O             O
                                      
                O      O             O
                                      
                O      O             O
                                      
                O      O             O
                                      
                O      O             O
                                      
                O      O             O
                                      
                O      O             O
                                      
                O      O             O
                                      
                O      O             O
                                      
                O      O             O
                                      
                                      
                                      
                O      O             O
                                      
                                      
                                      
                O      O      O      O
                                      
                                      
                                      
                O      O      O      O
                                      
                                      
                                      
                O      O             O
                                      
                                      
                                      
                O      O             O
                                      
                                      
                                      
                O      O             O
    "
  `);
});
