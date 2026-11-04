import React from 'react';
import { AttendanceStatus, EmployeeStatus } from '../../types';

interface BadgeProps {
  children?: React.ReactNode;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'purple';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'neutral', className = '' }) => {
  const variantStyles = {
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-500/20',
    warning: 'bg-amber-50 text-amber-700 border-amber-200 ring-amber-500/20',
    danger: 'bg-rose-50 text-rose-700 border-rose-200 ring-rose-500/20',
    info: 'bg-sky-50 text-sky-700 border-sky-200 ring-sky-500/20',
    purple: 'bg-indigo-50 text-indigo-700 border-indigo-200 ring-indigo-500/20',
    neutral: 'bg-slate-100 text-slate-700 border-slate-200 ring-slate-500/20',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
};

export const AttendanceBadge: React.FC<{ status: AttendanceStatus }> = ({ status }) => {
  switch (status) {
    case 'on_time':
      return <Badge variant="success">Đúng giờ</Badge>;
    case 'late':
      return <Badge variant="warning">Đi muộn</Badge>;
    case 'early_leave':
      return <Badge variant="warning">Về sớm</Badge>;
    case 'leave_approved':
      return <Badge variant="info">Nghỉ có phép</Badge>;
    case 'leave_unapproved':
      return <Badge variant="danger">Nghỉ không phép</Badge>;
    case 'holiday':
      return <Badge variant="purple">Nghỉ lễ</Badge>;
    case 'weekend':
      return <Badge variant="neutral">Cuối tuần</Badge>;
    default:
      return <Badge variant="neutral">{status}</Badge>;
  }
};

export const EmployeeStatusBadge: React.FC<{ status: EmployeeStatus }> = ({ status }) => {
  switch (status) {
    case 'active':
      return <Badge variant="success">Chính thức</Badge>;
    case 'probation':
      return <Badge variant="warning">Thử việc</Badge>;
    case 'inactive':
      return <Badge variant="danger">Đã nghỉ việc</Badge>;
    default:
      return <Badge variant="neutral">{status}</Badge>;
  }
};

export const LeaveRequestBadge: React.FC<{ status: 'pending' | 'approved' | 'rejected' }> = ({ status }) => {
  switch (status) {
    case 'approved':
      return <Badge variant="success">Đã duyệt</Badge>;
    case 'pending':
      return <Badge variant="warning">Chờ duyệt</Badge>;
    case 'rejected':
      return <Badge variant="danger">Từ chối</Badge>;
    default:
      return <Badge variant="neutral">{status}</Badge>;
  }
};

export const ImportStatusBadge: React.FC<{ status: 'success' | 'partial' | 'failed' }> = ({ status }) => {
  switch (status) {
    case 'success':
      return <Badge variant="success">Thành công</Badge>;
    case 'partial':
      return <Badge variant="warning">Một phần</Badge>;
    case 'failed':
      return <Badge variant="danger">Thất bại</Badge>;
    default:
      return <Badge variant="neutral">{status}</Badge>;
  }
};

export const PaymentStatusBadge: React.FC<{ status: 'paid' | 'pending' | 'draft' }> = ({ status }) => {
  switch (status) {
    case 'paid':
      return <Badge variant="success">Đã thanh toán</Badge>;
    case 'pending':
      return <Badge variant="warning">Chờ thanh toán</Badge>;
    case 'draft':
      return <Badge variant="neutral">Bản nháp</Badge>;
    default:
      return <Badge variant="neutral">{status}</Badge>;
  }
};

