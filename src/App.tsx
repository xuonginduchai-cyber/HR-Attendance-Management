import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { AdminLayout } from './components/layout/AdminLayout';
import { LoginPage } from './pages/admin/LoginPage';
import { DashboardPage } from './pages/admin/DashboardPage';
import { EmployeeManagementPage } from './pages/admin/EmployeeManagementPage';
import { AttendanceManagementPage } from './pages/admin/AttendanceManagementPage';
import { ExcelImportPage } from './pages/admin/ExcelImportPage';
import { PayrollPage } from './pages/admin/PayrollPage';
import { LeaveManagementPage } from './pages/admin/LeaveManagementPage';
import { ImportHistoryPage } from './pages/admin/ImportHistoryPage';
import { SettingsPage } from './pages/admin/SettingsPage';
import { EmployeeLookupPage } from './pages/lookup/EmployeeLookupPage';

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <DataProvider>
        <BrowserRouter>
          <Routes>
            {/* Public Employee Lookup - Trang chủ chính & các đường dẫn tra cứu */}
            <Route path="/" element={<EmployeeLookupPage />} />
            <Route path="/lookup" element={<EmployeeLookupPage />} />
            <Route path="/lookup/payroll" element={<EmployeeLookupPage initialCategory="payroll" />} />
            <Route path="/lookup/leave" element={<EmployeeLookupPage initialCategory="leave" />} />

            {/* Admin Login */}
            <Route path="/login" element={<LoginPage />} />

            {/* Admin Portal Protected Routes */}
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Navigate to="/admin/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="employees" element={<Navigate to="/admin/attendance" replace />} />
              <Route path="attendance" element={<AttendanceManagementPage />} />
              <Route path="import-excel" element={<Navigate to="/admin/attendance" replace />} />
              <Route path="payroll" element={<PayrollPage />} />
              <Route path="leave" element={<LeaveManagementPage />} />
              <Route path="import-history" element={<ImportHistoryPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>

            {/* Mọi đường dẫn không xác định chuyển hướng về trang chủ tra cứu */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </DataProvider>
    </AuthProvider>
  );
};

export default App;

