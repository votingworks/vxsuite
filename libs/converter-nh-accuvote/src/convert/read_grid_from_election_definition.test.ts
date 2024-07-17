import { electionGridLayoutNewHampshireHudsonFixtures } from '@votingworks/fixtures';
import { readFixtureDefinition } from '../../test/fixtures';
import { readGridFromBallotConfig } from './read_grid_from_election_definition';
import { asciiBubbleGrid } from '../../test/utils';
import { parseAccuvoteConfig } from './accuvote_parser';

test('readGridFromElectionDefinition', () => {
  const definition = readFixtureDefinition(
    electionGridLayoutNewHampshireHudsonFixtures.definitionXml.asText()
  );
  const config = parseAccuvoteConfig(definition).unsafeUnwrap();
  const grid = readGridFromBallotConfig(config);
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
