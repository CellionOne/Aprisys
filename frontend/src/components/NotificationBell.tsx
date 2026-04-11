import { useState, useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import { useAuth, apiFetch } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';

interface Notification {
  id: string; type: string; title: string; body: string;
  entity_type?: string; entity_id?: string; read_at?: string; created_at: string;
}

export default function NotificationBell({ dark = false }: { dark?: boolean }) {
  const { accessToken } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  async function load() {
    if (!accessToken) return;
    try {
      const data = await apiFetch<{ notifications: Notification[]; unread_count: number }>('/notifications');
      setNotifications(data.notifications);
      setUnread(data.unread_count);
    } catch {}
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [accessToken]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function markAllRead() {
    await apiFetch('/notifications/mark-read', { method: 'POST', body: JSON.stringify({ mark_all: true }) });
    setUnread(0);
    setNotifications(n => n.map(x => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })));
  }

  async function handleClick(n: Notification) {
    await apiFetch('/notifications/mark-read', { method: 'POST', body: JSON.stringify({ notification_ids: [n.id] }) });
    setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x));
    setUnread(u => Math.max(0, u - 1));
    setOpen(false);
    if (n.entity_type === 'deal' && n.entity_id) navigate(`/deals/${n.entity_id}`);
    else if (n.entity_type === 'subscriber') navigate('/kyc');
  }

  const textColor = dark ? 'text-[#888] hover:text-white' : 'text-[#555] hover:text-[#1a1a1a]';
  const dropBg = dark ? 'bg-[#1a1d24] border-[#2a2d35]' : 'bg-white border-[#e5e4e0]';
  const itemHover = dark ? 'hover:bg-[#2a2d35]' : 'hover:bg-[#f8f7f4]';

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className={`relative p-2 rounded-lg transition-colors ${textColor}`}>
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-medium">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className={`absolute right-0 top-10 w-80 rounded-xl border shadow-lg z-50 overflow-hidden ${dropBg}`}>
          <div className={`flex items-center justify-between px-4 py-3 border-b ${dark ? 'border-[#2a2d35]' : 'border-[#e5e4e0]'}`}>
            <p className={`text-sm font-medium ${dark ? 'text-white' : 'text-[#1a1a1a]'}`}>Notifications</p>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs text-[#888] hover:text-[#1D9E75]">Mark all read</button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-[#888]">No notifications</p>
              </div>
            ) : notifications.map(n => (
              <button key={n.id} onClick={() => handleClick(n)}
                className={`w-full text-left px-4 py-3 border-b transition-colors ${dark ? 'border-[#2a2d35]' : 'border-[#f0efeb]'} ${itemHover} ${!n.read_at ? dark ? 'bg-[#1D9E75]/5' : 'bg-[#f0fdf4]' : ''}`}>
                <p className={`text-sm font-medium ${dark ? 'text-white' : 'text-[#1a1a1a]'}`}>{n.title}</p>
                <p className={`text-xs mt-0.5 line-clamp-2 ${dark ? 'text-[#888]' : 'text-[#555]'}`}>{n.body}</p>
                <p className="text-[10px] text-[#aaa] mt-1">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
