import React from 'react';

interface Props {
  children: React.ReactNode;
  /** Shown in the fallback so the user knows which screen failed. */
  screenName?: string;
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', this.props.screenName ?? 'unknown screen', error, info.componentStack);
  }

  private handleReset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div role="alert" className="m-6 rounded-2xl border border-danger/20 bg-danger-bg p-6">
        <h2 className="mb-1 text-[14px] font-bold text-navy-900">
          {this.props.screenName
            ? `${this.props.screenName} could not be displayed`
            : 'This screen could not be displayed'}
        </h2>
        <p className="mb-4 text-[12px] leading-relaxed text-gray-600">
          The rest of the application is unaffected — you can navigate elsewhere, or try this screen again.
        </p>
        <pre className="mb-4 max-h-40 overflow-auto rounded-lg bg-white/60 p-3 font-mono text-[11px] text-gray-700">
          {error.message}
        </pre>
        <button
          type="button"
          onClick={this.handleReset}
          className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700"
        >
          Try again
        </button>
      </div>
    );
  }
}
