import {
  BallotStyle,
  DistrictId,
  LanguageCode,
  Party,
  PartyId,
} from '@votingworks/types';
import {
  generateBallotStyleId,
  getBallotStyleGroups,
  getDefaultLanguageBallotStyles,
  getRelatedBallotStyle,
} from './ballot_styles';

const GREEN_PARTY: Party = {
  abbrev: 'G',
  fullName: 'The Great Green Party',
  id: 'green-party' as PartyId,
  name: 'Green Party',
};

describe('generateBallotStyleId', () => {
  test('with party ID', () => {
    expect(
      generateBallotStyleId({
        ballotStyleIndex: 3,
        languages: ['en', 'es-US'] as LanguageCode[],
        party: GREEN_PARTY,
      })
    ).toEqual(`3-G_en_es-US`);
  });

  test('without party ID', () => {
    expect(
      generateBallotStyleId({
        ballotStyleIndex: 3,
        languages: ['zh-Hans'] as LanguageCode[],
      })
    ).toEqual('3_zh-Hans');
  });
});

describe('ballot style groups', () => {
  function makeBallotStyle(
    params: Pick<BallotStyle, 'id' | 'languages' | 'partyId'>
  ): BallotStyle {
    return {
      ...params,
      districts: ['district1' as DistrictId],
      precincts: ['precinct1'],
    };
  }

  const style1English = makeBallotStyle({
    id: '1_en',
    languages: [LanguageCode.ENGLISH],
  });

  const style1Spanish = makeBallotStyle({
    id: '1_es-US',
    languages: [LanguageCode.SPANISH],
  });

  const style2GreenEnglish = makeBallotStyle({
    id: '2-G_en',
    languages: [LanguageCode.ENGLISH],
    partyId: 'green-party' as PartyId,
  });

  const style2GreenEnglishMultiLanguage = makeBallotStyle({
    id: '2-G_en_es-US',
    languages: [LanguageCode.ENGLISH, LanguageCode.SPANISH],
    partyId: 'green-party' as PartyId,
  });

  const style2GreenNonEnglishSingleLanguage = makeBallotStyle({
    id: '2-G_zh-Hans',
    languages: [LanguageCode.CHINESE_SIMPLIFIED],
    partyId: 'green-party' as PartyId,
  });

  const style2PurpleEnglish = makeBallotStyle({
    id: '2-P_en',
    languages: [LanguageCode.ENGLISH],
    partyId: 'purple-party' as PartyId,
  });

  const style3LegacySchema = makeBallotStyle({ id: 'ballot-style-3' });

  test('getBallotStyleGroups', () => {
    expect(
      getBallotStyleGroups([
        style1English,
        style1Spanish,
        style2GreenEnglish,
        style2GreenEnglishMultiLanguage,
        style2GreenNonEnglishSingleLanguage,
        style2PurpleEnglish,
        style3LegacySchema,
      ])
    ).toEqual(
      new Map([
        ['1', new Set([style1English, style1Spanish])],
        [
          '2-G',
          new Set([
            style2GreenEnglish,
            style2GreenEnglishMultiLanguage,
            style2GreenNonEnglishSingleLanguage,
          ]),
        ],
        ['2-P', new Set([style2PurpleEnglish])],
        ['ballot-style-3', new Set([style3LegacySchema])],
      ])
    );
  });

  test('getRelatedBallotStyle', () => {
    const ballotStyles = [
      style1English,
      style1Spanish,
      style2GreenEnglish,
      style2GreenEnglishMultiLanguage,
      style2GreenNonEnglishSingleLanguage,
      style2PurpleEnglish,
      style3LegacySchema,
    ];

    expect(
      getRelatedBallotStyle({
        ballotStyles,
        sourceBallotStyleId: style1Spanish.id,
        targetBallotStyleLanguage: LanguageCode.ENGLISH,
      }).unsafeUnwrap()
    ).toEqual(style1English);

    expect(
      getRelatedBallotStyle({
        ballotStyles,
        sourceBallotStyleId: style1English.id,
        targetBallotStyleLanguage: LanguageCode.SPANISH,
      }).unsafeUnwrap()
    ).toEqual(style1Spanish);
  });

  test('getRelatedBallotStyle handles legacy styles', () => {
    expect(
      getRelatedBallotStyle({
        ballotStyles: [style1English, style1Spanish, style3LegacySchema],
        sourceBallotStyleId: style3LegacySchema.id,
        targetBallotStyleLanguage: LanguageCode.SPANISH,
      }).unsafeUnwrap()
    ).toEqual(style3LegacySchema);
  });

  test('getRelatedBallotStyle source style not found', () => {
    expect(
      getRelatedBallotStyle({
        ballotStyles: [style1English],
        sourceBallotStyleId: style2PurpleEnglish.id,
        targetBallotStyleLanguage: LanguageCode.ENGLISH,
      }).err()
    ).toMatch('not found');
  });

  test('getRelatedBallotStyle target style not found', () => {
    expect(
      getRelatedBallotStyle({
        ballotStyles: [style1English],
        sourceBallotStyleId: style1English.id,
        targetBallotStyleLanguage: LanguageCode.SPANISH,
      }).err()
    ).toMatch('not found');
  });

  test('getDefaultLanguageBallotStyles', () => {
    expect(
      getDefaultLanguageBallotStyles([
        style1English,
        style1Spanish,
        style2GreenEnglish,
        style2GreenEnglishMultiLanguage,
        style2GreenNonEnglishSingleLanguage,
        style2PurpleEnglish,
        style3LegacySchema,
      ])
    ).toEqual([
      style1English,
      style2GreenEnglish,
      style2PurpleEnglish,
      style3LegacySchema,
    ]);
  });
});
