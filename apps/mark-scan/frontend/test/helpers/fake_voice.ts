export function fakeVoice(
  props: Partial<SpeechSynthesisVoice> = {}
): SpeechSynthesisVoice {
  return {
    default: false,
    lang: '',
    localService: true,
    name: '',
    // This is a property on a native interface that we don't control.
    // eslint-disable-next-line vx/gts-identifiers
    voiceURI: props.name ?? '',
    ...props,
  };
}
