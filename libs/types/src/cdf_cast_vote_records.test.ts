import { CastVoteRecordReport } from './cdf/cast-vote-records';
import { CastVoteRecordReport as ExtendedCastVoteRecordReport } from './cdf_cast_vote_records';

test('compile-time check on extension of CastVoteRecords CDF extension', () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function readReport(_report: CastVoteRecordReport) {
    // noop
  }

  // check that our extended interface still conforms to the original
  readReport({} as unknown as ExtendedCastVoteRecordReport);
});
