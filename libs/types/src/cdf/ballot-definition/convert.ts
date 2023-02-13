import {
  assert,
  assertDefined,
  find,
  naturals,
  take,
  throwIllegalValue,
  unique,
} from '@votingworks/basics';
import * as Cdf from '.';
import * as Vxf from '../../election';

export function convertVxfElectionToCdfBallotDefinition(
  vxfElection: Vxf.Election
): Cdf.BallotDefinition {
  function text(content: string): Cdf.InternationalizedText {
    return {
      '@type': 'BallotDefinition.InternationalizedText',
      Text: [
        {
          '@type': 'BallotDefinition.LanguageString',
          Language: 'en',
          Content: content,
        },
      ],
    };
  }

  function dateString(vxDateTimeString: string) {
    const isoString = new Date(vxDateTimeString).toISOString();
    return isoString.split('T')[0];
  }

  function dateTimeString(date: Date) {
    const isoString = date.toISOString();
    // Need to remove fractional seconds to satisfy CDF schema
    return `${isoString.split('.')[0]}Z`;
  }

  const stateId = vxfElection.state.toLowerCase().replaceAll(' ', '-');

  return {
    '@type': 'BallotDefinition.BallotDefinition',

    Election: [
      {
        '@type': 'BallotDefinition.Election',
        ElectionScopeId: stateId,
        StartDate: dateString(vxfElection.date),
        EndDate: dateString(vxfElection.date),
        Type: Cdf.ElectionType.General,
        Name: text(vxfElection.title),

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
              BallotName: text(candidate.name),
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
                BallotTitle: text(contest.title),
                VotesAllowed: contest.seats,
                ContestOption: [
                  ...contest.candidates.map(
                    (candidate): Cdf.CandidateOption => ({
                      '@type': 'BallotDefinition.CandidateOption',
                      '@id': `option-${candidate.id}`,
                      CandidateIds: [candidate.id],
                      EndorsementPartyIds: candidate.partyIds,
                    })
                  ),
                  // Create write-in options up to the number of votes allowed
                  ...(contest.allowWriteIns
                    ? take(contest.seats, naturals()).map(
                        (writeInIndex): Cdf.CandidateOption => ({
                          '@type': 'BallotDefinition.CandidateOption',
                          '@id': `option-write-in-${writeInIndex}`,
                          IsWriteIn: true,
                        })
                      )
                    : []),
                ],
              };

            case 'yesno':
              return {
                '@type': 'BallotDefinition.BallotMeasureContest',
                '@id': contest.id,
                ElectionDistrictId: contest.districtId,
                Name: contest.title,
                BallotTitle: text(contest.title),
                FullText: text(contest.description),
                ContestOption: [
                  {
                    '@type': 'BallotDefinition.BallotMeasureOption',
                    '@id': contest.yesOption?.id ?? 'option-yes',
                    Selection: text(contest.yesOption?.label ?? 'Yes'),
                  },
                  {
                    '@type': 'BallotDefinition.BallotMeasureOption',
                    '@id': contest.noOption?.id ?? 'option-no',
                    Selection: text(contest.noOption?.label ?? 'No'),
                  },
                ],
              };

            /* istanbul ignore next */
            default:
              throwIllegalValue(contest);
          }
        }),

        // TODO Eventually, we might want to list all of the contests included
        // in the ballot style. Currently, our system infers it from the
        // associated precincts' districts.
        BallotStyle: vxfElection.ballotStyles.map(
          (ballotStyle): Cdf.BallotStyle => ({
            '@type': 'BallotDefinition.BallotStyle',
            GpUnitIds: ballotStyle.precincts,
            PartyIds: ballotStyle.partyId ? [ballotStyle.partyId] : undefined,
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
          })
        ),
      },
    ],

    Party: vxfElection.parties.map((party) => ({
      '@type': 'BallotDefinition.Party',
      '@id': party.id,
      Name: text(party.fullName),
      Abbreviation: text(party.abbrev),
      vxBallotLabel: text(party.name),
    })),

    GpUnit: [
      {
        '@type': 'BallotDefinition.ReportingUnit',
        '@id': stateId,
        Name: text(vxfElection.state),
        Type: Cdf.ReportingUnitType.State,
        ComposingGpUnitIds: [vxfElection.county.id],
      },
      {
        '@type': 'BallotDefinition.ReportingUnit',
        '@id': vxfElection.county.id,
        Name: text(vxfElection.county.name),
        Type: Cdf.ReportingUnitType.County,
        ComposingGpUnitIds: vxfElection.districts.map(
          (district) => district.id
        ),
      },
      ...vxfElection.districts.map(
        (district): Cdf.ReportingUnit => ({
          '@type': 'BallotDefinition.ReportingUnit',
          '@id': district.id,
          Name: text(district.name),
          // Since we represent multiple real-world entities as districts in VXF,
          // we can't know the actual type to use here
          Type: Cdf.ReportingUnitType.Other,
          // To figure out which precincts are in this district, we look at the
          // associated ballot styles
          ComposingGpUnitIds: unique(
            vxfElection.ballotStyles
              .filter((ballotStyle) =>
                ballotStyle.districts.includes(district.id)
              )
              .flatMap((ballotStyle) => ballotStyle.precincts)
          ),
        })
      ),
      ...vxfElection.precincts.map(
        (precinct): Cdf.ReportingUnit => ({
          '@type': 'BallotDefinition.ReportingUnit',
          '@id': precinct.id,
          Name: text(precinct.name),
          Type: Cdf.ReportingUnitType.Precinct,
        })
      ),
    ],

    GeneratedDate: dateTimeString(new Date()),
    Issuer: 'VotingWorks',
    IssuerAbbreviation: 'VX',
    VendorApplicationId: 'VxSuite',
    Version: Cdf.BallotDefinitionVersion.v1_0_0,
    SequenceStart: 1,
    SequenceEnd: 1,
  };
}

