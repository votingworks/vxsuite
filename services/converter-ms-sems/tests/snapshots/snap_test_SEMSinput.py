# -*- coding: utf-8 -*-
# snapshottest: v1 - https://goo.gl/zC4yUc
from __future__ import unicode_literals

from snapshottest import Snapshot


snapshots = Snapshot()

snapshots['test_general_conversion 1'] = '''{
  "title": "2019 General",
  "state": "State of Mississippi",
  "county": {
    "id": "10",
    "name": "Choctaw County"
  },
  "date": "2019-11-05T00:00:00-10:00",
  "parties": [
    {
      "id": "2",
      "name": "Democrat",
      "fullName": "Democratic Party",
      "abbrev": "D"
    },
    {
      "id": "3",
      "name": "Republican",
      "fullName": "Republican Party",
      "abbrev": "R"
    },
    {
      "id": "4",
      "name": "Libertarian",
      "fullName": "Libertarian Party",
      "abbrev": "L"
    },
    {
      "id": "5",
      "name": "Reform",
      "fullName": "Reform Party",
      "abbrev": "REF"
    },
    {
      "id": "6",
      "name": "Natural Law",
      "fullName": "Natural Law Party",
      "abbrev": "N"
    },
    {
      "id": "8",
      "name": "Constitution",
      "fullName": "Constitution Party",
      "abbrev": "C"
    },
    {
      "id": "9",
      "name": "Green",
      "fullName": "Green Party",
      "abbrev": "G"
    },
    {
      "id": "10",
      "name": "America First",
      "fullName": "America First Party",
      "abbrev": "A"
    },
    {
      "id": "11",
      "name": "Independent",
      "fullName": "Independent Party",
      "abbrev": "I"
    },
    {
      "id": "12",
      "name": "Nonpartisan",
      "fullName": "Nonpartisan",
      "abbrev": "NP"
    },
    {
      "id": "575000001",
      "name": "Justice",
      "fullName": "Justice Party",
      "abbrev": "JUS"
    },
    {
      "id": "575000002",
      "name": "Prohibition",
      "fullName": "Prohibition Party",
      "abbrev": "PRO"
    },
    {
      "id": "575000003",
      "name": "American Delta",
      "fullName": "American Delta Party",
      "abbrev": "ADP"
    },
    {
      "id": "575000004",
      "name": "Veterans",
      "fullName": "Veterans Party",
      "abbrev": "VET"
    }
  ],
  "contests": [
    {
      "id": "575021152",
      "districtId": "100000275",
      "type": "candidate",
      "title": "Governor",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "575032130",
          "name": "Jim Hood",
          "partyIds": [
            "2"
          ]
        },
        {
          "id": "575032129",
          "name": "Tate Reeves",
          "partyIds": [
            "3"
          ]
        },
        {
          "id": "575030384",
          "name": "Bob Hickingbottom",
          "partyIds": [
            "8"
          ]
        },
        {
          "id": "575030430",
          "name": "David R. Singletary",
          "partyIds": [
            "11"
          ]
        }
      ]
    },
    {
      "id": "575020972",
      "districtId": "100000275",
      "type": "candidate",
      "title": "Lieutenant Governor",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "575031914",
          "name": "Delbert Hosemann",
          "partyIds": [
            "3"
          ]
        },
        {
          "id": "575031915",
          "name": "Jay Hughes",
          "partyIds": [
            "2"
          ]
        }
      ]
    },
    {
      "id": "575020973",
      "districtId": "100000275",
      "type": "candidate",
      "title": "Secretary Of State",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "575031916",
          "name": "Johnny DuPree",
          "partyIds": [
            "2"
          ]
        },
        {
          "id": "575031917",
          "name": "Michael Watson",
          "partyIds": [
            "3"
          ]
        }
      ]
    },
    {
      "id": "575021151",
      "districtId": "100000275",
      "type": "candidate",
      "title": "Attorney General",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "575032128",
          "name": "Jennifer Riley Collins",
          "partyIds": [
            "2"
          ]
        },
        {
          "id": "575032127",
          "name": "Lynn Fitch",
          "partyIds": [
            "3"
          ]
        }
      ]
    },
    {
      "id": "575020974",
      "districtId": "100000275",
      "type": "candidate",
      "title": "State Auditor",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "575031918",
          "name": "Shad White",
          "partyIds": [
            "3"
          ]
        }
      ]
    },
    {
      "id": "575020975",
      "districtId": "100000275",
      "type": "candidate",
      "title": "State Treasurer",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "575031919",
          "name": "Addie Lee Green",
          "partyIds": [
            "2"
          ]
        },
        {
          "id": "575031920",
          "name": "David McRae",
          "partyIds": [
            "3"
          ]
        }
      ]
    },
    {
      "id": "575020970",
      "districtId": "100000275",
      "type": "candidate",
      "title": "Commissioner Of Agriculture & Commerce",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "575031911",
          "name": "Rickey L. Cole",
          "partyIds": [
            "2"
          ]
        },
        {
          "id": "575031910",
          "name": "Andy Gipson",
          "partyIds": [
            "3"
          ]
        }
      ]
    },
    {
      "id": "575020971",
      "districtId": "100000275",
      "type": "candidate",
      "title": "Commissioner Of Insurance",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "575031913",
          "name": "Robert E. Amos",
          "partyIds": [
            "2"
          ]
        },
        {
          "id": "575031912",
          "name": "Mike Chaney",
          "partyIds": [
            "3"
          ]
        }
      ]
    },
    {
      "id": "575021144",
      "districtId": "575001705",
      "type": "candidate",
      "title": "Northern District",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "575032121",
          "name": "Brandon Presley",
          "partyIds": [
            "2"
          ]
        }
      ]
    },
    {
      "id": "575021153",
      "districtId": "575001697",
      "type": "candidate",
      "title": "Northern District",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "575032131",
          "name": "John Caldwell",
          "partyIds": [
            "3"
          ]
        },
        {
          "id": "575032132",
          "name": "Joe T. \'Joey\' Grist",
          "partyIds": [
            "2"
          ]
        }
      ]
    },
    {
      "id": "575020980",
      "districtId": "100000362",
      "type": "candidate",
      "title": "District 05",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "575031925",
          "name": "Doug Evans",
          "partyIds": [
            "2"
          ]
        }
      ]
    },
    {
      "id": "575021007",
      "districtId": "100000234",
      "type": "candidate",
      "title": "District 15",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "575031962",
          "name": "Gary Jackson",
          "partyIds": [
            "3"
          ]
        }
      ]
    },
    {
      "id": "575021090",
      "districtId": "100000085",
      "type": "candidate",
      "title": "District 35",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "575032061",
          "name": "Joey Hood",
          "partyIds": [
            "3"
          ]
        }
      ]
    },
    {
      "id": "575021524",
      "districtId": "100000285",
      "type": "candidate",
      "title": "Chancery Clerk",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "575032577",
          "name": "Kenny King",
          "partyIds": [
            "3"
          ]
        },
        {
          "id": "575032576",
          "name": "Steve Montgomery",
          "partyIds": [
            "2"
          ]
        }
      ]
    },
    {
      "id": "575021525",
      "districtId": "100000285",
      "type": "candidate",
      "title": "Circuit Clerk",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "575032578",
          "name": "Amy Burdine",
          "partyIds": [
            "3"
          ]
        }
      ]
    },
    {
      "id": "575021526",
      "districtId": "100000285",
      "type": "candidate",
      "title": "Coroner",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "575032579",
          "name": "Keith Coleman",
          "partyIds": [
            "2"
          ]
        }
      ]
    },
    {
      "id": "575021527",
      "districtId": "100000285",
      "type": "candidate",
      "title": "Sheriff",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "575032580",
          "name": "Brandon Busby",
          "partyIds": [
            "2"
          ]
        },
        {
          "id": "575032581",
          "name": "Kevin Connell",
          "partyIds": [
            "3"
          ]
        }
      ]
    },
    {
      "id": "575021528",
      "districtId": "100000285",
      "type": "candidate",
      "title": "Tax Assessor Collector",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "575032582",
          "name": "Lori Power Kerr",
          "partyIds": [
            "2"
          ]
        }
      ]
    },
    {
      "id": "575021533",
      "districtId": "575000496",
      "type": "candidate",
      "title": "Supervisor 01",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "575032588",
          "name": "Warren Miles",
          "partyIds": [
            "3"
          ]
        },
        {
          "id": "575032589",
          "name": "Joey Stephenson",
          "partyIds": [
            "2"
          ]
        }
      ]
    },
    {
      "id": "575021534",
      "districtId": "575000497",
      "type": "candidate",
      "title": "Supervisor 02",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "575032591",
          "name": "Henry L. Brown",
          "partyIds": [
            "2"
          ]
        },
        {
          "id": "575032590",
          "name": "Greg Fondren",
          "partyIds": [
            "3"
          ]
        }
      ]
    },
    {
      "id": "575021535",
      "districtId": "575000498",
      "type": "candidate",
      "title": "Supervisor 03",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "575032593",
          "name": "Chris McIntire",
          "partyIds": [
            "3"
          ]
        },
        {
          "id": "575032592",
          "name": "Mitch Weeks",
          "partyIds": [
            "2"
          ]
        }
      ]
    },
    {
      "id": "575021536",
      "districtId": "575000499",
      "type": "candidate",
      "title": "Supervisor 04",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "575032595",
          "name": "Bobby Burton",
          "partyIds": [
            "3"
          ]
        },
        {
          "id": "575032594",
          "name": "John Avery Shumaker",
          "partyIds": [
            "2"
          ]
        }
      ]
    },
    {
      "id": "575021537",
      "districtId": "575000500",
      "type": "candidate",
      "title": "Supervisor 05",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "575032597",
          "name": "Mark Bruce",
          "partyIds": [
            "3"
          ]
        },
        {
          "id": "575032596",
          "name": "William D. \'Bill\' Peden",
          "partyIds": [
            "2"
          ]
        }
      ]
    },
    {
      "id": "575021531",
      "districtId": "575000506",
      "type": "candidate",
      "title": "Justice Court Judge Post 1",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "575032585",
          "name": "Phillip Smith",
          "partyIds": [
            "3"
          ]
        },
        {
          "id": "575032586",
          "name": "William A. \'Andy\' Stephenson",
          "partyIds": [
            "2"
          ]
        }
      ]
    },
    {
      "id": "575021532",
      "districtId": "575000507",
      "type": "candidate",
      "title": "Justice Court Judge Post 2",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "575032587",
          "name": "Teresa Weeks",
          "partyIds": [
            "2"
          ]
        }
      ]
    },
    {
      "id": "575021529",
      "districtId": "575000508",
      "type": "candidate",
      "title": "Constable Post 01",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "575032583",
          "name": "Thomas Harold Raybourn",
          "partyIds": [
            "3"
          ]
        }
      ]
    },
    {
      "id": "575021530",
      "districtId": "575000509",
      "type": "candidate",
      "title": "Constable Post 02",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "575032584",
          "name": "Roy Dun Carter",
          "partyIds": [
            "2"
          ]
        }
      ]
    }
  ],
  "districts": [
    {
      "id": "100000275",
      "name": "State Of Mississippi"
    },
    {
      "id": "575001705",
      "name": "Public Service Commissioner"
    },
    {
      "id": "575001697",
      "name": "Transportation Commissioner"
    },
    {
      "id": "100000362",
      "name": "District Attorney 05"
    },
    {
      "id": "100000234",
      "name": "State Senate 15"
    },
    {
      "id": "100000085",
      "name": "State House Of Rep 35"
    },
    {
      "id": "100000285",
      "name": "Choctaw"
    },
    {
      "id": "575000496",
      "name": "Supervisor 01"
    },
    {
      "id": "575000497",
      "name": "Supervisor 02"
    },
    {
      "id": "575000498",
      "name": "Supervisor 03"
    },
    {
      "id": "575000499",
      "name": "Supervisor 04"
    },
    {
      "id": "575000500",
      "name": "Supervisor 05"
    },
    {
      "id": "575000506",
      "name": "Justice Court Judge Post 1"
    },
    {
      "id": "575000507",
      "name": "Justice Court Judge Post 2"
    },
    {
      "id": "575000508",
      "name": "Constable Post 01"
    },
    {
      "id": "575000509",
      "name": "Constable Post 02"
    }
  ],
  "precincts": [
    {
      "id": "6522",
      "name": "District 5"
    },
    {
      "id": "6524",
      "name": "Chester"
    },
    {
      "id": "6525",
      "name": "East Weir"
    },
    {
      "id": "6526",
      "name": "French Camp"
    },
    {
      "id": "6527",
      "name": "Fentress"
    },
    {
      "id": "6528",
      "name": "Hebron"
    },
    {
      "id": "6529",
      "name": "Kenego"
    },
    {
      "id": "6532",
      "name": "Panhandle"
    },
    {
      "id": "6534",
      "name": "Reform"
    },
    {
      "id": "6536",
      "name": "Sherwood"
    },
    {
      "id": "6537",
      "name": "Southwest Ackerman"
    },
    {
      "id": "6538",
      "name": "Bywy"
    },
    {
      "id": "6539",
      "name": "West Weir"
    }
  ],
  "ballotStyles": [
    {
      "id": "7",
      "precincts": [
        "6538"
      ],
      "districts": [
        "100000085",
        "100000234",
        "100000275",
        "100000285",
        "100000362",
        "575000496",
        "575000507",
        "575000508",
        "575001697",
        "575001705"
      ]
    },
    {
      "id": "8",
      "precincts": [
        "6538",
        "6524",
        "6527"
      ],
      "districts": [
        "100000085",
        "100000234",
        "100000275",
        "100000285",
        "100000362",
        "575000496",
        "575000506",
        "575000508",
        "575001697",
        "575001705"
      ]
    },
    {
      "id": "1",
      "precincts": [
        "6522"
      ],
      "districts": [
        "100000085",
        "100000234",
        "100000275",
        "100000285",
        "100000362",
        "575000500",
        "575000507",
        "575000509",
        "575001697",
        "575001705"
      ]
    },
    {
      "id": "2",
      "precincts": [
        "6522"
      ],
      "districts": [
        "100000085",
        "100000234",
        "100000275",
        "100000285",
        "100000362",
        "575000500",
        "575000506",
        "575000508",
        "575001697",
        "575001705"
      ]
    },
    {
      "id": "3",
      "precincts": [
        "6525",
        "6532",
        "6537"
      ],
      "districts": [
        "100000085",
        "100000234",
        "100000275",
        "100000285",
        "100000362",
        "575000499",
        "575000507",
        "575000509",
        "575001697",
        "575001705"
      ]
    },
    {
      "id": "4",
      "precincts": [
        "6526",
        "6529",
        "6539"
      ],
      "districts": [
        "100000085",
        "100000234",
        "100000275",
        "100000285",
        "100000362",
        "575000498",
        "575000507",
        "575000509",
        "575001697",
        "575001705"
      ]
    },
    {
      "id": "6",
      "precincts": [
        "6527"
      ],
      "districts": [
        "100000085",
        "100000234",
        "100000275",
        "100000285",
        "100000362",
        "575000496",
        "575000507",
        "575000509",
        "575001697",
        "575001705"
      ]
    },
    {
      "id": "5",
      "precincts": [
        "6528",
        "6534",
        "6536"
      ],
      "districts": [
        "100000085",
        "100000234",
        "100000275",
        "100000285",
        "100000362",
        "575000497",
        "575000506",
        "575000508",
        "575001697",
        "575001705"
      ]
    }
  ],
  "sealUrl": "/seals/Seal_of_Mississippi_BW.svg",
  "ballotStrings": {
    "officialInitials": "Initialing Manager"
  },
  "centralScanAdjudicationReasons": [
    "UninterpretableBallot",
    "Overvote",
    "BlankBallot"
  ],
  "precinctScanAdjudicationReasons": [
    "UninterpretableBallot",
    "Overvote",
    "Undervote",
    "BlankBallot"
  ],
  "markThresholds": {
    "definite": 0.12,
    "marginal": 0.12
  }
}'''

