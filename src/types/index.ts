// Common Data Types for HR Attendance Management

export type Department = 'Phòng Kỹ thuật' | 'Phòng Kinh doanh' | 'Phòng Nhân sự' | 'Phòng Kế toán' | 'Phòng Marketing' | string;

export type EmployeeStatus = 'active' | 'probation' | 'inactive';

export interface Employee {
  id: string; // e.g. "NV001", "S0076"
  fullName: string;
  email: string;
  phone: string;
  department: Department | string;
  position: string;
  avatarUrl?: string;
  startDate: string; // YYYY-MM-DD
  status: EmployeeStatus;
  baseSalary: number; // VND
  allowance: number; // Phụ cấp
  salaryPin?: string; // Mã PIN bảo mật tra cứu lương (mặc định: '1234')
  bankAccount?: {
    accountNumber: string;
    bankName: string;
    branch?: string;
  };
}

export type AttendanceStatus = 'on_time' | 'late' | 'early_leave' | 'leave_approved' | 'leave_unapproved' | 'holiday' | 'weekend';

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  checkIn: string | null; // "08:02"
  checkOut: string | null; // "17:35"
  status: AttendanceStatus;
  workHours: number;
  overtimeHours?: number; // Số giờ tăng ca OT
  lateMinutes: number;
  earlyMinutes: number;
  note?: string;
  leaveCode?: string; // Ký hiệu nghỉ làm (ví dụ: "P", "KP", "HL", "-")
  dayOfWeek?: string; // Thứ (ví dụ: "Thu", "Fri", "Thứ 5")
  overtimeDetails?: Record<string, number | string>; // Chi tiết các chỉ tiêu tăng ca trong ngày
}

export interface AttendanceOvertimeIndicator {
  name: string; // Tên chỉ tiêu thực tế từ Excel (e.g. "TC ngày thường (150%)")
  rate?: string; // e.g. "150%"
  total: number; // Tổng số giờ hoặc ngày
  unit?: string; // "giờ" hoặc "ngày"
  dailyValues?: Record<number, number | string>; // Chi tiết từng ngày 1..31
}

export interface PayrollRecord {
  id: string;
  employeeId: string;
  month: number; // 1-12
  year: number;
  standardWorkDays: number;
  actualWorkDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  baseSalary: number;
  allowance: number;
  bonus: number;
  overtimePay: number;
  latePenalty: number;
  insuranceDeduction: number; // BHXH 8%, BHYT 1.5%, BHTN 1% = 10.5%
  taxDeduction: number;
  netSalary: number; // Lương thực nhận
  paymentStatus: 'paid' | 'pending' | 'draft';
  paymentDate?: string;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  leaveType: 'annual' | 'sick' | 'unpaid' | 'maternity';
  startDate: string;
  endDate: string;
  daysCount: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  approvedBy?: string;
  approverNote?: string;
}

export interface LeaveBalance {
  employeeId: string;
  year: number;
  carriedOverDays: number; // Tồn đầu năm
  allocatedDays: number;   // Phép được cấp trong năm (VD: 12 ngày)
  usedDays: number;        // Phép đã sử dụng
  adjustedDays: number;    // Điều chỉnh phép (+ hoặc -)
  remainingDays: number;   // Còn lại (= carriedOverDays + allocatedDays + adjustedDays - usedDays)
  pendingDays: number;     // Đang chờ duyệt
  totalDays: number;       // Tổng hạn mức (= carriedOverDays + allocatedDays + adjustedDays)
  note?: string;
}

/**
 * Bản ghi Danh mục Phép Tồn chuẩn 6 trường theo yêu cầu mới
 */
export interface EmployeeLeaveBalanceRecord {
  id?: string;
  employeeCode: string;       // Mã nhân viên
  employeeName: string;       // Tên nhân viên
  department: string;         // Bộ phận
  leaveBalance2025: number;   // Phép tồn năm 2025
  leaveGenerated2026: number; // Phép phát sinh năm 2026
  remainingDays: number;      // Số ngày còn lại
  month?: number | null;      // Tháng dữ liệu (1..12 hoặc null)
  year: number;               // Năm dữ liệu (mặc định 2026)
  importBatchId?: string;     // Mã đợt nhập Excel
  createdAt?: string;
  updatedAt?: string;
}

export interface ExcelPayrollMapping {
  employeeIdCol: string;
  fullNameCol?: string;
  standardWorkDaysCol?: string;
  actualWorkDaysCol?: string;
  baseSalaryCol?: string;
  allowanceCol?: string;
  bonusCol?: string;
  overtimePayCol?: string;
  latePenaltyCol?: string;
  insuranceDeductionCol?: string;
  taxDeductionCol?: string;
  netSalaryCol?: string;
  paymentStatusCol?: string;
  paymentDateCol?: string;
}

