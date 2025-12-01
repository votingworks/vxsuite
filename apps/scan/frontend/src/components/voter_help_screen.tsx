import {
  appStrings,
  VoterHelpScreen as VoterHelpScreenBase,
  VoterHelpScreenH2 as H2,
  VoterHelpScreenH3 as H3,
  VoterHelpScreenP as P,
} from '@votingworks/ui';

export function VoterHelpScreen({
  onClose,
}: {
  onClose: () => void;
}): JSX.Element {
  return (
    // TODO: Check whether the accessible input is a tactile controller vs. a PAT device and only
    // make the scroll buttons focusable when using a PAT device
    <VoterHelpScreenBase scrollButtonsFocusable onClose={onClose}>
      <H2>{appStrings.voterHelpScreenHeadingInsertBallotScreen()}</H2>
      <P>{appStrings.voterHelpScreenContentInsertBallotScreen()}</P>
      <P>{appStrings.voterHelpScreenContentChangeSettings()}</P>

      <H2>{appStrings.voterHelpScreenHeadingSettingsScreen()}</H2>
      <P>{appStrings.voterHelpScreenContentSettingsScreen()}</P>
      <P>{appStrings.voterHelpScreenContentSettingsScreenResetAndDone()}</P>

      <H3>{appStrings.voterHelpScreenHeadingColor()}</H3>
      <P>{appStrings.voterHelpScreenContentColorScan()}</P>

      <H3>{appStrings.voterHelpScreenHeadingTextSize()}</H3>
      <P>{appStrings.voterHelpScreenContentTextSizeScan()}</P>

      <H3>{appStrings.voterHelpScreenHeadingAudio()}</H3>
      <P>{appStrings.voterHelpScreenContentAudio()}</P>

      <H3>{appStrings.voterHelpScreenHeadingAudioOnlyMode()}</H3>
      <P>{appStrings.voterHelpScreenContentAudioOnlyMode()}</P>

      <H2>{appStrings.voterHelpScreenHeadingBallotReviewScreens()}</H2>

      <H3>{appStrings.voterHelpScreenHeadingBlankBallotScreen()}</H3>
      <P>{appStrings.voterHelpScreenContentBlankBallotScreen()}</P>

      <H3>{appStrings.voterHelpScreenHeadingMisvoteScreen()}</H3>
      <P>{appStrings.voterHelpScreenContentMisvoteScreen()}</P>
    </VoterHelpScreenBase>
  );
}
