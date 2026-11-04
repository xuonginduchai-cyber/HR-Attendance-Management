import React, { useState } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useAuth } from '../../context/AuthContext';

export const AdminLayout: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const getPageTitle = () => {
    const path = location.pathname;
    if (path.includes('dashboard')) return 'Tổng Quan Báo Cáo & Thống Kê';
    if (path.includes('employees')) return 'Danh Sách & Hồ Sơ Nhân Viên';
    if (path.includes('attendance')) return 'Bảng Theo Dõi Chấm Công Hàng Ngày';
    if (path.includes('import-excel')) return 'Nhập Dữ Liệu Chấm Công Từ Excel';
    if (path.includes('payroll')) return 'Quản Lý Bảng Lương & Chi Trả';
    if (path.includes('leave')) return 'Quản Lý Nghỉ Phép & Đơn Xin Phép';
    if (path.includes('import-history')) return 'Lịch Sử Nhập & Nhật Ký Dữ Liệu';
    if (path.includes('settings')) return 'Cài Đặt Tham Số & Giờ Làm Việc';
    return undefined;
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar Navigation */}
      <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        <Header onOpenMobileMenu={() => setMobileOpen(true)} title={getPageTitle()} />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

