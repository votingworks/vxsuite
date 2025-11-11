import {
  assert,
  assertDefined,
  DateWithoutTime,
  deepEqual,
  duplicates,
  err,
  find,
  naturals,
  ok,
  Result,
  throwIllegalValue,
  unique,
  wrapException,
} from '@votingworks/basics';
import setWith from 'lodash.setwith';
import * as Cdf from '.';
import * as Vxf from '../../election';
import {
  ballotPaperDimensions,
  getContests,
  getOrderedCandidatesForContestInBallotStyle,
} from '../../election_utils';
import { Id, safeParse } from '../../generic';
import { safeParseInt } from '../../numeric';
import {
  ElectionStringKey,
  UiStringsPackage,
} from '../../ui_string_translations';
import { DEFAULT_LANGUAGE_CODE } from '../../languages';

function officeId(contestId: Vxf.ContestId): string {
  return `office-${contestId}`;
}

function getElectionDistricts(
  cdfBallotDefinition: Cdf.BallotDefinition
): Cdf.ReportingUnit[] {
  // Any GpUnit that is associated with contests is a "district" in VXF
  return cdfBallotDefinition.GpUnit.filter((gpUnit) =>
    cdfBallotDefinition.Election[0].Contest.some(
      (contest) => contest.ElectionDistrictId === gpUnit['@id']
    )
  );
}

function termDescriptionForContest(
  ballotDefinition: Cdf.BallotDefinition,
  contestId: string
): string | undefined {
  /* istanbul ignore next - @preserve */
  return (ballotDefinition.Office ?? []).find(
    (office) => office['@id'] === officeId(contestId)
  )?.Term.Label;
}

/**
 * String translation string key, with support for one level of optional nesting
 * for strings of the same type that vary based on content ID(e.g.
 * `['contestTitle', contest.id]`).
 *
 * See https://www.i18next.com/translation-function/essentials#accessing-keys
 */
type StringKey = ElectionStringKey | [ElectionStringKey, string];

/**
 * Sets the appropriate language strings in supported languages for the given
 * internationalized CDF ballot content text.
 */
function setInternationalizedUiStrings(params: {
  uiStrings: UiStringsPackage;
  stringKey: StringKey;
  values: readonly Cdf.LanguageString[];
}) {
  const { stringKey, uiStrings, values } = params;

  for (const value of values) {
    const languageCode = value.Language;
    const valuePath = [languageCode, stringKey].flat();
    setWith(uiStrings, valuePath, value.Content, Object);
  }
}

/**
 * Sets the default English language string for the given ballot content text.
 * Used for content that will be spoken, but not translated, like ballot style.
 */
function setStaticUiString(params: {
  uiStrings: UiStringsPackage;
  stringKey: StringKey;
  value: string;
}) {
  const { stringKey, uiStrings, value } = params;

  const valuePath = [DEFAULT_LANGUAGE_CODE, stringKey].flat();
  setWith(uiStrings, valuePath, value, Object);
}

/**
 * Returns all the language codes in use in a CDF election based on the election
 * title internationalized text.
 */
function electionLanguageCodes(cdfElection: Cdf.BallotDefinition): string[] {
  const electionTitleStrings = assertDefined(cdfElection.Election[0]).Name.Text;
  return electionTitleStrings.map((string) => string.Language);
}

const extractorFns: Record<
  ElectionStringKey,
  (cdfElection: Cdf.BallotDefinition, uiStrings: UiStringsPackage) => void
