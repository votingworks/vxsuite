import { Election, VotesDict } from '../election'
import { encodeVotes, decodeVotes } from './index'
import electionSample from '../data/electionSample.json'
import { Uint8Size, toUint8, Uint8 } from '../bits'

const election = electionSample as Election

function uint8ArrayFromBitArray(
  ...bits: (string | number | number[])[]
): Uint8Array {
  const bytes: Uint8[] = []
  const allBits: number[] = []
  for (const bitOrBits of bits) {
    if (Array.isArray(bitOrBits)) {
      allBits.push(...bitOrBits)
    } else if (typeof bitOrBits === 'string') {
      allBits.push(...bitOrBits.split('').map(c => parseInt(c, 2)))
    } else {
      allBits.push(bitOrBits)
    }
  }
  const extraBits = allBits.length % Uint8Size
  const paddedLength =
    extraBits === 0 ? allBits.length : allBits.length + Uint8Size - extraBits

  for (let i = 0; i < paddedLength; i += Uint8Size) {
    const string = allBits
      .slice(i, i + Uint8Size)
      .join('')
      .padEnd(Uint8Size, '0')
    bytes.push(toUint8(parseInt(string, 2)))
  }

  return Uint8Array.of(...bytes)
}

it('encodes empty votes correctly', () => {
  const votes: VotesDict = {}
  const votesPresent = '0'.repeat(election.contests.length)

  expect(encodeVotes(election.contests, votes)).toEqual(
    uint8ArrayFromBitArray(votesPresent)
  )
})

it('encodes yesno votes correctly', () => {
  const votes: VotesDict = {
    'judicial-robert-demergue': 'yes',
    'judicial-elmer-hull': 'yes',
    'question-a': 'yes',
    'question-b': 'no',
    'question-c': 'yes',
    'proposition-1': 'yes',
    'measure-101': 'no',
    '102': 'yes',
    'measure-666': 'yes',
  }

  expect(encodeVotes(election.contests, votes)).toEqual(
    uint8ArrayFromBitArray(
      /** ROLL CALL * */
      '0000000000001111111110',

      /** VOTE DATA * */
      // judicial-robert-demergue
      1,
      // judicial-elmer-hull
      1,
      // question-a
      1,
      // question-b
      0,
      // question-c
      1,
      // proposition-1
      1,
      // measure-101
      0,
      // 102
      1,
      // measure-666
      1
    )
  )
})

it('encodes candidate choice votes correctly', () => {
  const votes: VotesDict = {
    president: [
      { id: 'barchi-hallaren', name: 'Joseph Barchi and Joseph Hallaren' },
    ],
    senator: [{ id: 'weiford', name: 'Dennis Weiford' }],
    'representative-district-6': [{ id: 'plunkard', name: 'Brad Plunkard' }],
    governor: [{ id: 'franz', name: 'Charlene Franz' }],
    'lieutenant-governor': [{ id: 'norberg', name: 'Chris Norberg' }],
    'secretary-of-state': [{ id: 'shamsi', name: 'Laila Shamsi' }],
    'state-senator-district-31': [{ id: 'shiplett', name: 'Edward Shiplett' }],
    'state-assembly-district-54': [{ id: 'solis', name: 'Andrea Solis' }],
    'county-commissioners': [{ id: 'argent', name: 'Camille Argent' }],
    'county-registrar-of-wills': [
      { id: 'ramachandrani', name: 'Rhadka Ramachandrani' },
    ],
    'city-mayor': [{ id: 'white', name: 'Orville White' }],
    'city-council': [{ id: 'eagle', name: 'Harvey Eagle' }],
    'primary-constitution-head-of-party': [
      { id: 'alice', name: 'Alice Jones' },
    ],
  }

  expect(encodeVotes(election.contests, votes)).toEqual(
    uint8ArrayFromBitArray(
      /** ROLL CALL * */
      '1111111111110000000001',

      /** VOTE DATA * */
      // president
      '100000',

      // senator
      '1000000',

      // representative-district-6
      '10000',

      // governor
      '10000000000000000000',
      '000000',

      // lieutenant-governor
      '100000000',

      // secretary-of-state
      '10',

      // state-senator-district-31
      '1',

      // state-assembly-district-54
      '100',

      // county-commisioners (+ write-in count4 seats)
      '10000000000000000',

      // county-registrar-of-wills (+ write-in count1 seat)
      '10',

      // city-mayor (+ write-in count1 seat)
      '100',

      // city-council (+ write-in count3 seats)
      '10000000',

      // primary-constitution-head-of-party
      '10'
    )
  )
})

