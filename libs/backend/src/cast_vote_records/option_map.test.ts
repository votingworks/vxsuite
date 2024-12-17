import { readElectionTwoPartyPrimary } from '@votingworks/fixtures';
import { buildElectionOptionPositionMap } from './option_map';

test('buildElectionOptionMap', () => {
  const election = readElectionTwoPartyPrimary();
  expect(buildElectionOptionPositionMap(election)).toEqual({
    'aquarium-council-fish': {
      'manta-ray': 0,
      pufferfish: 1,
      rockfish: 2,
      triggerfish: 3,
      'write-in-0': 4,
      'write-in-1': 5,
    },
    'best-animal-fish': {
      salmon: 1,
      seahorse: 0,
    },
    'best-animal-mammal': {
      fox: 2,
      horse: 0,
      otter: 1,
    },
    fishing: {
      'ban-fishing': 0,
      'allow-fishing': 1,
    },
    'new-zoo-either': {
      'new-zoo-either-approved': 0,
      'new-zoo-neither-approved': 1,
    },
    'new-zoo-pick': {
      'new-zoo-safari': 0,
      'new-zoo-traditional': 1,
    },
    'zoo-council-mammal': {
      elephant: 3,
      kangaroo: 2,
      lion: 1,
      'write-in-0': 4,
      'write-in-1': 5,
      'write-in-2': 6,
      zebra: 0,
    },
  });
});
