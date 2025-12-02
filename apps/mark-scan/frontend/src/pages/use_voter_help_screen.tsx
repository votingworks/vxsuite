import React from 'react';
import {
  VoterHelpScreenProps,
  VoterHelpScreenType,
} from '@votingworks/mark-flow-ui';
import {
  appStrings,
  VoterHelpScreen,
  VoterHelpScreenH2 as H2,
  VoterHelpScreenH3 as H3,
  VoterHelpScreenP as P,
} from '@votingworks/ui';

import { getIsPatDeviceConnected, getSystemSettings } from '../api';

type ScreenType =
  | 'StartScreen'
  | 'ContestScreen'
  | 'PrePrintReviewScreen'
  | 'ContestReviewScreen'
  | 'PostPrintReviewScreen';

const VoterHelpScreens: Record<ScreenType, VoterHelpScreenType> = {
  StartScreen: StartScreenVoterHelpScreen,
  ContestScreen: ContestScreenVoterHelpScreen,
  PrePrintReviewScreen: PrePrintReviewScreenVoterHelpScreen,
  ContestReviewScreen: ContestReviewScreenVoterHelpScreen,
  PostPrintReviewScreen: PostPrintReviewScreenVoterHelpScreen,
};

export function useVoterHelpScreen(
  screenType: ScreenType
): VoterHelpScreenType | undefined {
  const getSystemSettingsQuery = getSystemSettings.useQuery();
  if (!getSystemSettingsQuery.isSuccess) {
    return undefined;
  }

  const { disableVoterHelpButtons } = getSystemSettingsQuery.data;
  return disableVoterHelpButtons ? undefined : VoterHelpScreens[screenType];
}

function StartScreenVoterHelpScreen(props: VoterHelpScreenProps): JSX.Element {
  return (
    <MarkScanVoterHelpScreen {...props}>
      <H2>{appStrings.voterHelpScreenHeadingStartScreen()}</H2>
      <P>{appStrings.voterHelpScreenContentStartScreen()}</P>
      <P>{appStrings.voterHelpScreenContentChangeSettings()}</P>
    </MarkScanVoterHelpScreen>
  );
}

function ContestScreenVoterHelpScreen(
  props: VoterHelpScreenProps
): JSX.Element {
  return (
    <MarkScanVoterHelpScreen {...props}>
      <H2>{appStrings.voterHelpScreenHeadingContestScreen()}</H2>
      <P>{appStrings.voterHelpScreenContentContestScreenAddVote()}</P>
      <P>{appStrings.voterHelpScreenContentContestScreenRemoveVote()}</P>
      <P>{appStrings.voterHelpScreenContentContestScreenNext()}</P>
      <P>{appStrings.voterHelpScreenContentContestScreenBack()}</P>
      <P>{appStrings.voterHelpScreenContentChangeSettings()}</P>

      <H2>{appStrings.voterHelpScreenHeadingWriteInScreen()}</H2>
      <P>{appStrings.voterHelpScreenContentWriteInScreen()}</P>
      <P>{appStrings.voterHelpScreenContentWriteInScreenDone()}</P>
    </MarkScanVoterHelpScreen>
  );
}

function PrePrintReviewScreenVoterHelpScreen(
  props: VoterHelpScreenProps
): JSX.Element {
  return (
    <MarkScanVoterHelpScreen {...props}>
      <H2>{appStrings.voterHelpScreenHeadingPrePrintReviewScreen()}</H2>
      <P>{appStrings.voterHelpScreenContentPrePrintReviewScreen()}</P>
      <P>{appStrings.voterHelpScreenContentPrePrintReviewScreenEdit()}</P>
      <P>{appStrings.voterHelpScreenContentPrePrintReviewScreenDone()}</P>
      <P>{appStrings.voterHelpScreenContentChangeSettings()}</P>
    </MarkScanVoterHelpScreen>
  );
}

function ContestReviewScreenVoterHelpScreen(
  props: VoterHelpScreenProps
): JSX.Element {
  return (
    <MarkScanVoterHelpScreen {...props}>
      <H2>{appStrings.voterHelpScreenHeadingContestReviewScreen()}</H2>
      <P>{appStrings.voterHelpScreenContentContestScreenAddVote()}</P>
      <P>{appStrings.voterHelpScreenContentContestScreenRemoveVote()}</P>
      <P>{appStrings.voterHelpScreenContentContestReviewScreenReturn()}</P>
      <P>{appStrings.voterHelpScreenContentChangeSettings()}</P>

      <H2>{appStrings.voterHelpScreenHeadingWriteInScreen()}</H2>
      <P>{appStrings.voterHelpScreenContentWriteInScreen()}</P>
      <P>{appStrings.voterHelpScreenContentWriteInScreenDone()}</P>
    </MarkScanVoterHelpScreen>
  );
}

function PostPrintReviewScreenVoterHelpScreen(
  props: VoterHelpScreenProps
): JSX.Element {
  return (
    <MarkScanVoterHelpScreen {...props}>
      <H2>{appStrings.voterHelpScreenHeadingPostPrintReviewScreen()}</H2>
      <P>{appStrings.voterHelpScreenContentPostPrintReviewScreenPaper()}</P>
      <P>{appStrings.voterHelpScreenContentPostPrintReviewScreenDigital()}</P>
      <P>{appStrings.voterHelpScreenContentPostPrintReviewScreenCast()}</P>
      <P>{appStrings.voterHelpScreenContentPostPrintReviewScreenSpoil()}</P>
      <P>{appStrings.voterHelpScreenContentChangeSettings()}</P>
    </MarkScanVoterHelpScreen>
  );
}

function MarkScanVoterHelpScreen({
  onClose,
  children,
}: VoterHelpScreenProps & {
  children: React.ReactNode;
}): JSX.Element {
  const isPatDeviceConnected = Boolean(getIsPatDeviceConnected.useQuery().data);

  return (
    <VoterHelpScreen
      onClose={onClose}
      scrollButtonsFocusable={isPatDeviceConnected}
    >
      {children}

      {/* Common content below */}

      <H2>{appStrings.voterHelpScreenHeadingBallotLanguageScreen()}</H2>
      <P>{appStrings.voterHelpScreenContentBallotLanguageScreen()}</P>
      <P>{appStrings.voterHelpScreenContentBallotLanguageScreenDone()}</P>

      <H2>{appStrings.voterHelpScreenHeadingSettingsScreen()}</H2>
      <P>{appStrings.voterHelpScreenContentSettingsScreen()}</P>
      <P>{appStrings.voterHelpScreenContentSettingsScreenResetAndDone()}</P>

      <H3>{appStrings.voterHelpScreenHeadingColor()}</H3>
      <P>{appStrings.voterHelpScreenContentColor()}</P>

      <H3>{appStrings.voterHelpScreenHeadingTextSize()}</H3>
      <P>{appStrings.voterHelpScreenContentTextSize()}</P>

      <H3>{appStrings.voterHelpScreenHeadingAudio()}</H3>
      <P>{appStrings.voterHelpScreenContentAudio()}</P>

      <H3>{appStrings.voterHelpScreenHeadingAudioOnlyMode()}</H3>
      <P>{appStrings.voterHelpScreenContentAudioOnlyMode()}</P>
    </VoterHelpScreen>
  );
}
