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
