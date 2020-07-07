import { join } from 'path'
import { Interpreter } from '../../src'
import { Fixture } from '../fixtures'
import election from '../fixtures/election-4e31cb17d8-ballot-style-77-precinct-oaklawn-branch-library/election'

const skip = process.env.REGRESSION_TESTS !== '1'
const test = skip ? it.skip : it
let interpreter: Interpreter

beforeAll(async () => {
  if (skip) return

  const p1 = readFixture('batch-1-20200504_210852-ballot-0018.jpg')
  const p2 = readFixture('batch-1-20200504_210852-ballot-0017.jpg')

  interpreter = new Interpreter(election)
  await interpreter.addTemplate(await p1.imageData(), await p1.metadata())
  await interpreter.addTemplate(await p2.imageData(), await p2.metadata())
})

function readFixture(name: string): Fixture {
  return new Fixture(join(__dirname, '../fixtures/28lb-paper', name))
}

test('batch-1-20200504_210852-ballot-0001', async () => {
  const fixture = readFixture('batch-1-20200504_210852-ballot-0001.jpg')

  expect(
    (
      await interpreter.interpretBallot(
        await fixture.imageData(),
        await fixture.metadata()
      )
    ).ballot.votes
  ).toMatchInlineSnapshot(`
    Object {
      "dallas-city-council": Array [
        Object {
          "id": "harvey-eagle",
          "name": "Harvey Eagle",
          "partyId": "2",
        },
        Object {
          "id": "beverly-barker",
          "name": "Beverly Barker",
          "partyId": "3",
        },
        Object {
          "id": "hugo-smith",
          "name": "Hugo Smith",
          "partyId": "3",
        },
      ],
      "dallas-county-proposition-r": "yes",
      "dallas-county-retain-chief-justice": "no",
      "dallas-mayor": Array [
        Object {
          "id": "gregory-seldon",
          "name": "Gregory Seldon",
          "partyId": "3",
        },
      ],
    }
  `)
})

test('batch-1-20200504_210852-ballot-0002', async () => {
  const fixture = readFixture('batch-1-20200504_210852-ballot-0002.jpg')

  expect(
    (
      await interpreter.interpretBallot(
        await fixture.imageData(),
        await fixture.metadata()
      )
    ).ballot.votes
  ).toMatchInlineSnapshot(`
    Object {
      "dallas-county-commissioners-court-pct-3": Array [
        Object {
          "id": "john-wiley-price",
          "name": "John Wiley Price",
          "partyId": "2",
        },
        Object {
          "id": "s-t-russell",
          "name": "S.T. Russell",
          "partyId": "3",
        },
      ],
      "dallas-county-sheriff": Array [
        Object {
          "id": "chad-prda",
          "name": "Chad Prda",
          "partyId": "3",
        },
      ],
      "dallas-county-tax-assessor": Array [
        Object {
          "id": "john-ames",
          "name": "John Ames",
          "partyId": "2",
        },
      ],
      "texas-house-district-111": Array [
        Object {
          "id": "__write-in",
          "isWriteIn": true,
          "name": "Write-In",
        },
      ],
      "texas-sc-judge-place-6": Array [
        Object {
          "id": "jane-bland",
          "name": "Jane Bland",
          "partyId": "3",
        },
      ],
      "us-house-district-30": Array [
        Object {
          "id": "eddie-bernice-johnson",
          "name": "Eddie Bernice Johnson",
          "partyId": "2",
        },
      ],
      "us-senate": Array [
        Object {
          "id": "cedric-jefferson",
          "name": "Cedric Jefferson",
          "partyId": "5",
        },
      ],
    }
  `)
})

test('batch-1-20200504_210852-ballot-0003', async () => {
  const fixture = readFixture('batch-1-20200504_210852-ballot-0003.jpg')

  expect(
    (
      await interpreter.interpretBallot(
        await fixture.imageData(),
        await fixture.metadata()
      )
    ).ballot.votes
  ).toMatchInlineSnapshot(`
    Object {
      "dallas-city-council": Array [
        Object {
          "id": "donald-davis",
          "name": "Donald Davis",
          "partyId": "3",
        },
      ],
      "dallas-county-proposition-r": "yes",
      "dallas-county-retain-chief-justice": "no",
      "dallas-mayor": Array [
        Object {
          "id": "gregory-seldon",
          "name": "Gregory Seldon",
          "partyId": "3",
        },
      ],
    }
  `)
})

