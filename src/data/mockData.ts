import { Employee, AttendanceRecord, PayrollRecord, LeaveRequest, LeaveBalance, ImportLog, SystemSettings, AdminUser } from '../types';

export const mockAdmin: AdminUser = {
  id: '45d45f1f-9ba2-493a-aa15-a4bc1f5b8d49',
  username: 'ngocmai_vina',
  fullName: 'Ngô Thị Ngọc Mai',
  role: 'super_admin',
  email: 'ngocmai_vina@coasia.com',
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
};

export const initialEmployees: Employee[] = [
  {
    id: 'NV001',
    fullName: 'Trần Văn An',
    email: 'an.tran@congtyviet.com',
    phone: '0901 234 567',
    department: 'Phòng Kỹ thuật',
    position: 'Trưởng nhóm Backend',
    avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
    startDate: '2022-03-15',
    status: 'active',
    baseSalary: 28000000,
    allowance: 2500000,
    salaryPin: '1234',
    bankAccount: {
      bankName: 'Vietcombank',
      accountNumber: '1012398745',
      branch: 'Chi nhánh Ba Đình',
    },
  },
  {
    id: 'NV002',
    fullName: 'Lê Thị Bích',
    email: 'bich.le@congtyviet.com',
    phone: '0912 345 678',
    department: 'Phòng Nhân sự',
    position: 'Chuyên viên Tuyển dụng',
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    startDate: '2021-08-01',
    status: 'active',
    baseSalary: 18000000,
    allowance: 1500000,
    bankAccount: {
      bankName: 'Techcombank',
      accountNumber: '19035678129',
      branch: 'Chi nhánh Đông Đô',
    },
  },
  {
    id: 'NV003',
    fullName: 'Phạm Minh Cường',
    email: 'cuong.pham@congtyviet.com',
    phone: '0983 456 789',
    department: 'Phòng Kỹ thuật',
    position: 'Frontend Developer',
    avatarUrl: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150&auto=format&fit=crop&q=80',
    startDate: '2023-01-10',
    status: 'active',
    baseSalary: 22000000,
    allowance: 1800000,
    bankAccount: {
      bankName: 'MBBank',
      accountNumber: '0888999123',
      branch: 'Chi nhánh Hà Nội',
    },
  },
  {
    id: 'NV004',
    fullName: 'Hoàng Mỹ Duyên',
    email: 'duyen.hoang@congtyviet.com',
    phone: '0978 901 234',
    department: 'Phòng Marketing',
    position: 'Digital Marketing Lead',
    avatarUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
    startDate: '2022-11-01',
    status: 'active',
    baseSalary: 20000000,
    allowance: 2000000,
    bankAccount: {
      bankName: 'VPBank',
      accountNumber: '1249876543',
      branch: 'Sở giao dịch',
    },
  },
  {
    id: 'NV005',
    fullName: 'Đỗ Tuấn Em',
    email: 'em.do@congtyviet.com',
    phone: '0934 567 890',
    department: 'Phòng Kinh doanh',
    position: 'Sales Executive',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    startDate: '2024-02-15',
    status: 'active',
    baseSalary: 14000000,
    allowance: 3000000,
    bankAccount: {
      bankName: 'Vietcombank',
      accountNumber: '1098765432',
      branch: 'Chi nhánh Tân Bình',
    },
  },
  {
    id: 'NV006',
    fullName: 'Vũ Thị Phương Giang',
    email: 'giang.vu@congtyviet.com',
    phone: '0945 678 901',
    department: 'Phòng Kế toán',
    position: 'Kế toán trưởng',
    avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
    startDate: '2020-05-20',
    status: 'active',
    baseSalary: 26000000,
    allowance: 2200000,
    bankAccount: {
      bankName: 'BIDV',
      accountNumber: '215100012398',
      branch: 'Chi nhánh Cầu Giấy',
    },
  },
  {
    id: 'NV007',
    fullName: 'Ngô Quốc Hùng',
    email: 'hung.ngo@congtyviet.com',
    phone: '0967 890 123',
    department: 'Phòng Kỹ thuật',
    position: 'DevOps & SRE Engineer',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    startDate: '2023-06-01',
    status: 'active',
    baseSalary: 25000000,
    allowance: 2000000,
    bankAccount: {
      bankName: 'ACB',
      accountNumber: '987654321',
      branch: 'Chi nhánh TP.HCM',
    },
  },
  {
    id: 'NV008',
    fullName: 'Đặng Thanh Loan',
    email: 'loan.dang@congtyviet.com',
    phone: '0923 456 789',
    department: 'Phòng Kinh doanh',
    position: 'Thực tập sinh Sales (Thử việc)',
    avatarUrl: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&auto=format&fit=crop&q=80',
    startDate: '2026-09-01',
    status: 'probation',
    baseSalary: 7000000,
    allowance: 1000000,
    bankAccount: {
      bankName: 'TPBank',
      accountNumber: '0345678129',
      branch: 'Hội sở',
    },
  },
];

