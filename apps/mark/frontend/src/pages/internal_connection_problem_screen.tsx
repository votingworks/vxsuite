import {
  Main,
  P,
  PowerDownButton,
  appStrings,
  Screen,
  FullScreenMessage,
} from '@votingworks/ui';

export interface InternalConnectionProblemScreenProps {
  missingBarcode?: boolean;
  missingPatInput?: boolean;
  missingAccessibleController?: boolean;
  isPollWorkerAuth?: boolean;
}

export function InternalConnectionProblemScreen({
  missingBarcode,
  missingPatInput,
  missingAccessibleController,
  isPollWorkerAuth,
}: InternalConnectionProblemScreenProps): JSX.Element {
  return (
    <Screen>
      <Main padded centerChild>
        <FullScreenMessage title={appStrings.titleInternalConnectionProblem()}>
          {missingBarcode && (
            <P>{appStrings.noteBarcodeReaderDisconnected()}</P>
          )}
          {missingPatInput && <P>{appStrings.notePatInputDisconnected()}</P>}
          {missingAccessibleController && (
            <P>{appStrings.noteAccessibleControllerDisconnected()}</P>
          )}
          <P>
            {isPollWorkerAuth ? (
              <PowerDownButton variant="primary" />
            ) : (
              appStrings.instructionsAskForHelp()
            )}
          </P>
        </FullScreenMessage>
      </Main>
    </Screen>
  );
}
