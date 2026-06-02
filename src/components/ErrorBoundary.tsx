import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

// Top-level error boundary (DEBT FE-01). Without one, any uncaught error in
// render unmounts the whole tree to a blank white screen with no recovery. This
// catches render-time throws below it and shows a recoverable fallback. The
// app's existing loading/error states only cover async fetches, not render
// throws — this is the backstop for those (e.g. a malformed module payload).

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface to the console for local debugging / log capture. A real error
    // reporter (Sentry, etc.) would hook in here.
    console.error('Unhandled render error:', error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div
          className="min-h-screen bg-nava-sand flex items-center justify-center p-6"
          role="alert"
        >
          <div className="max-w-md text-center space-y-4">
            <AlertTriangle className="w-10 h-10 text-orange-500 mx-auto" aria-hidden="true" />
            <h1 className="text-xl font-bold text-nava-plum">Something went wrong</h1>
            <p className="text-gray-700 font-medium">
              The app hit an unexpected error. Reloading usually fixes it. If it keeps
              happening, please report an issue.
            </p>
            <button
              onClick={this.handleReload}
              className="px-6 py-2.5 bg-nava-green hover:bg-nava-plum text-white rounded-xl font-bold transition-all"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
