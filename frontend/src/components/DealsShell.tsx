import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LayoutDashboard, Briefcase, Globe, BarChart2, ShieldCheck, Users, FileText, DollarSign, Activity, LogOut, TrendingUp } from 'lucide-react';
import NotificationBell from './NotificationBell';

export default function DealsShell() {
  const { subscriber, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  const dealNav = [
    { to: '/deals', icon: Briefcase, label: 'My deals', exact: true },
    { to: '/deals/marketplace', icon: Globe, label: 'Marketplace' },
    { to: '/deals/new', icon: LayoutDashboard, label: 'New deal' },
    { to: '/deals/portfolio', icon: BarChart2, label: 'Portfolio' },
    { to: '/retail/dashboard', icon: TrendingUp, label: 'Market digest' },
  ];

  const adminNav = [
    { to: '/admin', icon: LayoutDashboard, label: 'Overview' },
    { to: '/admin/subscribers', icon: Users, label: 'Subscribers' },
    { to: '/admin/kyc', icon: ShieldCheck, label: 'KYC reviews' },
    { to: '/admin/deals', icon: Briefcase, label: 'All deals' },
    { to: '/admin/escrow', icon: DollarSign, label: 'Escrow' },
    { to: '/admin/digest', icon: FileText, label: 'Digest' },
    { to: '/admin/audit', icon: Activity, label: 'Audit log' },
  ];

  const nav = isAdmin ? adminNav : dealNav;

  const kyc_badge: Record<string, string> = {
    verified: 'text-[#1D9E75]', pending: 'text-amber-400',
    submitted: 'text-blue-400', rejected: 'text-red-400',
  };

  return (
    <div className="flex h-screen bg-[#0f1117]">
      <aside className="flex flex-col w-56 shrink-0 bg-[#0a0d12] border-r border-[#2a2d35]">
        <div className="px-5 py-5 border-b border-[#2a2d35]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-[#1D9E75] rounded-md flex items-center justify-center">
              <TrendingUp size={14} color="white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white leading-none">Aprisys</p>
              <p className="text-[10px] text-[#555] mt-0.5">{isAdmin ? 'Admin console' : 'Deal platform'}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {nav.map(({ to, icon: Icon, label, exact }: any) => (
            <NavLink key={to} to={to} end={exact}
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? 'bg-[#1D9E75]/20 text-[#1D9E75] font-medium' : 'text-[#888] hover:bg-[#1a1d24] hover:text-white'}`}>
              <Icon size={16} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-[#2a2d35]">
          <div className="px-3 py-2.5 rounded-lg bg-[#1a1d24] mb-2">
            <p className="text-sm font-medium text-white truncate">{subscriber?.name}</p>
            <p className={`text-xs mt-0.5 capitalize ${kyc_badge[subscriber?.kyc_status ?? 'pending']}`}>
              KYC {subscriber?.kyc_status}
            </p>
          </div>
          <button onClick={() => { logout(); navigate('/login'); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#555] hover:text-white hover:bg-[#1a1d24] rounded-lg transition-colors">
            <LogOut size={15} />Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="flex items-center justify-between px-6 py-3 bg-[#0a0d12] border-b border-[#2a2d35]">
          <div />
          <NotificationBell dark />
        </header>
        <main className="flex-1 overflow-y-auto p-6"><Outlet /></main>
      </div>
    </div>
  );
}
