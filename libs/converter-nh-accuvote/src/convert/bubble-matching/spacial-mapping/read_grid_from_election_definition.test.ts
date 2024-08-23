import { electionGridLayoutNewHampshireHudsonFixtures } from '@votingworks/fixtures';
import { asciiBubbleGrid } from '../../../../test/utils';
import * as accuvote from '../../accuvote';
import { parseXml } from '../../dom_parser';
import { readGridFromElectionDefinition } from './read_grid_from_election_definition';

test('readGridFromElectionDefinition', () => {
  const definition = parseXml(
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