test('batch-1-20200504_210852-ballot-0004', async () => {
  const fixture = readFixture('batch-1-20200504_210852-ballot-0004.jpg')

  expect(
    (
      await interpreter.interpretBallot(
        await fixture.imageData(),
        await fixture.metadata()
      )
    ).ballot.votes
  ).toMatchInlineSnapshot(`
    Object {
      "dallas-county-commissioners-court-pct-3": Array [
        Object {
          "id": "john-wiley-price",
          "name": "John Wiley Price",
          "partyId": "2",
        },
        Object {
          "id": "s-t-russell",
          "name": "S.T. Russell",
          "partyId": "3",
        },
      ],
      "dallas-county-tax-assessor": Array [
        Object {
          "id": "john-ames",
          "name": "John Ames",
          "partyId": "2",
        },
      ],
      "texas-house-district-111": Array [
        Object {
          "id": "yvonne-davis",
          "name": "Yvonne Davis",
          "partyId": "2",
        },
      ],
      "texas-sc-judge-place-6": Array [
        Object {
          "id": "kathy-cheng",
          "name": "Kathy Cheng",
          "partyId": "2",
        },
      ],
      "us-house-district-30": Array [
        Object {
          "id": "eddie-bernice-johnson",
          "name": "Eddie Bernice Johnson",
          "partyId": "2",
        },
      ],
      "us-senate": Array [
        Object {
          "id": "ricardo-turullols-bonilla",
          "name": "Ricardo Turullols-Bonilla",
          "partyId": "6",
        },
      ],
    }
  `)
})

test('batch-1-20200504_210852-ballot-0005', async () => {
  const fixture = readFixture('batch-1-20200504_210852-ballot-0005.jpg')

  expect(
    (
      await interpreter.interpretBallot(
        await fixture.imageData(),
        await fixture.metadata()
      )
    ).ballot.votes
  ).toMatchInlineSnapshot(`
    Object {
      "dallas-city-council": Array [
        Object {
          "id": "randall-rupp",
          "name": "Randall Rupp",
          "partyId": "2",
        },
        Object {
          "id": "carroll-shry",
          "name": "Carroll Shry",
          "partyId": "2",
        },
        Object {
          "id": "beverly-barker",
          "name": "Beverly Barker",
          "partyId": "3",
        },
      ],
      "dallas-county-proposition-r": "no",
      "dallas-county-retain-chief-justice": "yes",
      "dallas-mayor": Array [
        Object {
          "id": "gregory-seldon",
          "name": "Gregory Seldon",
          "partyId": "3",
        },
      ],
    }
  `)
})

test('batch-1-20200504_210852-ballot-0006', async () => {
  const fixture = readFixture('batch-1-20200504_210852-ballot-0006.jpg')

  expect(
    (
      await interpreter.interpretBallot(
        await fixture.imageData(),
        await fixture.metadata()
      )
    ).ballot.votes
  ).toMatchInlineSnapshot(`
    Object {
      "dallas-county-commissioners-court-pct-3": Array [
        Object {
          "id": "john-wiley-price",
          "name": "John Wiley Price",
          "partyId": "2",
        },
        Object {
          "id": "s-t-russell",
          "name": "S.T. Russell",
          "partyId": "3",
        },
      ],
      "dallas-county-sheriff": Array [
        Object {
          "id": "chad-prda",
          "name": "Chad Prda",
          "partyId": "3",
        },
      ],
      "dallas-county-tax-assessor": Array [
        Object {
          "id": "john-ames",
          "name": "John Ames",
          "partyId": "2",
        },
      ],
      "texas-house-district-111": Array [
        Object {
          "id": "yvonne-davis",
          "name": "Yvonne Davis",
          "partyId": "2",
        },
      ],
      "texas-sc-judge-place-6": Array [
        Object {
          "id": "jane-bland",
          "name": "Jane Bland",
          "partyId": "3",
        },
      ],
      "us-house-district-30": Array [
        Object {
          "id": "eddie-bernice-johnson",
          "name": "Eddie Bernice Johnson",
          "partyId": "2",
        },
      ],
      "us-senate": Array [
        Object {
          "id": "james-brumley",
          "name": "James Brumley",
          "partyId": "4",
        },
      ],
    }
  `)
})

test('batch-1-20200504_210852-ballot-0007', async () => {
  const fixture = readFixture('batch-1-20200504_210852-ballot-0007.jpg')

  expect(
    (
      await interpreter.interpretBallot(
        await fixture.imageData(),
        await fixture.metadata()
      )
    ).ballot.votes
  ).toMatchInlineSnapshot(`
    Object {
      "dallas-city-council": Array [
        Object {
          "id": "carroll-shry",
          "name": "Carroll Shry",
          "partyId": "2",
        },
        Object {
          "id": "beverly-barker",
          "name": "Beverly Barker",
          "partyId": "3",
        },
        Object {
          "id": "donald-davis",
          "name": "Donald Davis",
          "partyId": "3",
        },
      ],
      "dallas-county-proposition-r": "no",
      "dallas-county-retain-chief-justice": "no",
      "dallas-mayor": Array [
        Object {
          "id": "gregory-seldon",
          "name": "Gregory Seldon",
          "partyId": "3",
        },
      ],
    }
  `)
})

