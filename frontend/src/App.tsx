import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import './index.css';

// Landing
import RetailLanding from './pages/landing/RetailLanding';
import DealsLanding from './pages/landing/DealsLanding';

// Auth
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import VerifiedPage from './pages/auth/VerifiedPage';
import AuthCallbackPage from './pages/auth/AuthCallbackPage';
import KYCPage from './pages/auth/KYCPage';
import KYCPendingPage from './pages/auth/KYCPendingPage';
import KYCRejectedPage from './pages/auth/KYCRejectedPage';
import UpgradeToQualifiedPage from './pages/auth/UpgradeToQualifiedPage';

// Shells
import RetailShell from './components/RetailShell';
import DealsShell from './components/DealsShell';

// Retail
import RetailDashboard from './pages/retail/DashboardPage';
import RetailDigest from './pages/retail/DigestPage';
import RetailArchive from './pages/retail/ArchivePage';
import RetailWatchlist from './pages/retail/WatchlistPage';
import RetailBilling from './pages/retail/BillingPage';
import RetailSettings from './pages/retail/SettingsPage';

// Deals
import DealsPage from './pages/deals/DealsPage';
import CreateDealPage from './pages/deals/CreateDealPage';
import DealDetailPage from './pages/deals/DealDetailPage';
import MarketplacePage from './pages/deals/MarketplacePage';
import PortfolioPage from './pages/deals/PortfolioPage';

// Admin
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminSubscribers from './pages/admin/AdminSubscribers';
import AdminKYC from './pages/admin/AdminKYC';
import AdminDeals from './pages/admin/AdminDeals';
import AdminEscrow from './pages/admin/AdminEscrow';
import AdminDigest from './pages/admin/AdminDigest';
import AdminAudit from './pages/admin/AdminAudit';

function Guard({ children, require }: { children: React.ReactNode; require?: 'auth' | 'professional' | 'admin' }) {
  const { subscriber, loading, isProfessional, isAdmin } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" /></div>;
  if (!subscriber) return <Navigate to="/login" replace />;
  if (require === 'professional' && !isProfessional) return <Navigate to="/retail/dashboard" replace />;
  if (require === 'admin' && !isAdmin) return <Navigate to="/retail/dashboard" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public landing */}
          <Route path="/" element={<RetailLanding />} />
          <Route path="/deals-landing" element={<DealsLanding />} />

          {/* Auth */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
          <Route path="/auth/verified" element={<VerifiedPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/unsubscribed" element={<div className="min-h-screen flex items-center justify-center"><div className="card max-w-sm w-full text-center py-8"><p className="font-semibold mb-2">Unsubscribed</p><p className="text-sm text-[#888]">You've been unsubscribed from Aprisys digest emails.</p></div></div>} />

          {/* KYC */}
          <Route path="/kyc" element={<Guard require="auth"><KYCPage /></Guard>} />
          <Route path="/kyc/pending" element={<Guard require="auth"><KYCPendingPage /></Guard>} />
          <Route path="/kyc/rejected" element={<Guard require="auth"><KYCRejectedPage /></Guard>} />
          <Route path="/upgrade" element={<Guard require="auth"><UpgradeToQualifiedPage /></Guard>} />

          {/* Retail portal */}
          <Route path="/retail" element={<Guard require="auth"><RetailShell /></Guard>}>
            <Route index element={<Navigate to="/retail/dashboard" replace />} />
            <Route path="dashboard" element={<RetailDashboard />} />
            <Route path="digest" element={<RetailDigest />} />
            <Route path="archive" element={<RetailArchive />} />
            <Route path="watchlist" element={<RetailWatchlist />} />
            <Route path="billing" element={<RetailBilling />} />
            <Route path="settings" element={<RetailSettings />} />
          </Route>

          {/* Deals portal */}
          <Route path="/deals" element={<Guard require="professional"><DealsShell /></Guard>}>
            <Route index element={<DealsPage />} />
            <Route path="new" element={<CreateDealPage />} />
            <Route path="marketplace" element={<MarketplacePage />} />
            <Route path="portfolio" element={<PortfolioPage />} />
            <Route path=":id" element={<DealDetailPage />} />
          </Route>

          {/* Admin */}
          <Route path="/admin" element={<Guard require="admin"><DealsShell /></Guard>}>
            <Route index element={<AdminDashboard />} />
            <Route path="subscribers" element={<AdminSubscribers />} />
            <Route path="kyc" element={<AdminKYC />} />
            <Route path="deals" element={<AdminDeals />} />
            <Route path="escrow" element={<AdminEscrow />} />
            <Route path="digest" element={<AdminDigest />} />
            <Route path="audit" element={<AdminAudit />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
