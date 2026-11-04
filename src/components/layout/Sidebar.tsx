import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  FileSpreadsheet,
  Banknote,
  CalendarDays,
  History,
  Settings,
  Search,
  LogOut,
  X,
  Building2,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen, onCloseMobile }) => {
  const { currentUser, logout } = useAuth();
  const { leaveRequests } = useData();
  const navigate = useNavigate();

  const pendingLeaves = leaveRequests.filter((r) => r.status === 'pending').length;

  const navItems = [
    {
      to: '/admin/dashboard',
      label: 'Dashboard Thống Kê',
      icon: LayoutDashboard,
    },
    {
      to: '/admin/attendance',
      label: 'Quản Lý Chấm Công',
      icon: CalendarCheck,
    },
    {
      to: '/admin/payroll',
      label: 'Quản Lý Lương',
      icon: Banknote,
    },
    {
      to: '/admin/leave',
      label: 'Quản Lý Phép Tồn',
      icon: CalendarDays,
      badge: pendingLeaves > 0 ? pendingLeaves : undefined,
    },
    {
      to: '/admin/import-history',
      label: 'Lịch Sử Nhập Liệu',
      icon: History,
    },
    {
      to: '/admin/settings',
      label: 'Cài Đặt Hệ Thống',
      icon: Settings,
    },
  ];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 bg-slate-900 text-slate-200 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between px-5 h-16 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-sm text-white tracking-wide block">HR ATTENDANCE</span>
              <span className="text-[10px] text-indigo-400 font-medium uppercase tracking-wider block">Admin Portal</span>
            </div>
          </div>
          <button
            onClick={onCloseMobile}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 lg:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Portal Switcher Banner */}
        <div className="px-3 pt-4">
          <NavLink
            to="/lookup"
            onClick={onCloseMobile}
            className="flex items-center justify-between p-2.5 rounded-lg bg-indigo-950/60 border border-indigo-800/60 text-indigo-200 hover:bg-indigo-900/60 hover:text-white transition group text-xs"
          >
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-indigo-400" />
              <span className="font-medium">Cổng Tra Cứu Nhân Viên</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-indigo-400 group-hover:translate-x-0.5 transition" />
          </NavLink>
        </div>

        {/* Navigation Links */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Menu Quản Trị
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onCloseMobile}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`
                }
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-rose-500 text-white">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </div>

        {/* User Profile & Logout Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/30">
          <div className="flex items-center gap-3 px-2 py-2">
            <img
              src={currentUser?.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
              alt={currentUser?.fullName || 'Admin'}
              className="w-9 h-9 rounded-full object-cover border border-slate-700"
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{currentUser?.fullName || 'Admin User'}</p>
              <p className="text-[11px] text-slate-400 truncate">{currentUser?.email || 'admin@hrm.vn'}</p>
            </div>
            <button
              onClick={handleLogout}
              title="Đăng xuất"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};