export const initialLeaveBalances: LeaveBalance[] = [
  { employeeId: 'NV001', year: 2026, carriedOverDays: 2, allocatedDays: 12, adjustedDays: 0, usedDays: 3.5, remainingDays: 10.5, pendingDays: 1, totalDays: 14, note: '2 ngày phép tồn năm 2025' },
  { employeeId: 'NV002', year: 2026, carriedOverDays: 3, allocatedDays: 12, adjustedDays: 0, usedDays: 5, remainingDays: 10, pendingDays: 0, totalDays: 15, note: '3 ngày phép tồn năm 2025' },
  { employeeId: 'NV003', year: 2026, carriedOverDays: 1, allocatedDays: 12, adjustedDays: 0, usedDays: 2, remainingDays: 11, pendingDays: 0, totalDays: 13 },
  { employeeId: 'NV004', year: 2026, carriedOverDays: 1, allocatedDays: 12, adjustedDays: 0, usedDays: 4, remainingDays: 9, pendingDays: 2, totalDays: 13 },
  { employeeId: 'NV005', year: 2026, carriedOverDays: 0, allocatedDays: 12, adjustedDays: 0, usedDays: 1, remainingDays: 11, pendingDays: 0, totalDays: 12 },
  { employeeId: 'NV006', year: 2026, carriedOverDays: 4, allocatedDays: 12, adjustedDays: 0, usedDays: 6, remainingDays: 10, pendingDays: 0, totalDays: 16, note: 'Cộng thêm thâm niên và tồn năm trước' },
  { employeeId: 'NV007', year: 2026, carriedOverDays: 1, allocatedDays: 12, adjustedDays: 0, usedDays: 3, remainingDays: 10, pendingDays: 0, totalDays: 13 },
  { employeeId: 'NV008', year: 2026, carriedOverDays: 0, allocatedDays: 6, adjustedDays: 0, usedDays: 0, remainingDays: 6, pendingDays: 0, totalDays: 6, note: 'Thực tập sinh / thử việc cấp 6 ngày' },
];

export const initialLeaveRequests: LeaveRequest[] = [
  {
    id: 'LR001',
    employeeId: 'NV001',
    leaveType: 'annual',
    startDate: '2026-11-10',
    endDate: '2026-11-10',
    daysCount: 1,
    reason: 'Việc gia đình',
    status: 'pending',
    createdAt: '2026-11-02 14:30',
  },
  {
    id: 'LR002',
    employeeId: 'NV004',
    leaveType: 'annual',
    startDate: '2026-11-15',
    endDate: '2026-11-16',
    daysCount: 2,
    reason: 'Du lịch nghỉ dưỡng cùng gia đình',
    status: 'pending',
    createdAt: '2026-11-01 09:15',
  },
  {
    id: 'LR003',
    employeeId: 'NV003',
    leaveType: 'sick',
    startDate: '2026-10-24',
    endDate: '2026-10-24',
    daysCount: 1,
    reason: 'Sốt xuất huyết nhẹ có đơn bác sĩ',
    status: 'approved',
    createdAt: '2026-10-23 18:20',
    approvedBy: 'Trần Văn An',
    approverNote: 'Đã nhận hồ sơ y tế',
  },
  {
    id: 'LR004',
    employeeId: 'NV005',
    leaveType: 'annual',
    startDate: '2026-10-14',
    endDate: '2026-10-14',
    daysCount: 1,
    reason: 'Làm thủ tục hành chính tại quê',
    status: 'approved',
    createdAt: '2026-10-10 11:00',
    approvedBy: 'Nguyễn Quản Trị',
    approverNote: 'Đồng ý',
  },
  {
    id: 'LR005',
    employeeId: 'NV002',
    leaveType: 'unpaid',
    startDate: '2026-09-05',
    endDate: '2026-09-06',
    daysCount: 2,
    reason: 'Giải quyết công việc cá nhân',
    status: 'approved',
    createdAt: '2026-09-01 10:00',
    approvedBy: 'Nguyễn Quản Trị',
  },
];

