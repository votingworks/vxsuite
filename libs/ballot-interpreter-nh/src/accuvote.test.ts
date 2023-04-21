import {
  findGrid,
  findTargetOvalsInTemplate,
} from '@votingworks/ballot-interpreter-nh-next';
import { electionGridLayoutNewHampshireHudsonFixtures } from '@votingworks/fixtures';
import { readFixtureBallotCardDefinition } from '../test/fixtures';
import { asciiOvalGrid } from '../test/utils';
import { TemplateBallotCardGeometry8pt5x14 } from './accuvote';
import { pairColumnEntries, readGridFromElectionDefinition } from './convert';
import * as templates from './data/templates';

test('hudson template', async () => {
  const hudson = readFixtureBallotCardDefinition(
    electionGridLayoutNewHampshireHudsonFixtures.definitionXml.asText(),
    await electionGridLayoutNewHampshireHudsonFixtures.templateFront.asImage(),
    await electionGridLayoutNewHampshireHudsonFixtures.templateBack.asImage(),
    TemplateBallotCardGeometry8pt5x14
  );
  const { grid: frontGrid } = findGrid(hudson.front, {
    template: true,
  });
  const { grid: backGrid } = findGrid(hudson.back, {
    template: true,
  });

  const { gridSize } = TemplateBallotCardGeometry8pt5x14;
  expect(frontGrid.partialTimingMarks.topLeftRect).toBeDefined();
  expect(frontGrid.partialTimingMarks.topRightRect).toBeDefined();
  expect(frontGrid.partialTimingMarks.bottomLeftRect).toBeDefined();
  expect(frontGrid.partialTimingMarks.bottomRightRect).toBeDefined();
  expect(frontGrid.completeTimingMarks.leftRects).toHaveLength(gridSize.height);
  expect(frontGrid.completeTimingMarks.rightRects).toHaveLength(
    gridSize.height
  );
  expect(frontGrid.completeTimingMarks.topRects).toHaveLength(gridSize.width);
  expect(frontGrid.partialTimingMarks.bottomRects).toHaveLength(12);

  expect(backGrid.partialTimingMarks.topLeftRect).toBeDefined();
  expect(backGrid.partialTimingMarks.topRightRect).toBeDefined();
  expect(backGrid.partialTimingMarks.bottomLeftRect).toBeDefined();
  expect(backGrid.partialTimingMarks.bottomRightRect).toBeDefined();
  expect(backGrid.completeTimingMarks.leftRects).toHaveLength(gridSize.height);
  expect(backGrid.completeTimingMarks.rightRects).toHaveLength(gridSize.height);
  expect(backGrid.completeTimingMarks.topRects).toHaveLength(gridSize.width);
  expect(backGrid.partialTimingMarks.bottomRects).toHaveLength(19);

  const frontTemplateOvals = findTargetOvalsInTemplate(
    hudson.front,
    await templates.getOvalTemplate(),
    frontGrid
  );
  expect(frontTemplateOvals).toHaveLength(55);
  expect(asciiOvalGrid(frontTemplateOvals)).toMatchInlineSnapshot(`
    "                                 
                                     
                                     
                                     
                                     
                                     
                                     
                                     
                                     
                O      O      O     O
                                     
                                     
                                     
                O      O      O     O
                                     
                                     
                O      O      O     O
                                     
                                     
                O      O      O     O
                                     
                                     
                O      O            O
                                     
                                     
                O      O            O
                                     
                                     
                       O            O
                O                    
                       O            O
                O                    
                       O            O
                O                    
                       O            O
                O                    
                       O            O
                O                    
                       O            O
                O                    
                       O            O
                O                    
                       O            O
                O                    
                       O            O
                O                    
                       O            O
                O                    
                       O            O
                O                    
    "
  `);
  const backTemplateOvals = findTargetOvalsInTemplate(
    hudson.back,
    await templates.getOvalTemplate(),
    backGrid
  );
  expect(backTemplateOvals).toHaveLength(20);
  expect(asciiOvalGrid(backTemplateOvals)).toMatchInlineSnapshot(`
    "                                 
                                     
                                     
                                     
                O      O            O
                                     
                                     
                O      O      O     O
                                     
                                     
                O      O      O     O
                                     
                                     
                O      O            O
                                     
                                     
                O      O            O
                                     
                                     
                O      O            O
    "
  `);

  const grid = readGridFromElectionDefinition(hudson.definition);
  const pairResult = pairColumnEntries(
    grid.map((entry) => ({ ...entry, side: 'front' as const })),
    [...frontTemplateOvals, ...backTemplateOvals]
  );
  expect(pairResult.success).toEqual(true);
  expect(pairResult.pairs).toHaveLength(
    frontTemplateOvals.length + backTemplateOvals.length
  );

  const frontMetadata = frontGrid.metadata;
  expect(frontMetadata).toEqual(
    expect.objectContaining({
      side: 'front',
      batchOrPrecinctNumber: 53,
      cardNumber: 54,
      mod4Checksum: 1,
    })
  );

  const backMetadata = backGrid.metadata;
  expect(backMetadata).toEqual(
    expect.objectContaining({
      side: 'back',
      electionYear: 20,
      electionMonth: 11,
      electionDay: 3,
      electionType: 'G',
    })
  );
});
