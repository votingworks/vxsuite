import { expect, test } from 'vitest';
import {
  IdSchema,
  safeParseElection,
  safeParseElectionDefinition,
  unsafeParse,
} from '@votingworks/types';
import fc from 'fast-check';
import { assert } from '@votingworks/basics';
import { arbitraryDateTime } from '.';
import {
  arbitraryCandidateContest,
  arbitraryElection,
  arbitraryElectionDefinition,
  arbitraryId,
  arbitraryYesNoOption,
  arbitraryUint2,
  arbitraryUint4,
  arbitraryUint8,
  arbitraryUint16,
  arbitraryUint24,
  arbitraryUint32,
} from './arbitraries';

test('arbitraryUint2', () => {
  fc.assert(
    fc.property(arbitraryUint2(), (value) => {
      assert(value >= 0 && value <= 0b11);
    })
  );
});

test('arbitraryUint4', () => {
  fc.assert(
    fc.property(arbitraryUint4(), (value) => {
      assert(value >= 0 && value <= 0b1111);
    })
  );
});

test('arbitraryUint8', () => {
  fc.assert(
    fc.property(arbitraryUint8(), (value) => {
      assert(value >= 0 && value <= 0b11111111);
    })
  );
});

test('arbitraryUint16', () => {
  fc.assert(
    fc.property(arbitraryUint16(), (value) => {
      assert(value >= 0 && value <= 0xffff);
    })
  );
});

test('arbitraryUint24', () => {
  fc.assert(
    fc.property(arbitraryUint24(), (value) => {
      assert(value >= 0 && value <= 0xffffff);
    })
  );
});

test('arbitraryUint32', () => {
  fc.assert(
    fc.property(arbitraryUint32(), (value) => {
      assert(value >= 0 && value <= 0xffffffff);
    })
  );
});

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
        expect(contest.allowWriteIns).toEqual(allowWriteIns);
      }
    )
  );
});
