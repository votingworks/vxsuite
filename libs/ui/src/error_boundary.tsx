/* eslint-disable react/sort-comp */
import React from 'react';
import { LogEventId, BaseLogger } from '@votingworks/logging';
import { extractErrorMessage } from '@votingworks/basics';
import { Screen } from './screen';
import { Main } from './main';
import { H1, P } from './typography';

type Props = React.PropsWithChildren<{
  errorMessage: React.ReactNode | ((error: unknown) => React.ReactNode);
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

  async componentDidCatch(
    error: unknown,
    errorInfo: React.ErrorInfo
  ): Promise<void> {
    const { logger } = this.props;

    // eslint-disable-next-line no-console
    console.error('Error boundary caught error:', error, errorInfo);

    await logger?.log(LogEventId.UnknownError, 'system', {
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
  /* istanbul ignore next */
  async handleUnhandledRejection(event: PromiseRejectionEvent): Promise<void> {
    const { logger } = this.props;
    const error: unknown = event.reason;

    // eslint-disable-next-line no-console
    console.error('Error boundary caught unhandled promise rejection:', error);

    await logger?.log(LogEventId.UnknownError, 'system', {
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
      typeof errorMessage === 'function' ? errorMessage(error) : errorMessage;
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
    <ErrorBoundary
      // eslint-disable-next-line react/no-unstable-nested-components
      errorMessage={(error) => (
        <React.Fragment>
          Test Error Boundary
          {error ? <pre>{(error as Error).toString()}</pre> : undefined}
        </React.Fragment>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

/**
 * Error boundary for use in embedded apps. It shows a prompt to restart and,
 * optionally, a button to restart. The restart button requires the API to work,
 * so it should only be included if the API providers enclose the error boundary.
 */
export function AppErrorBoundary({
  children,
  restartMessage,
  logger,
}: {
  children: React.ReactNode;
  restartMessage: React.ReactNode;
  logger?: BaseLogger;
}): JSX.Element {
  return (
    <ErrorBoundary
      errorMessage={
        <React.Fragment>
          <H1>Something went wrong</H1>
          <P>{restartMessage}</P>
        </React.Fragment>
      }
      logger={logger}
    >
      {children}
    </ErrorBoundary>
  );
}
