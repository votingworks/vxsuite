import {
  electionGridLayoutNewHampshireHudsonFixtures,
  electionGridLayoutNewHampshireTestBallotFixtures,
} from '@votingworks/fixtures';
import { findTemplateGridAndBubbles } from '@votingworks/ballot-interpreter';
import { asciiBubbleGrid } from '../../../../test/utils';
import * as accuvote from '../../accuvote';
import { parseXml } from '../../dom_parser';
import { readGridFromElectionDefinition } from './read_grid_from_election_definition';
import { correctAccuVoteDefinition } from '../../correct_definition';
import { matchBubblesAndContestOptionsUsingSpacialMapping } from '.';

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

test('readGridFromElectionDefinition with yes/no contests', async () => {
  const definition = accuvote
    .parseXml(
      parseXml(
        electionGridLayoutNewHampshireTestBallotFixtures.definitionXml.asText()
      )
    )
    .unsafeUnwrap();
  const gridsAndBubbles = findTemplateGridAndBubbles([
    await electionGridLayoutNewHampshireTestBallotFixtures.templateFront.asImageData(),
    await electionGridLayoutNewHampshireTestBallotFixtures.templateBack.asImageData(),
  ]).unsafeUnwrap();
  const { matched, unmatched } =
    matchBubblesAndContestOptionsUsingSpacialMapping({
      gridsAndBubbles,
      definition,
    }).unsafeUnwrap();
  expect(unmatched).toHaveLength(0);
  const corrected = correctAccuVoteDefinition({
    gridsAndBubbles,
    definition,
    matched,
  });
  expect(asciiBubbleGrid(readGridFromElectionDefinition(corrected.definition)))
    .toMatchInlineSnapshot(`
"                                    
                                    
           O       O        O      O
                                    
                                    
                                    
                                    
                                    
           O       O               O
                                    
                                    
                                    
                                    
                                    
           O       O        O      O
                                    
                                    
                                    
                                    
                                    
           O       O               O
                                    
                                    
                                    
                                    
                                    
           O       O               O
                                    
                                    
                                    
                                    
                                    
                   O               O
                                    
           O                O       
                                    
                   O               O
                                    
           O                O       
                                    
                   O               O
                                    
           O                        
                                    
                                    
                                    
                                    
                                    
                                    
                                    
           O       O        O      O
                                    
                                    
                                    
                                    
                                    
                                    
                                    
                                    
                                    
                                    
                                    
                                    
                                    
                                    
                                    
                                    
                                    
                                    
                                    
                                    
                                    
                                    
                                    
                                    
                                    
                                    
                                    
                                    
                                    
                                    
                                    
           O       O               O
                                    
                                    
                                    
                                    
                                    
           O       O               O
                                    
                                    
                                    
                                    
                                    
           O       O               O
                                    
                                    
                                    
                                    
                                    
           O       O               O
                                    
                                    
                                    
                                    
                                    
           O       O               O
                                    
                                    
                                    
                                    
                                    
           O       O               O
                                    
                                    
                                    
                                    
                                    
                                    
                                    
                                    
                                    
                            O      O
"
`);
});
