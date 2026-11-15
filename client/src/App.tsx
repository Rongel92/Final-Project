import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './lib/auth';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';

import { LoginPage } from './pages/LoginPage';
import { AccessDeniedPage } from './pages/AccessDeniedPage';
import { NotFoundPage } from './pages/NotFoundPage';

import { EmployeeDashboard } from './pages/employee/EmployeeDashboard';
import { ResaleListPage } from './pages/employee/ResaleListPage';
import { ResaleDetailsPage } from './pages/employee/ResaleDetailsPage';
import { RegistrationWizardPage } from './pages/employee/RegistrationWizardPage';
import { MyRegistrationsPage } from './pages/employee/MyRegistrationsPage';
import { RegistrationDetailsPage } from './pages/employee/RegistrationDetailsPage';
import { ResultPage } from './pages/employee/ResultPage';
import { PickupPage } from './pages/employee/PickupPage';
import { ParticipationHistoryPage } from './pages/employee/ParticipationHistoryPage';
import { ParticipatedResalesPage } from './pages/employee/ParticipatedResalesPage';
import { ProfilePage } from './pages/employee/ProfilePage';

import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminResaleListPage } from './pages/admin/AdminResaleListPage';
import { ResaleEditorPage } from './pages/admin/ResaleEditorPage';
import { AdminResaleDetailsPage } from './pages/admin/AdminResaleDetailsPage';
import { ResaleReviewPage } from './pages/admin/ResaleReviewPage';
import { InventoryPage } from './pages/admin/InventoryPage';
import { HandoverManagementPage } from './pages/admin/HandoverManagementPage';
import { ExportsPage } from './pages/admin/ExportsPage';
import { AuditLogPage } from './pages/admin/AuditLogPage';
import { EligibilityManagementPage } from './pages/admin/EligibilityManagementPage';

function RequireRole({ role, children }: { role?: 'ADMIN'; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner label="Loading…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (role && user.role !== role) return <Navigate to="/access-denied" replace />;
  return <Layout>{children}</Layout>;
}

export function App() {
  const { user, loading } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/access-denied" element={<AccessDeniedPage />} />

      <Route
        path="/"
        element={
          loading ? (
            <Spinner />
          ) : !user ? (
            <Navigate to="/login" replace />
          ) : (
            <Navigate to={user.role === 'ADMIN' ? '/admin' : '/dashboard'} replace />
          )
        }
      />

      {/* Employee */}
      <Route path="/dashboard" element={<RequireRole><EmployeeDashboard /></RequireRole>} />
      <Route path="/resales" element={<RequireRole><ResaleListPage /></RequireRole>} />
      <Route path="/resales/:id" element={<RequireRole><ResaleDetailsPage /></RequireRole>} />
      <Route path="/resales/:id/register" element={<RequireRole><RegistrationWizardPage /></RequireRole>} />
      <Route path="/my-registrations" element={<RequireRole><MyRegistrationsPage /></RequireRole>} />
      <Route path="/registrations/:id" element={<RequireRole><RegistrationDetailsPage /></RequireRole>} />
      <Route path="/results/:resaleId" element={<RequireRole><ResultPage /></RequireRole>} />
      <Route path="/pickup/:registrationId" element={<RequireRole><PickupPage /></RequireRole>} />
      <Route path="/participation" element={<RequireRole><ParticipationHistoryPage /></RequireRole>} />
      <Route path="/participated" element={<RequireRole><ParticipatedResalesPage /></RequireRole>} />
      <Route path="/profile" element={<RequireRole><ProfilePage /></RequireRole>} />

      {/* Admin */}
      <Route path="/admin" element={<RequireRole role="ADMIN"><AdminDashboard /></RequireRole>} />
      <Route path="/admin/resales" element={<RequireRole role="ADMIN"><AdminResaleListPage /></RequireRole>} />
      <Route path="/admin/resales/new" element={<RequireRole role="ADMIN"><ResaleEditorPage /></RequireRole>} />
      <Route path="/admin/resales/:id/edit" element={<RequireRole role="ADMIN"><ResaleEditorPage /></RequireRole>} />
      <Route path="/admin/resales/:id/review" element={<RequireRole role="ADMIN"><ResaleReviewPage /></RequireRole>} />
      <Route path="/admin/resales/:id" element={<RequireRole role="ADMIN"><AdminResaleDetailsPage /></RequireRole>} />
      <Route path="/admin/inventory" element={<RequireRole role="ADMIN"><InventoryPage /></RequireRole>} />
      <Route path="/admin/handovers" element={<RequireRole role="ADMIN"><HandoverManagementPage /></RequireRole>} />
      <Route path="/admin/exports" element={<RequireRole role="ADMIN"><ExportsPage /></RequireRole>} />
      <Route path="/admin/audit" element={<RequireRole role="ADMIN"><AuditLogPage /></RequireRole>} />
      <Route path="/admin/eligibility" element={<RequireRole role="ADMIN"><EligibilityManagementPage /></RequireRole>} />

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