test('batch-1-20200504_210852-ballot-0008', async () => {
  const fixture = readFixture('batch-1-20200504_210852-ballot-0008.jpg')

  expect(
    (
      await interpreter.interpretBallot(
        await fixture.imageData(),
        await fixture.metadata()
      )
    ).ballot.votes
  ).toMatchInlineSnapshot(`
    Object {
      "dallas-county-commissioners-court-pct-3": Array [
        Object {
          "id": "s-t-russell",
          "name": "S.T. Russell",
          "partyId": "3",
        },
        Object {
          "id": "andrew-jewell",
          "name": "Andrew Jewell",
          "partyId": "7",
        },
      ],
      "dallas-county-sheriff": Array [
        Object {
          "id": "chad-prda",
          "name": "Chad Prda",
          "partyId": "3",
        },
      ],
      "dallas-county-tax-assessor": Array [
        Object {
          "id": "john-ames",
          "name": "John Ames",
          "partyId": "2",
        },
      ],
      "texas-house-district-111": Array [
        Object {
          "id": "yvonne-davis",
          "name": "Yvonne Davis",
          "partyId": "2",
        },
      ],
      "texas-sc-judge-place-6": Array [
        Object {
          "id": "kathy-cheng",
          "name": "Kathy Cheng",
          "partyId": "2",
        },
      ],
      "us-house-district-30": Array [
        Object {
          "id": "eddie-bernice-johnson",
          "name": "Eddie Bernice Johnson",
          "partyId": "2",
        },
      ],
      "us-senate": Array [
        Object {
          "id": "tim-smith",
          "name": "Tim Smith",
          "partyId": "6",
        },
      ],
    }
  `)
})

test('batch-1-20200504_210852-ballot-0009', async () => {
  const fixture = readFixture('batch-1-20200504_210852-ballot-0009.jpg')

  expect(
    (
      await interpreter.interpretBallot(
        await fixture.imageData(),
        await fixture.metadata()
      )
    ).ballot.votes
  ).toMatchInlineSnapshot(`
    Object {
      "dallas-city-council": Array [
        Object {
          "id": "harvey-eagle",
          "name": "Harvey Eagle",
          "partyId": "2",
        },
        Object {
          "id": "donald-davis",
          "name": "Donald Davis",
          "partyId": "3",
        },
      ],
      "dallas-county-proposition-r": "yes",
      "dallas-county-retain-chief-justice": "yes",
      "dallas-mayor": Array [
        Object {
          "id": "orville-white",
          "name": "Orville White",
          "partyId": "2",
        },
      ],
    }
  `)
})

test('batch-1-20200504_210852-ballot-0010', async () => {
  const fixture = readFixture('batch-1-20200504_210852-ballot-0010.jpg')

  expect(
    (
      await interpreter.interpretBallot(
        await fixture.imageData(),
        await fixture.metadata()
      )
    ).ballot.votes
  ).toMatchInlineSnapshot(`
    Object {
      "dallas-county-commissioners-court-pct-3": Array [
        Object {
          "id": "john-wiley-price",
          "name": "John Wiley Price",
          "partyId": "2",
        },
        Object {
          "id": "s-t-russell",
          "name": "S.T. Russell",
          "partyId": "3",
        },
      ],
      "dallas-county-sheriff": Array [
        Object {
          "id": "chad-prda",
          "name": "Chad Prda",
          "partyId": "3",
        },
      ],
      "dallas-county-tax-assessor": Array [
        Object {
          "id": "john-ames",
          "name": "John Ames",
          "partyId": "2",
        },
      ],
      "texas-house-district-111": Array [
        Object {
          "id": "yvonne-davis",
          "name": "Yvonne Davis",
          "partyId": "2",
        },
      ],
      "texas-sc-judge-place-6": Array [
        Object {
          "id": "jane-bland",
          "name": "Jane Bland",
          "partyId": "3",
        },
      ],
      "us-senate": Array [
        Object {
          "id": "arjun-srinivasan",
          "name": "Arjun Srinivasan",
          "partyId": "6",
        },
      ],
    }
  `)
})

test('batch-1-20200504_210852-ballot-0011', async () => {
  const fixture = readFixture('batch-1-20200504_210852-ballot-0011.jpg')

  expect(
    (
      await interpreter.interpretBallot(
        await fixture.imageData(),
        await fixture.metadata()
      )
    ).ballot.votes
  ).toMatchInlineSnapshot(`
    Object {
      "dallas-city-council": Array [
        Object {
          "id": "harvey-eagle",
          "name": "Harvey Eagle",
          "partyId": "2",
        },
        Object {
          "id": "carroll-shry",
          "name": "Carroll Shry",
          "partyId": "2",
        },
        Object {
          "id": "donald-davis",
          "name": "Donald Davis",
          "partyId": "3",
        },
      ],
      "dallas-county-proposition-r": "yes",
      "dallas-county-retain-chief-justice": "yes",
      "dallas-mayor": Array [
        Object {
          "id": "orville-white",
          "name": "Orville White",
          "partyId": "2",
        },
      ],
    }
  `)
})

