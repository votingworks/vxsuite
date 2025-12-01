/* eslint-disable react/sort-comp */
import React, { useEffect } from 'react';
import { LogEventId, BaseLogger } from '@votingworks/logging';
import { extractErrorMessage } from '@votingworks/basics';
import styled from 'styled-components';
import { Screen } from './screen';
import { Main } from './main';
import { Caption, H1, P } from './typography';

type Props = React.PropsWithChildren<{
  errorMessage:
    | React.ReactNode
    | (({ error }: { error: unknown }) => React.ReactNode);
  logger?: BaseLogger;
}>;

interface State {
  error?: unknown;
}

/**
 * A React error boundary component that catches any errors that occur in its
 * children. Note that may only be used to catch errors that occur in the render
 * phase of the React lifecycle. It should not be used to catch errors that
 * occur in event handlers or other async code, which should still use
 * try/catch.
 *
 * The one exception is errors that occur in react-query hooks, which may be
 * propagated to the error boundary using the `useErrorBoundary` setting.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {};

    // Non-React-lifecycle methods are not automatically bound
    this.handleUnhandledRejection = this.handleUnhandledRejection.bind(this);
  }

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo): void {
    const { logger } = this.props;

    // eslint-disable-next-line no-console
    console.error('Error boundary caught error:', error, errorInfo);

    logger?.log(LogEventId.UnknownError, 'system', {
      message: extractErrorMessage(error),
      stack: error instanceof Error ? error.stack : undefined,
      disposition: 'failure',
    });
  }

  // Catch unhandled promise rejections (e.g. from event handlers and other
  // async code). While this will work in production, it will *not* work in
  // tests due to the way that jest sets up the testing environment (there is no
  // known workaround), which leads to serious pain when debugging tests. So we
  // should still be diligent about avoiding unhandled promise rejections at
  // the source.
  /* istanbul ignore next - @preserve */
  handleUnhandledRejection(event: PromiseRejectionEvent): void {
    const { logger } = this.props;
    const error: unknown = event.reason;

    // eslint-disable-next-line no-console
    console.error('Error boundary caught unhandled promise rejection:', error);

    logger?.log(LogEventId.UnknownError, 'system', {
      errorMessage: extractErrorMessage(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    });

    this.setState({ error });
  }

  componentDidMount(): void {
    window.addEventListener(
      'unhandledrejection',
      this.handleUnhandledRejection
    );
  }

  componentWillUnmount(): void {
    window.removeEventListener(
      'unhandledrejection',
      this.handleUnhandledRejection
    );
  }

  render(): React.ReactNode {
    const { error } = this.state;
    const { errorMessage, children } = this.props;
    const errorMessageString =
      typeof errorMessage === 'function'
        ? errorMessage({ error })
        : errorMessage;
    if (error) {
      return (
        <Screen>
          <Main centerChild>{errorMessageString}</Main>
        </Screen>
      );
    }

    return children;
  }
}

function TestErrorMessage({ error }: { error: unknown }): React.ReactNode {
  return (
    <React.Fragment>
      Test Error Boundary
      {error ? <pre>{(error as Error).toString()}</pre> : undefined}
    </React.Fragment>
  );
}

/**
 * An error boundary designed to be used in tests. It shows the error message
 * from the caught error to aid in debugging.
 */
export function TestErrorBoundary({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <ErrorBoundary errorMessage={TestErrorMessage}>{children}</ErrorBoundary>
  );
}

export const ERROR_SCREEN_MESSAGES = {
  RESTART: 'Please restart the machine.',
  REACH_OUT:
    'If problems persist after restarting, ask your election official to contact VotingWorks support.',
} as const;

type AutoRestartInSeconds = 10 | 600;

const ErrorScreenContainer = styled.div`
  display: flex;
  flex-direction: column;
  padding: 0.5rem;
`;

function ErrorScreen({
  autoRestartInSeconds,
  logger,
  primaryMessage,
  secondaryMessage,
}: {
  autoRestartInSeconds?: AutoRestartInSeconds;
  logger?: BaseLogger;
  primaryMessage?: React.ReactNode;
  secondaryMessage?: React.ReactNode;
}): JSX.Element {
  useEffect(() => {
    let timeoutId: number | undefined;
    if (
      // Don't auto-restart in development as doing so is disruptive
      process.env.NODE_ENV !== 'development' &&
      autoRestartInSeconds !== undefined
    ) {
      timeoutId = window.setTimeout(async () => {
        logger?.log(LogEventId.RebootMachine, 'system', {
          message: `Automatic restart initiated after waiting ${autoRestartInSeconds} seconds`,
        });
        // Use kiosk-browser rather than a backend system call to reboot as the backend may have
        // crashed if we've reached this screen
        await window.kiosk?.reboot();
      }, autoRestartInSeconds * 1000);
    }
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [autoRestartInSeconds, logger]);

  return (
    <ErrorScreenContainer>
      <H1 align="center">Something went wrong</H1>
      <P align="center">{primaryMessage}</P>
      {secondaryMessage && <Caption align="center">{secondaryMessage}</Caption>}
    </ErrorScreenContainer>
  );
}

/**
 * Error boundary for use in embedded apps.
 */
export function AppErrorBoundary({
  autoRestartInSeconds,
  children,
  logger,
  primaryMessage = ERROR_SCREEN_MESSAGES.RESTART,
  secondaryMessage = ERROR_SCREEN_MESSAGES.REACH_OUT,
}: {
  autoRestartInSeconds?: AutoRestartInSeconds;
  children: React.ReactNode;
  logger?: BaseLogger;
  primaryMessage?: React.ReactNode;
  secondaryMessage?: React.ReactNode;
}): JSX.Element {
  return (
    <ErrorBoundary
      errorMessage={
        <ErrorScreen
          autoRestartInSeconds={autoRestartInSeconds}
          logger={logger}
          primaryMessage={primaryMessage}
          secondaryMessage={secondaryMessage}
        />
      }
      logger={logger}
    >
      {children}
    </ErrorBoundary>
  );
}
