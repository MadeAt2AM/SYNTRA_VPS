import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Top-level error boundary. Catches unhandled render errors in the React
 * tree and shows a friendly message + reload button instead of leaving the
 * user with a blank white screen.
 *
 * The most common cause of a blank page is a runtime error during route
 * rendering — this boundary converts that into a visible, actionable error.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log to console for debugging; in production this could be wired to
    // Sentry / Logtail / etc.
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleReload = () => {
    // Hard reload — drops any potentially-stuck state.
    window.location.reload();
  };

  handleClearAndReload = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // ignore
    }
    window.location.href = "/";
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          backgroundColor: "#fafafa",
          fontFamily:
            "Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: 480,
            width: "100%",
            padding: "2rem",
            backgroundColor: "#ffffff",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              backgroundColor: "#e11d48",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 18,
              marginBottom: 16,
            }}
          >
            SY
          </div>
          <h1
            style={{
              fontSize: 20,
              fontWeight: 700,
              margin: "0 0 8px",
              color: "#111",
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              color: "#555",
              margin: "0 0 16px",
            }}
          >
            The page failed to render. This is usually caused by a stale
            cached token or a temporary network hiccup.
          </p>
          {this.state.error && (
            <pre
              style={{
                fontSize: 11,
                color: "#888",
                backgroundColor: "#f5f5f5",
                padding: 12,
                borderRadius: 8,
                overflowX: "auto",
                margin: "0 0 16px",
                maxHeight: 120,
              }}
            >
              {this.state.error.message}
            </pre>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={this.handleReload}
              style={{
                flex: 1,
                height: 40,
                backgroundColor: "#e11d48",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontWeight: 600,
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              Reload page
            </button>
            <button
              onClick={this.handleClearAndReload}
              style={{
                flex: 1,
                height: 40,
                backgroundColor: "#fff",
                color: "#111",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                fontWeight: 600,
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              Clear cache & retry
            </button>
          </div>
        </div>
      </div>
    );
  }
}