test('batch-1-20200504_210852-ballot-0012', async () => {
  const fixture = readFixture('batch-1-20200504_210852-ballot-0012.jpg')

  expect(
    (
      await interpreter.interpretBallot(
        await fixture.imageData(),
        await fixture.metadata()
      )
    ).ballot.votes
  ).toMatchInlineSnapshot(`
    Object {
      "dallas-county-commissioners-court-pct-3": Array [
        Object {
          "id": "john-wiley-price",
          "name": "John Wiley Price",
          "partyId": "2",
        },
        Object {
          "id": "s-t-russell",
          "name": "S.T. Russell",
          "partyId": "3",
        },
      ],
      "dallas-county-sheriff": Array [
        Object {
          "id": "chad-prda",
          "name": "Chad Prda",
          "partyId": "3",
        },
      ],
      "dallas-county-tax-assessor": Array [
        Object {
          "id": "john-ames",
          "name": "John Ames",
          "partyId": "2",
        },
      ],
      "texas-house-district-111": Array [
        Object {
          "id": "yvonne-davis",
          "name": "Yvonne Davis",
          "partyId": "2",
        },
      ],
      "texas-sc-judge-place-6": Array [
        Object {
          "id": "jane-bland",
          "name": "Jane Bland",
          "partyId": "3",
        },
      ],
      "us-house-district-30": Array [
        Object {
          "id": "tre-pennie",
          "name": "Tre Pennie",
          "partyId": "3",
        },
      ],
      "us-senate": Array [
        Object {
          "id": "john-cornyn",
          "name": "John Cornyn",
          "partyId": "3",
        },
      ],
    }
  `)
})

test('batch-1-20200504_210852-ballot-0013', async () => {
  const fixture = readFixture('batch-1-20200504_210852-ballot-0013.jpg')

  expect(
    (
      await interpreter.interpretBallot(
        await fixture.imageData(),
        await fixture.metadata()
      )
    ).ballot.votes
  ).toMatchInlineSnapshot(`
    Object {
      "dallas-city-council": Array [
        Object {
          "id": "harvey-eagle",
          "name": "Harvey Eagle",
          "partyId": "2",
        },
        Object {
          "id": "randall-rupp",
          "name": "Randall Rupp",
          "partyId": "2",
        },
        Object {
          "id": "hugo-smith",
          "name": "Hugo Smith",
          "partyId": "3",
        },
      ],
      "dallas-county-proposition-r": "yes",
      "dallas-county-retain-chief-justice": "yes",
      "dallas-mayor": Array [
        Object {
          "id": "gregory-seldon",
          "name": "Gregory Seldon",
          "partyId": "3",
        },
      ],
    }
  `)
})

test('batch-1-20200504_210852-ballot-0014', async () => {
  const fixture = readFixture('batch-1-20200504_210852-ballot-0014.jpg')

  expect(
    (
      await interpreter.interpretBallot(
        await fixture.imageData(),
        await fixture.metadata()
      )
    ).ballot.votes
  ).toMatchInlineSnapshot(`
    Object {
      "dallas-county-commissioners-court-pct-3": Array [
        Object {
          "id": "s-t-russell",
          "name": "S.T. Russell",
          "partyId": "3",
        },
      ],
      "dallas-county-sheriff": Array [
        Object {
          "id": "chad-prda",
          "name": "Chad Prda",
          "partyId": "3",
        },
      ],
      "dallas-county-tax-assessor": Array [
        Object {
          "id": "john-ames",
          "name": "John Ames",
          "partyId": "2",
        },
      ],
      "texas-house-district-111": Array [
        Object {
          "id": "__write-in",
          "isWriteIn": true,
          "name": "Write-In",
        },
      ],
      "texas-sc-judge-place-6": Array [
        Object {
          "id": "kathy-cheng",
          "name": "Kathy Cheng",
          "partyId": "2",
        },
      ],
      "us-house-district-30": Array [
        Object {
          "id": "tre-pennie",
          "name": "Tre Pennie",
          "partyId": "3",
        },
      ],
      "us-senate": Array [
        Object {
          "id": "ricardo-turullols-bonilla",
          "name": "Ricardo Turullols-Bonilla",
          "partyId": "6",
        },
      ],
    }
  `)
})

