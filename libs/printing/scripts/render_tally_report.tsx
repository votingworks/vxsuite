import React from 'react';
import { readElection } from '@votingworks/fs';
import { AdminTallyReportByParty } from '@votingworks/ui';
import { buildSimpleMockTallyReportResults } from '@votingworks/utils';
import { createSimpleRenderer, renderToPdf } from '../src';

export async function main(args: readonly string[]): Promise<void> {
  if (args.length !== 2) {
    console.error('Usage: render-tally-report election.json output-path.pdf');
    process.exit(1);
  }
  const renderer = await createSimpleRenderer();

  const electionPath = args[0];
  const outputPath = args[1];
  const electionDefinition = (await readElection(electionPath)).unsafeUnwrap();
  const { election } = electionDefinition;

  (
    await renderToPdf(
      {
        document: (
          <AdminTallyReportByParty
            electionDefinition={electionDefinition}
            isTest={false}
            isOfficial={false}
            isForLogicAndAccuracyTesting={false}
            includeSignatureLines={false}
            generatedAtTime={new Date()}
            testId="render-tally-report"
            tallyReportResults={buildSimpleMockTallyReportResults({
              election,
              scannedBallotCount: 0,
            })}
          />
        ),
        outputPath,
      },
      renderer
    )
  ).unsafeUnwrap();
}