// Generate attendance records for October & November 2026
export const generateMockAttendance = (): AttendanceRecord[] => {
  const records: AttendanceRecord[] = [];
  const empIds = ['NV001', 'NV002', 'NV003', 'NV004', 'NV005', 'NV006', 'NV007', 'NV008'];

  // Current day: 2026-11-03
  // Tạo dữ liệu cho toàn bộ Tháng 10/2026 (01-31) và Tháng 11/2026 (01-30)
  const dates: string[] = [];
  for (let d = 30; d >= 1; d--) {
    dates.push(`2026-11-${String(d).padStart(2, '0')}`);
  }
  for (let d = 31; d >= 1; d--) {
    dates.push(`2026-10-${String(d).padStart(2, '0')}`);
  }

  let idCounter = 1;
  dates.forEach((date) => {
    const dayOfWeek = new Date(date).getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    empIds.forEach((empId) => {
      if (isWeekend) {
        records.push({
          id: `ATT-${idCounter++}`,
          employeeId: empId,
          date,
          checkIn: null,
          checkOut: null,
          status: 'weekend',
          workHours: 0,
          overtimeHours: 0,
          lateMinutes: 0,
          earlyMinutes: 0,
          note: 'Nghỉ cuối tuần',
        });
        return;
      }

      // Ca có tăng ca OT đặc thù
      if (date === '2026-10-06' && (empId === 'NV001' || empId === 'NV003')) {
        records.push({
          id: `ATT-${idCounter++}`,
          employeeId: empId,
          date,
          checkIn: '07:55',
          checkOut: '19:35',
          status: 'on_time',
          workHours: 10,
          overtimeHours: 2.0,
          lateMinutes: 0,
          earlyMinutes: 0,
          note: 'Tăng ca phát hành sản phẩm (+2h OT)',
        });
        return;
      }

      if (date === '2026-10-14' && (empId === 'NV001' || empId === 'NV007')) {
        records.push({
          id: `ATT-${idCounter++}`,
          employeeId: empId,
          date,
          checkIn: '07:50',
          checkOut: '19:05',
          status: 'on_time',
          workHours: 9.5,
          overtimeHours: 1.5,
          lateMinutes: 0,
          earlyMinutes: 0,
          note: 'Tăng ca kiểm thử hệ thống (+1.5h OT)',
        });
        return;
      }

      if (date === '2026-10-21' && empId === 'NV001') {
        records.push({
          id: `ATT-${idCounter++}`,
          employeeId: empId,
          date,
          checkIn: '07:55',
          checkOut: '20:05',
          status: 'on_time',
          workHours: 10.5,
          overtimeHours: 2.5,
          lateMinutes: 0,
          earlyMinutes: 0,
          note: 'Tăng ca hoàn thành tiến độ quý (+2.5h OT)',
        });
        return;
      }

      // Specific conditions for realistic variance
      if (date === '2026-11-03') {
        if (empId === 'NV005') {
          records.push({
            id: `ATT-${idCounter++}`,
            employeeId: empId,
            date,
            checkIn: '08:35',
            checkOut: null,
            status: 'late',
            workHours: 4.5,
            overtimeHours: 0,
            lateMinutes: 35,
            earlyMinutes: 0,
            note: 'Tắc đường đường vành đai 3',
          });
        } else if (empId === 'NV008') {
          records.push({
            id: `ATT-${idCounter++}`,
            employeeId: empId,
            date,
            checkIn: null,
            checkOut: null,
            status: 'leave_unapproved',
            workHours: 0,
            overtimeHours: 0,
            lateMinutes: 0,
            earlyMinutes: 0,
            note: 'Chưa có thông tin điểm danh',
          });
        } else {
          records.push({
            id: `ATT-${idCounter++}`,
            employeeId: empId,
            date,
            checkIn: '07:55',
            checkOut: null,
            status: 'on_time',
            workHours: 4.5,
            overtimeHours: 0,
            lateMinutes: 0,
            earlyMinutes: 0,
            note: 'Đang làm việc',
          });
        }
      } else if (date === '2026-10-24' && empId === 'NV003') {
        records.push({
          id: `ATT-${idCounter++}`,
          employeeId: empId,
          date,
          checkIn: null,
          checkOut: null,
          status: 'leave_approved',
          workHours: 0,
          overtimeHours: 0,
          lateMinutes: 0,
          earlyMinutes: 0,
          note: 'Nghỉ ốm có phép (LR003)',
        });
      } else if (date === '2026-10-28' && empId === 'NV007') {
        records.push({
          id: `ATT-${idCounter++}`,
          employeeId: empId,
          date,
          checkIn: '08:18',
          checkOut: '17:35',
          status: 'late',
          workHours: 8.0,
          overtimeHours: 0,
          lateMinutes: 18,
          earlyMinutes: 0,
          note: 'Đi muộn 18 phút',
        });
      } else if (date === '2026-10-29' && empId === 'NV002') {
        records.push({
          id: `ATT-${idCounter++}`,
          employeeId: empId,
          date,
          checkIn: '07:50',
          checkOut: '16:45',
          status: 'early_leave',
          workHours: 7.5,
          overtimeHours: 0,
          lateMinutes: 0,
          earlyMinutes: 45,
          note: 'Xin về sớm đưa con khám bệnh',
        });
      } else {
        // Standard on time
        records.push({
          id: `ATT-${idCounter++}`,
          employeeId: empId,
          date,
          checkIn: '07:52',
          checkOut: '17:35',
          status: 'on_time',
          workHours: 8.0,
          overtimeHours: 0,
          lateMinutes: 0,
          earlyMinutes: 0,
        });
      }
    });
  });

  return records;
};

