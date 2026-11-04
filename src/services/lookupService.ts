import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { decodeAttendanceNote } from './attendanceService';
import { buildMatrixFromAttendanceDaily } from '../utils/excelParser';
import {
  Employee,
  AttendanceRecord,
  PayrollRecord,
  LeaveBalance,
  AttendanceOvertimeIndicator,
  EmployeeAttendanceMatrix,
} from '../types';

export interface CalculatedAttendanceSummary {
  standardWorkDays: number;
  actualWorkDays: number;
  totalWorkHours: number;
  onTimeDays: number;
  lateDays: number;
  earlyLeaveDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  totalLateMinutes: number;
  totalEarlyMinutes: number;
  overtimeHours: number;
  overtimeIndicators?: AttendanceOvertimeIndicator[];
  matrix?: EmployeeAttendanceMatrix;
}

export interface LookupResult {
  success: boolean;
  message?: string;
  employee?: Employee;
  attendanceDaily?: AttendanceRecord[];
  payrollSummary?: PayrollRecord;
  calculatedSummary?: CalculatedAttendanceSummary;
  leaveBalance?: LeaveBalance;
}

const SECURITY_STORAGE_KEY = 'hr_lookup_anti_bruteforce';
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30 * 1000; // 30 giây khóa khi dò sai 5 lần
const MIN_COOLDOWN_MS = 1500; // Tối thiểu 1.5 giây giữa 2 lần bấm tra cứu

interface SecurityState {
  failedAttempts: number;
  lockoutUntil: number;
  lastRequestTime: number;
}

const getStoredSecurityState = (): SecurityState => {
  try {
    const raw = sessionStorage.getItem(SECURITY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        failedAttempts: Number(parsed.failedAttempts) || 0,
        lockoutUntil: Number(parsed.lockoutUntil) || 0,
        lastRequestTime: Number(parsed.lastRequestTime) || 0,
      };
    }
  } catch {
    // Bỏ qua lỗi sessionStorage
  }
  return { failedAttempts: 0, lockoutUntil: 0, lastRequestTime: 0 };
};

