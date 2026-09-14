import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// Last-resort safety net: without this, ANY uncaught exception anywhere in the render tree
// unmounts the whole React root (default React 18 behavior with no boundary), leaving nothing
// behind but the near-black `body` background (#07050b, see App.css) — a silent "black screen"
// with no way back except a manual page reload the player wouldn't know to try. Deliberately
// self-contained (inline styles, hardcoded PT text, no dependency on locales/App.css/game state)
// so the fallback itself can't fail for the same reason the original crash did.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Uncaught error — showing fallback screen instead of a blank one.', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        onClick={() => window.location.reload()}
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          background: '#07050b',
          color: '#f5e9c8',
          fontFamily: 'Arial, sans-serif',
          textAlign: 'center',
          padding: 24,
          cursor: 'pointer',
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 'bold' }}>Algo deu errado</div>
        <div style={{ fontSize: 14, opacity: 0.8, maxWidth: 280 }}>
          Toque em qualquer lugar da tela pra recarregar o jogo.
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: 8,
            padding: '10px 22px',
            fontSize: 14,
            fontWeight: 'bold',
            color: '#1a1108',
            background: '#ffd76a',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          Recarregar
        </button>
      </div>
    );
  }
}