snapshots['test_general_conversion 2'] = '''{
  "title": "2020 Primary Election",
  "state": "State of Mississippi",
  "county": {
    "id": "10",
    "name": "Choctaw County"
  },
  "date": "2020-03-10T00:00:00-10:00",
  "parties": [
    {
      "id": "2",
      "name": "Democrat",
      "fullName": "Democratic Party",
      "abbrev": "D"
    },
    {
      "id": "3",
      "name": "Republican",
      "fullName": "Republican Party",
      "abbrev": "R"
    },
    {
      "id": "4",
      "name": "Libertarian",
      "fullName": "Libertarian Party",
      "abbrev": "L"
    },
    {
      "id": "5",
      "name": "Reform",
      "fullName": "Reform Party",
      "abbrev": "REF"
    },
    {
      "id": "6",
      "name": "Natural Law",
      "fullName": "Natural Law Party",
      "abbrev": "N"
    },
    {
      "id": "8",
      "name": "Constitution",
      "fullName": "Constitution Party",
      "abbrev": "C"
    },
    {
      "id": "9",
      "name": "Green",
      "fullName": "Green Party",
      "abbrev": "G"
    },
    {
      "id": "10",
      "name": "America First",
      "fullName": "America First Party",
      "abbrev": "A"
    },
    {
      "id": "11",
      "name": "Independent",
      "fullName": "Independent Party",
      "abbrev": "I"
    },
    {
      "id": "12",
      "name": "Nonpartisan",
      "fullName": "Nonpartisan",
      "abbrev": "NP"
    },
    {
      "id": "575000001",
      "name": "Justice",
      "fullName": "Justice Party",
      "abbrev": "JUS"
    },
    {
      "id": "575000002",
      "name": "Prohibition",
      "fullName": "Prohibition Party",
      "abbrev": "PRO"
    },
    {
      "id": "575000003",
      "name": "American Delta",
      "fullName": "American Delta Party",
      "abbrev": "ADP"
    },
    {
      "id": "575000004",
      "name": "Veterans",
      "fullName": "Veterans Party",
      "abbrev": "VET"
    }
  ],
  "contests": [
    {
      "id": "775020738",
      "districtId": "1",
      "type": "candidate",
      "partyId": "2",
      "title": "President",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "775031649",
          "name": "Joseph R. Biden",
          "partyIds": [
            "2"
          ]
        },
        {
          "id": "775031654",
          "name": "Michael R. Bloomberg",
          "partyIds": [
            "2"
          ]
        },
        {
          "id": "775031651",
          "name": "Pete Buttigieg",
          "partyIds": [
            "2"
          ]
        },
        {
          "id": "775031652",
          "name": "Tulsi Gabbard",
          "partyIds": [
            "2"
          ]
        },
        {
          "id": "775031646",
          "name": "Amy Klobuchar",
          "partyIds": [
            "2"
          ]
        },
        {
          "id": "775031653",
          "name": "Deval Patrick",
          "partyIds": [
            "2"
          ]
        },
        {
          "id": "775031650",
          "name": "Bernie Sanders",
          "partyIds": [
            "2"
          ]
        },
        {
          "id": "775031647",
          "name": "Tom Steyer",
          "partyIds": [
            "2"
          ]
        },
        {
          "id": "775031648",
          "name": "Elizabeth Warren",
          "partyIds": [
            "2"
          ]
        },
        {
          "id": "775031655",
          "name": "Andrew Yang",
          "partyIds": [
            "2"
          ]
        }
      ]
    },
    {
      "id": "775020740",
      "districtId": "1",
      "type": "candidate",
      "partyId": "2",
      "title": "Senate ",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "775031631",
          "name": "Tobey Bernard Bartee",
          "partyIds": [
            "2"
          ]
        },
        {
          "id": "775031632",
          "name": "Jensen Bohren",
          "partyIds": [
            "2"
          ]
        },
        {
          "id": "775031633",
          "name": "Mike Espy",
          "partyIds": [
            "2"
          ]
        }
      ]
    },
    {
      "id": "775020730",
      "districtId": "100000047",
      "type": "candidate",
      "partyId": "2",
      "title": "1st Congressional District",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "775031635",
          "name": "Antonia Eliason",
          "partyIds": [
            "2"
          ]
        }
      ]
    },
    {
      "id": "775020739",
      "districtId": "1",
      "type": "candidate",
      "partyId": "3",
      "title": "President",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "775031657",
          "name": "Roque \'Rocky\' De La Fuente",
          "partyIds": [
            "3"
          ]
        },
        {
          "id": "775031656",
          "name": "Donald J. Trump",
          "partyIds": [
            "3"
          ]
        },
        {
          "id": "775031658",
          "name": "Bill Weld",
          "partyIds": [
            "3"
          ]
        }
      ]
    },
    {
      "id": "775020741",
      "districtId": "1",
      "type": "candidate",
      "partyId": "3",
      "title": "Senate ",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "775031639",
          "name": "Cindy Hyde-Smith",
          "partyIds": [
            "3"
          ]
        }
      ]
    },
    {
      "id": "775020731",
      "districtId": "100000047",
      "type": "candidate",
      "partyId": "3",
      "title": "1st Congressional District",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "775031626",
          "name": "Trent Kelly",
          "partyIds": [
            "3"
          ]
        }
      ]
    }
  ],
  "districts": [
    {
      "id": "1",
      "name": "United States"
    },
    {
      "id": "100000047",
      "name": "US House Of Representatives"
    }
  ],
  "precincts": [
    {
      "id": "6522",
      "name": "District 5"
    },
    {
      "id": "6524",
      "name": "Chester"
    },
    {
      "id": "6525",
      "name": "East Weir"
    },
    {
      "id": "6526",
      "name": "French Camp"
    },
    {
      "id": "6527",
      "name": "Fentress"
    },
    {
      "id": "6528",
      "name": "Hebron"
    },
    {
      "id": "6529",
      "name": "Kenego"
    },
    {
      "id": "6532",
      "name": "Panhandle"
    },
    {
      "id": "6534",
      "name": "Reform"
    },
    {
      "id": "6536",
      "name": "Sherwood"
    },
    {
      "id": "6537",
      "name": "Southwest Ackerman"
    },
    {
      "id": "6538",
      "name": "Bywy"
    },
    {
      "id": "6539",
      "name": "West Weir"
    }
  ],
  "ballotStyles": [
    {
      "id": "1D",
      "partyId": "2",
      "precincts": [
        "6538",
        "6524",
        "6522",
        "6525",
        "6526",
        "6527",
        "6528",
        "6529",
        "6532",
        "6534",
        "6536",
        "6537",
        "6539"
      ],
      "districts": [
        "1",
        "100000047"
      ]
    },
    {
      "id": "2R",
      "partyId": "3",
      "precincts": [
        "6538",
        "6524",
        "6522",
        "6525",
        "6526",
        "6527",
        "6528",
        "6529",
        "6532",
        "6534",
        "6536",
        "6537",
        "6539"
      ],
      "districts": [
        "1",
        "100000047"
      ]
    }
  ],
  "sealUrl": "/seals/Seal_of_Mississippi_BW.svg",
  "ballotStrings": {
    "officialInitials": "Initialing Manager"
  },
  "centralScanAdjudicationReasons": [
    "UninterpretableBallot",
    "Overvote",
    "BlankBallot"
  ],
  "precinctScanAdjudicationReasons": [
    "UninterpretableBallot",
    "Overvote",
    "Undervote",
    "BlankBallot"
  ],
  "markThresholds": {
    "definite": 0.12,
    "marginal": 0.12
  }
}'''

