import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { RequireAdmin, RequireAuth, RequireLorryReceipts } from './auth/guards'
import { Layout } from './components/Layout'
import { AccountsPage } from './pages/AccountsPage'
import { CompaniesPage } from './pages/CompaniesPage'
import { CompanyDetailPage } from './pages/CompanyDetailPage'
import { DashboardPage } from './pages/DashboardPage'
import { DriverDetailPage } from './pages/DriverDetailPage'
import { DriversPage } from './pages/DriversPage'
import { IntakePage } from './pages/IntakePage'
import { LanesPage } from './pages/LanesPage'
import { LoginPage } from './pages/LoginPage'
import { LorryReceiptsPage } from './pages/LorryReceiptsPage'
import { MastersPage } from './pages/MastersPage'
import { VehicleDetailPage } from './pages/VehicleDetailPage'
import { VehiclesPage } from './pages/VehiclesPage'

export default function App() {
  return (
    <BrowserRouter
      // Opt in to v7 behaviour now rather than carrying two console warnings until the upgrade.
      // Both are behaviour we already want, and a console with known noise in it is a console
      // nobody reads.
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<RequireAuth />}>
            <Route element={<Layout />}>
              <Route index element={<DashboardPage />} />
              <Route path="intake" element={<IntakePage />} />
              {/* Lorry receipts are the operating firm's own work: ADMIN and TEJJJ_CSR.
                  The API enforces it too; this only avoids rendering a page that would then
                  403 on every call. */}
              <Route element={<RequireLorryReceipts />}>
                <Route path="lr" element={<LorryReceiptsPage />} />
              </Route>
              <Route path="lanes" element={<LanesPage />} />
              <Route path="vehicles" element={<VehiclesPage />} />
              <Route path="vehicles/:id" element={<VehicleDetailPage />} />
              <Route path="drivers" element={<DriversPage />} />
              <Route path="drivers/:id" element={<DriverDetailPage />} />
              <Route path="companies" element={<CompaniesPage />} />
              <Route path="companies/:id" element={<CompanyDetailPage />} />
              <Route path="masters" element={<MastersPage />} />

              {/* Account management is the one thing gated by role. The API enforces it too —
                  this only avoids showing a screen that would answer 403. */}
              <Route element={<RequireAdmin />}>
                <Route path="accounts" element={<AccountsPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
