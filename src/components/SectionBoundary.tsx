import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

// Scoped error boundary for one widget region of a module (audit D-16). The
// app-level ErrorBoundary (FE-01) is the backstop for everything, but it
// replaces the WHOLE app with a reload screen — so a single malformed authored
// row (quiz_json / lab_config_json) used to white-screen the academy. This
// boundary contains a render throw to the failing activity: the lesson body,
// the other widgets, and navigation keep working, and the fallback names what
// failed. No reload button — the page is healthy; navigating away and back
// remounts (ModuleRenderer's tree is keyed by module.id) and retries naturally.

interface Props {
  /** What the region is, for the fallback copy (e.g. "interactive activity", "quiz"). */
  label: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class SectionBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Most likely a malformed authored row reaching a component that trusts its
    // config shape. Log loudly for local debugging / future error reporting.
    console.error(`Section "${this.props.label}" failed to render:`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="bg-white border border-orange-200 rounded-3xl p-8 shadow-sm text-center space-y-2"
        >
          <AlertTriangle className="w-8 h-8 text-orange-500 mx-auto" aria-hidden="true" />
          <h3 className="font-bold text-gray-800">This {this.props.label} couldn&apos;t load</h3>
          <p className="text-sm text-gray-500">
            Its content may be misconfigured — the rest of the lesson still works. Please report an
            issue if this keeps happening.
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
