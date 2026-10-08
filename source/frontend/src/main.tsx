import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocaleProvider locale={resolveLocale(window.location.search, navigator.languages)}>
      <App reporterKey={getReporterKey(browserStorage())} />
    </LocaleProvider>
  </StrictMode>,
);
