'use client';

import { Component, ReactNode } from 'react';

interface Props {
  /** Human-readable name of the view (shown in the fallback UI). */
  viewName: string;
  /** Title to re-apply on render so we don't degrade to bare hostname. */
  title?: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ViewErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error(`[${this.props.viewName}] view crashed:`, error, info);
  }

  componentDidMount() {
    if (this.props.title && typeof document !== 'undefined') {
      document.title = this.props.title;
    }
  }

  componentDidUpdate() {
    if (this.props.title && typeof document !== 'undefined') {
      document.title = this.props.title;
    }
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="bg-white rounded-lg border border-red-200 p-6">
          <div className="flex items-start gap-3">
            <div className="text-red-600 text-xl">⚠️</div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">
                {this.props.viewName} failed to render
              </h2>
              <p className="text-sm text-gray-600 mb-3">
                Something went wrong loading this view. Other views still work.
              </p>
              <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-2 mb-3 overflow-x-auto">
                {this.state.error.message}
              </pre>
              <button
                onClick={this.reset}
                className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                Reload this view
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
