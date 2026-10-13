import { Component, ErrorInfo, ReactNode } from 'react';
import { buildErrorReport, copyText, recordError } from '../lib/errorLog';
import { t } from '../locales';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  copied: boolean;
}

// The texts live in the locale files (errorReport.boundary*); the English/Portuguese fallbacks below only apply if the locale lookup itself is what
// crashed (t() returns '' for a missing key and could throw on a broken storage), so the fallback screen never depends on it.
function text(key: string, fallback: string): string {
  try {
    return t(key) || fallback;
  } catch {
    return fallback;
  }
}

// Last-resort safety net: without this, ANY uncaught exception anywhere in the render tree
// unmounts the whole React root (default React 18 behavior with no boundary), leaving nothing
// behind but the near-black `body` background (#07050b, see App.css) — a silent "black screen"
// with no way back except a manual page reload the player wouldn't know to try. Deliberately
// self-contained (inline styles, no dependency on App.css/game state) so the fallback itself
// can't fail for the same reason the original crash did. The crash is also written to the same
// local error ring buffer as uncaught errors (src/lib/errorLog.ts), and the screen offers to
// copy that report so the player can paste it to support.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, copied: false };

  static getDerivedStateFromError(): State {
    return { hasError: true, copied: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Uncaught error — showing fallback screen instead of a blank one.', error, info);
    recordError('boundary', error, info.componentStack ?? '');
  }

  copyReport = async () => {
    const ok = await copyText(buildErrorReport());
    this.setState({ copied: ok });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    const button = {
      marginTop: 8,
      padding: '10px 22px',
      fontSize: 14,
      fontWeight: 'bold',
      border: 'none',
      borderRadius: 8,
      cursor: 'pointer',
    } as const;
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
        <div style={{ fontSize: 20, fontWeight: 'bold' }}>{text('errorReport.boundaryTitle', 'Algo deu errado')}</div>
        <div style={{ fontSize: 14, opacity: 0.8, maxWidth: 280 }}>{text('errorReport.boundaryHint', 'Toque em qualquer lugar da tela pra recarregar o jogo.')}</div>
        <button onClick={() => window.location.reload()} style={{ ...button, color: '#1a1108', background: '#ffd76a' }}>
          {text('errorReport.boundaryReload', 'Recarregar')}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation(); // copying must not reload the page
            void this.copyReport();
          }}
          style={{ ...button, color: '#f5e9c8', background: 'transparent', border: '1px solid #f5e9c8', fontWeight: 'normal' }}
        >
          {this.state.copied ? text('errorReport.copied', 'Relatório copiado.') : text('errorReport.copy', 'Copiar relatório de erro')}
        </button>
      </div>
    );
  }
}