const saveSecurityState = (state: SecurityState) => {
  try {
    sessionStorage.setItem(SECURITY_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Bỏ qua lỗi sessionStorage
  }
};

export const lookupSecurity = {
  checkCanQuery(): { allowed: boolean; remainingLockoutSeconds?: number; message?: string } {
    const state = getStoredSecurityState();
    const now = Date.now();

    // 1. Kiểm tra lockout
    if (state.lockoutUntil > now) {
      const remaining = Math.ceil((state.lockoutUntil - now) / 1000);
      return {
        allowed: false,
        remainingLockoutSeconds: remaining,
        message: `Phát hiện nhiều lần nhập mã nhân viên không hợp lệ liên tiếp. Nhằm bảo mật dữ liệu, tính năng tra cứu tạm khóa trong ${remaining} giây.`,
      };
    }

    // 2. Kiểm tra throttling cooldown
    if (now - state.lastRequestTime < MIN_COOLDOWN_MS) {
      return {
        allowed: false,
        message: 'Thao tác quá nhanh, vui lòng chờ 1-2 giây trước khi bấm tra cứu tiếp.',
      };
    }

    return { allowed: true };
  },

  recordAttempt(success: boolean) {
    const state = getStoredSecurityState();
    const now = Date.now();
    state.lastRequestTime = now;

    if (success) {
      state.failedAttempts = 0;
      state.lockoutUntil = 0;
    } else {
      state.failedAttempts += 1;
      if (state.failedAttempts >= MAX_FAILED_ATTEMPTS) {
        state.lockoutUntil = now + LOCKOUT_DURATION_MS;
      }
    }
    saveSecurityState(state);
  },

  getFailedAttemptsCount(): number {
    return getStoredSecurityState().failedAttempts;
  },

  getRemainingLockoutSeconds(): number {
    const state = getStoredSecurityState();
    const now = Date.now();
    if (state.lockoutUntil > now) {
      return Math.ceil((state.lockoutUntil - now) / 1000);
    }
    return 0;
  },
};

export const lookupService = {
  /**
   * Gọi RPC bảo mật 'lookup_employee_attendance' để tra cứu nhân viên
   * Không yêu cầu đăng nhập, đảm bảo không để lộ toàn bộ danh sách nhân viên
   */
  async lookupEmployee(
    employeeCode: string,
    month: number,
    year: number
  ): Promise<LookupResult> {
    // 1. Kiểm tra giới hạn truy vấn & chống dò mã
    const securityCheck = lookupSecurity.checkCanQuery();
    if (!securityCheck.allowed) {
      return {
        success: false,
        message: securityCheck.message,
      };
    }

    if (!isSupabaseConfigured) {
      return {
        success: false,
        message: 'SUPABASE_NOT_CONFIGURED',
      };
    }

    try {
      const { data, error } = await supabase.rpc('lookup_employee_attendance', {
        p_employee_code: employeeCode.trim().toUpperCase(),
        p_month: month,
        p_year: year,
      });

      if (error) {
        console.error('Lỗi khi gọi RPC tra cứu nhân sự:', error);
        lookupSecurity.recordAttempt(false);
        return {
          success: false,
          message: error.message,
        };
      }

      if (!data || !data.success) {
        lookupSecurity.recordAttempt(false);
        return {
          success: false,
          message: data?.message || 'Không tìm thấy thông tin nhân viên',
        };
      }

      // Tra cứu thành công -> ghi nhận bảo mật reset đếm lỗi
      lookupSecurity.recordAttempt(true);

      // Chuẩn hóa dữ liệu trả về từ RPC
      const empData = data.employee;
      const employee: Employee = {
        id: empData.id,
        fullName: empData.full_name,
        email: empData.email,
        phone: empData.phone || '',
        department: empData.department_name,
        position: empData.position,
        avatarUrl: empData.avatar_url,
        startDate: empData.start_date,
        status: empData.status,
        baseSalary: 0,
        allowance: 0,
        bankAccount: empData.bank_account
          ? {
              bankName: empData.bank_account.bank_name || '',
              accountNumber: empData.bank_account.account_number || '',
              branch: empData.bank_account.branch || '',
            }
          : undefined,
      };

      const attendanceDaily: AttendanceRecord[] = (data.attendance_daily || []).map((r: any) => {
        const decoded = decodeAttendanceNote(r.note);
        const otHours =
          decoded.overtimeHours !== undefined
            ? decoded.overtimeHours
            : (r.overtime_hours !== undefined && r.overtime_hours !== null
                ? Number(r.overtime_hours)
                : (Number(r.work_hours) > 8 ? Number(r.work_hours) - 8 : 0));

        return {
          id: r.id,
          employeeId: empData.id,
          date: r.date,
          checkIn: r.check_in,
          checkOut: r.check_out,
          status: r.status,
          workHours: Number(r.work_hours) || 0,
          overtimeHours: otHours,
          lateMinutes: Number(r.late_minutes) || 0,
          earlyMinutes: Number(r.early_minutes) || 0,
          note: decoded.note || '',
          leaveCode: decoded.leaveCode || r.leave_code || undefined,
          overtimeDetails: decoded.overtimeDetails || r.overtime_details || undefined,
        };
      });

      // Sắp xếp ngày tăng dần (từ ngày 01 đến ngày cuối tháng)
      attendanceDaily.sort((a, b) => a.date.localeCompare(b.date));

      let payrollSummary: PayrollRecord | undefined = undefined;
      if (data.attendance_summary) {
        const s = data.attendance_summary;
        payrollSummary = {
          id: s.id,
          employeeId: empData.id,
          month: s.month,
          year: s.year,
          standardWorkDays: s.standard_work_days,
          actualWorkDays: Number(s.actual_work_days) || 0,
          paidLeaveDays: Number(s.paid_leave_days) || 0,
          unpaidLeaveDays: Number(s.unpaid_leave_days) || 0,
          baseSalary: Number(s.base_salary) || 0,
          allowance: Number(s.allowance) || 0,
          bonus: Number(s.bonus) || 0,
          overtimePay: Number(s.overtime_pay) || 0,
          latePenalty: Number(s.late_penalty) || 0,
          insuranceDeduction: Number(s.insurance_deduction) || 0,
          taxDeduction: Number(s.tax_deduction) || 0,
          netSalary: Number(s.net_salary) || 0,
          paymentStatus: s.payment_status,
          paymentDate: s.payment_date,
        };
      }

      let leaveBalance: LeaveBalance | undefined = undefined;
      if (data.leave_balance) {
        const lb = data.leave_balance;
        const carried = Number(lb.carried_over_days) || 0;
        const allocated = Number(lb.allocated_days) || 0;
        const used = Number(lb.used_days) || 0;
        const adjusted = Number(lb.adjusted_days) || 0;
        const remaining = Number(lb.remaining_days) || (carried + allocated + adjusted - used);
        leaveBalance = {
          employeeId: empData.id,
          year: lb.year || year,
          carriedOverDays: carried,
          allocatedDays: allocated,
          usedDays: used,
          adjustedDays: adjusted,
          remainingDays: remaining,
          pendingDays: Number(lb.pending_days) || 0,
          totalDays: carried + allocated + adjusted,
          note: lb.note || '',
        };
      }

      // Chỉ xây dựng ma trận chấm công nếu có bản ghi ngày công thực tế
      const hasActualAttendance = attendanceDaily.length > 0;
      const matrix = hasActualAttendance
        ? buildMatrixFromAttendanceDaily(employee, attendanceDaily, month, year)
        : undefined;

      const getMatrixTotal = (nameSub: string, fallback: number = 0) => {
        if (!matrix) return fallback;
        const row = matrix.rows.find((r) => r.indicatorName.toLowerCase().includes(nameSub.toLowerCase()));
        if (row && typeof row.total === 'number') return row.total;
        return fallback;
      };

      // Tính toán các chỉ tiêu KPI tổng hợp từ dữ liệu theo ngày
      const onTimeDays = attendanceDaily.filter((r) => r.status === 'on_time').length;
      const lateDays = attendanceDaily.filter((r) => r.status === 'late').length;
      const earlyLeaveDays = attendanceDaily.filter((r) => r.status === 'early_leave').length;
      const approvedLeaveDays = attendanceDaily.filter((r) => r.status === 'leave_approved').length;
      const unapprovedLeaveDays = attendanceDaily.filter((r) => r.status === 'leave_unapproved').length;
      const totalWorkHours = attendanceDaily.reduce((sum, r) => sum + r.workHours, 0);
      const totalLateMinutes = attendanceDaily.reduce((sum, r) => sum + r.lateMinutes, 0);
      const totalEarlyMinutes = attendanceDaily.reduce((sum, r) => sum + r.earlyMinutes, 0);
      const overtimeHours = attendanceDaily.reduce(
        (sum, r) => sum + Math.max(0, r.overtimeHours ?? (r.workHours > 8 ? r.workHours - 8 : 0)),
        0
      );

      const actualWorkDays =
        payrollSummary?.actualWorkDays ??
        attendanceDaily.filter((r) => r.workHours > 0 || r.status === 'on_time' || r.status === 'late').length;

      const standardWorkDays = payrollSummary?.standardWorkDays ?? 22;

      const ot150 = getMatrixTotal('150%', Number(overtimeHours.toFixed(1)));
      const ot210 = getMatrixTotal('210%', 0);
      const night30 = getMatrixTotal('30%', 0);
      const otSun200 = getMatrixTotal('200%', 0);
      const otSun270 = getMatrixTotal('270%', 0);
      const otHoliday300 = getMatrixTotal('300%', 0);
      const otHoliday390 = getMatrixTotal('390%', 0);

      // Nghỉ làm
      const leaveRow = matrix ? matrix.rows.find((r) => r.indicatorName.toLowerCase().includes('nghỉ làm')) : undefined;
      const totalLeaveCount = typeof leaveRow?.total === 'number' ? leaveRow.total : approvedLeaveDays;

      // Xây dựng danh sách chỉ tiêu Nhóm 2 - Các loại công tăng ca và phụ cấp
      const standardOtIndicators: AttendanceOvertimeIndicator[] = [
        {
          name: 'TC ngày thường (150%)',
          rate: '150%',
          total: ot150,
          unit: 'giờ',
        },
        {
          name: 'TC đêm ngày thường (210%)',
          rate: '210%',
          total: ot210,
          unit: 'giờ',
        },
        {
          name: 'Phụ cấp ca đêm (30%)',
          rate: '30%',
          total: night30,
          unit: 'giờ',
        },
        {
          name: 'TC ngày Chủ nhật (200%)',
          rate: '200%',
          total: otSun200,
          unit: 'giờ',
        },
        {
          name: 'TC đêm Chủ nhật (270%)',
          rate: '270%',
          total: otSun270,
          unit: 'giờ',
        },
        {
          name: 'TC ngày lễ (300%)',
          rate: '300%',
          total: otHoliday300,
          unit: 'giờ',
        },
        {
          name: 'TC đêm ngày lễ (390%)',
          rate: '390%',
          total: otHoliday390,
          unit: 'giờ',
        },
        {
          name: 'Nghỉ làm',
          rate: '100%',
          total: totalLeaveCount,
          unit: 'ngày',
        },
      ];

      const calculatedSummary: CalculatedAttendanceSummary = {
        standardWorkDays,
        actualWorkDays,
        totalWorkHours,
        onTimeDays,
        lateDays,
        earlyLeaveDays,
        paidLeaveDays: payrollSummary?.paidLeaveDays ?? totalLeaveCount,
        unpaidLeaveDays: payrollSummary?.unpaidLeaveDays ?? unapprovedLeaveDays,
        totalLateMinutes,
        totalEarlyMinutes,
        overtimeHours,
        overtimeIndicators: standardOtIndicators,
        matrix,
      };

      return {
        success: true,
        employee,
        attendanceDaily,
        payrollSummary,
        calculatedSummary,
        leaveBalance,
      };
    } catch (err: any) {
      console.error('Lỗi ngoại lệ khi tra cứu:', err);
      lookupSecurity.recordAttempt(false);
      return {
        success: false,
        message: err.message || 'Lỗi hệ thống khi tra cứu dữ liệu',
      };
    }
  },
};
