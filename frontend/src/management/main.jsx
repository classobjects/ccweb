// (c) Copyright 2026 Nathaniel Mills
// Open Source licensed under Apache 2.0: https://www.apache.org/licenses/LICENSE-2.0
// SPDX-License-Identifier: Apache-2.0
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import ManagementApp from './ManagementApp'
import { AuthProvider } from '../shared/auth'
import { ReferenceProvider } from '../shared/reference'
import '../shared/shared.css'
import './styles.css'

// basename, not a route prefix: every `to="/people"` in the console resolves
// under /management, so no component needs to know where the console is mounted.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename="/management">
      <AuthProvider>
        {/* Retired values too: the console is a manager's, and a record that
            still uses one has to show it. */}
        <ReferenceProvider includeInactive>
          <ManagementApp />
        </ReferenceProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