> = {
  [ElectionStringKey.BALLOT_LANGUAGE](cdfElection, uiStrings) {
    // CDF does not support internationalized text for this string, so we just
    // use JS to internationalize the language code.
    const languageCodes = electionLanguageCodes(cdfElection);
    for (const languageCode of languageCodes) {
      setInternationalizedUiStrings({
        uiStrings,
        stringKey: [ElectionStringKey.BALLOT_LANGUAGE, languageCode],
        values: languageCodes.map(
          (displayLanguageCode): Cdf.LanguageString => ({
            '@type': 'BallotDefinition.LanguageString',
            Language: displayLanguageCode,
            Content: assertDefined(
              new Intl.DisplayNames([displayLanguageCode], {
                type: 'language',
                style: 'narrow',
                fallback: 'none',
              }).of(languageCode)
            ),
          })
        ),
      });
    }
  },

  [ElectionStringKey.BALLOT_STYLE_ID](cdfElection, uiStrings) {
    for (const ballotStyle of assertDefined(cdfElection.Election[0])
      .BallotStyle) {
      const ballotStyleId = assertDefined(
        ballotStyle.ExternalIdentifier[0]
      ).Value;

      setStaticUiString({
        stringKey: [ElectionStringKey.BALLOT_STYLE_ID, ballotStyleId],
        uiStrings,
        // TODO(kofi): Should we start populating the `Label` field to provide
        // more user-friendly display values?
        value: assertDefined(ballotStyle.ExternalIdentifier[0]).Value,
      });
    }
  },

  [ElectionStringKey.CANDIDATE_NAME](cdfElection, uiStrings) {
    const candidates =
      assertDefined(cdfElection.Election[0]).Candidate ||
      /* istanbul ignore next - @preserve */ [];
    for (const candidate of candidates) {
      setInternationalizedUiStrings({
        stringKey: [ElectionStringKey.CANDIDATE_NAME, candidate['@id']],
        uiStrings,
        values: candidate.BallotName.Text,
      });
    }
  },

  [ElectionStringKey.CONTEST_DESCRIPTION](cdfElection, uiStrings) {
    for (const contest of assertDefined(cdfElection.Election[0]).Contest) {
      if (contest['@type'] !== 'BallotDefinition.BallotMeasureContest') {
        continue;
      }

      setInternationalizedUiStrings({
        stringKey: [ElectionStringKey.CONTEST_DESCRIPTION, contest['@id']],
        uiStrings,
        values: contest.FullText.Text,
      });
    }
  },

  [ElectionStringKey.CONTEST_OPTION_LABEL](cdfElection, uiStrings) {
    for (const contest of assertDefined(cdfElection.Election[0]).Contest) {
      if (contest['@type'] !== 'BallotDefinition.BallotMeasureContest') {
        continue;
      }

      for (const option of contest.ContestOption) {
        setInternationalizedUiStrings({
          stringKey: [ElectionStringKey.CONTEST_OPTION_LABEL, option['@id']],
          uiStrings,
          values: option.Selection.Text,
        });
      }
    }
  },

  [ElectionStringKey.CONTEST_TERM](cdfElection, uiStrings) {
    // CDF does not support internationalized text for this string, so we just
    // use the provided English text.
    for (const contest of assertDefined(cdfElection.Election[0]).Contest) {
      const termDescription = termDescriptionForContest(
        cdfElection,
        contest['@id']
      );
      if (termDescription) {
        setInternationalizedUiStrings({
          stringKey: [ElectionStringKey.CONTEST_TERM, contest['@id']],
          uiStrings,
          values: electionLanguageCodes(cdfElection).map(
            (languageCode): Cdf.LanguageString => ({
              '@type': 'BallotDefinition.LanguageString',
              Language: languageCode,
              Content: termDescription,
            })
          ),
        });
      }
    }
  },

  [ElectionStringKey.CONTEST_TITLE](cdfElection, uiStrings) {
    for (const contest of assertDefined(cdfElection.Election[0]).Contest) {
      setInternationalizedUiStrings({
        stringKey: [ElectionStringKey.CONTEST_TITLE, contest['@id']],
        uiStrings,
        values: contest.BallotTitle.Text,
      });
    }
  },

  [ElectionStringKey.COUNTY_NAME](cdfElection, uiStrings) {
    const county = cdfElection.GpUnit.find(
      (gpUnit) => gpUnit.Type === Cdf.ReportingUnitType.County
    );

    if (!county) {
      return;
    }

    setInternationalizedUiStrings({
      stringKey: ElectionStringKey.COUNTY_NAME,
      uiStrings,
      values: county.Name.Text,
    });
  },

  [ElectionStringKey.DISTRICT_NAME](cdfElection, uiStrings) {
    const districts = getElectionDistricts(cdfElection);

    for (const district of districts) {
      setInternationalizedUiStrings({
        stringKey: [ElectionStringKey.DISTRICT_NAME, district['@id']],
        uiStrings,
        values: district.Name.Text,
      });
    }
  },

  [ElectionStringKey.ELECTION_DATE](cdfElection, uiStrings) {
    // CDF does not support internationalized text for this string, so we format
    // it using JS.
    setInternationalizedUiStrings({
      stringKey: ElectionStringKey.ELECTION_DATE,
      uiStrings,
      values: electionLanguageCodes(cdfElection).map(
        (languageCode): Cdf.LanguageString => ({
          '@type': 'BallotDefinition.LanguageString',
          Language: languageCode,
          Content: new Intl.DateTimeFormat(languageCode, {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          }).format(
            new DateWithoutTime(
              assertDefined(cdfElection.Election[0]).StartDate
            ).toMidnightDatetimeWithSystemTimezone()
          ),
        })
      ),
    });
  },

  [ElectionStringKey.ELECTION_TITLE](cdfElection, uiStrings) {
    setInternationalizedUiStrings({
      stringKey: ElectionStringKey.ELECTION_TITLE,
      uiStrings,
      values: assertDefined(cdfElection.Election[0]).Name.Text,
    });
  },

  [ElectionStringKey.PARTY_FULL_NAME](cdfElection, uiStrings) {
    for (const party of cdfElection.Party) {
      setInternationalizedUiStrings({
        stringKey: [ElectionStringKey.PARTY_FULL_NAME, party['@id']],
        uiStrings,
        values: party.Name.Text,
      });
    }
  },

  [ElectionStringKey.PARTY_NAME](cdfElection, uiStrings) {
    for (const party of cdfElection.Party) {
      setInternationalizedUiStrings({
        stringKey: [ElectionStringKey.PARTY_NAME, party['@id']],
        uiStrings,
        values: party.Name.Text,
      });
    }
  },

  [ElectionStringKey.PRECINCT_NAME](cdfElection, uiStrings) {
    for (const gpUnit of cdfElection.GpUnit) {
      if (gpUnit.Type !== Cdf.ReportingUnitType.Precinct) {
        continue;
      }

      setInternationalizedUiStrings({
        stringKey: [ElectionStringKey.PRECINCT_NAME, gpUnit['@id']],
        uiStrings,
        values: gpUnit.Name.Text,
      });
    }
  },

  [ElectionStringKey.PRECINCT_SPLIT_NAME](cdfElection, uiStrings) {
    for (const gpUnit of cdfElection.GpUnit) {
      if (gpUnit.Type !== Cdf.ReportingUnitType.SplitPrecinct) {
        continue;
      }

      setInternationalizedUiStrings({
        stringKey: [ElectionStringKey.PRECINCT_SPLIT_NAME, gpUnit['@id']],
        uiStrings,
        values: gpUnit.Name.Text,
      });
    }
  },

  [ElectionStringKey.STATE_NAME](cdfElection, uiStrings) {
    const state = cdfElection.GpUnit.find(
      (gpUnit) => gpUnit.Type === Cdf.ReportingUnitType.State
    );

    if (!state) {
      return;
    }

    setInternationalizedUiStrings({
      stringKey: ElectionStringKey.STATE_NAME,
      uiStrings,
      values: state.Name.Text,
    });
  },
};

export function extractCdfUiStrings(
  cdfElection: Cdf.BallotDefinition
): UiStringsPackage {
  const uiStrings: UiStringsPackage = {};

  for (const extractorFn of Object.values(extractorFns)) {
    extractorFn(cdfElection, uiStrings);
  }

  return uiStrings;
}

