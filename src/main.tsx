import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { AuthProvider } from './context/AuthContext';
import { ScopeProvider } from './context/ScopeContext';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// After a deploy, an open tab still points at the previous build's screen files, which no longer exist.
// Reload once to pick up the new build instead of showing "Failed to fetch dynamically imported module".
const RELOADED_KEY = 'ascent-reloaded-for-new-build';
export function reloadForNewBuild(): boolean {
  try {
    if (sessionStorage.getItem(RELOADED_KEY)) return false;
    sessionStorage.setItem(RELOADED_KEY, '1');
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
window.addEventListener('vite:preloadError', (event) => {
  if (reloadForNewBuild()) event.preventDefault();
});
window.addEventListener('load', () => {
  // A successful load of the new build clears the guard, so the next deploy can reload again.
  window.setTimeout(() => {
    try {
      sessionStorage.removeItem(RELOADED_KEY);
    } catch {
      /* storage unavailable */
    }
  }, 10_000);
});

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(
  <React.StrictMode>
    <ErrorBoundary screenName="Ascent ALM Platform">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ScopeProvider>
            <App />
          </ScopeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
