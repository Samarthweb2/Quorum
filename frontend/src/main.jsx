import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('Quorum UI Error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, fontFamily: 'sans-serif', background: '#0D0D0D', color: '#EDEDED', minHeight: '100vh' }}>
          <h2 style={{ color: '#EF4444', marginBottom: 12 }}>Quorum Frontend Error Encountered</h2>
          <p style={{ color: '#A0A0A0', marginBottom: 20 }}>An unexpected error prevented the dashboard from rendering:</p>
          <pre style={{ background: '#18181A', border: '1px solid #26262A', padding: 16, borderRadius: 8, color: '#F87171', overflowX: 'auto', fontSize: 13 }}>
            {this.state.error?.stack || this.state.error?.toString()}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 20, padding: '10px 20px', background: '#EDEDED', color: '#0D0D0D', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}
          >
            Reload Dashboard
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