snapshots['test_general_conversion 3'] = '''{
  "title": "September 22, 2020 Special Election for Senate 15",
  "state": "State of Mississippi",
  "county": {
    "id": "10",
    "name": "Choctaw County"
  },
  "date": "2020-09-22T00:00:00-10:00",
  "parties": [
    {
      "id": "2",
      "name": "Democrat",
      "fullName": "Democratic Party",
      "abbrev": "D"
    },
    {
      "id": "3",
      "name": "Republican",
      "fullName": "Republican Party",
      "abbrev": "R"
    },
    {
      "id": "4",
      "name": "Libertarian",
      "fullName": "Libertarian Party",
      "abbrev": "L"
    },
    {
      "id": "5",
      "name": "Reform",
      "fullName": "Reform Party",
      "abbrev": "REF"
    },
    {
      "id": "6",
      "name": "Natural Law",
      "fullName": "Natural Law Party",
      "abbrev": "N"
    },
    {
      "id": "8",
      "name": "Constitution",
      "fullName": "Constitution Party",
      "abbrev": "C"
    },
    {
      "id": "9",
      "name": "Green",
      "fullName": "Green Party",
      "abbrev": "G"
    },
    {
      "id": "10",
      "name": "America First",
      "fullName": "America First Party",
      "abbrev": "A"
    },
    {
      "id": "11",
      "name": "Independent",
      "fullName": "Independent Party",
      "abbrev": "I"
    },
    {
      "id": "12",
      "name": "Nonpartisan",
      "fullName": "Nonpartisan",
      "abbrev": "NP"
    },
    {
      "id": "575000001",
      "name": "Justice",
      "fullName": "Justice Party",
      "abbrev": "JUS"
    },
    {
      "id": "575000002",
      "name": "Prohibition",
      "fullName": "Prohibition Party",
      "abbrev": "PRO"
    },
    {
      "id": "575000003",
      "name": "American Delta",
      "fullName": "American Delta Party",
      "abbrev": "ADP"
    },
    {
      "id": "575000004",
      "name": "Veterans",
      "fullName": "Veterans Party",
      "abbrev": "VET"
    }
  ],
  "contests": [
    {
      "id": "775020858",
      "districtId": "100000234",
      "type": "candidate",
      "title": "District 15",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "775031909",
          "name": "Bricklee Miller"
        },
        {
          "id": "775031910",
          "name": "Levon Murphy Jr."
        },
        {
          "id": "775031911",
          "name": "Bart Williams"
        },
        {
          "id": "775031912",
          "name": "Joyce Meek Yates"
        }
      ]
    }
  ],
  "districts": [
    {
      "id": "100000234",
      "name": "State Senate 15"
    }
  ],
  "precincts": [
    {
      "id": "6522",
      "name": "District 5"
    },
    {
      "id": "6524",
      "name": "Chester"
    },
    {
      "id": "6525",
      "name": "East Weir"
    },
    {
      "id": "6526",
      "name": "French Camp"
    },
    {
      "id": "6527",
      "name": "Fentress"
    },
    {
      "id": "6528",
      "name": "Hebron"
    },
    {
      "id": "6529",
      "name": "Kenego"
    },
    {
      "id": "6532",
      "name": "Panhandle"
    },
    {
      "id": "6534",
      "name": "Reform"
    },
    {
      "id": "6536",
      "name": "Sherwood"
    },
    {
      "id": "6537",
      "name": "Southwest Ackerman"
    },
    {
      "id": "6538",
      "name": "Bywy"
    },
    {
      "id": "6539",
      "name": "West Weir"
    }
  ],
  "ballotStyles": [
    {
      "id": "1",
      "precincts": [
        "6538",
        "6524",
        "6522",
        "6525",
        "6526",
        "6527",
        "6528",
        "6529",
        "6532",
        "6534",
        "6536",
        "6537",
        "6539"
      ],
      "districts": [
        "100000234"
      ]
    }
  ],
  "sealUrl": "/seals/Seal_of_Mississippi_BW.svg",
  "ballotStrings": {
    "officialInitials": "Initialing Manager"
  },
  "centralScanAdjudicationReasons": [
    "UninterpretableBallot",
    "Overvote",
    "BlankBallot"
  ],
  "precinctScanAdjudicationReasons": [
    "UninterpretableBallot",
    "Overvote",
    "Undervote",
    "BlankBallot"
  ],
  "markThresholds": {
    "definite": 0.12,
    "marginal": 0.12
  }
}'''

