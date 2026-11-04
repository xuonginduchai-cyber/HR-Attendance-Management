import React from 'react';
import { Menu, Bell, ExternalLink, Calendar, Database } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';

interface HeaderProps {
  onOpenMobileMenu: () => void;
  title?: string;
}

export const Header: React.FC<HeaderProps> = ({ onOpenMobileMenu, title }) => {
  const { currentUser } = useAuth();
  const { isDatabaseConnected } = useData();

  const today = new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  return (
    <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 flex items-center justify-between">
      {/* Left: Mobile hamburger + Page Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition"
          aria-label="Mở menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div>
          {title ? (
            <h1 className="text-base sm:text-lg font-bold text-slate-800">{title}</h1>
          ) : (
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <Calendar className="w-3.5 h-3.5 text-indigo-600" />
              <span className="capitalize">{today}</span>
            </div>
          )}
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Database Status Pill */}
        {isDatabaseConnected ? (
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Supabase Connected</span>
          </span>
        ) : (
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
            <span>Demo Mode (Chờ .env)</span>
          </span>
        )}

        {/* Quick Link to Employee Lookup */}
        <Link
          to="/lookup"
          target="_blank"
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200/70 rounded-lg hover:bg-indigo-100 transition"
        >
          <span>Mở Cổng Tra cứu</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>

        {/* Notifications Icon with Indicator */}
        <div className="relative">
          <button
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition"
            title="Thông báo"
          >
            <Bell className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white"></span>
          </button>
        </div>

        {/* User preview */}
        <div className="flex items-center gap-2.5 pl-2 border-l border-slate-200">
          <img
            src={currentUser?.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
            alt="User"
            className="w-8 h-8 rounded-full object-cover border border-slate-200"
          />
          <div className="hidden md:block text-left">
            <span className="block text-xs font-semibold text-slate-800 leading-tight">
              {currentUser?.fullName}
            </span>
            <span className="block text-[11px] text-slate-500 leading-tight">
              {currentUser?.role === 'super_admin' ? 'Super Admin' : 'Quản trị viên'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
