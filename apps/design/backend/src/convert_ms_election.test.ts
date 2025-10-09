import { test, expect, vi, beforeAll, afterAll } from 'vitest';
import { mockBaseLogger } from '@votingworks/logging';
import { convertMsElection } from './convert_ms_election';
import { TestStore } from '../test/test_store';
import { Org } from './types';

const mockElectionFileContents = `0, "GEMS Import Data", 1, 5, 1, 1, 1, 1
1, "General Election", "11/5/2024"
2, -1, 1, "United States"
2, -1, 100000047, "US House Of Representatives"
2, -1, 100000174, "Supreme Court Justice"
2, -1, 575000501, "Election Commissioner 01"
2, -1, 575000503, "Election Commissioner 03"
2, -1, 575000505, "Election Commissioner 05"
2, -1, 575000082, "School Board District 3"
2, -1, 575000083, "School Board District 4"
3, 0, 775000001, "SPRINGFIELD COMMUNITY CENTER"
3, 0, 2898, "RIVERSIDE FIRE DEPARTMENT"
3, 0, 2885, "OAKVILLE COMMUNITY CENTER"
3, 0, 2887, "MAPLE GROVE FIRE DEPARTMENT"
3, 0, 2897, "HILLSIDE UMC"
3, 0, 2889, "OLD VALLEY BAPTIST CHURCH"
3, 0, 775000002, "NORTHSIDE FIRE DEPARTMENT"
3, 0, 2894, "SUNSET FIRE DEPARTMENT"
3, 0, 2896, "ELMWOOD COMMUNITY CENTER"
3, 0, 2890, "FAIRVIEW VOL FIRE DEPT"
3, 0, 2886, "WILLOW FIRE DEPARTMENT"
3, 0, 2899, "WILLOW SCHOOL GYMNASIUM"
4, 2898, 6538, 22725, "Riverside", 0, "3"
4, 2885, 6524, 22683, "Oakville", 0, "3"
4, 2885, 6524, 22691, "Oakville", 0, "3"
4, 2885, 6524, 775000997, "Oakville", 0, "3"
4, 2885, 6524, 775000998, "Oakville", 0, "3"
4, 775000001, 6522, 22713, "District 5", 0, "2"
4, 775000001, 6522, 775000004, "District 5", 0, "2"
4, 775000001, 6522, 775000993, "District 5", 0, "2"
4, 775000001, 6522, 775000994, "District 5", 0, "2"
4, 775000001, 6522, 775000995, "District 5", 0, "2"
4, 775000001, 6522, 775000996, "District 5", 0, "2"
4, 775000001, 6522, 775001002, "District 5", 0, "2"
4, 775000001, 6522, 775001003, "District 5", 0, "2"
4, 775000001, 6522, 775001004, "District 5", 0, "2"
4, 775000001, 6522, 775001005, "District 5", 0, "2"
4, 2886, 6525, 22686, "East Willow", 0, "4"
4, 2886, 6525, 22687, "East Willow", 0, "4"
4, 2886, 6525, 775001116, "East Willow", 0, "4"
4, 2886, 6525, 775001117, "East Willow", 0, "4"
4, 2887, 6526, 22689, "Maple Grove", 0, "5"
4, 2887, 6526, 575000859, "Maple Grove", 0, "5"
4, 2889, 6528, 22695, "Valley", 0, "1"
4, 2890, 6529, 22697, "Fairview", 0, "5"
4, 775000002, 6532, 22706, "Northside", 0, "4"
4, 2894, 6534, 22710, "Sunset", 0, "1"
4, 2896, 6536, 22719, "Elmwood", 0, "1"
4, 2896, 6536, 775002424, "Elmwood", 0, "1"
4, 2897, 6537, 22724, "Southwest Springfield", 0, "4"
4, 2897, 6537, 775000999, "Southwest Springfield", 0, "4"
4, 2897, 6537, 775001000, "Southwest Springfield", 0, "4"
4, 2897, 6537, 775002728, "Southwest Springfield", 0, "4"
4, 2899, 6539, 22728, "West Willow", 0, "5"
4, 2899, 6539, 775001118, "West Willow", 0, "5"
5, 22683, 100000174
5, 22683, 100000047
5, 22683, 1
5, 22683, 575000501
5, 22686, 1
5, 22686, 100000047
5, 22686, 575000083
5, 22686, 100000174
5, 22687, 1
5, 22687, 100000174
5, 22687, 100000047
5, 22687, 575000083
5, 22689, 1
5, 22689, 100000047
5, 22689, 575000503
5, 22689, 575000082
5, 22689, 100000174
5, 22691, 1
5, 22691, 100000047
5, 22691, 100000174
5, 22691, 575000501
5, 22692, 1
5, 22692, 100000047
5, 22692, 575000501
5, 22692, 100000174
5, 22695, 100000047
5, 22695, 1
5, 22695, 100000174
5, 22697, 100000174
5, 22697, 100000047
5, 22697, 1
5, 22697, 575000082
5, 22697, 575000503
5, 22706, 100000047
5, 22706, 1
5, 22706, 100000174
5, 22706, 575000083
5, 22709, 100000047
5, 22709, 1
5, 22709, 100000174
5, 22710, 1
5, 22710, 100000047
5, 22710, 100000174
5, 22713, 1
5, 22713, 100000047
5, 22713, 100000174
5, 22713, 575000505
5, 22719, 1
5, 22719, 100000174
5, 22719, 100000047
5, 22724, 100000047
5, 22724, 1
5, 22724, 100000174
5, 22724, 575000083
5, 22725, 100000047
5, 22725, 1
5, 22725, 100000174
5, 22725, 575000501
5, 22728, 1
5, 22728, 100000047
5, 22728, 575000082
5, 22728, 100000174
5, 22728, 575000503
5, 575000859, 1
5, 575000859, 100000047
5, 575000859, 100000174
5, 575000859, 575000082
5, 575000859, 575000503
5, 575002363, 1
5, 575002363, 100000047
5, 575002363, 100000174
5, 575002363, 575000501
5, 775000004, 1
5, 775000004, 100000047
5, 775000004, 100000174
5, 775000004, 575000505
5, 775000993, 1
5, 775000993, 100000047
5, 775000993, 100000174
5, 775000993, 575000505
5, 775000994, 1
5, 775000994, 100000047
5, 775000994, 575000505
5, 775000994, 100000174
5, 775000995, 1
5, 775000995, 100000174
5, 775000995, 100000047
5, 775000995, 575000505
5, 775000996, 1
5, 775000996, 100000047
5, 775000996, 575000505
5, 775000996, 100000174
5, 775000997, 1
5, 775000997, 100000047
5, 775000997, 100000174
5, 775000997, 575000501
5, 775000998, 1
5, 775000998, 100000047
5, 775000998, 575000501
5, 775000998, 100000174
5, 775000999, 1
5, 775000999, 100000047
5, 775000999, 100000174
5, 775000999, 575000083
5, 775001000, 1
5, 775001000, 100000047
5, 775001000, 100000174
5, 775001000, 575000083
5, 775001002, 100000174
5, 775001002, 100000047
5, 775001002, 1
5, 775001002, 575000505
5, 775001003, 100000174
5, 775001003, 100000047
5, 775001003, 1
5, 775001003, 575000505
5, 775001004, 1
5, 775001004, 100000047
5, 775001004, 100000174
5, 775001004, 575000505
5, 775001005, 1
5, 775001005, 100000047
5, 775001005, 100000174
5, 775001005, 575000505
5, 775001116, 100000047
5, 775001116, 1
5, 775001116, 100000174
5, 775001116, 575000083
5, 775001117, 100000047
5, 775001117, 1
5, 775001117, 100000174
5, 775001117, 575000083
5, 775001118, 1
5, 775001118, 100000047
5, 775001118, 100000174
5, 775001118, 575000082
5, 775001118, 575000503
5, 775002424, 1
5, 775002424, 100000174
5, 775002424, 100000047
5, 775002728, 1
5, 775002728, 575000083
5, 775002728, 100000174
5, 775002728, 100000047
6, 2, "Democrat", "D", 2, "Democrat"
6, 3, "Republican", "R", 3, "Republican"
6, 4, "Libertarian", "L", 4, "Libertarian"
6, 5, "Reform", "REF", 5, "Reform"
6, 6, "Natural Law", "N", 6, "Natural Law"
6, 8, "Mississippi Constitution", "C", 8, "Mississippi Constitution"
6, 9, "Green", "G", 9, "Green"
6, 10, "America First", "A", 10, "America First"
6, 11, "Independent", "I", 11, "Independent"
6, 12, "Nonpartisan", "NP", 12, "Nonpartisan"
6, 575000001, "Justice", "JUS", 575000001, "Justice"
6, 575000002, "Prohibition", "PRO", 575000002, "Prohibition"
6, 575000003, "American Delta", "ADP", 575000003, "American Delta"
6, 575000004, "Veterans", "VET", 575000004, "Veterans"
6, 775000001, "American Solidarity", "ASP", 775000001, "American Solidarity"
6, 775000002, "American Constitution", "AMC", 775000002, "American Constitution"
7, 775030219, "President",0, 0, 1, 1, 1, "United States\nPresident\n4 YEAR TERM\nVote for ONE", 0, 0
7, 775030220, "Senate",0, 0, 1, 1, 1, "United States\nSenate\n6 YEAR TERM\nVote for ONE", 0, 0
7, 775030215, "1st Congressional District",0, 0, 100000047, 1, 1, "US House Of Rep 01\n1st Congressional District\n2 YEAR TERM\nVote for ONE", 0, 0
7, 775030212, "Supreme Court District 3(Northern) Position 1",0, 0, 100000174, 1, 1, "Northern District\nSupreme Court District 3(Northern) Position 1\n8 YEAR TERM\nVote for ONE", 0, 0
7, 775030213, "Supreme Court District 3(Northern) Position 2",0, 0, 100000174, 1, 1, "Northern District\nSupreme Court District 3(Northern) Position 2\n8 YEAR TERM\nVote for ONE", 0, 0
7, 775030689, "Election Commissioner 01",0, 0, 575000501, 1, 1, "Election Commissioner 01\nElection Commissioner  01\n4 YEAR TERM\nVote for ONE", 0, 0
7, 775030690, "Election Commissioner 03",0, 0, 575000503, 1, 1, "Election Commissioner 03\nElection Commissioner 03\n4 YEAR TERM\nVote for ONE", 0, 0
7, 775030691, "Election Commissioner 05",0, 0, 575000505, 1, 1, "Election Commissioner 05\nElection Commissioner 05\n4 YEAR TERM\nVote for ONE", 0, 0
7, 775030692, "School Board District 3 Member",0, 0, 575000082, 1, 1, "School Board District 3\nSchool Board District 3 Member\n6 YEAR TERM\nVote for ONE", 0, 0
7, 775030693, "School Board District 4 Member",0, 0, 575000083, 1, 1, "School Board District 4\nSchool Board District 4 Member\n6 YEAR TERM\nVote for ONE", 0, 0
8, 775030219, 1, "JOHNSON ALICE",0, 1, 2, "Presidential Electors for Alice Johnson for President and David Wilson for Vice President"
8, 775030219, 2, "MARTINEZ CARLOS",0, 2, 4, "Presidential Electors for Carlos Martinez for President and Sarah Davis for Vice President"
8, 775030219, 3, "THOMPSON EMILY",0, 3, 9, "Presidential Electors for Emily Thompson for President and Michael Brown for Vice President"
8, 775030219, 4, "ANDERSON ROBERT",0, 4, 8, "Presidential Electors for Robert Anderson for President and Jennifer Lee for Vice President"
8, 775030219, 5, "WILLIAMS JAMES",0, 5, 3, "Presidential Electors for James Williams for President and Lisa Garcia for Vice President"
8, 775030219, 6, "CLARK PATRICIA",0, 6, 11, "Presidential Electors for Patricia Clark for President and Kevin Miller for Vice President"
8, 775030219, 7, "RODRIGUEZ MARIA",0, 7, 11, "Presidential Electors for Maria Rodriguez for President and Thomas Taylor for Vice President"
8, 775030219, 8, "JACKSON ROBERT",0, 8, 11, "Presidential Electors for Robert Jackson for President and Amanda White for Vice President"
8, 775030219, 9, "LEWIS DANIEL",0, 9, 11, "Presidential Electors for Daniel Lewis for President and Rachel Green for Vice President"
8, 775030220, 1, "BAKER MICHELLE",0, 1, 2, "Michelle Baker"
8, 775030220, 2, "COOPER WILLIAM",0, 2, 3, "William Cooper"
8, 775030215, 1, "TURNER SUSAN",0, 1, 2, "Susan Turner"
8, 775030215, 2, "PARKER JOHN",0, 2, 3, "John Parker"
8, 775030212, 1, "MORRIS EDWARD",0, 1, "", "Edward Morris"
8, 775030213, 1, "WATSON HELEN",0, 1, "", "Helen Watson"
8, 775030689, 1, "BROOKS NANCY",0, 1, 11, "Nancy Brooks"
8, 775030690, 1, "KELLY STEPHANIE",0, 1, 11, "Stephanie Kelly"
8, 775030691, 1, "WARD BETTY",0, 1, 11, "Betty Ward"
8, 775030692, 1, "FOSTER ANTHONY",0, 1, 11, "Anthony Foster"
8, 775030692, 2, "COLEMAN PATRICK",0, 2, 11, "Patrick Coleman"
8, 775030693, 1, "RICHARDSON DIANA",0, 1, 11, "Diana Richardson"
8, 775030693, 2, "PHILLIPS KAREN",0, 2, 11, "Karen Phillips"
`;

