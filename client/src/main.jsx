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
    console.error("App Crash caught by ErrorBoundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, fontFamily: 'system-ui, sans-serif', maxWidth: 600, margin: '40px auto', textAlign: 'center', background: '#fff', borderRadius: 24, boxShadow: '0 10px 25px rgba(0,0,0,0.05)', border: '1px solid #fee2e2' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🍽️</div>
          <h2 style={{ color: '#991b1b', margin: '0 0 8px 0', fontSize: 20, fontWeight: 800 }}>BMU Canteen - Loading Notice</h2>
          <p style={{ color: '#64748b', fontSize: 14 }}>{this.state.error?.message || 'A browser state issue occurred.'}</p>
          <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button
              onClick={() => {
                try { localStorage.clear(); } catch(e) {}
                window.location.href = '/';
              }}
              style={{ padding: '10px 20px', borderRadius: 12, background: '#ea580c', color: '#fff', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
            >
              Reset Cache & Reload
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{ padding: '10px 20px', borderRadius: 12, background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', fontWeight: 'bold', cursor: 'pointer' }}
            >
              Refresh
            </button>
          </div>
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
