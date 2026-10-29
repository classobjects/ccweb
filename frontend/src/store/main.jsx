// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import { AuthProvider } from '../shared/auth'
import { CartProvider } from './cart'
import ErrorBoundary from './ErrorBoundary'
import { ReferenceProvider } from '../shared/reference'
import StoreApp from './StoreApp'
import '../shared/shared.css'
import './styles.css'

// The boundary is outermost, so an error in any provider is caught too. The
// vocabularies are the active values only: the shop offers nothing retired,
// and the server serves retired values to a manager alone.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <CartProvider>
            <ReferenceProvider>
              <StoreApp />
            </ReferenceProvider>
          </CartProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
