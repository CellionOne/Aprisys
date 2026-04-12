import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LayoutDashboard, Newspaper, Archive, Star, CreditCard, Settings, LogOut, TrendingUp, Briefcase } from 'lucide-react';
import { useState } from 'react';
import NotificationBell from './NotificationBell';

const PLAN_BADGE: Record<string, string> = {
  free: 'badge-gray', standard: 'badge-amber', pro: 'badge-teal',
  broker: 'badge-blue', institutional: 'badge-blue',
};

export default function RetailShell() {
  const { subscriber, logout, isProfessional } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const nav = [
    { to: '/retail/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/retail/digest', icon: Newspaper, label: "Today's digest" },
    { to: '/retail/archive', icon: Archive, label: 'Archive' },
    { to: '/retail/watchlist', icon: Star, label: 'Watchlist' },
    { to: '/retail/billing', icon: CreditCard, label: 'Billing' },
    { to: '/retail/settings', icon: Settings, label: 'Settings' },
  ];

  const Sidebar = () => (
    <nav className="flex flex-col h-full bg-white border-r border-[#e5e4e0]">
      <div className="px-5 py-5 border-b border-[#e5e4e0]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#1a1a1a] rounded-md flex items-center justify-center">
            <TrendingUp size={14} color="white" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-none">Aprisys</p>
            <p className="text-[10px] text-[#aaa] mt-0.5">powered by Cellion One</p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {nav.map(({ to, icon: Icon, label, locked }) => (
          <NavLink key={to} to={to} onClick={() => setOpen(false)}
            className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? 'bg-[#1a1a1a] text-white' : locked ? 'text-[#ccc] cursor-default' : 'text-[#555] hover:bg-[#f0efeb] hover:text-[#1a1a1a]'}`}>
            <Icon size={16} />
            <span>{label}</span>
            {locked && <span className="ml-auto badge-amber text-[10px]">Upgrade</span>}
          </NavLink>
        ))}

        {isProfessional && (
          <NavLink to="/deals"
            className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? 'bg-[#1D9E75] text-white' : 'text-[#555] hover:bg-[#f0efeb]'}`}>
            <Briefcase size={16} />
            <span>Deals platform</span>
          </NavLink>
        )}
      </div>

      <div className="px-3 py-4 border-t border-[#e5e4e0]">
        <div className="px-3 py-2.5 rounded-lg bg-[#f8f7f4] mb-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium truncate">{subscriber?.name}</p>
            <span className={`ml-2 text-[10px] ${PLAN_BADGE[subscriber?.plan ?? 'free']}`}>{subscriber?.plan}</span>
          </div>
          <p className="text-xs text-[#aaa] truncate mt-0.5">{subscriber?.email}</p>
        </div>
        <button onClick={() => { logout(); navigate('/login'); }}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#888] hover:bg-[#f0efeb] rounded-lg transition-colors">
          <LogOut size={15} />Sign out
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex h-screen bg-[#f5f4f0]">
      <aside className="hidden md:flex flex-col w-56 shrink-0"><Sidebar /></aside>
      {open && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="fixed inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="relative z-10 w-56 h-full"><Sidebar /></aside>
        </div>
      )}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-[#e5e4e0]">
          <button onClick={() => setOpen(true)} className="p-1.5 rounded-lg hover:bg-[#f0efeb]">☰</button>
          <div className="flex items-center gap-2">
            <NotificationBell />
          </div>
        </header>
        <div className="hidden md:flex justify-end px-6 py-3 bg-white border-b border-[#e5e4e0]">
          <NotificationBell />
        </div>
        <main className="flex-1 overflow-y-auto p-4 md:p-8"><Outlet /></main>
      </div>
    </div>
  );
}