const mockCandidateFileContents = `, , , , 0
9, "10", 775030212, 1, 775045190
, , , , 0
9, "10", 775030213, 1, 775045191
, , , , 0
9, "10", 775030215, 1, 775045193
9, "10", 775030215, 2, 775045194
, , , , 0
9, "10", 775030219, 1, 775045212
9, "10", 775030219, 5, 775045213
9, "10", 775030219, 8, 775045214
9, "10", 775030219, 3, 775045215
9, "10", 775030219, 2, 775045216
9, "10", 775030219, 4, 775045256
9, "10", 775030219, 9, 775045258
9, "10", 775030219, 6, 775045286
9, "10", 775030219, 7, 775045287
, , , , 0
9, "10", 775030220, 2, 775045200
9, "10", 775030220, 1, 775045201
, , , , 0
9, "10", 775030689, 1, 775045843
, , , , 0
9, "10", 775030690, 1, 775045847
, , , , 0
9, "10", 775030691, 1, 775045848
, , , , 0
9, "10", 775030692, 1, 775045849
9, "10", 775030692, 2, 775045850
, , , , 0
9, "10", 775030693, 1, 775045851
9, "10", 775030693, 2, 775045852
`;

const logger = mockBaseLogger({ fn: vi.fn });
const testStore = new TestStore(logger);

