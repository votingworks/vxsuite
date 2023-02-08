import { mockOf } from '@votingworks/test-utils';
import { fakeVoice } from '../../test/helpers/fake_voice';
import { getUsEnglishVoice } from './voices';

describe('getUSEnglishVoice', () => {
  it('returns nothing given no voices', () => {
    mockOf(speechSynthesis.getVoices).mockReturnValue([]);

    expect(getUsEnglishVoice()).toBeUndefined();
  });

  it('never returns non-local voices', () => {
    mockOf(speechSynthesis.getVoices).mockReturnValue([
      fakeVoice({ localService: false, name: 'Google US English' }),
    ]);

    expect(getUsEnglishVoice()).toBeUndefined();
  });

  it.each([
    'cmu_us_slt_arctic_hts festival',
    'cmu_us_slt_arctic_clunits festival',
  ])('prefers the CMU voice "%s"', (name) => {
    mockOf(speechSynthesis.getVoices).mockReturnValue([
      // Preferred over default
      fakeVoice({ default: true }),
      // Preferred over US English
      fakeVoice({ name: 'US English' }),
      // Preferred over English
      fakeVoice({ name: 'English' }),
      // Preferred over lang matches
      fakeVoice({ lang: 'en-US' }),
      fakeVoice({ name }),
    ]);

    expect(getUsEnglishVoice()?.name).toEqual(name);
  });

  it('prefers US English to UK English', () => {
    mockOf(speechSynthesis.getVoices).mockReturnValue([
      fakeVoice({ name: 'Google UK English' }),
      fakeVoice({ name: 'Google US English' }),
    ]);

    expect(getUsEnglishVoice()?.name).toEqual('Google US English');
  });

  it('prefers en-US over en', () => {
    mockOf(speechSynthesis.getVoices).mockReturnValue([
      fakeVoice({ lang: 'en' }),
      fakeVoice({ lang: 'en-US' }),
    ]);

    expect(getUsEnglishVoice()?.lang).toEqual('en-US');
  });

  it('prefers en over en-GB', () => {
    mockOf(speechSynthesis.getVoices).mockReturnValue([
      fakeVoice({ lang: 'en-GB' }),
      fakeVoice({ lang: 'en' }),
    ]);

    expect(getUsEnglishVoice()?.lang).toEqual('en');
  });

  it('falls back to the default if there is one', () => {
    mockOf(speechSynthesis.getVoices).mockReturnValue([
      fakeVoice({ lang: 'af', default: false }),
      fakeVoice({ default: true }),
      fakeVoice({ name: 'Google 普通话（中国大陆）', default: false }),
    ]);

    expect(getUsEnglishVoice()?.default).toEqual(true);
  });

  it('falls back to the first one if none match or are the default', () => {
    mockOf(speechSynthesis.getVoices).mockReturnValue([
      fakeVoice({ lang: 'af', default: false }),
      fakeVoice({ name: 'Google 普通话（中国大陆）', default: false }),
    ]);

    expect(getUsEnglishVoice()?.lang).toEqual('af');
  });
});
