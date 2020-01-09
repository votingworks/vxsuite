export default function fakeVoice(
  props: Partial<SpeechSynthesisVoice> = {}
): SpeechSynthesisVoice {
  return {
    default: false,
    lang: '',
    localService: true,
    name: '',
    voiceURI: props.name ?? '',
    ...props,
  }
}
