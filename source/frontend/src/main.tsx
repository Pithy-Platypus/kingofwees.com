import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { createReporter, rootErrorHandlers, sendDiagnostic, watchErrors } from './diagnostics.ts';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import { LocaleProvider } from './i18n/LocaleProvider.tsx';
import { resolveLocale } from './i18n/locale.ts';
import { getReporterKey } from './king/reporter.ts';

function browserStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

const report = createReporter(sendDiagnostic, window.location, import.meta.env.VITE_APP_VERSION);
watchErrors(window, report);

createRoot(document.getElementById('root')!, rootErrorHandlers(report)).render(
  <StrictMode>
    <LocaleProvider locale={resolveLocale(window.location.search, navigator.languages)}>
      <ErrorBoundary onReload={() => window.location.reload()}>
        <App reporterKey={getReporterKey(browserStorage())} storage={browserStorage()} geolocation={navigator.geolocation} />
      </ErrorBoundary>
    </LocaleProvider>
  </StrictMode>,
);