export const initialAttendanceRecords = generateMockAttendance();

export const initialPayrollRecords: PayrollRecord[] = [
  {
    id: 'PR-2026-10-001',
    employeeId: 'NV001',
    month: 10,
    year: 2026,
    standardWorkDays: 22,
    actualWorkDays: 22,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    baseSalary: 28000000,
    allowance: 2500000,
    bonus: 3000000,
    overtimePay: 1500000,
    latePenalty: 0,
    insuranceDeduction: 28000000 * 0.105,
    taxDeduction: 1550000,
    netSalary: 28000000 + 2500000 + 3000000 + 1500000 - (28000000 * 0.105) - 1550000,
    paymentStatus: 'paid',
    paymentDate: '2026-11-01',
  },
  {
    id: 'PR-2026-10-002',
    employeeId: 'NV002',
    month: 10,
    year: 2026,
    standardWorkDays: 22,
    actualWorkDays: 22,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    baseSalary: 18000000,
    allowance: 1500000,
    bonus: 1000000,
    overtimePay: 0,
    latePenalty: 50000,
    insuranceDeduction: 18000000 * 0.105,
    taxDeduction: 450000,
    netSalary: 18000000 + 1500000 + 1000000 - 50000 - (18000000 * 0.105) - 450000,
    paymentStatus: 'paid',
    paymentDate: '2026-11-01',
  },
  {
    id: 'PR-2026-10-003',
    employeeId: 'NV003',
    month: 10,
    year: 2026,
    standardWorkDays: 22,
    actualWorkDays: 21,
    paidLeaveDays: 1,
    unpaidLeaveDays: 0,
    baseSalary: 22000000,
    allowance: 1800000,
    bonus: 2000000,
    overtimePay: 800000,
    latePenalty: 0,
    insuranceDeduction: 22000000 * 0.105,
    taxDeduction: 820000,
    netSalary: 22000000 + 1800000 + 2000000 + 800000 - (22000000 * 0.105) - 820000,
    paymentStatus: 'paid',
    paymentDate: '2026-11-01',
  },
  {
    id: 'PR-2026-10-004',
    employeeId: 'NV004',
    month: 10,
    year: 2026,
    standardWorkDays: 22,
    actualWorkDays: 22,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    baseSalary: 20000000,
    allowance: 2000000,
    bonus: 2500000,
    overtimePay: 0,
    latePenalty: 0,
    insuranceDeduction: 20000000 * 0.105,
    taxDeduction: 680000,
    netSalary: 20000000 + 2000000 + 2500000 - (20000000 * 0.105) - 680000,
    paymentStatus: 'paid',
    paymentDate: '2026-11-01',
  },
  {
    id: 'PR-2026-10-005',
    employeeId: 'NV005',
    month: 10,
    year: 2026,
    standardWorkDays: 22,
    actualWorkDays: 21,
    paidLeaveDays: 1,
    unpaidLeaveDays: 0,
    baseSalary: 14000000,
    allowance: 3000000,
    bonus: 4500000,
    overtimePay: 0,
    latePenalty: 150000,
    insuranceDeduction: 14000000 * 0.105,
    taxDeduction: 320000,
    netSalary: 14000000 + 3000000 + 4500000 - 150000 - (14000000 * 0.105) - 320000,
    paymentStatus: 'paid',
    paymentDate: '2026-11-01',
  },
  {
    id: 'PR-2026-10-006',
    employeeId: 'NV006',
    month: 10,
    year: 2026,
    standardWorkDays: 22,
    actualWorkDays: 22,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    baseSalary: 26000000,
    allowance: 2200000,
    bonus: 2000000,
    overtimePay: 0,
    latePenalty: 0,
    insuranceDeduction: 26000000 * 0.105,
    taxDeduction: 1200000,
    netSalary: 26000000 + 2200000 + 2000000 - (26000000 * 0.105) - 1200000,
    paymentStatus: 'paid',
    paymentDate: '2026-11-01',
  },
  {
    id: 'PR-2026-10-007',
    employeeId: 'NV007',
    month: 10,
    year: 2026,
    standardWorkDays: 22,
    actualWorkDays: 22,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    baseSalary: 25000000,
    allowance: 2000000,
    bonus: 2000000,
    overtimePay: 1200000,
    latePenalty: 100000,
    insuranceDeduction: 25000000 * 0.105,
    taxDeduction: 1100000,
    netSalary: 25000000 + 2000000 + 2000000 + 1200000 - 100000 - (25000000 * 0.105) - 1100000,
    paymentStatus: 'paid',
    paymentDate: '2026-11-01',
  },
  {
    id: 'PR-2026-10-008',
    employeeId: 'NV008',
    month: 10,
    year: 2026,
    standardWorkDays: 22,
    actualWorkDays: 22,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    baseSalary: 7000000,
    allowance: 1000000,
    bonus: 500000,
    overtimePay: 0,
    latePenalty: 0,
    insuranceDeduction: 0, // Thử việc chưa đóng BH
    taxDeduction: 0,
    netSalary: 7000000 + 1000000 + 500000,
    paymentStatus: 'paid',
    paymentDate: '2026-11-01',
  },
  // September 2026 records for historical lookup
  {
    id: 'PR-2026-09-001',
    employeeId: 'NV001',
    month: 9,
    year: 2026,
    standardWorkDays: 22,
    actualWorkDays: 22,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    baseSalary: 28000000,
    allowance: 2500000,
    bonus: 2500000,
    overtimePay: 0,
    latePenalty: 0,
    insuranceDeduction: 28000000 * 0.105,
    taxDeduction: 1400000,
    netSalary: 28000000 + 2500000 + 2500000 - (28000000 * 0.105) - 1400000,
    paymentStatus: 'paid',
    paymentDate: '2026-10-02',
  },
];