function getUiString(
  uiStrings: UiStringsPackage,
  languageCode: string,
  stringKey: string | [string, string]
): string | undefined {
  const uiStringsInLanguage = uiStrings[languageCode];
  // No current code paths lead here, but it's also not cause for an assert.
  /* istanbul ignore next - @preserve */
  if (!uiStringsInLanguage) {
    return undefined;
  }

  // Single-value key
  if (typeof stringKey === 'string') {
    const uiString = uiStringsInLanguage[stringKey];
    return uiString && typeof uiString === 'string' ? uiString : undefined;
  }

  // Two-value key
  const subStructure = uiStringsInLanguage[stringKey[0]];
  return subStructure && typeof subStructure === 'object'
    ? subStructure[stringKey[1]]
    : undefined;
}

export function convertVxfElectionToCdfBallotDefinition(
  vxfElection: Vxf.Election
): Cdf.BallotDefinition {
  function text(
    content: string,
    stringKey: ElectionStringKey | [ElectionStringKey, string] | 'other'
  ): Cdf.InternationalizedText {
    const cdfText: Cdf.LanguageString[] = [];
    for (const languageCode of Object.keys(vxfElection.ballotStrings)) {
      if (languageCode === DEFAULT_LANGUAGE_CODE) {
        cdfText.push({
          '@type': 'BallotDefinition.LanguageString',
          Language: DEFAULT_LANGUAGE_CODE,
          Content: content,
        });
        continue;
      }

      if (stringKey === 'other') {
        continue;
      }

      const stringInLanguage = getUiString(
        vxfElection.ballotStrings,
        languageCode,
        stringKey
      );
      if (stringInLanguage) {
        cdfText.push({
          '@type': 'BallotDefinition.LanguageString',
          Language: languageCode,
          Content: stringInLanguage,
        });
      }
    }

    return {
      '@type': 'BallotDefinition.InternationalizedText',
      Text: cdfText,
    };
  }

  const stateId = vxfElection.state.toLowerCase().replaceAll(' ', '-');

  function precinctsOrSplitsForBallotStyle(ballotStyle: Vxf.BallotStyle): Id[] {
    // For each precinct in the ballot style's precinct list, find the matching
    // precinct or split in the election
    return ballotStyle.precincts.flatMap((precinctId) => {
      const precinct = find(vxfElection.precincts, (p) => p.id === precinctId);

      if (Vxf.hasSplits(precinct)) {
        // If the precinct has splits, find the ones that match the ballot style's districts
        return precinct.splits
          .filter((split) =>
            deepEqual(
              split.districtIds.toSorted(),
              ballotStyle.districts.toSorted()
            )
          )
          .map((split) => split.id);
      }

      // If the precinct doesn't have splits, verify districts match and return the precinct ID
      return deepEqual(
        precinct.districtIds.toSorted(),
        ballotStyle.districts.toSorted()
      )
        ? [precinct.id]
        : [];
    });
  }

  function candidateOptionId(
    contestId: Vxf.ContestId,
    candidateId: Vxf.CandidateId
  ): string {
    return `${contestId}-option-${candidateId}`;
  }

  function writeInOptionId(
    contestId: Vxf.ContestId,
    writeInIndex: number
  ): string {
    return `${contestId}-option-write-in-${writeInIndex}`;
  }

  function orderedContentForBallotStyle(
    ballotStyle: Vxf.BallotStyle
  ): Cdf.OrderedContest[] | undefined {
    if (!vxfElection.gridLayouts) return undefined;

    const gridLayout = find(
      vxfElection.gridLayouts,
      (layout) => layout.ballotStyleId === ballotStyle.id
    );

    function optionIdForPosition(
      contest: Vxf.AnyContest,
      gridPosition: Vxf.GridPosition
    ): string {
      switch (gridPosition.type) {
        case 'option': {
          switch (contest.type) {
            case 'candidate':
              return candidateOptionId(contest.id, gridPosition.optionId);
            case 'yesno': {
              return gridPosition.optionId;
            }
            /* istanbul ignore next - @preserve */
            default: {
              return throwIllegalValue(contest);
            }
          }
        }
        case 'write-in':
          return writeInOptionId(contest.id, gridPosition.writeInIndex);
        /* istanbul ignore next - @preserve */
        default: {
          return throwIllegalValue(gridPosition);
        }
      }
    }

    function getOrderedPhysicalContestOptions(
      contest: Vxf.AnyContest
    ): Cdf.PhysicalContestOption[] {
      // For candidate contests, use the ordered candidates from the ballot style
      if (contest.type === 'candidate') {
        const orderedCandidates = getOrderedCandidatesForContestInBallotStyle({
          contest,
          ballotStyle,
        });
        const physicalOptions: Cdf.PhysicalContestOption[] = [];

        // Add candidate options in the specified order
        for (const orderedCandidate of orderedCandidates) {
          const optionId = candidateOptionId(contest.id, orderedCandidate.id);
          const position = gridLayout.gridPositions.find(
            (pos) =>
              pos.contestId === contest.id &&
              pos.type === 'option' &&
              optionIdForPosition(contest, pos) === optionId &&
              // Only require partyIds to match if both are defined
              // (handles case where grid position doesn't have partyIds set)
              (orderedCandidate.partyIds === undefined ||
                pos.partyIds === undefined ||
                deepEqual(orderedCandidate.partyIds, pos.partyIds))
          );
          if (position) {
            physicalOptions.push({
              '@type': 'BallotDefinition.PhysicalContestOption',
              ContestOptionId: optionId,
              OptionPosition: [
                {
                  '@type': 'BallotDefinition.OptionPosition',
                  Sheet: position.sheetNumber,
                  Side: position.side as Cdf.BallotSideType,
                  X: position.column,
                  Y: position.row,
                  H: 0,
                  W: 0,
                  NumberVotes: 1,
                },
              ],
            });
          }
        }

        // Add write-in options
        if (contest.allowWriteIns) {
          for (const position of gridLayout.gridPositions) {
            if (
              position.contestId === contest.id &&
              position.type === 'write-in'
            ) {
              physicalOptions.push({
                '@type': 'BallotDefinition.PhysicalContestOption',
                ContestOptionId: optionIdForPosition(contest, position),
                OptionPosition: [
                  {
                    '@type': 'BallotDefinition.OptionPosition',
                    Sheet: position.sheetNumber,
                    Side: position.side as Cdf.BallotSideType,
                    // Technically these should be in inches, not grid
                    // coordinates, since that's the measurement unit
                    // specified in the ballot format, but grid coordinates
                    // are what our interpreter uses, and converting to inches
                    // and back would just add arbitrary confusion.
                    X: position.column,
                    Y: position.row,

                    // It's not clear what the height/width of an
                    // OptionPosition refer to. Is it the dimensions of the
                    // bubble? Since we don't actually use this data, just set
                    // it to a dummy value.
                    H: 0,
                    W: 0,
                    NumberVotes: 1,
                  },
                ],
                WriteInPosition: [
                  {
                    '@type': 'BallotDefinition.WriteInPosition',
                    Sheet: position.sheetNumber,
                    Side: position.side as Cdf.BallotSideType,
                    // Note that these are in grid coordinates
                    X: position.writeInArea.x,
                    Y: position.writeInArea.y,
                    W: position.writeInArea.width,
                    H: position.writeInArea.height,
                  },
                ],
              });
            }
          }
        }

        return physicalOptions;
      }

      // For other contests (yesno), use grid layout order
      return gridLayout.gridPositions
        .filter((position) => position.contestId === contest.id)
        .map(
          (position): Cdf.PhysicalContestOption => ({
            '@type': 'BallotDefinition.PhysicalContestOption',
            ContestOptionId: optionIdForPosition(contest, position),
            OptionPosition: [
              {
                '@type': 'BallotDefinition.OptionPosition',
                Sheet: position.sheetNumber,
                Side: position.side as Cdf.BallotSideType,

                // Technically these should be in inches, not grid
                // coordinates, since that's the measurement unit
                // specified in the ballot format, but grid coordinates
                // are what our interpreter uses, and converting to inches
                // and back would just add arbitrary confusion.
                X: position.column,
                Y: position.row,

                // It's not clear what the height/width of an
                // OptionPosition refer to. Is it the dimensions of the
                // bubble? Since we don't actually use this data, just set
                // it to a dummy value.
                H: 0,
                W: 0,
                NumberVotes: 1,
              },
            ],
            WriteInPosition:
              position.type === 'write-in'
                ? [
                    {
                      '@type': 'BallotDefinition.WriteInPosition',
                      Sheet: position.sheetNumber,
                      Side: position.side as Cdf.BallotSideType,
                      // Note that these are in grid coordinates
                      X: position.writeInArea.x,
                      Y: position.writeInArea.y,
                      W: position.writeInArea.width,
                      H: position.writeInArea.height,
                    },
                  ]
                : undefined,
          })
        );
    }

    const contests = getContests({ election: vxfElection, ballotStyle });
    return contests.map(
      (contest): Cdf.OrderedContest => ({
        '@type': 'BallotDefinition.OrderedContest',
        ContestId: contest.id,
        Physical: [
          {
            '@type': 'BallotDefinition.PhysicalContest',
            BallotFormatId: 'ballot-format',
            PhysicalContestOption: getOrderedPhysicalContestOptions(contest),
          },
        ],
      })
    );
  }

  // In order to include contest term descriptions in the CDF, we need to
  // create Office objects, since that's where Terms are defined.
  const offices = vxfElection.contests
    .filter(
      (contest): contest is Vxf.CandidateContest =>
        contest.type === 'candidate' && contest.termDescription !== undefined
    )
    .map(
      (contest): Cdf.Office => ({
        '@type': 'BallotDefinition.Office',
        '@id': officeId(contest.id),
        Name: text(contest.title, 'other'), // Not used, but required
        Term: {
          '@type': 'BallotDefinition.Term',
          Label: assertDefined(contest.termDescription),
        },
      })
    );

  return {
    '@type': 'BallotDefinition.BallotDefinition',

    Office: offices,

    Election: [
      {
        '@type': 'BallotDefinition.Election',
        ElectionScopeId: stateId,
        StartDate: vxfElection.date.toISOString(),
        EndDate: vxfElection.date.toISOString(),
        ExternalIdentifier: [
          {
            '@type': 'BallotDefinition.ExternalIdentifier',
            Type: Cdf.IdentifierType.Other,
            Value: vxfElection.id,
          },
        ],
        Type: vxfElection.type as Cdf.ElectionType,
        Name: text(vxfElection.title, ElectionStringKey.ELECTION_TITLE),

        Candidate: vxfElection.contests
          .filter(
            (contest): contest is Vxf.CandidateContest =>
              contest.type === 'candidate'
          )
          .flatMap((contest) => contest.candidates)
          .map(
            (candidate): Cdf.Candidate => ({
              '@type': 'BallotDefinition.Candidate',
              '@id': candidate.id,
              BallotName: text(candidate.name, [
                ElectionStringKey.CANDIDATE_NAME,
                candidate.id,
              ]),
            })
          ),

        // eslint-disable-next-line array-callback-return
        Contest: vxfElection.contests.map((contest) => {
          switch (contest.type) {
            case 'candidate':
              return {
                '@type': 'BallotDefinition.CandidateContest',
                '@id': contest.id,
                ElectionDistrictId: contest.districtId,
                Name: contest.title,
                BallotTitle: text(contest.title, [
                  ElectionStringKey.CONTEST_TITLE,
                  contest.id,
                ]),
                VotesAllowed: contest.seats,
                ContestOption: [
                  ...contest.candidates.map(
                    (candidate): Cdf.CandidateOption => ({
                      '@type': 'BallotDefinition.CandidateOption',
                      '@id': candidateOptionId(contest.id, candidate.id),
                      CandidateIds: [candidate.id],
                      EndorsementPartyIds: candidate.partyIds,
                    })
                  ),
                  // Create write-in options up to the number of votes allowed
                  ...(contest.allowWriteIns
                    ? naturals()
                        .take(contest.seats)
                        .map(
                          (writeInIndex): Cdf.CandidateOption => ({
                            '@type': 'BallotDefinition.CandidateOption',
                            '@id': writeInOptionId(contest.id, writeInIndex),
                            IsWriteIn: true,
                          })
                        )
                    : []),
                ],
                PrimaryPartyIds: contest.partyId
                  ? [contest.partyId]
                  : undefined,
                OfficeIds: contest.termDescription
                  ? [officeId(contest.id)]
                  : undefined,
              };

            case 'yesno':
              return {
                '@type': 'BallotDefinition.BallotMeasureContest',
                '@id': contest.id,
                ElectionDistrictId: contest.districtId,
                Name: contest.title,
                BallotTitle: text(contest.title, [
                  ElectionStringKey.CONTEST_TITLE,
                  contest.id,
                ]),
                FullText: text(contest.description, [
                  ElectionStringKey.CONTEST_DESCRIPTION,
                  contest.id,
                ]),
                ContestOption: [
                  {
                    '@type': 'BallotDefinition.BallotMeasureOption',
                    '@id': contest.yesOption.id,
                    Selection: text(contest.yesOption.label, [
                      ElectionStringKey.CONTEST_OPTION_LABEL,
                      contest.yesOption.id,
                    ]),
                  },
                  {
                    '@type': 'BallotDefinition.BallotMeasureOption',
                    '@id': contest.noOption.id,
                    Selection: text(contest.noOption.label, [
                      ElectionStringKey.CONTEST_OPTION_LABEL,
                      contest.noOption.id,
                    ]),
                  },
                ],
              };

            /* istanbul ignore next - @preserve */
            default: {
              throwIllegalValue(contest);
            }
          }
        }),

        BallotStyle: vxfElection.ballotStyles.map(
          (ballotStyle): Cdf.BallotStyle => ({
            '@type': 'BallotDefinition.BallotStyle',
            GpUnitIds: precinctsOrSplitsForBallotStyle(ballotStyle),
            PartyIds: ballotStyle.partyId ? [ballotStyle.partyId] : undefined,
            OrderedContent: orderedContentForBallotStyle(ballotStyle),
            // In CDF, ballot styles don't have an id field. I think this might be
            // because each ballot style can be uniquely identified by its
            // GpUnitIds + PartyIds. When multiple ballot styles are used within a
            // precinct (e.g. when there are diff school districts within a
            // precinct), that there should be SplitPrecinct GpUnits to represent
            // that. However, our system currently uses ballot styles with
            // different ids to represent these splits, so as a first pass at
            // compatibility, we add an external identifier to the ballot style
            // and don't use SplitPrecinct GpUnits.
            ExternalIdentifier: [
              {
                '@type': 'BallotDefinition.ExternalIdentifier',
                Type: Cdf.IdentifierType.StateLevel,
                Value: ballotStyle.id,
              },
            ],
            Language: ballotStyle.languages,
          })
        ),
      },
    ],

    Party: vxfElection.parties.map((party) => ({
      '@type': 'BallotDefinition.Party',
      '@id': party.id,
      Name: text(party.fullName, [ElectionStringKey.PARTY_FULL_NAME, party.id]),
      Abbreviation: text(party.abbrev, 'other'),
    })),

    GpUnit: [
      {
        '@type': 'BallotDefinition.ReportingUnit',
        '@id': stateId,
        Name: text(vxfElection.state, ElectionStringKey.STATE_NAME),
        Type: Cdf.ReportingUnitType.State,
        ComposingGpUnitIds: [vxfElection.county.id],
      },
      {
        '@type': 'BallotDefinition.ReportingUnit',
        '@id': vxfElection.county.id,
        Name: text(vxfElection.county.name, ElectionStringKey.COUNTY_NAME),
        Type: Cdf.ReportingUnitType.County,
        ComposingGpUnitIds: vxfElection.districts.map(
          (district) => district.id
        ),
      },
      ...vxfElection.districts.map(
        (district): Cdf.ReportingUnit => ({
          '@type': 'BallotDefinition.ReportingUnit',
          '@id': district.id,
          Name: text(district.name, [
            ElectionStringKey.DISTRICT_NAME,
            district.id,
          ]),
          // Since we represent multiple real-world entities as districts in VXF,
          // we can't know the actual type to use here
          Type: Cdf.ReportingUnitType.Other,
          ComposingGpUnitIds: vxfElection.precincts.flatMap((precinct) =>
            Vxf.hasSplits(precinct)
              ? precinct.splits
                  .filter((split) => split.districtIds.includes(district.id))
                  .map((split) => split.id)
              : precinct.districtIds.includes(district.id)
              ? [precinct.id]
              : []
          ),
        })
      ),
      ...vxfElection.precincts.map(
        (precinct): Cdf.ReportingUnit => ({
          '@type': 'BallotDefinition.ReportingUnit',
          '@id': precinct.id,
          Name: text(precinct.name, [
            ElectionStringKey.PRECINCT_NAME,
            precinct.id,
          ]),
          Type: Cdf.ReportingUnitType.Precinct,
          ComposingGpUnitIds: Vxf.hasSplits(precinct)
            ? precinct.splits.map((split) => split.id)
            : undefined,
        })
      ),
      ...vxfElection.precincts.flatMap((precinct) =>
        Vxf.hasSplits(precinct)
          ? precinct.splits.map(
              (split): Cdf.ReportingUnit => ({
                '@type': 'BallotDefinition.ReportingUnit',
                '@id': split.id,
                // TODO(jonah): Add election string for precinct split names (once we want to actually use them)
                Name: text(split.name, 'other'),
                Type: Cdf.ReportingUnitType.SplitPrecinct,
              })
            )
          : []
      ),
    ],

    BallotFormat: [
      {
        '@type': 'BallotDefinition.BallotFormat',
        '@id': 'ballot-format',
        // For some reason, the CDF schema requires at least one external
        // identifier here
        ExternalIdentifier: [
          {
            '@type': 'BallotDefinition.ExternalIdentifier',
            Type: Cdf.IdentifierType.Other,
            Value: 'ballot-format',
          },
        ],
        MeasurementUnit: Cdf.MeasurementUnitType.In,
        ShortEdge: ballotPaperDimensions(vxfElection.ballotLayout.paperSize)
          .width,
        LongEdge: ballotPaperDimensions(vxfElection.ballotLayout.paperSize)
          .height,
        Orientation: Cdf.OrientationType.Portrait,
        SelectionCaptureMethod: Cdf.SelectionCaptureMethod.Omr,
      },
    ],

    // Since we don't have a generated date in VXF, we use the election date. If
    // we were to use the current date, it would cause changes every time we
    // hash the object. We want hashes to be based on the content of the
    // election, not the date generated.
    GeneratedDate: `${vxfElection.date.toISOString()}T00:00:00Z`,
    Issuer: 'VotingWorks',
    IssuerAbbreviation: 'VX',
    VendorApplicationId: 'VxSuite',
    Version: Cdf.BallotDefinitionVersion.v1_0_0,
    SequenceStart: 1,
    SequenceEnd: 1,
  };
}

