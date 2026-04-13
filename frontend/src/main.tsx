import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[App crash]', error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', background: '#f8f7f4', padding: '2rem' }}>
          <div style={{ maxWidth: 480, textAlign: 'center' }}>
            <p style={{ fontSize: 36, marginBottom: 12 }}>⚠️</p>
            <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Something went wrong</h1>
            <p style={{ color: '#888', fontSize: 14, marginBottom: 24 }}>The page encountered an error. Please refresh to try again.</p>
            <button onClick={() => { this.setState({ error: null }); window.location.href = '/'; }}
              style={{ background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, cursor: 'pointer' }}>
              Refresh
            </button>
            {process.env.NODE_ENV !== 'production' && (
              <pre style={{ marginTop: 24, textAlign: 'left', fontSize: 11, color: '#555', background: '#eee', padding: 12, borderRadius: 8, overflow: 'auto', maxHeight: 200 }}>
                {this.state.error.message}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