beforeAll(async () => {
  await testStore.init();
});

afterAll(async () => {
  await testStore.cleanUp();
});

test('convertMsElection', async () => {
  const election = convertMsElection(
    'mock-election-id',
    mockElectionFileContents,
    mockCandidateFileContents
  );
  expect(election).toMatchInlineSnapshot(`
    {
      "ballotLayout": {
        "metadataEncoding": "qr-code",
        "paperSize": "letter",
      },
      "ballotStrings": {},
      "ballotStyles": [],
      "contests": [
        {
          "allowWriteIns": true,
          "candidates": [
            {
              "firstName": "Presidential",
              "id": "775045212",
              "lastName": "President",
              "middleName": "Electors for Alice Johnson for President and David Wilson for Vice",
              "name": "Presidential Electors for Alice Johnson for President and David Wilson for Vice President",
              "partyIds": [
                "2",
              ],
            },
            {
              "firstName": "Presidential",
              "id": "775045216",
              "lastName": "President",
              "middleName": "Electors for Carlos Martinez for President and Sarah Davis for Vice",
              "name": "Presidential Electors for Carlos Martinez for President and Sarah Davis for Vice President",
              "partyIds": [
                "4",
              ],
            },
            {
              "firstName": "Presidential",
              "id": "775045215",
              "lastName": "President",
              "middleName": "Electors for Emily Thompson for President and Michael Brown for Vice",
              "name": "Presidential Electors for Emily Thompson for President and Michael Brown for Vice President",
              "partyIds": [
                "9",
              ],
            },
            {
              "firstName": "Presidential",
              "id": "775045256",
              "lastName": "President",
              "middleName": "Electors for Robert Anderson for President and Jennifer Lee for Vice",
              "name": "Presidential Electors for Robert Anderson for President and Jennifer Lee for Vice President",
              "partyIds": [
                "8",
              ],
            },
            {
              "firstName": "Presidential",
              "id": "775045213",
              "lastName": "President",
              "middleName": "Electors for James Williams for President and Lisa Garcia for Vice",
              "name": "Presidential Electors for James Williams for President and Lisa Garcia for Vice President",
              "partyIds": [
                "3",
              ],
            },
            {
              "firstName": "Presidential",
              "id": "775045286",
              "lastName": "President",
              "middleName": "Electors for Patricia Clark for President and Kevin Miller for Vice",
              "name": "Presidential Electors for Patricia Clark for President and Kevin Miller for Vice President",
              "partyIds": [
                "11",
              ],
            },
            {
              "firstName": "Presidential",
              "id": "775045287",
              "lastName": "President",
              "middleName": "Electors for Maria Rodriguez for President and Thomas Taylor for Vice",
              "name": "Presidential Electors for Maria Rodriguez for President and Thomas Taylor for Vice President",
              "partyIds": [
                "11",
              ],
            },
            {
              "firstName": "Presidential",
              "id": "775045214",
              "lastName": "President",
              "middleName": "Electors for Robert Jackson for President and Amanda White for Vice",
              "name": "Presidential Electors for Robert Jackson for President and Amanda White for Vice President",
              "partyIds": [
                "11",
              ],
            },
            {
              "firstName": "Presidential",
              "id": "775045258",
              "lastName": "President",
              "middleName": "Electors for Daniel Lewis for President and Rachel Green for Vice",
              "name": "Presidential Electors for Daniel Lewis for President and Rachel Green for Vice President",
              "partyIds": [
                "11",
              ],
            },
          ],
          "districtId": "1",
          "id": "775030219",
          "partyId": undefined,
          "seats": 1,
          "title": "President",
          "type": "candidate",
        },
        {
          "allowWriteIns": true,
          "candidates": [
            {
              "firstName": "Michelle",
              "id": "775045201",
              "lastName": "Baker",
              "middleName": "",
              "name": "Michelle Baker",
              "partyIds": [
                "2",
              ],
            },
            {
              "firstName": "William",
              "id": "775045200",
              "lastName": "Cooper",
              "middleName": "",
              "name": "William Cooper",
              "partyIds": [
                "3",
              ],
            },
          ],
          "districtId": "1",
          "id": "775030220",
          "partyId": undefined,
          "seats": 1,
          "title": "Senate",
          "type": "candidate",
        },
        {
          "allowWriteIns": true,
          "candidates": [
            {
              "firstName": "Susan",
              "id": "775045193",
              "lastName": "Turner",
              "middleName": "",
              "name": "Susan Turner",
              "partyIds": [
                "2",
              ],
            },
            {
              "firstName": "John",
              "id": "775045194",
              "lastName": "Parker",
              "middleName": "",
              "name": "John Parker",
              "partyIds": [
                "3",
              ],
            },
          ],
          "districtId": "100000047",
          "id": "775030215",
          "partyId": undefined,
          "seats": 1,
          "title": "1st Congressional District",
          "type": "candidate",
        },
        {
          "allowWriteIns": true,
          "candidates": [
            {
              "firstName": "Edward",
              "id": "775045190",
              "lastName": "Morris",
              "middleName": "",
              "name": "Edward Morris",
              "partyIds": undefined,
            },
          ],
          "districtId": "100000174",
          "id": "775030212",
          "partyId": undefined,
          "seats": 1,
          "title": "Supreme Court District 3(Northern) Position 1",
          "type": "candidate",
        },
        {
          "allowWriteIns": true,
          "candidates": [
            {
              "firstName": "Helen",
              "id": "775045191",
              "lastName": "Watson",
              "middleName": "",
              "name": "Helen Watson",
              "partyIds": undefined,
            },
          ],
          "districtId": "100000174",
          "id": "775030213",
          "partyId": undefined,
          "seats": 1,
          "title": "Supreme Court District 3(Northern) Position 2",
          "type": "candidate",
        },
        {
          "allowWriteIns": true,
          "candidates": [
            {
              "firstName": "Nancy",
              "id": "775045843",
              "lastName": "Brooks",
              "middleName": "",
              "name": "Nancy Brooks",
              "partyIds": [
                "11",
              ],
            },
          ],
          "districtId": "575000501",
          "id": "775030689",
          "partyId": undefined,
          "seats": 1,
          "title": "Election Commissioner 01",
          "type": "candidate",
        },
        {
          "allowWriteIns": true,
          "candidates": [
            {
              "firstName": "Stephanie",
              "id": "775045847",
              "lastName": "Kelly",
              "middleName": "",
              "name": "Stephanie Kelly",
              "partyIds": [
                "11",
              ],
            },
          ],
          "districtId": "575000503",
          "id": "775030690",
          "partyId": undefined,
          "seats": 1,
          "title": "Election Commissioner 03",
          "type": "candidate",
        },
        {
          "allowWriteIns": true,
          "candidates": [
            {
              "firstName": "Betty",
              "id": "775045848",
              "lastName": "Ward",
              "middleName": "",
              "name": "Betty Ward",
              "partyIds": [
                "11",
              ],
            },
          ],
          "districtId": "575000505",
          "id": "775030691",
          "partyId": undefined,
          "seats": 1,
          "title": "Election Commissioner 05",
          "type": "candidate",
        },
        {
          "allowWriteIns": true,
          "candidates": [
            {
              "firstName": "Anthony",
              "id": "775045849",
              "lastName": "Foster",
              "middleName": "",
              "name": "Anthony Foster",
              "partyIds": [
                "11",
              ],
            },
            {
              "firstName": "Patrick",
              "id": "775045850",
              "lastName": "Coleman",
              "middleName": "",
              "name": "Patrick Coleman",
              "partyIds": [
                "11",
              ],
            },
          ],
          "districtId": "575000082",
          "id": "775030692",
          "partyId": undefined,
          "seats": 1,
          "title": "School Board District 3 Member",
          "type": "candidate",
        },
        {
          "allowWriteIns": true,
          "candidates": [
            {
              "firstName": "Diana",
              "id": "775045851",
              "lastName": "Richardson",
              "middleName": "",
              "name": "Diana Richardson",
              "partyIds": [
                "11",
              ],
            },
            {
              "firstName": "Karen",
              "id": "775045852",
              "lastName": "Phillips",
              "middleName": "",
              "name": "Karen Phillips",
              "partyIds": [
                "11",
              ],
            },
          ],
          "districtId": "575000083",
          "id": "775030693",
          "partyId": undefined,
          "seats": 1,
          "title": "School Board District 4 Member",
          "type": "candidate",
        },
      ],
      "county": {
        "id": "10",
        "name": "Choctaw County",
      },
      "date": "2024-11-05",
      "districts": [
        {
          "id": "1",
          "name": "United States",
        },
        {
          "id": "100000047",
          "name": "US House Of Representatives",
        },
        {
          "id": "100000174",
          "name": "Supreme Court Justice",
        },
        {
          "id": "575000501",
          "name": "Election Commissioner 01",
        },
        {
          "id": "575000503",
          "name": "Election Commissioner 03",
        },
        {
          "id": "575000505",
          "name": "Election Commissioner 05",
        },
        {
          "id": "575000082",
          "name": "School Board District 3",
        },
        {
          "id": "575000083",
          "name": "School Board District 4",
        },
      ],
      "id": "mock-election-id",
      "parties": [
        {
          "abbrev": "D",
          "fullName": "Democratic Party",
          "id": "2",
          "name": "Democrat",
        },
        {
          "abbrev": "R",
          "fullName": "Republican Party",
          "id": "3",
          "name": "Republican",
        },
        {
          "abbrev": "L",
          "fullName": "Libertarian Party",
          "id": "4",
          "name": "Libertarian",
        },
        {
          "abbrev": "REF",
          "fullName": "Reform Party",
          "id": "5",
          "name": "Reform",
        },
        {
          "abbrev": "N",
          "fullName": "Natural Law Party",
          "id": "6",
          "name": "Natural Law",
        },
        {
          "abbrev": "C",
          "fullName": "Mississippi Constitution Party",
          "id": "8",
          "name": "Mississippi Constitution",
        },
        {
          "abbrev": "G",
          "fullName": "Green Party",
          "id": "9",
          "name": "Green",
        },
        {
          "abbrev": "A",
          "fullName": "America First Party",
          "id": "10",
          "name": "America First",
        },
        {
          "abbrev": "I",
          "fullName": "Independent Party",
          "id": "11",
          "name": "Independent",
        },
        {
          "abbrev": "NP",
          "fullName": "Nonpartisan",
          "id": "12",
          "name": "Nonpartisan",
        },
        {
          "abbrev": "JUS",
          "fullName": "Justice Party",
          "id": "575000001",
          "name": "Justice",
        },
        {
          "abbrev": "PRO",
          "fullName": "Prohibition Party",
          "id": "575000002",
          "name": "Prohibition",
        },
        {
          "abbrev": "ADP",
          "fullName": "American Delta Party",
          "id": "575000003",
          "name": "American Delta",
        },
        {
          "abbrev": "VET",
          "fullName": "Veterans Party",
          "id": "575000004",
          "name": "Veterans",
        },
        {
          "abbrev": "ASP",
          "fullName": "American Solidarity Party",
          "id": "775000001",
          "name": "American Solidarity",
        },
        {
          "abbrev": "AMC",
          "fullName": "American Constitution Party",
          "id": "775000002",
          "name": "American Constitution",
        },
      ],
      "precincts": [
        {
          "districtIds": [
            "100000047",
            "1",
            "100000174",
            "575000501",
          ],
          "id": "6538",
          "name": "Riverside",
        },
        {
          "id": "6524",
          "name": "Oakville",
          "splits": [
            {
              "districtIds": [
                "100000174",
                "100000047",
                "1",
                "575000501",
              ],
              "id": "22683",
              "name": "Oakville - Split #1",
            },
            {
              "districtIds": [
                "1",
                "100000047",
                "100000174",
                "575000501",
              ],
              "id": "22691",
              "name": "Oakville - Split #2",
            },
            {
              "districtIds": [
                "1",
                "100000047",
                "100000174",
                "575000501",
              ],
              "id": "775000997",
              "name": "Oakville - Split #3",
            },
            {
              "districtIds": [
                "1",
                "100000047",
                "575000501",
                "100000174",
              ],
              "id": "775000998",
              "name": "Oakville - Split #4",
            },
          ],
        },
        {
          "id": "6522",
          "name": "District 5",
          "splits": [
            {
              "districtIds": [
                "1",
                "100000047",
                "100000174",
                "575000505",
              ],
              "id": "22713",
              "name": "District 5 - Split #1",
            },
            {
              "districtIds": [
                "1",
                "100000047",
                "100000174",
                "575000505",
              ],
              "id": "775000004",
              "name": "District 5 - Split #2",
            },
            {
              "districtIds": [
                "1",
                "100000047",
                "100000174",
                "575000505",
              ],
              "id": "775000993",
              "name": "District 5 - Split #3",
            },
            {
              "districtIds": [
                "1",
                "100000047",
                "575000505",
                "100000174",
              ],
              "id": "775000994",
              "name": "District 5 - Split #4",
            },
            {
              "districtIds": [
                "1",
                "100000174",
                "100000047",
                "575000505",
              ],
              "id": "775000995",
              "name": "District 5 - Split #5",
            },
            {
              "districtIds": [
                "1",
                "100000047",
                "575000505",
                "100000174",
              ],
              "id": "775000996",
              "name": "District 5 - Split #6",
            },
            {
              "districtIds": [
                "100000174",
                "100000047",
                "1",
                "575000505",
              ],
              "id": "775001002",
              "name": "District 5 - Split #7",
            },
            {
              "districtIds": [
                "100000174",
                "100000047",
                "1",
                "575000505",
              ],
              "id": "775001003",
              "name": "District 5 - Split #8",
            },
            {
              "districtIds": [
                "1",
                "100000047",
                "100000174",
                "575000505",
              ],
              "id": "775001004",
              "name": "District 5 - Split #9",
            },
            {
              "districtIds": [
                "1",
                "100000047",
                "100000174",
                "575000505",
              ],
              "id": "775001005",
              "name": "District 5 - Split #10",
            },
          ],
        },
        {
          "id": "6525",
          "name": "East Willow",
          "splits": [
            {
              "districtIds": [
                "1",
                "100000047",
                "575000083",
                "100000174",
              ],
              "id": "22686",
              "name": "East Willow - Split #1",
            },
            {
              "districtIds": [
                "1",
                "100000174",
                "100000047",
                "575000083",
              ],
              "id": "22687",
              "name": "East Willow - Split #2",
            },
            {
              "districtIds": [
                "100000047",
                "1",
                "100000174",
                "575000083",
              ],
              "id": "775001116",
              "name": "East Willow - Split #3",
            },
            {
              "districtIds": [
                "100000047",
                "1",
                "100000174",
                "575000083",
              ],
              "id": "775001117",
              "name": "East Willow - Split #4",
            },
          ],
        },
        {
          "id": "6526",
          "name": "Maple Grove",
          "splits": [
            {
              "districtIds": [
                "1",
                "100000047",
                "575000503",
                "575000082",
                "100000174",
              ],
              "id": "22689",
              "name": "Maple Grove - Split #1",
            },
            {
              "districtIds": [
                "1",
                "100000047",
                "100000174",
                "575000082",
                "575000503",
              ],
              "id": "575000859",
              "name": "Maple Grove - Split #2",
            },
          ],
        },
        {
          "districtIds": [
            "100000047",
            "1",
            "100000174",
          ],
          "id": "6528",
          "name": "Valley",
        },
        {
          "districtIds": [
            "100000174",
            "100000047",
            "1",
            "575000082",
            "575000503",
          ],
          "id": "6529",
          "name": "Fairview",
        },
        {
          "districtIds": [
            "100000047",
            "1",
            "100000174",
            "575000083",
          ],
          "id": "6532",
          "name": "Northside",
        },
        {
          "districtIds": [
            "1",
            "100000047",
            "100000174",
          ],
          "id": "6534",
          "name": "Sunset",
        },
        {
          "id": "6536",
          "name": "Elmwood",
          "splits": [
            {
              "districtIds": [
                "1",
                "100000174",
                "100000047",
              ],
              "id": "22719",
              "name": "Elmwood - Split #1",
            },
            {
              "districtIds": [
                "1",
                "100000174",
                "100000047",
              ],
              "id": "775002424",
              "name": "Elmwood - Split #2",
            },
          ],
        },
        {
          "id": "6537",
          "name": "Southwest Springfield",
          "splits": [
            {
              "districtIds": [
                "100000047",
                "1",
                "100000174",
                "575000083",
              ],
              "id": "22724",
              "name": "Southwest Springfield - Split #1",
            },
            {
              "districtIds": [
                "1",
                "100000047",
                "100000174",
                "575000083",
              ],
              "id": "775000999",
              "name": "Southwest Springfield - Split #2",
            },
            {
              "districtIds": [
                "1",
                "100000047",
                "100000174",
                "575000083",
              ],
              "id": "775001000",
              "name": "Southwest Springfield - Split #3",
            },
            {
              "districtIds": [
                "1",
                "575000083",
                "100000174",
                "100000047",
              ],
              "id": "775002728",
              "name": "Southwest Springfield - Split #4",
            },
          ],
        },
        {
          "id": "6539",
          "name": "West Willow",
          "splits": [
            {
              "districtIds": [
                "1",
                "100000047",
                "575000082",
                "100000174",
                "575000503",
              ],
              "id": "22728",
              "name": "West Willow - Split #1",
            },
            {
              "districtIds": [
                "1",
                "100000047",
                "100000174",
                "575000082",
                "575000503",
              ],
              "id": "775001118",
              "name": "West Willow - Split #2",
            },
          ],
        },
      ],
      "seal": "TODO",
      "state": "State of Mississippi",
      "title": "General Election",
      "type": "general",
    }
  `);
  const store = testStore.getStore();
  const org: Org = {
    id: 'test-org-id',
    name: 'Test Org',
  };
  await store.syncOrganizationsCache([org]);
  await store.createElection(org.id, election, 'VxDefaultBallot');
});