test('batch-1-20200504_210852-ballot-0015', async () => {
  const fixture = readFixture('batch-1-20200504_210852-ballot-0015.jpg')

  expect(
    (
      await interpreter.interpretBallot(
        await fixture.imageData(),
        await fixture.metadata()
      )
    ).ballot.votes
  ).toMatchInlineSnapshot(`
    Object {
      "dallas-city-council": Array [
        Object {
          "id": "beverly-barker",
          "name": "Beverly Barker",
          "partyId": "3",
        },
        Object {
          "id": "donald-davis",
          "name": "Donald Davis",
          "partyId": "3",
        },
        Object {
          "id": "hugo-smith",
          "name": "Hugo Smith",
          "partyId": "3",
        },
      ],
      "dallas-county-proposition-r": "yes",
      "dallas-county-retain-chief-justice": "no",
      "dallas-mayor": Array [
        Object {
          "id": "gregory-seldon",
          "name": "Gregory Seldon",
          "partyId": "3",
        },
      ],
    }
  `)
})

test('batch-1-20200504_210852-ballot-0016', async () => {
  const fixture = readFixture('batch-1-20200504_210852-ballot-0016.jpg')

  expect(
    (
      await interpreter.interpretBallot(
        await fixture.imageData(),
        await fixture.metadata()
      )
    ).ballot.votes
  ).toMatchInlineSnapshot(`
    Object {
      "dallas-county-commissioners-court-pct-3": Array [
        Object {
          "id": "john-wiley-price",
          "name": "John Wiley Price",
          "partyId": "2",
        },
        Object {
          "id": "s-t-russell",
          "name": "S.T. Russell",
          "partyId": "3",
        },
      ],
      "dallas-county-sheriff": Array [
        Object {
          "id": "chad-prda",
          "name": "Chad Prda",
          "partyId": "3",
        },
      ],
      "texas-house-district-111": Array [
        Object {
          "id": "yvonne-davis",
          "name": "Yvonne Davis",
          "partyId": "2",
        },
      ],
      "texas-sc-judge-place-6": Array [
        Object {
          "id": "jane-bland",
          "name": "Jane Bland",
          "partyId": "3",
        },
      ],
      "us-house-district-30": Array [
        Object {
          "id": "eddie-bernice-johnson",
          "name": "Eddie Bernice Johnson",
          "partyId": "2",
        },
      ],
      "us-senate": Array [
        Object {
          "id": "john-cornyn",
          "name": "John Cornyn",
          "partyId": "3",
        },
      ],
    }
  `)
})

test('batch-1-20200504_210852-ballot-0017', async () => {
  const fixture = readFixture('batch-1-20200504_210852-ballot-0017.jpg')

  expect(
    (
      await interpreter.interpretBallot(
        await fixture.imageData(),
        await fixture.metadata()
      )
    ).ballot.votes
  ).toMatchInlineSnapshot(`Object {}`)
})

test('batch-1-20200504_210852-ballot-0018', async () => {
  const fixture = readFixture('batch-1-20200504_210852-ballot-0018.jpg')

  expect(
    (
      await interpreter.interpretBallot(
        await fixture.imageData(),
        await fixture.metadata()
      )
    ).ballot.votes
  ).toMatchInlineSnapshot(`Object {}`)
})

test('batch-1-20200504_210852-ballot-0019', async () => {
  const fixture = readFixture('batch-1-20200504_210852-ballot-0019.jpg')

  expect(
    (
      await interpreter.interpretBallot(
        await fixture.imageData(),
        await fixture.metadata()
      )
    ).ballot.votes
  ).toMatchInlineSnapshot(`
    Object {
      "dallas-city-council": Array [
        Object {
          "id": "harvey-eagle",
          "name": "Harvey Eagle",
          "partyId": "2",
        },
        Object {
          "id": "randall-rupp",
          "name": "Randall Rupp",
          "partyId": "2",
        },
        Object {
          "id": "carroll-shry",
          "name": "Carroll Shry",
          "partyId": "2",
        },
      ],
      "dallas-county-proposition-r": "no",
      "dallas-county-retain-chief-justice": "no",
      "dallas-mayor": Array [
        Object {
          "id": "gregory-seldon",
          "name": "Gregory Seldon",
          "partyId": "3",
        },
      ],
    }
  `)
})

