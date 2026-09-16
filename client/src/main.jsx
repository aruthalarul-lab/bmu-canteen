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
        <div style={{ padding: 40, fontFamily: 'system-ui, sans-serif', maxWidth: 640, margin: '40px auto', textAlign: 'center', background: '#fff', borderRadius: 24, boxShadow: '0 10px 25px rgba(0,0,0,0.05)', border: '1px solid #fee2e2' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🍽️</div>
          <h2 style={{ color: '#991b1b', margin: '0 0 8px 0', fontSize: 22, fontWeight: 800 }}>BMU Canteen - Loading Notice</h2>
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: 12, margin: '16px 0', color: '#b91c1c', fontSize: 13, fontFamily: 'monospace', textAlign: 'left', wordBreak: 'break-all' }}>
            <strong>Error:</strong> {this.state.error?.message || String(this.state.error)}
          </div>
          <p style={{ color: '#94a3b8', fontSize: 11, marginBottom: 20 }}>Build: v1.0.2-live • {new Date().toLocaleTimeString()}</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => {
                try { localStorage.clear(); sessionStorage.clear(); } catch(e) {}
                window.location.href = '/?nocache=' + Date.now();
              }}
              style={{ padding: '12px 24px', borderRadius: 12, background: '#ea580c', color: '#fff', border: 'none', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 12px rgba(234, 88, 12, 0.3)' }}
            >
              Force Clear Cache & Reload
            </button>
            <button
              onClick={() => {
                window.location.href = '/?view=operator';
              }}
              style={{ padding: '12px 20px', borderRadius: 12, background: '#0f172a', color: '#fff', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
            >
              Open Operator Console
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