export const initialImportLogs: ImportLog[] = [
  {
    id: 'IMP-2026-004',
    fileName: 'Cham_Cong_Thang_10_2026_MayQuetVanTay.xlsx',
    importedBy: 'Nguyễn Quản Trị',
    importedAt: '2026-11-01 08:30:12',
    totalRows: 176,
    successRows: 176,
    errorRows: 0,
    status: 'success',
  },
  {
    id: 'IMP-2026-003',
    fileName: 'Cham_Cong_Tuan_4_Thang_10.xlsx',
    importedBy: 'Lê Thị Bích',
    importedAt: '2026-10-25 17:15:04',
    totalRows: 40,
    successRows: 38,
    errorRows: 2,
    status: 'partial',
    errors: [
      { row: 14, error: 'Mã nhân viên NV999 không tồn tại trong hệ thống' },
      { row: 29, error: 'Định dạng giờ check-in không hợp lệ: "08h30"' },
    ],
  },
  {
    id: 'IMP-2026-002',
    fileName: 'Danh_Sach_Nhan_Vien_Moi_Q3_2026.xlsx',
    importedBy: 'Lê Thị Bích',
    importedAt: '2026-09-01 09:00:22',
    totalRows: 5,
    successRows: 5,
    errorRows: 0,
    status: 'success',
  },
  {
    id: 'IMP-2026-001',
    fileName: 'Cham_Cong_Thang_09_2026.xlsx',
    importedBy: 'Nguyễn Quản Trị',
    importedAt: '2026-10-01 10:20:45',
    totalRows: 176,
    successRows: 176,
    errorRows: 0,
    status: 'success',
  },
];

export const initialSettings: SystemSettings = {
  companyName: 'CÔNG TY CỔ PHẦN CÔNG NGHỆ VÀ TRUYỀN THÔNG TOÀN CẦU',
  companyAddress: 'Tầng 12, Tòa nhà Landmark 72, Đường Phạm Hùng, Q. Nam Từ Liêm, TP. Hà Nội',
  companyTaxCode: '0108992341',
  standardCheckIn: '08:00',
  standardCheckOut: '17:30',
  gracePeriodMinutes: 15,
  salaryCutoffDay: 25,
  standardMonthlyWorkDays: 22,
  allowanceDefault: 1500000,
  insurancePercent: 10.5,
};