// TODO Should we make a tighter BallotDefinition type that encodes some of our constraints?
export function convertCdfBallotDefinitionToVxfElection(
  cdfBallotDefinition: Cdf.BallotDefinition
): Vxf.Election {
  assert(cdfBallotDefinition.Election);
  const election = assertDefined(cdfBallotDefinition.Election[0]);
  const gpUnits = assertDefined(cdfBallotDefinition.GpUnit);

  const state = find(
    gpUnits,
    (gpUnit) => gpUnit.Type === Cdf.ReportingUnitType.State
  );
  const county = find(
    gpUnits,
    (gpUnit) => gpUnit.Type === Cdf.ReportingUnitType.County
  );

  // Any GpUnit that is associated with contests is a "district" in VXF
  const districts = gpUnits.filter((gpUnit) =>
    assertDefined(election.Contest).some(
      (contest) => contest.ElectionDistrictId === gpUnit['@id']
    )
  );

  // Any GpUnit that is associated with a ballot style is a "precinct" in VXF
  const precincts = gpUnits.filter((gpUnit) =>
    assertDefined(election.BallotStyle).some((ballotStyle) =>
      assertDefined(ballotStyle.GpUnitIds).includes(gpUnit['@id'])
    )
  );
  // In well-formed CDF, these should all be of type "Precinct" or
  // "SplitPrecinct" (for now though, we don't support SplitPrecinct)
  assert(
    precincts.every(
      (precinct) => precinct.Type === Cdf.ReportingUnitType.Precinct
    )
  );

  function englishText(text: Cdf.InternationalizedText): string {
    const content = find(text.Text, (t) => t.Language === 'en').Content;
    assert(content !== undefined, 'Could not find English text');
    return content;
  }

  return {
    title: englishText(election.Name),
    state: englishText(assertDefined(state.Name)),
    county: {
      id: county['@id'],
      name: englishText(assertDefined(county.Name)),
    },
    date: `${election.StartDate}T00:00:00Z`,

    parties: assertDefined(cdfBallotDefinition.Party).map((party) => {
      assert(party['@type'] === 'BallotDefinition.Party');
      return {
        id: party['@id'] as Vxf.PartyId,
        name: englishText(party.vxBallotLabel),
        fullName: englishText(party.Name),
        abbrev: englishText(assertDefined(party.Abbreviation)),
      };
    }),

    contests: assertDefined(election.Contest).map((contest): Vxf.AnyContest => {
      const contestBase = {
        id: contest['@id'],
        title: englishText(assertDefined(contest.BallotTitle)),
        districtId: contest.ElectionDistrictId as Vxf.DistrictId,
      } as const;
      switch (contest['@type']) {
        case 'BallotDefinition.CandidateContest': {
          return {
            ...contestBase,
            type: 'candidate',
            seats: contest.VotesAllowed,
            allowWriteIns: assertDefined(contest.ContestOption).some(
              (option) => {
                assert(option['@type'] === 'BallotDefinition.CandidateOption');
                return option.IsWriteIn;
              }
            ),
            candidates: assertDefined(contest.ContestOption)
              .filter((option): option is Cdf.CandidateOption => {
                assert(option['@type'] === 'BallotDefinition.CandidateOption');
                return !option.IsWriteIn;
              })
              .map((option): Vxf.Candidate => {
                const candidate = find(
                  assertDefined(election.Candidate),
                  (cand) =>
                    cand['@id'] === assertDefined(option.CandidateIds)[0]
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
          };
        }
        case 'BallotDefinition.BallotMeasureContest': {
          // We use option order to determine the "yes" and "no" options.
          // There's no real semantic difference in the eyes of the voting
          // system.
          const [yesOption, noOption] = assertDefined(contest.ContestOption);
          assert(
            yesOption &&
              yesOption['@type'] === 'BallotDefinition.BallotMeasureOption'
          );
          assert(
            noOption &&
              noOption['@type'] === 'BallotDefinition.BallotMeasureOption'
          );
          return {
            ...contestBase,
            type: 'yesno',
            description: englishText(assertDefined(contest.FullText)),
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

        /* istanbul ignore next */
        default:
          throw new Error(`Unsupported contest type: ${contest['@type']}`);
      }
    }),

    districts: districts.map((district) => ({
      id: district['@id'] as Vxf.DistrictId,
      name: englishText(assertDefined(district.Name)),
    })),

    precincts: precincts.map((precinct) => ({
      id: precinct['@id'],
      name: englishText(assertDefined(precinct.Name)),
    })),

    ballotStyles: assertDefined(election.BallotStyle).map(
      (ballotStyle): Vxf.BallotStyle => {
        // Ballot style GpUnitIds should all be precincts
        assert(
          ballotStyle.GpUnitIds.every((gpUnitId) =>
            precincts.some((precinct) => precinct['@id'] === gpUnitId)
          )
        );
        // To find the districts for a ballot style, we look at the associated
        // precincts and find the districts that contain them
        const ballotStyleDistricts = ballotStyle.GpUnitIds.flatMap(
          (gpUnitId) => {
            return districts.filter((district) =>
              assertDefined(district.ComposingGpUnitIds).includes(gpUnitId)
            );
          }
        );
        const districtIds = unique(
          ballotStyleDistricts.map(
            (district) => district['@id'] as Vxf.DistrictId
          )
        );

        if (ballotStyle.PartyIds) assert(ballotStyle.PartyIds.length <= 1);

        // For now, we expect exactly one external identifier for each ballot
        // style (see comment on BallotStyles in other conversion function for
        // context).
        assert(
          ballotStyle.ExternalIdentifier &&
            ballotStyle.ExternalIdentifier.length === 1
        );

        return {
          id: ballotStyle.ExternalIdentifier[0].Value,
          districts: districtIds,
          precincts: assertDefined(ballotStyle.GpUnitIds),
          partyId: ballotStyle.PartyIds?.[0] as Vxf.PartyId | undefined,
        };
      }
    ),
  };
}