snapshots['test_general_conversion 4'] = '''{
  "title": "Mock General Election Choctaw 2020",
  "state": "State of Mississippi",
  "county": {
    "id": "10",
    "name": "Choctaw County"
  },
  "date": "2020-08-26T00:00:00-10:00",
  "parties": [
    {
      "id": "2",
      "name": "Democrat",
      "fullName": "Democratic Party",
      "abbrev": "D"
    },
    {
      "id": "3",
      "name": "Republican",
      "fullName": "Republican Party",
      "abbrev": "R"
    },
    {
      "id": "4",
      "name": "Libertarian",
      "fullName": "Libertarian Party",
      "abbrev": "L"
    },
    {
      "id": "5",
      "name": "Reform",
      "fullName": "Reform Party",
      "abbrev": "REF"
    },
    {
      "id": "6",
      "name": "Natural Law",
      "fullName": "Natural Law Party",
      "abbrev": "N"
    },
    {
      "id": "8",
      "name": "Constitution",
      "fullName": "Constitution Party",
      "abbrev": "C"
    },
    {
      "id": "9",
      "name": "Green",
      "fullName": "Green Party",
      "abbrev": "G"
    },
    {
      "id": "10",
      "name": "America First",
      "fullName": "America First Party",
      "abbrev": "A"
    },
    {
      "id": "11",
      "name": "Independent",
      "fullName": "Independent Party",
      "abbrev": "I"
    },
    {
      "id": "12",
      "name": "Nonpartisan",
      "fullName": "Nonpartisan",
      "abbrev": "NP"
    },
    {
      "id": "575000001",
      "name": "Justice",
      "fullName": "Justice Party",
      "abbrev": "JUS"
    },
    {
      "id": "575000002",
      "name": "Prohibition",
      "fullName": "Prohibition Party",
      "abbrev": "PRO"
    },
    {
      "id": "575000003",
      "name": "American Delta",
      "fullName": "American Delta Party",
      "abbrev": "ADP"
    },
    {
      "id": "575000004",
      "name": "Veterans",
      "fullName": "Veterans Party",
      "abbrev": "VET"
    }
  ],
  "contests": [
    {
      "id": "775020876",
      "districtId": "1",
      "type": "candidate",
      "title": "President",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "775031988",
          "name": "Presidential Electors for Joe Biden for President and Kamala Harris for Vice President",
          "partyIds": [
            "2"
          ]
        },
        {
          "id": "775031987",
          "name": "Presidential Electors for Donald J. Trump for President and Michael R. Pence for Vice President",
          "partyIds": [
            "3"
          ]
        },
        {
          "id": "775031989",
          "name": "Presidential Electors for Phil Collins for President and Bill Parker for Vice President",
          "partyIds": [
            "11"
          ]
        }
      ]
    },
    {
      "id": "775020877",
      "districtId": "1",
      "type": "candidate",
      "title": "Senate ",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "775031985",
          "name": "Mike Espy",
          "partyIds": [
            "2"
          ]
        },
        {
          "id": "775031986",
          "name": "Cindy Hyde-Smith",
          "partyIds": [
            "3"
          ]
        },
        {
          "id": "775031990",
          "name": "Jimmy Edwards",
          "partyIds": [
            "4"
          ]
        }
      ]
    },
    {
      "id": "775020872",
      "districtId": "100000047",
      "type": "candidate",
      "title": "1st Congressional District",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "775031978",
          "name": "Antonia Eliason",
          "partyIds": [
            "2"
          ]
        },
        {
          "id": "775031979",
          "name": "Trent Kelly",
          "partyIds": [
            "3"
          ]
        }
      ]
    },
    {
      "id": "775020870",
      "districtId": "100000174",
      "type": "candidate",
      "title": "Supreme Court District 3(Northern) Position 3",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "775031976",
          "name": "Josiah Dennis Coleman",
          "partyIds": [
            "12"
          ]
        },
        {
          "id": "775031993",
          "name": "Percy L. Lynchard",
          "partyIds": [
            "12"
          ]
        }
      ]
    },
    {
      "id": "775020899",
      "districtId": "575000501",
      "type": "candidate",
      "title": "Election Commissioner  01",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "775032015",
          "name": "Glynda Chaney Fulce"
        }
      ]
    },
    {
      "id": "775020900",
      "districtId": "575000502",
      "type": "candidate",
      "title": "Election Commissioner 02",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "775032016",
          "name": "Charles Beck"
        },
        {
          "id": "775032017",
          "name": "Sharon Brooks"
        }
      ]
    },
    {
      "id": "775020901",
      "districtId": "575000503",
      "type": "candidate",
      "title": "Election Commissioner 03",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "775032018",
          "name": "Dorothy Anderson"
        }
      ]
    },
    {
      "id": "775020902",
      "districtId": "575000504",
      "type": "candidate",
      "title": "Election Commissioner 04",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "775032019",
          "name": "Willie Mae Guillory"
        },
        {
          "id": "775032020",
          "name": "Lewis Wright"
        }
      ]
    },
    {
      "id": "775020903",
      "districtId": "575000505",
      "type": "candidate",
      "title": "Election Commissioner 05",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "775032021",
          "name": "Ouida A Loper",
          "partyIds": [
            "11"
          ]
        },
        {
          "id": "775032022",
          "name": "Wayne McLeod"
        }
      ]
    },
    {
      "id": "775020904",
      "districtId": "575000084",
      "type": "candidate",
      "title": "School Board 05",
      "seats": 1,
      "allowWriteIns": true,
      "candidates": [
        {
          "id": "775032023",
          "name": "Michael D Thomas"
        }
      ]
    },
    {
      "id": "750000015-750000016-either-neither",
      "districtId": "100000275",
      "type": "ms-either-neither",
      "title": "Ballot Measure 1",
      "eitherNeitherContestId": "750000015",
      "pickOneContestId": "750000016",
      "description": "<b>Initiated by Petition and Alternative by Legislature</b>\\n\\nInitiative Measure No. 65, Should Mississippi allow qualified patients with debilitating medical conditions, as certified by Mississippi licensed physicians, to use medical marijuana?\\n\\nLegislative Budget Office Fiscal Analysis: The anticipated expenses for year one (1) to implement a medical marijuana program is $24,068,150 (Plants \\u2013 seeds to Sale: $5,000,000; Licensing, Monitoring, Inspection: $16,220,150; and Cost to Collect Revenue: $2,848,000). The anticipated revenue is $13,000,000 (User ID Cards: $2,500,000; Commercial Licenses: $500,000 and Tax Revenue at 7 percent: $10,000,000). The overall cost for year one (1) is anticipated to be $11,068,150.\\n\\nLegislative Budget Office Fiscal Analysis: The anticipated expenses for year after the first for a medical marijuana program is $15,338,000 (Plants \\u2013 seeds to Sale: $5,000,000; Licensing, Monitoring, Inspection: $8,756,000; and Cost to Collect Revenue: $1,582,000). The anticipated revenue is $26,000,000 (User ID Cards: $5,000,000; Commercial Licenses: $1,000,000 and Tax Revenue at 7 percent: $20,000,000). The overall annual revenue is anticipated to be $10,662.000.\\n\\nAlternative Measure No. 65 A, Shall Mississippi establish a program to allow the medical use of marijuana products by qualified persons with debilitating medical conditions?\\n\\nLegislative Budget Office Fiscal Analysis: There is no determinable cost or revenue impact associated with this initiative.",
      "eitherNeitherLabel": "VOTE FOR APPROVAL OF EITHER, OR AGAINST BOTH",
      "pickOneLabel": "AND VOTE FOR ONE",
      "eitherOption": {
        "id": "750000088",
        "label": "FOR APPROVAL OF EITHER Initiative No. 65 OR Alternative Measure No. 65 A"
      },
      "neitherOption": {
        "id": "750000089",
        "label": "AGAINST BOTH Initiative Measure No. 65 AND Alternative Measure No. 65 A"
      },
      "firstOption": {
        "id": "750000090",
        "label": "FOR Initiative Measure No. 65"
      },
      "secondOption": {
        "id": "750000091",
        "label": "FOR Alternative Measure 65 A"
      }
    },
    {
      "id": "750000017",
      "districtId": "100000275",
      "type": "yesno",
      "title": "Ballot Measure 2: House Concurrent Resolution No. 47",
      "description": "This amendment provides that to be elected Governor, or to any other statewide office, a candidate must receive a majority of the votes in the general election. If no candidate receives a majority of the votes, then a runoff election shall be held as provided by general law. The requirement of receiving the most votes in a majority of Mississippi House of Representative\\u2019s districts is removed.",
      "yesOption": {
        "id": "750000094",
        "label": "YES"
      },
      "noOption": {
        "id": "750000095",
        "label": "NO"
      }
    },
    {
      "id": "750000018",
      "districtId": "100000275",
      "type": "yesno",
      "title": "Ballot Measure 3: House Bill 1796 - Flag Referendum",
      "description": "Please vote \\u2018Yes\\u2019 or \\u2018No\\u2019 on whether the following design shall be the official Mississippi State Flag",
      "yesOption": {
        "id": "750000092",
        "label": "YES"
      },
      "noOption": {
        "id": "750000093",
        "label": "NO"
      }
    }
  ],
  "districts": [
    {
      "id": "1",
      "name": "United States"
    },
    {
      "id": "100000275",
      "name": "State Of Mississippi"
    },
    {
      "id": "100000047",
      "name": "US House Of Representatives"
    },
    {
      "id": "100000174",
      "name": "Northern District"
    },
    {
      "id": "575000501",
      "name": "Election Commissioner 01"
    },
    {
      "id": "575000502",
      "name": "Election Commissioner 02"
    },
    {
      "id": "575000503",
      "name": "Election Commissioner 03"
    },
    {
      "id": "575000504",
      "name": "Election Commissioner 04"
    },
    {
      "id": "575000505",
      "name": "Election Commissioner 05"
    },
    {
      "id": "575000084",
      "name": "School Board District 5"
    }
  ],
  "precincts": [
    {
      "id": "6522",
      "name": "District 5"
    },
    {
      "id": "6524",
      "name": "Chester"
    },
    {
      "id": "6525",
      "name": "East Weir"
    },
    {
      "id": "6526",
      "name": "French Camp"
    },
    {
      "id": "6527",
      "name": "Fentress"
    },
    {
      "id": "6528",
      "name": "Hebron"
    },
    {
      "id": "6529",
      "name": "Kenego"
    },
    {
      "id": "6532",
      "name": "Panhandle"
    },
    {
      "id": "6534",
      "name": "Reform"
    },
    {
      "id": "6536",
      "name": "Sherwood"
    },
    {
      "id": "6537",
      "name": "Southwest Ackerman"
    },
    {
      "id": "6538",
      "name": "Bywy"
    },
    {
      "id": "6539",
      "name": "West Weir"
    }
  ],
  "ballotStyles": [
    {
      "id": "4",
      "precincts": [
        "6538",
        "6524",
        "6527"
      ],
      "districts": [
        "1",
        "100000047",
        "100000174",
        "100000275",
        "575000501"
      ]
    },
    {
      "id": "5",
      "precincts": [
        "6522"
      ],
      "districts": [
        "1",
        "100000047",
        "100000174",
        "100000275",
        "575000084",
        "575000505"
      ]
    },
    {
      "id": "1",
      "precincts": [
        "6525",
        "6532",
        "6537"
      ],
      "districts": [
        "1",
        "100000047",
        "100000174",
        "100000275",
        "575000504"
      ]
    },
    {
      "id": "2",
      "precincts": [
        "6526",
        "6529",
        "6539"
      ],
      "districts": [
        "1",
        "100000047",
        "100000174",
        "100000275",
        "575000503"
      ]
    },
    {
      "id": "3",
      "precincts": [
        "6528",
        "6534",
        "6536"
      ],
      "districts": [
        "1",
        "100000047",
        "100000174",
        "100000275",
        "575000502"
      ]
    }
  ],
  "sealUrl": "/seals/Seal_of_Mississippi_BW.svg",
  "ballotStrings": {
    "officialInitials": "Initialing Manager"
  },
  "centralScanAdjudicationReasons": [
    "UninterpretableBallot",
    "Overvote",
    "BlankBallot"
  ],
  "precinctScanAdjudicationReasons": [
    "UninterpretableBallot",
    "Overvote",
    "Undervote",
    "BlankBallot"
  ],
  "markThresholds": {
    "definite": 0.12,
    "marginal": 0.12
  }
}'''
