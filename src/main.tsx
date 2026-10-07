import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { queryClient } from './app/queryClient'
import { ToastProvider } from './components/Toast'
import { AuthGate } from './features/auth/AuthGate'
import '@fontsource/jetbrains-mono/400.css'
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthGate>
          <App />
        </AuthGate>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
)
