import {
  IdSchema,
  safeParseElection,
  safeParseElectionDefinition,
  unsafeParse,
  YesNoOptionSchema,
} from '@votingworks/types';
import { strict as assert } from 'assert';
import fc from 'fast-check';
import { arbitraryDateTime } from '.';
import {
  arbitraryCastVoteRecord,
  arbitraryCastVoteRecords,
  arbitraryCandidateContest,
  arbitraryElection,
  arbitraryElectionDefinition,
  arbitraryId,
  arbitraryYesNoOption,
} from './arbitraries';

test('arbitraryId', () => {
  fc.assert(
    fc.property(arbitraryId(), (id) => {
      unsafeParse(IdSchema, id);
    })
  );
});

test('arbitraryDateTime', () => {
  fc.assert(
    fc.property(
      arbitraryDateTime({ minYear: 2020, maxYear: 2022, zoneName: 'UTC' }),
      (dateTime) => {
        expect(dateTime.year).toBeGreaterThanOrEqual(2020);
        expect(dateTime.year).toBeLessThanOrEqual(2022);
        expect(dateTime.zoneName).toEqual('UTC');
      }
    )
  );
});

test('arbitraryYesNoOption', () => {
  fc.assert(
    fc.property(arbitraryYesNoOption(), (option) => {
      unsafeParse(YesNoOptionSchema, option);
    })
  );

  // specify the ID
  fc.assert(
    fc.property(arbitraryYesNoOption({ id: fc.constant('YEP') }), (option) => {
      expect(option.id).toEqual('YEP');
    })
  );
});

test('arbitraryElection makes valid elections', () => {
  fc.assert(
    fc.property(arbitraryElection(), (election) => {
      safeParseElection(election).unsafeUnwrap();
    })
  );
});

test('arbitraryElectionDefinition makes valid election definitions', () => {
  fc.assert(
    fc.property(arbitraryElectionDefinition(), (electionDefinition) => {
      const parsed = safeParseElectionDefinition(
        electionDefinition.electionData
      ).unsafeUnwrap();
      expect(parsed).toEqual(electionDefinition);
    })
  );
});

test('arbitraryCastVoteRecord(s) makes valid CVRs', () => {
  fc.assert(
    fc.property(arbitraryCastVoteRecord(), (cvr) => {
      assert(cvr._pageNumbers);
      const [frontPage, backPage] = cvr._pageNumbers;
      expect(backPage - frontPage).toEqual(1);
    })
  );

  // specify whether it's a test ballot
  fc.assert(
    fc.property(
      arbitraryCastVoteRecord({ testBallot: fc.constant(true) }),
      (cvr) => {
        expect(cvr._testBallot).toBe(true);
      }
    )
  );

  // specify the election
  const election = fc.sample(arbitraryElection(), 1)[0];
  const testBallot = fc.sample(fc.boolean())[0];
  fc.assert(
    fc.property(arbitraryCastVoteRecords({ election, testBallot }), (cvrs) => {
      for (const cvr of cvrs) {
        expect(election.precincts.map(({ id }) => id)).toContain(
          cvr._precinctId
        );
        expect(election.ballotStyles.map(({ id }) => id)).toContain(
          cvr._ballotStyleId
        );
        expect(cvr._testBallot).toBe(testBallot);
      }
    })
  );
});

test('arbitraryCandidateContest allows specifying whether it allows write-ins', () => {
  fc.assert(
    fc.property(
      fc.boolean().chain((allowWriteIns) =>
        fc.tuple(
          fc.constant(allowWriteIns),
          arbitraryCandidateContest({
            allowWriteIns: fc.constant(allowWriteIns),
          })
        )
      ),
      ([allowWriteIns, contest]) => {
        expect(contest.allowWriteIns).toBe(allowWriteIns);
      }
    )
  );
});