test('batch-1-20200504_210852-ballot-0020', async () => {
  const fixture = readFixture('batch-1-20200504_210852-ballot-0020.jpg')

  expect(
    (
      await interpreter.interpretBallot(
        await fixture.imageData(),
        await fixture.metadata()
      )
    ).ballot.votes
  ).toMatchInlineSnapshot(`
    Object {
      "dallas-county-commissioners-court-pct-3": Array [
        Object {
          "id": "andrew-jewell",
          "name": "Andrew Jewell",
          "partyId": "7",
        },
      ],
      "dallas-county-sheriff": Array [
        Object {
          "id": "chad-prda",
          "name": "Chad Prda",
          "partyId": "3",
        },
      ],
      "dallas-county-tax-assessor": Array [
        Object {
          "id": "john-ames",
          "name": "John Ames",
          "partyId": "2",
        },
      ],
      "texas-house-district-111": Array [
        Object {
          "id": "yvonne-davis",
          "name": "Yvonne Davis",
          "partyId": "2",
        },
      ],
      "texas-sc-judge-place-6": Array [
        Object {
          "id": "jane-bland",
          "name": "Jane Bland",
          "partyId": "3",
        },
      ],
      "us-house-district-30": Array [
        Object {
          "id": "tre-pennie",
          "name": "Tre Pennie",
          "partyId": "3",
        },
      ],
      "us-senate": Array [
        Object {
          "id": "cedric-jefferson",
          "name": "Cedric Jefferson",
          "partyId": "5",
        },
      ],
    }
  `)
})

test('batch-1-20200504_210852-ballot-0021', async () => {
  const fixture = readFixture('batch-1-20200504_210852-ballot-0021.jpg')

  expect(
    (
      await interpreter.interpretBallot(
        await fixture.imageData(),
        await fixture.metadata()
      )
    ).ballot.votes
  ).toMatchInlineSnapshot(`
    Object {
      "dallas-city-council": Array [
        Object {
          "id": "hugo-smith",
          "name": "Hugo Smith",
          "partyId": "3",
        },
      ],
      "dallas-county-proposition-r": "yes",
      "dallas-county-retain-chief-justice": "no",
      "dallas-mayor": Array [
        Object {
          "id": "gregory-seldon",
          "name": "Gregory Seldon",
          "partyId": "3",
        },
      ],
    }
  `)
})

test('batch-1-20200504_210852-ballot-0022', async () => {
  const fixture = readFixture('batch-1-20200504_210852-ballot-0022.jpg')

  expect(
    (
      await interpreter.interpretBallot(
        await fixture.imageData(),
        await fixture.metadata()
      )
    ).ballot.votes
  ).toMatchInlineSnapshot(`
    Object {
      "dallas-county-commissioners-court-pct-3": Array [
        Object {
          "id": "john-wiley-price",
          "name": "John Wiley Price",
          "partyId": "2",
        },
        Object {
          "id": "s-t-russell",
          "name": "S.T. Russell",
          "partyId": "3",
        },
      ],
      "dallas-county-sheriff": Array [
        Object {
          "id": "chad-prda",
          "name": "Chad Prda",
          "partyId": "3",
        },
      ],
      "dallas-county-tax-assessor": Array [
        Object {
          "id": "john-ames",
          "name": "John Ames",
          "partyId": "2",
        },
      ],
      "texas-house-district-111": Array [
        Object {
          "id": "yvonne-davis",
          "name": "Yvonne Davis",
          "partyId": "2",
        },
      ],
      "texas-sc-judge-place-6": Array [
        Object {
          "id": "jane-bland",
          "name": "Jane Bland",
          "partyId": "3",
        },
      ],
      "us-house-district-30": Array [
        Object {
          "id": "eddie-bernice-johnson",
          "name": "Eddie Bernice Johnson",
          "partyId": "2",
        },
      ],
      "us-senate": Array [
        Object {
          "id": "john-cornyn",
          "name": "John Cornyn",
          "partyId": "3",
        },
      ],
    }
  `)
})

test('batch-1-20200504_210852-ballot-0023', async () => {
  const fixture = readFixture('batch-1-20200504_210852-ballot-0023.jpg')

  expect(
    (
      await interpreter.interpretBallot(
        await fixture.imageData(),
        await fixture.metadata()
      )
    ).ballot.votes
  ).toMatchInlineSnapshot(`Object {}`)
})

test('batch-1-20200504_210852-ballot-0024', async () => {
  const fixture = readFixture('batch-1-20200504_210852-ballot-0024.jpg')

  expect(
    (
      await interpreter.interpretBallot(
        await fixture.imageData(),
        await fixture.metadata()
      )
    ).ballot.votes
  ).toMatchInlineSnapshot(`Object {}`)
})

test('batch-1-20200504_210852-ballot-0025', async () => {
  const fixture = readFixture('batch-1-20200504_210852-ballot-0025.jpg')

  expect(
    (
      await interpreter.interpretBallot(
        await fixture.imageData(),
        await fixture.metadata()
      )
    ).ballot.votes
  ).toMatchInlineSnapshot(`
    Object {
      "dallas-city-council": Array [
        Object {
          "id": "carroll-shry",
          "name": "Carroll Shry",
          "partyId": "2",
        },
        Object {
          "id": "donald-davis",
          "name": "Donald Davis",
          "partyId": "3",
        },
        Object {
          "id": "hugo-smith",
          "name": "Hugo Smith",
          "partyId": "3",
        },
      ],
      "dallas-county-proposition-r": "no",
      "dallas-county-retain-chief-justice": "no",
      "dallas-mayor": Array [
        Object {
          "id": "gregory-seldon",
          "name": "Gregory Seldon",
          "partyId": "3",
        },
      ],
    }
  `)
})