export function convertCdfBallotDefinitionToVxfElection(
  cdfBallotDefinition: Cdf.BallotDefinition
): Vxf.Election {
  const election = cdfBallotDefinition.Election[0];
  const gpUnits = cdfBallotDefinition.GpUnit;
  const ballotFormat = cdfBallotDefinition.BallotFormat[0];

  const state = find(
    gpUnits,
    (gpUnit) => gpUnit.Type === Cdf.ReportingUnitType.State
  );
  const county = find(
    gpUnits,
    (gpUnit) => gpUnit.Type === Cdf.ReportingUnitType.County
  );

  // Any GpUnit that is associated with contests is a "district" in VXF
  const districts = getElectionDistricts(cdfBallotDefinition);

  const precincts = gpUnits.filter(
    (gpUnit) => gpUnit.Type === Cdf.ReportingUnitType.Precinct
  );
  const precinctSplits = gpUnits.filter(
    (gpUnit) => gpUnit.Type === Cdf.ReportingUnitType.SplitPrecinct
  );

  function precinctOrSplitIdToPrecinctId(
    precinctOrSplitId: Id
  ): Vxf.PrecinctId {
    return find(
      precincts,
      (precinct) =>
        precinct['@id'] === precinctOrSplitId ||
        Boolean(precinct['ComposingGpUnitIds']?.includes(precinctOrSplitId))
    )['@id'];
  }

  function districtsForPrecinctOrSplit(
    precinctOrSplitId: Id
  ): Vxf.DistrictId[] {
    return districts
      .filter((district) =>
        assertDefined(district.ComposingGpUnitIds).includes(precinctOrSplitId)
      )
      .map((district) => district['@id']);
  }

  function convertOptionId(contestId: Vxf.ContestId, optionId: string): Id {
    const contest = find(election.Contest, (c) => c['@id'] === contestId);
    switch (contest['@type']) {
      case 'BallotDefinition.CandidateContest': {
        const candidateOption = find(
          contest.ContestOption,
          (option) => option['@id'] === optionId
        );
        return assertDefined(candidateOption.CandidateIds)[0];
      }
      case 'BallotDefinition.BallotMeasureContest':
        return optionId;
      /* istanbul ignore next - @preserve */
      default: {
        return throwIllegalValue(contest);
      }
    }
  }

  function parseWriteInIndexFromOptionId(
    contestId: Vxf.ContestId,
    optionId: string
  ): number {
    const match = /^-option-write-in-([0-9]+)$/.exec(
      optionId.replace(contestId, '')
    );
    /* istanbul ignore next - @preserve */
    return safeParseInt(match?.[1]).assertOk(
      `Invalid write-in option id: ${optionId}`
    );
  }

  function englishText(text: Cdf.InternationalizedText): string {
    const content = find(
      text.Text,
      (t) => t.Language === DEFAULT_LANGUAGE_CODE
    ).Content;
    assert(content !== undefined, 'Could not find English text');
    return content;
  }

  return {
    id: assertDefined(election.ExternalIdentifier[0]).Value,
    type: election.Type,
    title: englishText(election.Name),
    state: englishText(state.Name),
    county: {
      id: county['@id'],
      name: englishText(county.Name),
    },
    date: new DateWithoutTime(election.StartDate),
    // CDF doesn't have a seal field, but VXF requires a seal, so we pass in an
    // empty string (a hacky form of "no seal"). While we could change VXF to
    // have an optional seal field, we actually want to require a seal for all
    // elections - this is an edge case due to CDF limitations. This case is
    // handled in the Seal ui component.
    seal: '',

    parties: cdfBallotDefinition.Party.map((party) => ({
      id: party['@id'],
      name: englishText(party.Name),
      fullName: englishText(party.Name),
      abbrev: englishText(party.Abbreviation),
    })),

    contests: election.Contest.map((contest): Vxf.AnyContest => {
      const contestBase = {
        id: contest['@id'],
        title: englishText(contest.BallotTitle),
        districtId: contest.ElectionDistrictId,
      } as const;
      switch (contest['@type']) {
        case 'BallotDefinition.CandidateContest': {
          if (contest.PrimaryPartyIds) {
            assert(contest.PrimaryPartyIds.length === 1);
          }
          return {
            ...contestBase,
            type: 'candidate',
            seats: contest.VotesAllowed,
            allowWriteIns: contest.ContestOption.some(
              (option) => option.IsWriteIn
            ),
            candidates: contest.ContestOption.filter(
              (option) => !option.IsWriteIn
            ).map((option): Vxf.Candidate => {
              const candidate = find(
                assertDefined(election.Candidate),
                (cand) => cand['@id'] === assertDefined(option.CandidateIds)[0]
              );
              return {
                id: candidate['@id'],
                name: englishText(candidate.BallotName),
                // We use CandidateOption.EndorsementPartyIds rather than
                // Candidate.PartyId, since we want to support cases where a
                // candidate is endorsed by multiple parties, and we don't
                // care about the candidate's "home" party.
                partyIds: option.EndorsementPartyIds as Vxf.PartyId[],
              };
            }),
            partyId: contest.PrimaryPartyIds
              ? contest.PrimaryPartyIds[0]
              : undefined,
            termDescription: termDescriptionForContest(
              cdfBallotDefinition,
              contest['@id']
            ),
          };
        }
        case 'BallotDefinition.BallotMeasureContest': {
          // We use option order to determine the "yes" and "no" options.
          // There's no real semantic difference in the eyes of the voting
          // system.
          const [yesOption, noOption] = contest.ContestOption;
          return {
            ...contestBase,
            type: 'yesno',
            description: englishText(contest.FullText),
            yesOption: {
              id: yesOption['@id'],
              label: englishText(yesOption.Selection),
            },
            noOption: {
              id: noOption['@id'],
              label: englishText(noOption.Selection),
            },
          };
        }

        /* istanbul ignore next - @preserve */
        default: {
          throw throwIllegalValue(contest, 'type');
        }
      }
    }),

    districts: districts.map((district) => ({
      id: district['@id'],
      name: englishText(district.Name),
    })),

    precincts: precincts.map((precinct) => {
      const precinctBase = {
        id: precinct['@id'],
        name: englishText(precinct.Name),
      } as const;
      if ((precinct.ComposingGpUnitIds ?? []).length > 0) {
        return {
          ...precinctBase,
          splits: precinctSplits
            .filter(
              (split) => precinct.ComposingGpUnitIds?.includes(split['@id'])
            )
            .map(
              (split): Vxf.PrecinctSplit => ({
                id: split['@id'],
                name: englishText(split.Name),
                districtIds: districtsForPrecinctOrSplit(split['@id']),
              })
            ),
        };
      }
      return {
        ...precinctBase,
        districtIds: districtsForPrecinctOrSplit(precinct['@id']),
      };
    }),

    ballotStyles: election.BallotStyle.map((ballotStyle): Vxf.BallotStyle => {
      // Ballot style GpUnitIds should all be precincts or splits
      assert(
        ballotStyle.GpUnitIds.every((gpUnitId) =>
          [...precincts, ...precinctSplits].some(
            (precinctOrSplit) => precinctOrSplit['@id'] === gpUnitId
          )
        )
      );
      // To find the districts for a ballot style, we look at the associated
      // precincts/splits and find the districts that contain them
      const districtIds = unique(
        ballotStyle.GpUnitIds.flatMap(districtsForPrecinctOrSplit)
      );

      if (ballotStyle.PartyIds) assert(ballotStyle.PartyIds.length <= 1);

      const precinctIds = ballotStyle.GpUnitIds.map(
        precinctOrSplitIdToPrecinctId
      );

      // For now, we expect exactly one external identifier for each ballot
      // style (see comment on BallotStyles in other conversion function for
      // context).
      assert(ballotStyle.ExternalIdentifier.length === 1);

      const ballotStyleId = ballotStyle.ExternalIdentifier[0].Value;

      const idParts = ballotStyleId.split('_');

      // Check if this is a VxDesign formatted Id_LanguageCode Ballot Id.
      // If so extract the group ID from the first part of the Id.
      const useExtractedGroupId =
        ballotStyle.Language &&
        ballotStyle.Language.length === 1 &&
        idParts.length === 2 &&
        idParts[1] === ballotStyle.Language[0];

      // Extract orderedCandidatesByContest from OrderedContent if available
      const orderedCandidatesByContest:
        | Record<Vxf.ContestId, Vxf.OrderedCandidateOption[]>
        | undefined = ballotStyle.OrderedContent
        ? Object.fromEntries(
            ballotStyle.OrderedContent.filter((orderedContest) => {
              const contest = find(
                election.Contest,
                (c) => c['@id'] === orderedContest.ContestId
              );
              return contest['@type'] === 'BallotDefinition.CandidateContest';
            }).map((orderedContest) => {
              const contest = find(
                election.Contest,
                (c) => c['@id'] === orderedContest.ContestId
              ) as Cdf.CandidateContest;
              const candidateOptions =
                orderedContest.Physical[0].PhysicalContestOption.filter(
                  (option) => !option.WriteInPosition
                ).map((option) => {
                  const candidateId = convertOptionId(
                    orderedContest.ContestId,
                    option.ContestOptionId
                  );
                  const contestOption = find(
                    contest.ContestOption,
                    (o) => o['@id'] === option.ContestOptionId
                  );
                  const orderedOption: Vxf.OrderedCandidateOption = {
                    id: candidateId,
                  };
                  // Include partyIds if this represents a cross-endorsed candidate
                  // We will always represent multi-endorsed candidates with a single ordered candidate option
                  // when converting from CDF to VXF
                  if (
                    contestOption.EndorsementPartyIds &&
                    contestOption.EndorsementPartyIds.length > 0
                  ) {
                    orderedOption.partyIds =
                      contestOption.EndorsementPartyIds as Vxf.PartyId[];
                  }
                  return orderedOption;
                });
              return [orderedContest.ContestId, candidateOptions];
            })
          )
        : undefined;

      return {
        id: ballotStyleId,
        groupId: useExtractedGroupId ? idParts[0] : ballotStyleId,
        districts: districtIds,
        precincts: precinctIds,
        partyId: ballotStyle.PartyIds?.[0],
        languages: ballotStyle.Language,
        orderedCandidatesByContest,
      };
    }),

    ballotLayout: {
      paperSize: find(Object.values(Vxf.HmpbBallotPaperSize), (paperSize) => {
        const { width, height } = ballotPaperDimensions(paperSize);
        return (
          width === ballotFormat.ShortEdge && height === ballotFormat.LongEdge
        );
      }),
      metadataEncoding: 'qr-code',
    },

    ballotStrings: extractCdfUiStrings(cdfBallotDefinition),

    gridLayouts: (() => {
      const gridLayouts = election.BallotStyle.filter(
        (ballotStyle) => ballotStyle.OrderedContent !== undefined
      ).map((ballotStyle): Vxf.GridLayout => {
        const orderedContests = assertDefined(ballotStyle.OrderedContent);
        return {
          ballotStyleId: ballotStyle.ExternalIdentifier[0].Value,
          // Since there's no CDF field for this, we set a default based on what
          // generally works well for our HMPBs.
          optionBoundsFromTargetMark: {
            top: 1,
            left: 1,
            right: 9,
            bottom: 1,
          },
          gridPositions: orderedContests.flatMap(
            (orderedContest): Vxf.GridPosition[] => {
              const contest = find(
                election.Contest,
                (c) => c['@id'] === orderedContest.ContestId
              );
              return orderedContest.Physical[0].PhysicalContestOption.map(
                (option): Vxf.GridPosition => {
                  switch (contest['@type']) {
                    case 'BallotDefinition.CandidateContest': {
                      if (option.WriteInPosition) {
                        return {
                          type: 'write-in',
                          contestId: orderedContest.ContestId,
                          sheetNumber: option.OptionPosition[0].Sheet,
                          side: option.OptionPosition[0].Side,
                          column: option.OptionPosition[0].X,
                          row: option.OptionPosition[0].Y,
                          writeInIndex: parseWriteInIndexFromOptionId(
                            orderedContest.ContestId,
                            option.ContestOptionId
                          ),
                          writeInArea: {
                            x: option.WriteInPosition[0].X,
                            y: option.WriteInPosition[0].Y,
                            width: option.WriteInPosition[0].W,
                            height: option.WriteInPosition[0].H,
                          },
                        };
                      }

                      const candidateOption = find(
                        contest.ContestOption,
                        (o) => o['@id'] === option.ContestOptionId
                      );
                      const basePosition: Vxf.GridPositionOption = {
                        type: 'option',
                        contestId: orderedContest.ContestId,
                        sheetNumber: option.OptionPosition[0].Sheet,
                        side: option.OptionPosition[0].Side,
                        column: option.OptionPosition[0].X,
                        row: option.OptionPosition[0].Y,
                        optionId: convertOptionId(
                          orderedContest.ContestId,
                          option.ContestOptionId
                        ),
                      };

                      // Add partyIds if the candidate has endorsements
                      if (
                        candidateOption.EndorsementPartyIds &&
                        candidateOption.EndorsementPartyIds.length > 0
                      ) {
                        return {
                          ...basePosition,
                          partyIds:
                            candidateOption.EndorsementPartyIds as Vxf.PartyId[],
                        };
                      }

                      return basePosition;
                    }

                    case 'BallotDefinition.BallotMeasureContest': {
                      return {
                        type: 'option',
                        contestId: orderedContest.ContestId,
                        sheetNumber: option.OptionPosition[0].Sheet,
                        side: option.OptionPosition[0].Side,
                        column: option.OptionPosition[0].X,
                        row: option.OptionPosition[0].Y,
                        optionId: convertOptionId(
                          orderedContest.ContestId,
                          option.ContestOptionId
                        ),
                      };
                    }

                    /* istanbul ignore next - @preserve */
                    default: {
                      return throwIllegalValue(contest, '@type');
                    }
                  }
                }
              );
            }
          ),
        };
      });
      return gridLayouts.length > 0 ? gridLayouts : undefined;
    })(),
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * The '@id' fields in a CDF ballot definition are required to be globally
 * unique across the entire ballot definition.
 */
function findDuplicateIds(ballotDefinition: Cdf.BallotDefinition): string[] {
  function findIds(value: unknown): string[] {
    if (isPlainObject(value)) {
      const id = value['@id'] as string;
      return (id ? [id] : []).concat(Object.values(value).flatMap(findIds));
    }
    if (isArray(value)) {
      return value.flatMap(findIds);
    }
    return [];
  }
  const allIds = findIds(ballotDefinition);
  return duplicates(allIds);
}

export function safeParseCdfBallotDefinition(value: unknown): Result<
  {
    cdfElection: Cdf.BallotDefinition;
    vxfElection: Vxf.Election;
  },
  Error
> {
  const parseResult = safeParse(Cdf.BallotDefinitionSchema, value);
  if (parseResult.isErr()) return parseResult;
  const ballotDefinition = parseResult.ok();

  const duplicateIds = findDuplicateIds(ballotDefinition);
  if (duplicateIds.length > 0) {
    return err(
      new Error(
        `Ballot definition contains duplicate @ids: ${duplicateIds.join(', ')}`
      )
    );
  }

  try {
    return ok({
      cdfElection: ballotDefinition,
      vxfElection: convertCdfBallotDefinitionToVxfElection(ballotDefinition),
    });
  } catch (error) {
    return wrapException(error);
  }
}
