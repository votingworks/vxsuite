import { electionSampleDefinition } from '@votingworks/fixtures';
import { generatePdfExportMetadataCsv } from './generate_pdf_export_metadata_csv';

import { BallotMode } from '../config/types';
import { DEFAULT_LOCALE } from '../config/globals';

describe('generatePdfExportMetadataCsv', () => {
  it('generates an accurate metadata csv', () => {
    const actualMetadataCsv = generatePdfExportMetadataCsv({
      electionDefinition: electionSampleDefinition,
      ballotMode: BallotMode.Official,
      isAbsentee: false,
      ballotLocales: { primary: DEFAULT_LOCALE },
    });

    const expectedMetadataCsv = `Filename,Precinct,Ballot Style
election-748dc61ad3-precinct-center-springfield-id-23-style-12-English-live.pdf,Center Springfield,12
election-748dc61ad3-precinct-north-springfield-id-21-style-5-English-live.pdf,North Springfield,5
election-748dc61ad3-precinct-north-springfield-id-21-style-12-English-live.pdf,North Springfield,12
election-748dc61ad3-precinct-south-springfield-id-20-style-7C-English-live.pdf,South Springfield,7C`;

    expect(actualMetadataCsv).toEqual(expectedMetadataCsv);
  });

  it('includes test filenames if the ballot mode is test', () => {
    const metadataCsv = generatePdfExportMetadataCsv({
      electionDefinition: electionSampleDefinition,
      ballotMode: BallotMode.Test,
      isAbsentee: false,
      ballotLocales: { primary: DEFAULT_LOCALE },
    });

    expect(metadataCsv).not.toContain('-live');
    expect(metadataCsv).toContain('-test');
  });

  it('includes absentee filenames if ballots are absentee', () => {
    const metadataCsv = generatePdfExportMetadataCsv({
      electionDefinition: electionSampleDefinition,
      ballotMode: BallotMode.Official,
      isAbsentee: true,
      ballotLocales: { primary: DEFAULT_LOCALE },
    });

    expect(metadataCsv).toContain('-absentee');
  });
});