test('batch-1-20200504_210852-ballot-0026', async () => {
  const fixture = readFixture('batch-1-20200504_210852-ballot-0026.jpg')

  expect(
    (
      await interpreter.interpretBallot(
        await fixture.imageData(),
        await fixture.metadata()
      )
    ).ballot.votes
  ).toMatchInlineSnapshot(`
    Object {
      "dallas-county-commissioners-court-pct-3": Array [
        Object {
          "id": "s-t-russell",
          "name": "S.T. Russell",
          "partyId": "3",
        },
      ],
      "dallas-county-sheriff": Array [
        Object {
          "id": "chad-prda",
          "name": "Chad Prda",
          "partyId": "3",
        },
      ],
      "dallas-county-tax-assessor": Array [
        Object {
          "id": "john-ames",
          "name": "John Ames",
          "partyId": "2",
        },
      ],
      "texas-house-district-111": Array [
        Object {
          "id": "yvonne-davis",
          "name": "Yvonne Davis",
          "partyId": "2",
        },
      ],
      "texas-sc-judge-place-6": Array [
        Object {
          "id": "jane-bland",
          "name": "Jane Bland",
          "partyId": "3",
        },
      ],
      "us-house-district-30": Array [
        Object {
          "id": "eddie-bernice-johnson",
          "name": "Eddie Bernice Johnson",
          "partyId": "2",
        },
      ],
      "us-senate": Array [
        Object {
          "id": "john-cornyn",
          "name": "John Cornyn",
          "partyId": "3",
        },
      ],
    }
  `)
})

test('batch-1-20200504_210852-ballot-0027', async () => {
  const fixture = readFixture('batch-1-20200504_210852-ballot-0027.jpg')

  expect(
    (
      await interpreter.interpretBallot(
        await fixture.imageData(),
        await fixture.metadata()
      )
    ).ballot.votes
  ).toMatchInlineSnapshot(`
    Object {
      "dallas-city-council": Array [
        Object {
          "id": "carroll-shry",
          "name": "Carroll Shry",
          "partyId": "2",
        },
        Object {
          "id": "beverly-barker",
          "name": "Beverly Barker",
          "partyId": "3",
        },
        Object {
          "id": "hugo-smith",
          "name": "Hugo Smith",
          "partyId": "3",
        },
      ],
      "dallas-county-proposition-r": "yes",
      "dallas-county-retain-chief-justice": "no",
      "dallas-mayor": Array [
        Object {
          "id": "gregory-seldon",
          "name": "Gregory Seldon",
          "partyId": "3",
        },
      ],
    }
  `)
})

test('batch-1-20200504_210852-ballot-0028', async () => {
  const fixture = readFixture('batch-1-20200504_210852-ballot-0028.jpg')

  expect(
    (
      await interpreter.interpretBallot(
        await fixture.imageData(),
        await fixture.metadata()
      )
    ).ballot.votes
  ).toMatchInlineSnapshot(`
    Object {
      "dallas-county-commissioners-court-pct-3": Array [
        Object {
          "id": "s-t-russell",
          "name": "S.T. Russell",
          "partyId": "3",
        },
        Object {
          "id": "andrew-jewell",
          "name": "Andrew Jewell",
          "partyId": "7",
        },
      ],
      "dallas-county-sheriff": Array [
        Object {
          "id": "chad-prda",
          "name": "Chad Prda",
          "partyId": "3",
        },
      ],
      "dallas-county-tax-assessor": Array [
        Object {
          "id": "john-ames",
          "name": "John Ames",
          "partyId": "2",
        },
      ],
      "texas-house-district-111": Array [
        Object {
          "id": "yvonne-davis",
          "name": "Yvonne Davis",
          "partyId": "2",
        },
      ],
      "texas-sc-judge-place-6": Array [
        Object {
          "id": "jane-bland",
          "name": "Jane Bland",
          "partyId": "3",
        },
      ],
      "us-house-district-30": Array [
        Object {
          "id": "tre-pennie",
          "name": "Tre Pennie",
          "partyId": "3",
        },
      ],
      "us-senate": Array [
        Object {
          "id": "ricardo-turullols-bonilla",
          "name": "Ricardo Turullols-Bonilla",
          "partyId": "6",
        },
      ],
    }
  `)
})