export interface ParsedPayrollRow {
  rowNum: number;
  raw: Record<string, any>;
  employeeId: string;
  fullName: string;
  standardWorkDays: number;
  actualWorkDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  baseSalary: number;
  allowance: number;
  bonus: number;
  overtimePay: number;
  latePenalty: number;
  insuranceDeduction: number;
  taxDeduction: number;
  netSalary: number;
  paymentStatus: 'paid' | 'pending' | 'draft';
  paymentDate?: string;
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ExcelLeaveMapping {
  employeeIdCol: string;
  fullNameCol?: string;
  carriedOverDaysCol?: string; // Tồn đầu năm
  allocatedDaysCol?: string;   // Phép được cấp
  usedDaysCol?: string;        // Phép đã sử dụng
  adjustedDaysCol?: string;    // Điều chỉnh
  remainingDaysCol?: string;   // Còn lại
  pendingDaysCol?: string;     // Đang chờ duyệt
}

export interface ParsedLeaveRow {
  rowNum: number;
  raw: Record<string, any>;
  employeeId: string;
  fullName: string;
  carriedOverDays: number;
  allocatedDays: number;
  usedDays: number;
  adjustedDays: number;
  remainingDays: number;
  expectedRemainingDays: number;
  pendingDays: number;
  hasFormulaMismatch: boolean;
  formulaNote?: string;
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ImportLog {
  id: string;
  fileName: string;
  importedBy: string;
  importedAt: string;
  totalRows: number;
  successRows: number;
  errorRows: number;
  status: 'success' | 'partial' | 'failed';
  errors?: { row: number; error: string }[];
}

export interface SystemSettings {
  companyName: string;
  companyAddress: string;
  companyTaxCode: string;
  standardCheckIn: string; // "08:00"
  standardCheckOut: string; // "17:30"
  gracePeriodMinutes: number; // 15 mins
  salaryCutoffDay: number; // ngày 25 hàng tháng
  standardMonthlyWorkDays: number; // 22 ngày
  allowanceDefault: number;
  insurancePercent: number; // 10.5%
}

export interface AdminUser {
  id: string;
  username: string;
  fullName: string;
  role: 'super_admin' | 'hr_manager';
  email: string;
  avatarUrl: string;
}

export interface ExcelColumnMapping {
  employeeIdCol: string;
  fullNameCol?: string;
  departmentCol?: string;
  startDateCol?: string;
  positionCol?: string;
  dateCol: string;
  checkInCol: string;
  checkOutCol?: string;
  noteCol?: string;
}

export interface ParsedAttendanceRow {
  rowNum: number;
  raw: Record<string, any>;
  employeeId: string;
  fullName: string;
  department?: string;
  startDate?: string;
  date: string;
  checkIn: string;
  checkOut: string;
  note: string;
  leaveCode?: string; // Ký hiệu nghỉ (e.g. "P", "HL", "-")
  overtimeHours?: number; // Số giờ tăng ca OT
  overtimeDetails?: Record<string, number | string>; // Chi tiết các chỉ tiêu tăng ca
  status: AttendanceStatus;
  workHours: number;
  lateMinutes: number;
  earlyMinutes: number;
  isValid: boolean;
  isNewEmployee?: boolean;
  errors: string[];
  warnings: string[];
}

export type ImportConflictMode = 'overwrite' | 'upsert';

export interface ImportConflictInfo {
  hasExistingData: boolean;
  existingCount: number;
  month: number;
  year: number;
}

export interface EmployeeSyncRecord {
  id: string;
  fullName: string;
  department: string;
  startDate: string;
  position?: string;
  action: 'create' | 'update' | 'keep' | 'error';
  errorReason?: string;
  changedFields?: string[];
}

export interface ImportReportSummary {
  totalEmployeesRecognized: number;
  existingEmployeesCount: number;
  newEmployeesCreatedCount: number;
  updatedEmployeesCount: number;
  successfulAttendanceEmployeesCount: number;
  failedAttendanceEmployeesCount: number;
  totalErrorRows: number;
  newEmployeesList: EmployeeSyncRecord[];
  updatedEmployeesList: EmployeeSyncRecord[];
}

export interface ImportExecutionResult {
  success: boolean;
  message: string;
  totalRows: number;
  successRows: number;
  errorRows: number;
  storageFilePath?: string | null;
  importLogId?: string;
  reportSummary?: ImportReportSummary;
}

// ==============================================================================
// ĐỊNH DẠNG MA TRẬN BẢNG CÔNG GIỐNG 100% FILE EXCEL MẪU (mẫu(1).xlsx)
// ==============================================================================

export interface EmployeeAttendanceMatrixRow {
  indicatorName: string;
  dataType: 'time' | 'hours' | 'leave' | 'count';
  values: Record<number, string | number>; // Ngày (1..31) -> Giá trị ô ("08:00", 8, 4.5, "P", "-")
  total: number | string; // Cột TỔNG thống kê riêng từng dòng chỉ tiêu
  unit?: string; // "giờ", "ngày", ""
}

export interface EmployeeAttendanceMatrix {
  employeeId: string;
  fullName: string;
  department: string;
  startDate: string;
  month: number;
  year: number;
  daysInMonth: number;
  daysOfWeek: Record<number, string>; // Ngày (1..31) -> Thứ ("Thu", "Fri", "Sat", "Sun"...)
  rows: EmployeeAttendanceMatrixRow[];
  summary: {
    totalWorkHours: number;
    totalWorkDays: number;
    totalLeaveDays: number;
    overtime150: number;
    overtime210: number;
    nightAllowance30: number;
    overtimeSunday200: number;
    overtimeSunday270: number;
    otherOvertime: number;
  };
}


