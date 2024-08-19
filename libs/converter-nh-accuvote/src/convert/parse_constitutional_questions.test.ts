import {
  ParseConstitutionalQuestionError,
  ParseConstitutionalQuestionErrorKind,
  parseConstitutionalQuestions,
  ParsedConstitutionalQuestions,
} from './parse_constitutional_questions';

test('single simple question', () => {
  const questions = parseConstitutionalQuestions(
    `<![CDATA[<div>CONSTITUTIONAL AMENDMENT QUESTION </div><div>Constitutional Amendment Proposed by the General Court</div><div>Question Proposed pursuant to Part II, Article 100 of the New Hampshire Constitution.</div><div>&nbsp;</div><div>"Shall there be a convention to amend or revise the constitution? &nbsp; &nbsp; YES&nbsp;&nbsp;<FONT face=Arial>&nbsp;<IMG src="http://ertuat.sos.nh.gov/ballotpaper/assets/images/oval.png""></FONT> &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;NO&nbsp;&nbsp;<FONT face=Arial>&nbsp;<IMG src="http://ertuat.sos.nh.gov/ballotpaper/assets/images/oval.png""></FONT></div> `
  ).unsafeUnwrap();

  expect(questions).toEqual<ParsedConstitutionalQuestions>({
    title: 'CONSTITUTIONAL AMENDMENT QUESTION',
    questions: [
      {
        number: undefined,
        header: [
          'Constitutional Amendment Proposed by the General Court',
          '',
          'Question Proposed pursuant to Part II, Article 100 of the New Hampshire Constitution.',
        ].join('\n'),
        title:
          'Shall there be a convention to amend or revise the constitution?',
      },
    ],
  });
});

test('multiple constitutional questions with long text', () => {
  const questions = parseConstitutionalQuestions(
    // eslint-disable-next-line no-irregular-whitespace
    `<![CDATA[<div>2022 CONSTITUTIONAL AMENDMENT QUESTIONS</div><div>Constitutional Amendment Proposed by the 2022 General Court</div><div> </div><div>1.  "Are you in favor of amending articles 71 and 81 of the second part of the constitution to read as follows:</div><div>[Art.] 71. [County Treasurers, County Attorneys, Sheriffs, and Registers of Deeds Elected.] The county treasurers, county attorneys, sheriffs and registers of deeds, shall be elected by the inhabitants of the several towns, in the several counties in the State, according to the method now practiced, and the laws of the state, provided nevertheless the legislature shall have authority to alter the manner of certifying the votes, and the mode of electing those officers; but not so as to deprive the people of the right they now have of electing them. [Art.] 81. [Judges Not to Act as Counsel.] No judge shall be of counsel, act as advocate, or receive any fees as advocate or counsel, in any probate business which is pending, or may be brought into any court of probate in the county of which he or she is judge." </div><div>(Passed by the N.H. House 294 Yes 43 No; Passed by Senate 21 Yes 3 No.) CACR 21</div><div> </div><div>                                              YES   <FONT face=Arial> <IMG src="http://ertuat.sos.nh.gov/ballotpaper/assets/images/oval.png""></FONT>                                  NO  <FONT face=Arial> <IMG src="http://ertuat.sos.nh.gov/ballotpaper/assets/images/oval.png""></FONT></div><div> </div><div>Question Proposed pursuant to Part II, Article 100 of the New Hampshire Constitution</div><div> </div><div>2. "Shall there be a convention to amend or revise the constitution?"</div>                                YES  <FONT face=Arial> <IMG src="http://ertuat.sos.nh.gov/ballotpaper/assets/images/oval.png""></FONT>                                  NO  <FONT face=Arial> <IMG src="http://ertuat.sos.nh.gov/ballotpaper/assets/images/oval.png""></FONT></div><div> </div>]]>`
  ).unsafeUnwrap();

  expect(questions).toEqual<ParsedConstitutionalQuestions>({
    title: '2022 CONSTITUTIONAL AMENDMENT QUESTIONS',
    questions: [
      {
        number: 1,
        header: 'Constitutional Amendment Proposed by the 2022 General Court',
        title: [
          'Are you in favor of amending articles 71 and 81 of the second part of the constitution to read as follows:',
          '',
          '[Art.] 71. [County Treasurers, County Attorneys, Sheriffs, and Registers of Deeds Elected.] The county treasurers, county attorneys, sheriffs and registers of deeds, shall be elected by the inhabitants of the several towns, in the several counties in the State, according to the method now practiced, and the laws of the state, provided nevertheless the legislature shall have authority to alter the manner of certifying the votes, and the mode of electing those officers; but not so as to deprive the people of the right they now have of electing them. [Art.] 81. [Judges Not to Act as Counsel.] No judge shall be of counsel, act as advocate, or receive any fees as advocate or counsel, in any probate business which is pending, or may be brought into any court of probate in the county of which he or she is judge.',
          '',
          '(Passed by the N.H. House 294 Yes 43 No; Passed by Senate 21 Yes 3 No.) CACR 21',
        ].join('\n'),
      },
      {
        number: 2,
        header:
          'Question Proposed pursuant to Part II, Article 100 of the New Hampshire Constitution',
        title:
          'Shall there be a convention to amend or revise the constitution?',
      },
    ],
  });
});

test('missing question text single question', () => {
  const error = parseConstitutionalQuestions(
    `<div>TITLE</div><!-- no question text here --><div>YES</div><div>NO</div>`
  ).unsafeUnwrapErr();

  expect(error).toMatchObject<Partial<ParseConstitutionalQuestionError>>({
    kind: ParseConstitutionalQuestionErrorKind.MissingQuestionText,
  });
});

test('missing question text multiple questions', () => {
  const error = parseConstitutionalQuestions(
    `<div>TITLE</div><div>Question text</div><div>YES</div><div>NO</div>` +
      `<!-- no question text here --><div>YES</div><!-- no NO here, to break out of loop without returning -->`
  ).unsafeUnwrapErr();

  expect(error).toMatchObject<Partial<ParseConstitutionalQuestionError>>({
    kind: ParseConstitutionalQuestionErrorKind.MissingQuestionText,
  });
});

test('missing YES/NO single question', () => {
  const error = parseConstitutionalQuestions(
    `<div>TITLE</div><div>Question text</div><div>DUNNO</div><div>NO</div>`
  ).unsafeUnwrapErr();

  expect(error).toMatchObject<Partial<ParseConstitutionalQuestionError>>({
    kind: ParseConstitutionalQuestionErrorKind.MissingYesNo,
  });
});

test('missing YES/NO multiple questions', () => {
  const error = parseConstitutionalQuestions(
    `<div>TITLE</div><div>Question text</div><div>DUNNO</div><div>NO</div>` +
      `<div>Question title 2</div><div>Question text 2</div><div>YES</div><div>MAYBE</div>`
  ).unsafeUnwrapErr();

  expect(error).toMatchObject<Partial<ParseConstitutionalQuestionError>>({
    kind: ParseConstitutionalQuestionErrorKind.MissingYesNo,
  });
});