test('batch-1-20200504_210852-ballot-0029', async () => {
  const fixture = readFixture('batch-1-20200504_210852-ballot-0029.jpg')

  expect(
    (
      await interpreter.interpretBallot(
        await fixture.imageData(),
        await fixture.metadata()
      )
    ).ballot.votes
  ).toMatchInlineSnapshot(`
    Object {
      "dallas-city-council": Array [
        Object {
          "id": "randall-rupp",
          "name": "Randall Rupp",
          "partyId": "2",
        },
        Object {
          "id": "carroll-shry",
          "name": "Carroll Shry",
          "partyId": "2",
        },
        Object {
          "id": "beverly-barker",
          "name": "Beverly Barker",
          "partyId": "3",
        },
      ],
      "dallas-county-proposition-r": "no",
      "dallas-county-retain-chief-justice": "no",
      "dallas-mayor": Array [
        Object {
          "id": "orville-white",
          "name": "Orville White",
          "partyId": "2",
        },
      ],
    }
  `)
})

test('batch-1-20200504_210852-ballot-0030', async () => {
  const fixture = readFixture('batch-1-20200504_210852-ballot-0030.jpg')

  expect(
    (
      await interpreter.interpretBallot(
        await fixture.imageData(),
        await fixture.metadata()
      )
    ).ballot.votes
  ).toMatchInlineSnapshot(`
    Object {
      "dallas-county-commissioners-court-pct-3": Array [
        Object {
          "id": "john-wiley-price",
          "name": "John Wiley Price",
          "partyId": "2",
        },
        Object {
          "id": "s-t-russell",
          "name": "S.T. Russell",
          "partyId": "3",
        },
      ],
      "dallas-county-sheriff": Array [
        Object {
          "id": "marian-brown",
          "name": "Marian Brown",
          "partyId": "2",
        },
      ],
      "dallas-county-tax-assessor": Array [
        Object {
          "id": "john-ames",
          "name": "John Ames",
          "partyId": "2",
        },
      ],
      "texas-house-district-111": Array [
        Object {
          "id": "yvonne-davis",
          "name": "Yvonne Davis",
          "partyId": "2",
        },
      ],
      "us-house-district-30": Array [
        Object {
          "id": "eddie-bernice-johnson",
          "name": "Eddie Bernice Johnson",
          "partyId": "2",
        },
      ],
      "us-senate": Array [
        Object {
          "id": "john-cornyn",
          "name": "John Cornyn",
          "partyId": "3",
        },
      ],
    }
  `)
})

test('batch-1-20200504_210852-ballot-0031', async () => {
  const fixture = readFixture('batch-1-20200504_210852-ballot-0031.jpg')

  expect(
    (
      await interpreter.interpretBallot(
        await fixture.imageData(),
        await fixture.metadata()
      )
    ).ballot.votes
  ).toMatchInlineSnapshot(`
    Object {
      "dallas-city-council": Array [
        Object {
          "id": "randall-rupp",
          "name": "Randall Rupp",
          "partyId": "2",
        },
        Object {
          "id": "carroll-shry",
          "name": "Carroll Shry",
          "partyId": "2",
        },
        Object {
          "id": "beverly-barker",
          "name": "Beverly Barker",
          "partyId": "3",
        },
      ],
      "dallas-county-proposition-r": "yes",
      "dallas-county-retain-chief-justice": "no",
      "dallas-mayor": Array [
        Object {
          "id": "orville-white",
          "name": "Orville White",
          "partyId": "2",
        },
      ],
    }
  `)
})

test('batch-1-20200504_210852-ballot-0032', async () => {
  const fixture = readFixture('batch-1-20200504_210852-ballot-0032.jpg')

  expect(
    (
      await interpreter.interpretBallot(
        await fixture.imageData(),
        await fixture.metadata()
      )
    ).ballot.votes
  ).toMatchInlineSnapshot(`
    Object {
      "dallas-county-commissioners-court-pct-3": Array [
        Object {
          "id": "john-wiley-price",
          "name": "John Wiley Price",
          "partyId": "2",
        },
        Object {
          "id": "s-t-russell",
          "name": "S.T. Russell",
          "partyId": "3",
        },
      ],
      "dallas-county-sheriff": Array [
        Object {
          "id": "marian-brown",
          "name": "Marian Brown",
          "partyId": "2",
        },
      ],
      "dallas-county-tax-assessor": Array [
        Object {
          "id": "john-ames",
          "name": "John Ames",
          "partyId": "2",
        },
      ],
      "texas-house-district-111": Array [
        Object {
          "id": "yvonne-davis",
          "name": "Yvonne Davis",
          "partyId": "2",
        },
      ],
      "texas-sc-judge-place-6": Array [
        Object {
          "id": "jane-bland",
          "name": "Jane Bland",
          "partyId": "3",
        },
      ],
      "us-house-district-30": Array [
        Object {
          "id": "eddie-bernice-johnson",
          "name": "Eddie Bernice Johnson",
          "partyId": "2",
        },
      ],
      "us-senate": Array [
        Object {
          "id": "john-cornyn",
          "name": "John Cornyn",
          "partyId": "3",
        },
      ],
    }
  `)
})
