/* eslint-disable react/sort-comp */
import React from 'react';
import { Text, Screen, Main, Prose } from '@votingworks/ui';

// eslint-disable-next-line @typescript-eslint/ban-types
type Props = React.PropsWithChildren<{}>;

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
  }

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('Error boundary caught error:', error, errorInfo);
  }

  // Catch unhandled promise rejections (e.g. from event handlers and other
  // async code). While this will work in production, it will *not* work in
  // tests due to the way that jest sets up the testing environment (there is no
  // known workaround), which leads to serious pain when debugging tests. So we
  // should still be dilligent about avoiding unhandled promise rejections at
  // the source.
  /* istanbul ignore next */
  handleUnhandledRejection(event: PromiseRejectionEvent): void {
    // eslint-disable-next-line no-console
    console.error(
      'Error boundary caught unhandled promise rejection:',
      event.reason
    );
    this.setState({ error: event.reason });
  }
  componentWillUnmount(): void {
    window.removeEventListener(
      'unhandledrejection',
      this.handleUnhandledRejection
    );
  }
  componentDidMount(): void {
    window.addEventListener(
      'unhandledrejection',
      this.handleUnhandledRejection
    );
  }

  render(): React.ReactNode {
    const { error } = this.state;
    if (error) {
      return (
        <Screen>
          <Main centerChild>
            <Prose textCenter>
              <h1>Something went wrong</h1>
              <Text>
                Ask a poll worker to restart the ballot marking device.
              </Text>
            </Prose>
          </Main>
        </Screen>
      );
    }

    const { children } = this.props;
    return children;
  }
}