it('encodes a ballot with mixed vote types correctly', () => {
  const votes: VotesDict = {
    '102': 'yes',
    'judicial-robert-demergue': 'yes',
    'judicial-elmer-hull': 'yes',
    'question-a': 'yes',
    'question-b': 'yes',
    'question-c': 'yes',
    'proposition-1': 'yes',
    'measure-101': 'yes',
    'measure-666': 'yes',
    president: [
      { id: 'barchi-hallaren', name: 'Joseph Barchi and Joseph Hallaren' },
    ],
    senator: [{ id: 'weiford', name: 'Dennis Weiford' }],
    'representative-district-6': [{ id: 'plunkard', name: 'Brad Plunkard' }],
    governor: [{ id: 'franz', name: 'Charlene Franz' }],
    'lieutenant-governor': [{ id: 'norberg', name: 'Chris Norberg' }],
    'secretary-of-state': [{ id: 'shamsi', name: 'Laila Shamsi' }],
    'state-senator-district-31': [{ id: 'shiplett', name: 'Edward Shiplett' }],
    'state-assembly-district-54': [{ id: 'solis', name: 'Andrea Solis' }],
    'county-commissioners': [{ id: 'argent', name: 'Camille Argent' }],
    'county-registrar-of-wills': [
      { id: 'ramachandrani', name: 'Rhadka Ramachandrani' },
    ],
    'city-mayor': [{ id: 'white', name: 'Orville White' }],
    'city-council': [{ id: 'eagle', name: 'Harvey Eagle' }],
    'primary-constitution-head-of-party': [
      { id: 'alice', name: 'Alice Jones' },
    ],
  }

  expect(encodeVotes(election.contests, votes)).toEqual(
    uint8ArrayFromBitArray(
      /** ROLL CALL * */
      '1111111111111111111111',

      /** VOTE DATA * */
      // president
      '100000',

      // senator
      '1000000',

      // representative-district-6
      '10000',

      // governor
      '10000000000000000000000000',

      // lieutenant-governor
      '100000000',

      // secretary-of-state
      '10',

      // state-senator-district-31
      '1',

      // state-assembly-district-54
      '100',

      // county-commisioners (+ write-in count, 4 seats)
      '10000000000000000',

      // county-registrar-of-wills (+ write-in count, 1 seat)
      '10',

      // city-mayor (+ write-in count, 1 seat)
      '100',

      // city-council (+ write-in count, 3 seats)
      '10000000',

      // 102
      1,
      // judicial-robert-demergue
      1,
      // judicial-elmer-hull
      1,
      // question-a
      1,
      // question-b
      1,
      // question-c
      1,
      // proposition-1
      1,
      // measure-101
      1,
      // measure-666
      1,

      // primary-constitution-head-of-party
      '10'
    )
  )
})

it('encodes write-in votes correctly', () => {
  const votes: VotesDict = {
    'county-registrar-of-wills': [
      { id: 'write-in__MICKEY MOUSE', name: 'MICKEY MOUSE', isWriteIn: true },
    ],
  }

  expect(encodeVotes(election.contests, votes)).toEqual(
    uint8ArrayFromBitArray(
      /** ROLL CALL * */
      '0000000001000000000000',

      /** VOTE DATA * */

      // county-registrar-of-wills
      // 1st candidate not selected
      // # of write-ins
      '0',
      // write-in length
      '100110',
      // M
      '001100',
      // I
      '01000',
      // C
      '00010',
      // K
      '01010',
      // E
      '00100',
      // Y
      '11000',
      // ␣
      '11010',
      // M
      '01100',
      // O
      '01110',
      // U
      '10100',
      // S
      '10010',
      // E
      '00100'
    )
  )
})

it('round-trips empty votes correctly', () => {
  const votes: VotesDict = {}

  expect(
    decodeVotes(election.contests, encodeVotes(election.contests, votes))
  ).toEqual(votes)
})

it('round-trips yesno votes correctly', () => {
  const votes: VotesDict = {
    'judicial-robert-demergue': 'yes',
    'judicial-elmer-hull': 'yes',
    'question-a': 'yes',
    'question-b': 'no',
    'question-c': 'yes',
    'proposition-1': 'yes',
    'measure-101': 'no',
    '102': 'yes',
    'measure-666': 'yes',
  }

  expect(
    decodeVotes(election.contests, encodeVotes(election.contests, votes))
  ).toEqual(votes)
})

it('round-trips candidate votes correctly', () => {
  const votes: VotesDict = {
    president: [
      {
        id: 'barchi-hallaren',
        name: 'Joseph Barchi and Joseph Hallaren',
        partyId: '0',
      },
    ],
    senator: [{ id: 'weiford', name: 'Dennis Weiford', partyId: '0' }],
    'representative-district-6': [
      { id: 'plunkard', name: 'Brad Plunkard', partyId: '0' },
    ],
    governor: [{ id: 'franz', name: 'Charlene Franz', partyId: '0' }],
    'lieutenant-governor': [
      { id: 'norberg', name: 'Chris Norberg', partyId: '0' },
    ],
    'secretary-of-state': [
      { id: 'shamsi', name: 'Laila Shamsi', partyId: '0' },
    ],
    'state-senator-district-31': [
      { id: 'shiplett', name: 'Edward Shiplett', partyId: '3' },
    ],
    'state-assembly-district-54': [
      { id: 'solis', name: 'Andrea Solis', partyId: '0' },
    ],
    'county-commissioners': [
      { id: 'argent', name: 'Camille Argent', partyId: '0' },
    ],
    'county-registrar-of-wills': [
      { id: 'ramachandrani', name: 'Rhadka Ramachandrani', partyId: '6' },
    ],
    'city-mayor': [{ id: 'white', name: 'Orville White', partyId: '1' }],
    'city-council': [{ id: 'eagle', name: 'Harvey Eagle', partyId: '0' }],
    'primary-constitution-head-of-party': [
      { id: 'alice', name: 'Alice Jones', partyId: '3' },
    ],
  }

  expect(
    decodeVotes(election.contests, encodeVotes(election.contests, votes))
  ).toEqual(votes)
})

it('round-trips write-ins correctly', () => {
  const votes: VotesDict = {
    'county-registrar-of-wills': [
      { id: 'write-in__MICKEY MOUSE', name: 'MICKEY MOUSE', isWriteIn: true },
    ],
  }

  expect(
    decodeVotes(election.contests, encodeVotes(election.contests, votes))
  ).toEqual(votes)
})
