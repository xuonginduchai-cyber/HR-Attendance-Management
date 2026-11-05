import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  Employee,
  AttendanceRecord,
  PayrollRecord,
  LeaveRequest,
  LeaveBalance,
  ImportLog,
  SystemSettings,
  ParsedAttendanceRow,
  ImportConflictMode,
  ImportExecutionResult,
  EmployeeSyncRecord,
  EmployeeAttendanceMatrix,
  ImportReportSummary,
  EmployeeLeaveBalanceRecord,
} from '../types';
import {
  initialEmployees,
  initialAttendanceRecords,
  initialPayrollRecords,
  initialLeaveRequests,
  initialLeaveBalances,
  initialImportLogs,
  initialSettings,
} from '../data/mockData';
import { supabase, isSupabaseConfigured, checkSupabaseConnection } from '../lib/supabase';
import { employeeService } from '../services/employeeService';
import { attendanceService } from '../services/attendanceService';
import { payrollService } from '../services/payrollService';
import { leaveService } from '../services/leaveService';
import { importService } from '../services/importService';
import { auditService } from '../services/auditService';
import { buildMatrixFromAttendanceDaily, isDateInPeriod, isDateInYear } from '../utils/excelParser';

interface DataContextType {
  employees: Employee[];
  attendanceRecords: AttendanceRecord[];
  payrollRecords: PayrollRecord[];
  leaveRequests: LeaveRequest[];
  leaveBalances: LeaveBalance[];
  employeeLeaveBalances: EmployeeLeaveBalanceRecord[];
  importLogs: ImportLog[];
  importedMatrices: Record<string, EmployeeAttendanceMatrix>;
  settings: SystemSettings;
  isDatabaseConnected: boolean;
  isLoadingFromDatabase: boolean;
  refreshData: () => Promise<void>;
  addEmployee: (emp: Omit<Employee, 'id'> & { id?: string }) => Promise<Employee>;
  updateEmployee: (emp: Employee) => Promise<void>;
  deleteEmployee: (id: string) => Promise<void>;
  deleteEmployees: (ids: string[]) => Promise<void>;
  addAttendanceRecord: (record: Omit<AttendanceRecord, 'id'>) => Promise<void>;
  updateAttendanceRecord: (id: string, updates: Partial<AttendanceRecord>) => Promise<void>;
  deleteAttendanceRecords: (ids: string[]) => Promise<void>;
  deleteAttendanceByEmployeeMonth: (employeeIds: string[], month: number, year: number) => Promise<void>;
  deleteAttendanceByPeriod: (month: number, year: number) => Promise<void>;
  deleteAttendanceByYear: (year: number) => Promise<void>;
  approveLeaveRequest: (id: string, note?: string) => void;
  rejectLeaveRequest: (id: string, note?: string) => void;
  addImportLog: (log: Omit<ImportLog, 'id' | 'importedAt'> & { file?: File }) => Promise<void>;
  importAttendanceData: (params: {
    month: number;
    year: number;
    validRows: ParsedAttendanceRow[];
    totalRows: number;
    errorRowsCount: number;
    errorDetails: { row: number; error: string }[];
    file?: File;
    importedByName: string;
    mode: ImportConflictMode;
    employeesSyncList: EmployeeSyncRecord[];
    matrices?: EmployeeAttendanceMatrix[];
  }) => Promise<ImportExecutionResult>;
  importPayrollData: (params: {
    month: number;
    year: number;
    records: PayrollRecord[];
    mode: ImportConflictMode;
    importedByName: string;
  }) => Promise<{ success: boolean; count: number; error?: string }>;
  deletePayrollRecords: (records: { id?: string; employeeId: string; month: number; year: number }[]) => Promise<void>;
  deletePayrollByPeriod: (month: number, year: number) => Promise<void>;
  deletePayrollByYear: (year: number) => Promise<void>;
  importLeaveBalances: (params: {
    year: number;
    records: LeaveBalance[];
    mode: ImportConflictMode;
    importedByName: string;
  }) => Promise<{ success: boolean; count: number; error?: string }>;
  importEmployeeLeaveBalances: (params: {
    records: EmployeeLeaveBalanceRecord[];
    month?: number | null;
    year: number;
    mode: ImportConflictMode;
    importedByName: string;
    batchId?: string;
  }) => Promise<{ success: boolean; count: number; error?: string }>;
  deleteEmployeeLeaveBalances: (ids: string[]) => Promise<void>;
  deleteEmployeeLeaveBalancesByPeriod: (month: number | null, year: number) => Promise<void>;
  deleteEmployeeLeaveBalancesByYear: (year: number) => Promise<void>;
  getEmployeeLeaveBalance: (empCode: string, month?: number | null, year?: number) => EmployeeLeaveBalanceRecord | undefined;
  updateEmployeeSalaryPin: (employeeId: string, newPin: string) => Promise<void>;
  verifyEmployeeSalaryPin: (employeeId: string, pin: string) => { valid: boolean; message?: string };
  updateSettings: (newSettings: Partial<SystemSettings>) => void;
  getEmployeeById: (id: string) => Employee | undefined;
  getLeaveBalanceByEmployee: (empId: string, year?: number) => LeaveBalance | undefined;
  getAttendanceByEmployee: (empId: string, month?: number, year?: number) => AttendanceRecord[];
  getAttendanceMatrix: (empId: string, month?: number, year?: number) => EmployeeAttendanceMatrix | undefined;
  getAvailablePeriodsForEmployee: (empId: string) => Array<{ month: number; year: number }>;
  getPayrollByEmployee: (empId: string, month?: number, year?: number) => PayrollRecord | undefined;
}

export const buildDailyRecordsFromMatrix = (mat: EmployeeAttendanceMatrix): AttendanceRecord[] => {
  const records: AttendanceRecord[] = [];
  const { month, year, daysInMonth, rows, employeeId } = mat;
  const cleanEmpId = employeeId.trim().toUpperCase();

  const startRow = rows.find((r) => r.indicatorName.toLowerCase().includes('bắt đầu'));
  const stopRow = rows.find((r) => r.indicatorName.toLowerCase().includes('kết thúc'));
  const workRow = rows.find((r) => r.indicatorName.toLowerCase().includes('thời gian làm việc'));
  const leaveRow = rows.find((r) => r.indicatorName.toLowerCase().includes('nghỉ làm'));
  const ot150Row = rows.find((r) => r.indicatorName.toLowerCase().includes('150%'));
  const ot210Row = rows.find((r) => r.indicatorName.toLowerCase().includes('210%'));
  const night30Row = rows.find((r) => r.indicatorName.toLowerCase().includes('30%'));
  const otSun200Row = rows.find((r) => r.indicatorName.toLowerCase().includes('200%'));
  const otSun270Row = rows.find((r) => r.indicatorName.toLowerCase().includes('270%'));

  for (let d = 1; d <= daysInMonth; d++) {
    const dayStr = String(d).padStart(2, '0');
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${dayStr}`;

    const startVal = startRow?.values[d];
    const stopVal = stopRow?.values[d];
    const workVal = workRow?.values[d];
    const leaveVal = leaveRow?.values[d];
    const v150 = Number(ot150Row?.values[d]) || 0;
    const v210 = Number(ot210Row?.values[d]) || 0;
    const vNight = Number(night30Row?.values[d]) || 0;
    const v200 = Number(otSun200Row?.values[d]) || 0;
    const v270 = Number(otSun270Row?.values[d]) || 0;

    const workHours = typeof workVal === 'number' ? workVal : (Number(workVal) || 0);
    const checkIn = startVal && startVal !== '-' ? String(startVal) : null;
    const checkOut = stopVal && stopVal !== '-' ? String(stopVal) : null;

    const leaveCode = leaveVal && leaveVal !== '-' && leaveVal !== '0' ? String(leaveVal).trim() : undefined;
    const totalOt = v150 + v210 + v200 + v270;

    const otDetails: Record<string, number> = {};
    if (v150 > 0) otDetails['150%'] = v150;
    if (v210 > 0) otDetails['210%'] = v210;
    if (vNight > 0) otDetails['30%'] = vNight;
    if (v200 > 0) otDetails['200%'] = v200;
    if (v270 > 0) otDetails['270%'] = v270;

    let status: any = 'on_time';
    if (leaveCode) {
      status = leaveCode === 'KP' ? 'leave_unapproved' : 'leave_approved';
    } else if (workHours > 0) {
      status = 'on_time';
    } else {
      const dateObj = new Date(year, month - 1, d);
      const dow = dateObj.getDay();
      status = dow === 0 || dow === 6 ? 'weekend' : 'on_time';
    }

    records.push({
      id: `REC-MAT-${cleanEmpId}-${dateStr}`,
      employeeId: cleanEmpId,
      date: dateStr,
      checkIn,
      checkOut,
      status,
      workHours,
      overtimeHours: totalOt > 0 ? totalOt : (workHours > 8 ? workHours - 8 : 0),
      lateMinutes: 0,
      earlyMinutes: 0,
      note: '',
      leaveCode,
      overtimeDetails: Object.keys(otDetails).length > 0 ? otDetails : undefined,
    });
  }
  return records;
};

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [employees, setEmployees] = useState<Employee[]>(() => {
    try {
      const saved = localStorage.getItem('hr_employees') ?? sessionStorage.getItem('hr_employees');
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return initialEmployees;
  });

  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>(() => {
    try {
      const saved = localStorage.getItem('hr_attendance_records') ?? sessionStorage.getItem('hr_attendance_records');
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return initialAttendanceRecords;
  });

  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>(() => {
    try {
      const saved = localStorage.getItem('hr_payroll_records') ?? sessionStorage.getItem('hr_payroll_records');
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return initialPayrollRecords;
  });

  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>(initialLeaveRequests);

  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>(() => {
    try {
      const saved = localStorage.getItem('hr_leave_balances') ?? sessionStorage.getItem('hr_leave_balances');
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return initialLeaveBalances;
  });

  const [employeeLeaveBalances, setEmployeeLeaveBalances] = useState<EmployeeLeaveBalanceRecord[]>(() => {
    try {
      const saved = localStorage.getItem('hr_employee_leave_balances') ?? sessionStorage.getItem('hr_employee_leave_balances');
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return initialLeaveBalances.map((b) => ({
      id: `ELB-${b.employeeId}-${b.year}`,
      employeeCode: b.employeeId,
      employeeName: `Nhân viên ${b.employeeId}`,
      department: 'Phòng Kỹ thuật',
      leaveBalance2025: b.carriedOverDays || 0,
      leaveGenerated2026: b.allocatedDays != null ? b.allocatedDays : 0,
      remainingDays: b.remainingDays != null ? b.remainingDays : 0,
      year: b.year || 2026,
      month: null,
    }));
  });

  const [importLogs, setImportLogs] = useState<ImportLog[]>(initialImportLogs);
  const [settings, setSettings] = useState<SystemSettings>(initialSettings);
  const [importedMatrices, setImportedMatrices] = useState<Record<string, EmployeeAttendanceMatrix>>(() => {
    try {
      const saved = localStorage.getItem('hr_imported_matrices') || sessionStorage.getItem('hr_imported_matrices');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Tự động lưu persistent state vào localStorage
  const saveToStorage = (key: string, data: any) => {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      sessionStorage.setItem(key, JSON.stringify(data));
    } catch {}
  };

  const getEmployeeById = useCallback(
    (id: string): Employee | undefined => {
      if (!id) return undefined;
      const cleanId = id.trim().toUpperCase();

      // 1. Tìm trong danh sách employees
      const found = employees.find((e) => e.id.trim().toUpperCase() === cleanId);
      if (found) return found;

      // 2. Tự động tái tạo hồ sơ nhân viên từ importedMatrices (Đảm bảo tra cứu ra 100% như Quản lý công)
      const mat = Object.values(importedMatrices).find(
        (m) => m.employeeId.trim().toUpperCase() === cleanId
      );
      if (mat) {
        return {
          id: mat.employeeId.trim().toUpperCase(),
          fullName: mat.fullName,
          email: `${mat.employeeId.toLowerCase().replace(/[^a-z0-9]/g, '')}@congtyviet.com`,
          phone: '',
          department: (mat.department as any) || 'Phòng Kỹ thuật',
          position: 'Nhân viên',
          startDate: mat.startDate || `${mat.year}-01-01`,
          status: 'active',
          baseSalary: 12000000,
          allowance: 1500000,
        };
      }

      // 3. Tìm từ attendanceRecords
      const att = attendanceRecords.find((r) => r.employeeId.trim().toUpperCase() === cleanId);
      if (att) {
        return {
          id: cleanId,
          fullName: `Nhân viên ${cleanId}`,
          email: `${cleanId.toLowerCase().replace(/[^a-z0-9]/g, '')}@congtyviet.com`,
          phone: '',
          department: 'Phòng Kỹ thuật',
          position: 'Nhân viên',
          startDate: att.date || '2026-01-01',
          status: 'active',
          baseSalary: 12000000,
          allowance: 1500000,
        };
      }

      // 4. Tìm từ payrollRecords
      const pay = payrollRecords.find((p) => p.employeeId.trim().toUpperCase() === cleanId);
      if (pay) {
        return {
          id: cleanId,
          fullName: `Nhân viên ${cleanId}`,
          email: `${cleanId.toLowerCase().replace(/[^a-z0-9]/g, '')}@congtyviet.com`,
          phone: '',
          department: 'Phòng Kỹ thuật',
          position: 'Nhân viên',
          startDate: `${pay.year}-01-01`,
          status: 'active',
          baseSalary: pay.baseSalary || 12000000,
          allowance: pay.allowance || 1500000,
        };
      }

      return undefined;
    },
    [employees, importedMatrices, attendanceRecords, payrollRecords]
  );

  const getAttendanceByEmployee = useCallback(
    (empId: string, month?: number, year?: number): AttendanceRecord[] => {
      const cleanId = empId.trim().toUpperCase();
      const records = attendanceRecords.filter((r) => {
        if (r.employeeId.trim().toUpperCase() !== cleanId) return false;
        if (month && year) {
          const prefix = `${year}-${String(month).padStart(2, '0')}`;
          return r.date.startsWith(prefix);
        }
        return true;
      });

      if (records.length > 0) {
        return records;
      }

      // Fallback thông minh: Tự động tái tạo danh sách chấm công từ ma trận importedMatrices nếu records đang trống!
      if (month && year) {
        const mat = importedMatrices[`${cleanId}_${month}_${year}`];
        if (mat) {
          return buildDailyRecordsFromMatrix(mat);
        }
        // CHUẨN HÓA DỮ LIỆU: Đã tra cứu đúng tháng/năm nhưng kỳ này không có dữ liệu
        // Tuyệt đối không lấy dữ liệu của tháng khác trả về!
        return [];
      }

      const matchKey = Object.keys(importedMatrices).find((k) => k.startsWith(`${cleanId}_`));
      if (matchKey && importedMatrices[matchKey]) {
        return buildDailyRecordsFromMatrix(importedMatrices[matchKey]);
      }

      return [];
    },
    [attendanceRecords, importedMatrices]
  );

  const getAttendanceMatrix = useCallback(
    (empId: string, month?: number, year?: number): EmployeeAttendanceMatrix | undefined => {
      const cleanId = empId.trim().toUpperCase();
      if (month && year) {
        const numMonth = Number(month);
        const numYear = Number(year);
        const key = `${cleanId}_${numMonth}_${numYear}`;
        if (importedMatrices[key]) return importedMatrices[key];

        // Tìm trong importedMatrices theo thuộc tính đối tượng nếu key khác định dạng
        const foundMat = Object.values(importedMatrices).find(
          (m) =>
            m.employeeId.trim().toUpperCase() === cleanId &&
            Number(m.month) === numMonth &&
            Number(m.year) === numYear
        );
        if (foundMat) return foundMat;

        // Nếu chưa có trong importedMatrices, tự động xây dựng từ attendanceRecords đúng tháng/năm đó
        const emp = getEmployeeById(cleanId) || {
          id: cleanId,
          fullName: `Nhân viên ${cleanId}`,
          department: 'Phòng Kỹ thuật',
          position: 'Nhân viên',
          startDate: `${numYear}-${String(numMonth).padStart(2, '0')}-01`,
          status: 'active' as const,
          baseSalary: 12000000,
          allowance: 1500000,
          email: `${cleanId.toLowerCase()}@congtyviet.com`,
          phone: '',
        };
        const prefix = `${numYear}-${String(numMonth).padStart(2, '0')}`;
        const empAtt = attendanceRecords.filter(
          (r) => r.employeeId.trim().toUpperCase() === cleanId && r.date.startsWith(prefix)
        );
        if (empAtt.length > 0) {
          return buildMatrixFromAttendanceDaily(emp, empAtt, numMonth, numYear);
        }
        // CHUẨN HÓA DỮ LIỆU: Nếu tra cứu đúng tháng/năm mà không có ma trận kỳ đó -> Trả về undefined!
        return undefined;
      }

      // Chỉ khi KHÔNG chỉ định tháng/năm mới lấy ma trận bất kỳ của nhân viên này:
      // 1. Tìm trong importedMatrices
      const matchKey = Object.keys(importedMatrices).find((k) => k.startsWith(`${cleanId}_`));
      if (matchKey && importedMatrices[matchKey]) {
        return importedMatrices[matchKey];
      }

      // 2. Tìm kiếm ma trận theo thuộc tính đối tượng
      const foundAnyMat = Object.values(importedMatrices).find(
        (m) => m.employeeId.trim().toUpperCase() === cleanId
      );
      if (foundAnyMat) return foundAnyMat;

      // 3. Tự động tái tạo ma trận từ attendanceRecords nếu có bản ghi của nhân viên này
      const allAtt = attendanceRecords.filter((r) => r.employeeId.trim().toUpperCase() === cleanId);
      if (allAtt.length > 0) {
        const emp = getEmployeeById(cleanId) || {
          id: cleanId,
          fullName: `Nhân viên ${cleanId}`,
          department: 'Phòng Kỹ thuật',
          position: 'Nhân viên',
          startDate: '2026-01-01',
          status: 'active' as const,
          baseSalary: 12000000,
          allowance: 1500000,
          email: `${cleanId.toLowerCase()}@congtyviet.com`,
          phone: '',
        };
        const rec = allAtt[0];
        const p = rec.date ? rec.date.split('-') : [];
        const m = p.length >= 2 ? parseInt(p[1], 10) : 10;
        const y = p.length >= 1 ? parseInt(p[0], 10) : 2026;
        const periodAtt = allAtt.filter((r) => r.date.startsWith(`${y}-${String(m).padStart(2, '0')}`));
        return buildMatrixFromAttendanceDaily(emp, periodAtt.length > 0 ? periodAtt : allAtt, m, y);
      }

      return undefined;
    },
    [importedMatrices, attendanceRecords, getEmployeeById]
  );

  const getAvailablePeriodsForEmployee = useCallback(
    (empId: string): Array<{ month: number; year: number }> => {
      const cleanId = empId.trim().toUpperCase();
      const periodsSet = new Set<string>();
      const result: Array<{ month: number; year: number }> = [];

      Object.values(importedMatrices).forEach((mat) => {
        if (mat.employeeId.trim().toUpperCase() === cleanId) {
          const numM = Number(mat.month);
          const numY = Number(mat.year);
          const pKey = `${numM}_${numY}`;
          if (!periodsSet.has(pKey)) {
            periodsSet.add(pKey);
            result.push({ month: numM, year: numY });
          }
        }
      });

      attendanceRecords.forEach((r) => {
        if (r.employeeId.trim().toUpperCase() === cleanId && r.date) {
          const parts = r.date.split('-');
          if (parts.length === 3) {
            const y = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            const pKey = `${m}_${y}`;
            if (!periodsSet.has(pKey)) {
              periodsSet.add(pKey);
              result.push({ month: m, year: y });
            }
          }
        }
      });

      payrollRecords.forEach((p) => {
        if (p.employeeId.trim().toUpperCase() === cleanId) {
          const pKey = `${p.month}_${p.year}`;
          if (!periodsSet.has(pKey)) {
            periodsSet.add(pKey);
            result.push({ month: p.month, year: p.year });
          }
        }
      });

      return result.sort((a, b) => b.year - a.year || b.month - a.month);
    },
    [importedMatrices, attendanceRecords, payrollRecords]
  );

  const [isDatabaseConnected, setIsDatabaseConnected] = useState(false);
  const [isLoadingFromDatabase, setIsLoadingFromDatabase] = useState(false);

  // Tải dữ liệu thật từ Supabase khi có kết nối
  const loadSupabaseData = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setIsDatabaseConnected(false);
      return;
    }

    setIsLoadingFromDatabase(true);
    try {
      const health = await checkSupabaseConnection();
      if (!health.connected) {
        setIsDatabaseConnected(false);
        setIsLoadingFromDatabase(false);
        return;
      }

      setIsDatabaseConnected(true);

      // 1. Tải hồ sơ nhân viên (rất nhanh, ~200ms)
      const empPromise = employeeService.getEmployees().then((dbEmployees) => {
        if (dbEmployees && dbEmployees.length > 0) {
          setEmployees((prev) => {
            const prevMap = new Map(prev.map((e) => [e.id.trim().toUpperCase(), e]));
            dbEmployees.forEach((e) => prevMap.set(e.id.trim().toUpperCase(), e));
            const list = Array.from(prevMap.values());
            saveToStorage('hr_employees', list);
            return list;
          });
        }
        return dbEmployees;
      }).catch((e) => {
        console.warn('Lỗi tải nhân viên:', e);
        return [];
      });

      // 2. Tải bảng lương tổng hợp / summaries (rất nhanh, ~200ms)
      const payrollPromise = payrollService.getPayrollSummaries().then((dbPayroll) => {
        if (dbPayroll && dbPayroll.length > 0) {
          setPayrollRecords((prev) => {
            const prevMap = new Map(prev.map((p) => [`${p.employeeId.trim().toUpperCase()}_${p.month}_${p.year}`, p]));
            dbPayroll.forEach((p) => prevMap.set(`${p.employeeId.trim().toUpperCase()}_${p.month}_${p.year}`, p));
            const list = Array.from(prevMap.values());
            saveToStorage('hr_payroll_records', list);
            return list;
          });
        }
        return dbPayroll;
      }).catch((e) => {
        console.warn('Lỗi tải payroll summaries:', e);
        return [];
      });

      // 3. Tải lịch sử import (~100ms)
      const importsPromise = importService.getImportLogs().then((dbImports) => {
        if (dbImports && dbImports.length > 0) {
          setImportLogs(dbImports);
        }
        return dbImports;
      }).catch((e) => {
        console.warn('Lỗi tải import logs:', e);
        return [];
      });

      // 4. Tải số dư phép năm (~200ms)
      const leavePromise = Promise.allSettled([
        leaveService.getLeaveBalances(),
        leaveService.getEmployeeLeaveBalances(),
        empPromise,
      ]).then(([lbRes, elbRes, empsRes]) => {
        const lbData = lbRes.status === 'fulfilled' ? lbRes.value : [];
        const elbData = elbRes.status === 'fulfilled' ? elbRes.value : [];
        const currentEmps = (empsRes.status === 'fulfilled' && empsRes.value.length > 0) ? empsRes.value : employees;
        const empMap = new Map(currentEmps.map((e) => [e.id.trim().toUpperCase(), e]));

        if (lbData.length > 0) {
          setLeaveBalances(lbData);
          saveToStorage('hr_leave_balances', lbData);
        }

        if (elbData.length > 0) {
          setEmployeeLeaveBalances(elbData);
          saveToStorage('hr_employee_leave_balances', elbData);
        } else if (lbData.length > 0) {
          // Tự động ánh xạ từ bảng leave_balances nếu bảng employee_leave_balances chưa có trên Supabase
          const mappedElb: EmployeeLeaveBalanceRecord[] = lbData.map((b) => {
            const emp = empMap.get(b.employeeId.trim().toUpperCase());
            return {
              id: `ELB-${b.employeeId}-${b.year}`,
              employeeCode: b.employeeId,
              employeeName: emp?.fullName || `Nhân viên ${b.employeeId}`,
              department: emp?.department || 'Phòng Kỹ thuật',
              leaveBalance2025: b.carriedOverDays || 0,
              leaveGenerated2026: b.allocatedDays != null ? b.allocatedDays : 0,
              remainingDays: b.remainingDays != null ? b.remainingDays : 0,
              year: b.year || 2026,
              month: null,
            };
          });
          setEmployeeLeaveBalances(mappedElb);
          saveToStorage('hr_employee_leave_balances', mappedElb);
        }
      }).catch((e) => {
        console.warn('Lỗi tải số dư phép:', e);
      });

      // 5. Tải chấm công hàng ngày (chạy ngầm, không chặn giao diện)
      const attendancePromise = attendanceService.getDailyAttendance().then(async (dbAttendance) => {
        if (dbAttendance && dbAttendance.length > 0) {
          setAttendanceRecords((prev) => {
            const prevMap = new Map(prev.map((a) => [`${a.employeeId.trim().toUpperCase()}_${a.date}`, a]));
            dbAttendance.forEach((a) => prevMap.set(`${a.employeeId.trim().toUpperCase()}_${a.date}`, a));
            const list = Array.from(prevMap.values());
            saveToStorage('hr_attendance_records', list);
            return list;
          });

          const currentEmps = await empPromise;
          const activeEmps = currentEmps.length > 0 ? currentEmps : employees;
          const empMap = new Map(activeEmps.map((e) => [e.id.trim().toUpperCase(), e]));

          const groups = new Map<string, { empId: string; month: number; year: number; records: AttendanceRecord[] }>();
          dbAttendance.forEach((rec) => {
            if (!rec.date) return;
            const parts = rec.date.split('-');
            if (parts.length === 3) {
              const y = parseInt(parts[0], 10);
              const m = parseInt(parts[1], 10);
              const key = `${rec.employeeId.trim().toUpperCase()}_${m}_${y}`;
              if (!groups.has(key)) {
                groups.set(key, { empId: rec.employeeId.trim().toUpperCase(), month: m, year: y, records: [] });
              }
              groups.get(key)!.records.push(rec);
            }
          });

          setImportedMatrices((prev) => {
            const next = { ...prev };
            groups.forEach((group, key) => {
              const emp = empMap.get(group.empId) || {
                id: group.empId,
                fullName: `Nhân viên ${group.empId}`,
                department: 'Phòng Kỹ thuật',
                position: 'Nhân viên',
                startDate: `${group.year}-01-01`,
                status: 'active' as const,
                baseSalary: 12000000,
                allowance: 1500000,
                email: `${group.empId.toLowerCase()}@congtyviet.com`,
                phone: '',
              };
              next[key] = buildMatrixFromAttendanceDaily(emp, group.records, group.month, group.year);
            });
            try {
              localStorage.setItem('hr_imported_matrices', JSON.stringify(next));
              sessionStorage.setItem('hr_imported_matrices', JSON.stringify(next));
            } catch {}
            return next;
          });
        }
      }).catch((e) => {
        console.warn('Lỗi tải chấm công hàng ngày:', e);
      });

      // Chờ toàn bộ các tiến trình hoàn tất
      await Promise.allSettled([empPromise, payrollPromise, importsPromise, leavePromise, attendancePromise]);
    } catch (err) {
      console.warn('Lỗi đồng bộ dữ liệu với Supabase, tiếp tục dùng dữ liệu hiện tại:', err);
    } finally {
      setIsLoadingFromDatabase(false);
    }
  }, []);

  useEffect(() => {
    loadSupabaseData();
  }, [loadSupabaseData]);

  const addEmployee = async (empData: Omit<Employee, 'id'> & { id?: string }): Promise<Employee> => {
    const nextNumber = employees.length + 1;
    const cleanId = (empData.id?.trim().toUpperCase()) || `NV${String(nextNumber).padStart(3, '0')}`;
    const newEmp: Employee = { ...empData, id: cleanId };

    // Cập nhật State tức thì để giao diện mượt mà
    setEmployees((prev) => {
      const filtered = prev.filter((e) => e.id.trim().toUpperCase() !== cleanId);
      const updated = [newEmp, ...filtered];
      saveToStorage('hr_employees', updated);
      return updated;
    });

    // Khởi tạo hạn mức phép năm
    setLeaveBalances((prev) => {
      const filtered = prev.filter((b) => b.employeeId.trim().toUpperCase() !== cleanId);
      const updated = [
        ...filtered,
        {
          employeeId: cleanId,
          year: 2026,
          carriedOverDays: 0,
          allocatedDays: 12,
          usedDays: 0,
          adjustedDays: 0,
          remainingDays: 12,
          pendingDays: 0,
          totalDays: 12,
        },
      ];
      saveToStorage('hr_leave_balances', updated);
      return updated;
    });

    // Đồng bộ lên Supabase nếu có kết nối
    if (isSupabaseConfigured) {
      try {
        await employeeService.createEmployee(newEmp);
        await auditService.logAction('CREATE_EMPLOYEE', 'employees', cleanId, { fullName: newEmp.fullName });
      } catch (err) {
        console.error('Lỗi khi lưu nhân viên vào Supabase:', err);
      }
    }

    return newEmp;
  };

  const updateEmployee = async (emp: Employee) => {
    const cleanId = emp.id.trim().toUpperCase();
    const cleanEmp: Employee = { ...emp, id: cleanId };

    setEmployees((prev) => {
      const updated = prev.map((e) => (e.id.trim().toUpperCase() === cleanId ? cleanEmp : e));
      saveToStorage('hr_employees', updated);
      return updated;
    });

    setImportedMatrices((prev) => {
      const next = { ...prev };
      let changed = false;
      Object.keys(next).forEach((key) => {
        if (key.startsWith(`${cleanId}_`)) {
          next[key] = {
            ...next[key],
            fullName: cleanEmp.fullName,
            department: cleanEmp.department,
          };
          changed = true;
        }
      });
      if (changed) {
        try {
          localStorage.setItem('hr_imported_matrices', JSON.stringify(next));
          sessionStorage.setItem('hr_imported_matrices', JSON.stringify(next));
        } catch {}
      }
      return next;
    });

    if (isSupabaseConfigured) {
      try {
        await employeeService.updateEmployee(cleanEmp);
        await auditService.logAction('UPDATE_EMPLOYEE', 'employees', cleanId, { fullName: cleanEmp.fullName });
      } catch (err) {
        console.error('Lỗi khi cập nhật nhân viên trên Supabase:', err);
      }
    }
  };

  const deleteEmployee = async (id: string) => {
    await deleteEmployees([id]);
  };

  const deleteEmployees = async (ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids.map((id) => id.trim().toUpperCase()));

    setEmployees((prev) => {
      const remaining = prev.filter((e) => !idSet.has(e.id.trim().toUpperCase()));
      saveToStorage('hr_employees', remaining);
      return remaining;
    });
    setAttendanceRecords((prev) => {
      const remaining = prev.filter((r) => !idSet.has(r.employeeId.trim().toUpperCase()));
      saveToStorage('hr_attendance_records', remaining);
      return remaining;
    });
    setPayrollRecords((prev) => {
      const remaining = prev.filter((p) => !idSet.has(p.employeeId.trim().toUpperCase()));
      saveToStorage('hr_payroll_records', remaining);
      return remaining;
    });
    setLeaveBalances((prev) => {
      const remaining = prev.filter((b) => !idSet.has(b.employeeId.trim().toUpperCase()));
      saveToStorage('hr_leave_balances', remaining);
      return remaining;
    });
    setLeaveRequests((prev) => {
      const remaining = prev.filter((r) => !idSet.has(r.employeeId.trim().toUpperCase()));
      saveToStorage('hr_leave_requests', remaining);
      return remaining;
    });

    setImportedMatrices((prev) => {
      const next: Record<string, EmployeeAttendanceMatrix> = {};
      Object.entries(prev).forEach(([key, mat]) => {
        const keyEmpId = key.split('_')[0]?.trim().toUpperCase();
        const matEmpId = mat.employeeId?.trim().toUpperCase();
        if (!idSet.has(matEmpId) && (!keyEmpId || !idSet.has(keyEmpId))) {
          next[key] = mat;
        }
      });
      try {
        localStorage.setItem('hr_imported_matrices', JSON.stringify(next));
        sessionStorage.setItem('hr_imported_matrices', JSON.stringify(next));
      } catch {}
      return next;
    });

    // Dọn dẹp hr_last_imported_period nếu trùng nhân viên vừa bị xóa
    try {
      const savedPeriod = localStorage.getItem('hr_last_imported_period');
      if (savedPeriod) {
        const parsed = JSON.parse(savedPeriod);
        if (parsed.employeeId && idSet.has(String(parsed.employeeId).trim().toUpperCase())) {
          localStorage.removeItem('hr_last_imported_period');
        }
      }
    } catch {}

    if (isSupabaseConfigured) {
      try {
        await employeeService.deleteEmployees(ids);
        await auditService.logAction('DELETE_EMPLOYEES', 'employees', ids.join(','), { count: ids.length });
      } catch (err) {
        console.error('Lỗi khi xóa nhân viên trên Supabase:', err);
      }
    }
  };

  const addAttendanceRecord = async (record: Omit<AttendanceRecord, 'id'>) => {
    const tempId = `ATT-${Date.now()}`;
    const newRecord: AttendanceRecord = { ...record, id: tempId };
    setAttendanceRecords(prev => [newRecord, ...prev]);

    if (isSupabaseConfigured) {
      try {
        const saved = await attendanceService.addAttendanceRecord(record);
        setAttendanceRecords(prev => prev.map(r => (r.id === tempId ? saved : r)));
        await auditService.logAction('CREATE_ATTENDANCE', 'attendance_daily', saved.id, {
          employeeId: record.employeeId,
          date: record.date,
        });
      } catch (err) {
        console.error('Lỗi lưu điểm danh vào Supabase:', err);
      }
    }
  };

  const updateAttendanceRecord = async (id: string, updates: Partial<AttendanceRecord>) => {
    setAttendanceRecords(prev =>
      prev.map(r => (r.id === id ? { ...r, ...updates } : r))
    );

    if (isSupabaseConfigured) {
      try {
        await attendanceService.updateAttendanceRecord(id, updates);
        await auditService.logAction('UPDATE_ATTENDANCE', 'attendance_daily', id, updates);
      } catch (err) {
        console.error('Lỗi cập nhật điểm danh trên Supabase:', err);
      }
    }
  };

  const deleteAttendanceRecords = async (ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    setAttendanceRecords((prev) => {
      const remaining = prev.filter((r) => !idSet.has(r.id));
      saveToStorage('hr_attendance_records', remaining);
      return remaining;
    });

    if (isSupabaseConfigured) {
      try {
        await attendanceService.deleteAttendanceRecordsByIds(ids);
        await auditService.logAction('DELETE_ATTENDANCE', 'attendance_daily', ids.join(','), { count: ids.length });
      } catch (err) {
        console.error('Lỗi khi xóa bản ghi điểm danh trên Supabase:', err);
      }
    }
  };

  const deleteAttendanceByEmployeeMonth = async (employeeIds: string[], month: number, year: number) => {
    if (employeeIds.length === 0) return;
    const empSet = new Set(employeeIds.map((id) => id.trim().toUpperCase()));
    const numMonth = Number(month);
    const numYear = Number(year);
    const prefix = `${numYear}-${String(numMonth).padStart(2, '0')}`;

    // 1. Cập nhật attendanceRecords và lưu vào localStorage
    setAttendanceRecords((prev) => {
      const remaining = prev.filter((r) => !(r.date.startsWith(prefix) && empSet.has(r.employeeId.trim().toUpperCase())));
      saveToStorage('hr_attendance_records', remaining);
      return remaining;
    });

    // 2. Cập nhật importedMatrices và lưu storage
    setImportedMatrices((prev) => {
      const next: Record<string, EmployeeAttendanceMatrix> = {};
      Object.entries(prev).forEach(([key, mat]) => {
        if (!(Number(mat.month) === numMonth && Number(mat.year) === numYear && empSet.has(mat.employeeId.trim().toUpperCase()))) {
          next[key] = mat;
        }
      });
      try {
        localStorage.setItem('hr_imported_matrices', JSON.stringify(next));
        sessionStorage.setItem('hr_imported_matrices', JSON.stringify(next));
      } catch {}
      return next;
    });

    // 3. Xóa bảng lương liên quan trong kỳ của các nhân viên này
    setPayrollRecords((prev) => {
      const remaining = prev.filter(
        (p) => !(Number(p.month) === numMonth && Number(p.year) === numYear && empSet.has(p.employeeId.trim().toUpperCase()))
      );
      saveToStorage('hr_payroll_records', remaining);
      return remaining;
    });

    // 4. Đồng bộ Supabase (xóa attendance_daily và attendance_summaries)
    if (isSupabaseConfigured) {
      try {
        await attendanceService.deleteAttendanceByEmployeeMonth(employeeIds, numMonth, numYear);
        await auditService.logAction('DELETE_ATTENDANCE_BATCH', 'attendance_daily', employeeIds.join(','), {
          employeeIds,
          month: numMonth,
          year: numYear,
        });
      } catch (err) {
        console.error('Lỗi khi xóa chấm công nhân viên theo kỳ trên Supabase:', err);
      }
    }
  };

  const deleteAttendanceByPeriod = async (month: number, year: number) => {
    const numMonth = Number(month);
    const numYear = Number(year);
    const paddedMonth = String(numMonth).padStart(2, '0');
    const prefix = `${numYear}-${paddedMonth}`;

    // 1. Thu thập danh sách ID nhân viên bị ảnh hưởng trước khi xóa
    const affectedEmpIds = new Set<string>();
    attendanceRecords.forEach((r) => {
      if (isDateInPeriod(r.date, numMonth, numYear) && r.employeeId) {
        affectedEmpIds.add(r.employeeId.trim().toUpperCase());
      }
    });
    Object.entries(importedMatrices).forEach(([key, mat]) => {
      const isTarget =
        (Number(mat.month) === numMonth && Number(mat.year) === numYear) ||
        key.endsWith(`_${numMonth}_${numYear}`) ||
        key.endsWith(`_${paddedMonth}_${numYear}`);
      if (isTarget && mat.employeeId) {
        affectedEmpIds.add(mat.employeeId.trim().toUpperCase());
      }
    });

    // 2. Cập nhật attendanceRecords và lưu vào localStorage
    let remainingAttendance: AttendanceRecord[] = [];
    setAttendanceRecords((prev) => {
      remainingAttendance = prev.filter((r) => !isDateInPeriod(r.date, numMonth, numYear));
      saveToStorage('hr_attendance_records', remainingAttendance);
      return remainingAttendance;
    });

    // 3. Cập nhật importedMatrices và lưu storage
    let remainingMatrices: Record<string, EmployeeAttendanceMatrix> = {};
    setImportedMatrices((prev) => {
      const next: Record<string, EmployeeAttendanceMatrix> = {};
      Object.entries(prev).forEach(([key, mat]) => {
        const isTarget =
          (Number(mat.month) === numMonth && Number(mat.year) === numYear) ||
          key.endsWith(`_${numMonth}_${numYear}`) ||
          key.endsWith(`_${paddedMonth}_${numYear}`);
        if (!isTarget) {
          next[key] = mat;
        }
      });
      remainingMatrices = next;
      try {
        localStorage.setItem('hr_imported_matrices', JSON.stringify(next));
        sessionStorage.setItem('hr_imported_matrices', JSON.stringify(next));
      } catch {}
      return next;
    });

    // 4. Xóa dữ liệu bảng lương / tổng hợp công kỳ này
    setPayrollRecords((prev) => {
      const remaining = prev.filter(
        (p) => !(Number(p.month) === numMonth && Number(p.year) === numYear)
      );
      saveToStorage('hr_payroll_records', remaining);
      return remaining;
    });

    // 5. Xóa hr_last_imported_period nếu trùng kỳ đã xóa
    try {
      const saved = localStorage.getItem('hr_last_imported_period');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Number(parsed.month) === numMonth && Number(parsed.year) === numYear) {
          localStorage.removeItem('hr_last_imported_period');
        }
      }
    } catch {}

    // 6. Đồng bộ Supabase (xóa attendance_daily, attendance_summaries, attendance_months)
    // Lưu ý: Tuyệt đối không xóa hồ sơ nhân viên trong bảng employees khi xóa kỳ chấm công
    if (isSupabaseConfigured) {
      try {
        await attendanceService.deleteAttendanceByPeriod(numMonth, numYear);
        await auditService.logAction('DELETE_ATTENDANCE_PERIOD', 'attendance_daily', prefix, { month: numMonth, year: numYear });
      } catch (err) {
        console.error('Lỗi khi xóa kỳ chấm công trên Supabase:', err);
      }
    }
  };

  const deleteAttendanceByYear = async (year: number) => {
    const numYear = Number(year);

    // 1. Thu thập danh sách ID nhân viên bị ảnh hưởng trước khi xóa
    const affectedEmpIds = new Set<string>();
    attendanceRecords.forEach((r) => {
      if (isDateInYear(r.date, numYear) && r.employeeId) {
        affectedEmpIds.add(r.employeeId.trim().toUpperCase());
      }
    });
    Object.entries(importedMatrices).forEach(([key, mat]) => {
      const isTarget = Number(mat.year) === numYear || key.endsWith(`_${numYear}`);
      if (isTarget && mat.employeeId) {
        affectedEmpIds.add(mat.employeeId.trim().toUpperCase());
      }
    });

    // 2. Cập nhật attendanceRecords và lưu vào localStorage
    let remainingAttendance: AttendanceRecord[] = [];
    setAttendanceRecords((prev) => {
      remainingAttendance = prev.filter((r) => !isDateInYear(r.date, numYear));
      saveToStorage('hr_attendance_records', remainingAttendance);
      return remainingAttendance;
    });

    // 3. Cập nhật importedMatrices và lưu storage
    let remainingMatrices: Record<string, EmployeeAttendanceMatrix> = {};
    setImportedMatrices((prev) => {
      const next: Record<string, EmployeeAttendanceMatrix> = {};
      Object.entries(prev).forEach(([key, mat]) => {
        const isTarget = Number(mat.year) === numYear || key.endsWith(`_${numYear}`);
        if (!isTarget) {
          next[key] = mat;
        }
      });
      remainingMatrices = next;
      try {
        localStorage.setItem('hr_imported_matrices', JSON.stringify(next));
        sessionStorage.setItem('hr_imported_matrices', JSON.stringify(next));
      } catch {}
      return next;
    });

    // 4. Xóa dữ liệu bảng lương cả năm
    setPayrollRecords((prev) => {
      const remaining = prev.filter((p) => Number(p.year) !== numYear);
      saveToStorage('hr_payroll_records', remaining);
      return remaining;
    });

    // 5. Xóa hr_last_imported_period nếu trùng năm đã xóa
    try {
      const saved = localStorage.getItem('hr_last_imported_period');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Number(parsed.year) === numYear) {
          localStorage.removeItem('hr_last_imported_period');
        }
      }
    } catch {}

    // 6. Đồng bộ Supabase (xóa attendance_daily, attendance_summaries, attendance_months)
    // Lưu ý: Tuyệt đối không xóa hồ sơ nhân viên trong bảng employees khi xóa kỳ chấm công
    if (isSupabaseConfigured) {
      try {
        await attendanceService.deleteAttendanceByYear(numYear);
        await auditService.logAction('DELETE_ATTENDANCE_YEAR', 'attendance_daily', String(numYear), { year: numYear });
      } catch (err) {
        console.error('Lỗi khi xóa dữ liệu chấm công cả năm trên Supabase:', err);
      }
    }
  };

  const approveLeaveRequest = (id: string, note?: string) => {
    setLeaveRequests(prev =>
      prev.map(r => {
        if (r.id === id) {
          return {
            ...r,
            status: 'approved',
            approverNote: note || 'Đã phê duyệt',
            approvedBy: 'Nguyễn Quản Trị',
          };
        }
        return r;
      })
    );

    const target = leaveRequests.find(r => r.id === id);
    if (target && target.leaveType === 'annual') {
      setLeaveBalances(prev =>
        prev.map(b => {
          if (b.employeeId === target.employeeId) {
            return {
              ...b,
              usedDays: b.usedDays + target.daysCount,
              remainingDays: Math.max(0, b.remainingDays - target.daysCount),
              pendingDays: Math.max(0, b.pendingDays - target.daysCount),
            };
          }
          return b;
        })
      );
    }
  };

  const rejectLeaveRequest = (id: string, note?: string) => {
    setLeaveRequests(prev =>
      prev.map(r => {
        if (r.id === id) {
          return {
            ...r,
            status: 'rejected',
            approverNote: note || 'Không chấp thuận',
            approvedBy: 'Nguyễn Quản Trị',
          };
        }
        return r;
      })
    );
  };

  const addImportLog = async (logData: Omit<ImportLog, 'id' | 'importedAt'> & { file?: File }) => {
    let filePath: string | undefined = undefined;
    let fileSize: number | undefined = undefined;

    // 1. Tải file lên Supabase Storage nếu có file
    if (logData.file && isSupabaseConfigured) {
      fileSize = logData.file.size;
      const uploadRes = await importService.uploadExcelFile(logData.file);
      if (uploadRes.filePath) {
        filePath = uploadRes.filePath;
      }
    }

    // 2. Ghi nhật ký vào database
    if (isSupabaseConfigured) {
      try {
        const savedLog = await importService.recordImportLog({
          ...logData,
          filePath,
          fileSize,
        });
        setImportLogs(prev => [savedLog, ...prev]);
        await auditService.logAction('IMPORT_EXCEL', 'attendance_imports', savedLog.id, {
          fileName: logData.fileName,
          totalRows: logData.totalRows,
        });
        return;
      } catch (err) {
        console.error('Lỗi khi ghi lịch sử import vào Supabase:', err);
      }
    }

    // Fallback local state
    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const newLog: ImportLog = {
      fileName: logData.fileName,
      importedBy: logData.importedBy,
      totalRows: logData.totalRows,
      successRows: logData.successRows,
      errorRows: logData.errorRows,
      status: logData.status,
      errors: logData.errors,
      id: `IMP-${Date.now()}`,
      importedAt: formattedDate,
    };
    setImportLogs(prev => [newLog, ...prev]);
  };

  const importAttendanceData = async (params: {
    month: number;
    year: number;
    validRows: ParsedAttendanceRow[];
    totalRows: number;
    errorRowsCount: number;
    errorDetails: { row: number; error: string }[];
    file?: File;
    importedByName: string;
    mode: ImportConflictMode;
    employeesSyncList: EmployeeSyncRecord[];
    matrices?: EmployeeAttendanceMatrix[];
  }): Promise<ImportExecutionResult> => {
    // 1. Tự động thêm hoặc cập nhật nhân viên vào state (đảm bảo tra cứu ra 100%)
    const newEmpsToCreate: Employee[] = [];
    params.employeesSyncList
      .filter((e) => e.action === 'create')
      .forEach((c) => {
        newEmpsToCreate.push({
          id: c.id.trim().toUpperCase(),
          fullName: c.fullName,
          email: `${c.id.toLowerCase().replace(/[^a-z0-9]/g, '')}@congtyviet.com`,
          phone: '',
          department: (c.department as any) || 'Phòng Kỹ thuật',
          position: c.position || 'Nhân viên',
          startDate: c.startDate || `${params.year}-${String(params.month).padStart(2, '0')}-01`,
          status: 'active',
          baseSalary: 12000000,
          allowance: 1500000,
        });
      });

    if (params.matrices) {
      params.matrices.forEach((mat) => {
        const matId = mat.employeeId.trim().toUpperCase();
        if (!newEmpsToCreate.some((e) => e.id === matId)) {
          newEmpsToCreate.push({
            id: matId,
            fullName: mat.fullName,
            email: `${matId.toLowerCase().replace(/[^a-z0-9]/g, '')}@congtyviet.com`,
            phone: '',
            department: (mat.department as any) || 'Phòng Kỹ thuật',
            position: 'Nhân viên',
            startDate: mat.startDate || `${params.year}-${String(params.month).padStart(2, '0')}-01`,
            status: 'active',
            baseSalary: 12000000,
            allowance: 1500000,
          });
        }
      });
    }

    params.validRows.forEach((r) => {
      const rId = r.employeeId.trim().toUpperCase();
      if (!newEmpsToCreate.some((e) => e.id === rId)) {
        newEmpsToCreate.push({
          id: rId,
          fullName: r.fullName || rId,
          email: `${rId.toLowerCase().replace(/[^a-z0-9]/g, '')}@congtyviet.com`,
          phone: '',
          department: (r.department as any) || 'Phòng Kỹ thuật',
          position: 'Nhân viên',
          startDate: r.startDate || `${params.year}-${String(params.month).padStart(2, '0')}-01`,
          status: 'active',
          baseSalary: 12000000,
          allowance: 1500000,
        });
      }
    });

    setEmployees((prev) => {
      const existingIds = new Set(prev.map((e) => e.id.trim().toUpperCase()));
      const toAdd = newEmpsToCreate.filter((e) => !existingIds.has(e.id));
      const updateMap = new Map(
        params.employeesSyncList
          .filter((e) => e.action === 'update')
          .map((u) => [u.id.trim().toUpperCase(), u])
      );
      const updatedPrev = prev.map((emp) => {
        const upd = updateMap.get(emp.id.trim().toUpperCase());
        if (upd) {
          return {
            ...emp,
            fullName: upd.fullName || emp.fullName,
            department: (upd.department || emp.department) as any,
            startDate: upd.startDate || emp.startDate,
          };
        }
        return emp;
      });
      const finalEmployees = [...toAdd, ...updatedPrev];
      saveToStorage('hr_employees', finalEmployees);
      return finalEmployees;
    });

    // 2. Cập nhật dữ liệu chấm công chi tiết bảo toàn 100% trường dữ liệu
    const newAttendance: AttendanceRecord[] = params.validRows.map((r, idx) => ({
      id: `ATT-IMP-${Date.now()}-${idx}`,
      employeeId: r.employeeId.trim().toUpperCase(),
      date: r.date,
      checkIn: r.checkIn || null,
      checkOut: r.checkOut || null,
      status: r.status,
      workHours: r.workHours,
      overtimeHours: r.overtimeHours ?? (r.raw?.otHours || (r.workHours > 8 ? r.workHours - 8 : 0)),
      lateMinutes: r.lateMinutes,
      earlyMinutes: r.earlyMinutes,
      note: r.note,
      leaveCode: r.leaveCode || (r.raw?.leaveCode || undefined),
      overtimeDetails: r.overtimeDetails || r.raw?.dayOtDetails || undefined,
    }));

    setAttendanceRecords((prev) => {
      let finalAttendance: AttendanceRecord[];
      if (params.mode === 'overwrite') {
        const prefix = `${params.year}-${String(params.month).padStart(2, '0')}`;
        const filtered = prev.filter((a) => !a.date.startsWith(prefix));
        finalAttendance = [...newAttendance, ...filtered];
      } else {
        const map = new Map(prev.map((p) => [`${p.employeeId.trim().toUpperCase()}_${p.date}`, p]));
        newAttendance.forEach((a) => map.set(`${a.employeeId.trim().toUpperCase()}_${a.date}`, a));
        finalAttendance = Array.from(map.values());
      }
      saveToStorage('hr_attendance_records', finalAttendance);
      return finalAttendance;
    });

    // 0. Lưu và tái tạo ma trận công chi tiết (đảm bảo 100% nhân viên có ma trận xem trước và tra cứu)
    setImportedMatrices((prev) => {
      const next = { ...prev };
      if (params.matrices && params.matrices.length > 0) {
        params.matrices.forEach((mat) => {
          const key = `${mat.employeeId.trim().toUpperCase()}_${Number(params.month)}_${Number(params.year)}`;
          next[key] = {
            ...mat,
            month: Number(params.month),
            year: Number(params.year),
          };
        });
      }

      const distinctEmpIds = Array.from(new Set(params.validRows.map((r) => r.employeeId.trim().toUpperCase())));
      distinctEmpIds.forEach((empId) => {
        const key = `${empId}_${Number(params.month)}_${Number(params.year)}`;
        if (!next[key]) {
          const empRows = newAttendance.filter((a) => a.employeeId === empId);
          const empMeta = newEmpsToCreate.find((e) => e.id === empId) ||
            employees.find((e) => e.id === empId) || {
              id: empId,
              fullName: `Nhân viên ${empId}`,
              department: 'Phòng Kỹ thuật' as const,
              position: 'Nhân viên',
              startDate: `${params.year}-${String(params.month).padStart(2, '0')}-01`,
              status: 'active' as const,
              baseSalary: 12000000,
              allowance: 1500000,
              email: `${empId.toLowerCase()}@congtyviet.com`,
              phone: '',
            };
          next[key] = buildMatrixFromAttendanceDaily(empMeta, empRows, Number(params.month), Number(params.year));
        }
      });

      try {
        localStorage.setItem('hr_imported_matrices', JSON.stringify(next));
        sessionStorage.setItem('hr_imported_matrices', JSON.stringify(next));
        localStorage.setItem(
          'hr_last_imported_period',
          JSON.stringify({
            month: Number(params.month),
            year: Number(params.year),
            employeeId: distinctEmpIds[0] || params.matrices?.[0]?.employeeId,
          })
        );
      } catch (e) {
        console.warn('Không thể lưu matrices vào storage:', e);
      }
      return next;
    });

    // 3. Ghi nhật ký import
    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const newLog: ImportLog = {
      id: `IMP-${Date.now()}`,
      fileName: params.file?.name || `Import_Thang_${params.month}_${params.year}.xlsx`,
      importedBy: params.importedByName,
      importedAt: formattedDate,
      totalRows: params.totalRows,
      successRows: params.validRows.length,
      errorRows: params.errorRowsCount,
      status: params.errorRowsCount === 0 ? 'success' : params.validRows.length > 0 ? 'partial' : 'failed',
      errors: params.errorDetails,
    };
    setImportLogs((prev) => [newLog, ...prev]);

    const buildFallbackReportSummary = (): ImportReportSummary => {
      const toCreate = params.employeesSyncList.filter((e) => e.action === 'create');
      const toUpdate = params.employeesSyncList.filter((e) => e.action === 'update');
      const existingCount = params.employeesSyncList.filter((e) => e.action === 'keep' || e.action === 'update').length;
      const distinctEmpIds = Array.from(new Set(params.validRows.map((r) => r.employeeId)));

      return {
        totalEmployeesRecognized: params.employeesSyncList.length,
        existingEmployeesCount: existingCount,
        newEmployeesCreatedCount: toCreate.length,
        updatedEmployeesCount: toUpdate.length,
        successfulAttendanceEmployeesCount: distinctEmpIds.length,
        failedAttendanceEmployeesCount: Math.max(0, params.employeesSyncList.length - distinctEmpIds.length),
        totalErrorRows: params.errorRowsCount,
        newEmployeesList: toCreate,
        updatedEmployeesList: toUpdate,
      };
    };

    // 4. Đồng bộ Supabase nếu đã cấu hình (bọc try-catch không làm hỏng trải nghiệm người dùng)
    let res: ImportExecutionResult;
    if (isSupabaseConfigured) {
      try {
        res = await importService.executeImport(params);
        // Làm mới dữ liệu ngầm không gây đóng băng giao diện (Non-blocking background refresh)
        checkSupabaseConnection().then((health) => {
          if (health.connected) {
            employeeService.getEmployees().then((dbEmployees) => {
              if (dbEmployees && dbEmployees.length > 0) {
                setEmployees((prev) => {
                  const prevMap = new Map(prev.map((e) => [e.id.trim().toUpperCase(), e]));
                  dbEmployees.forEach((e) => prevMap.set(e.id.trim().toUpperCase(), e));
                  const list = Array.from(prevMap.values());
                  saveToStorage('hr_employees', list);
                  return list;
                });
              }
            }).catch(() => {});
          }
        }).catch(() => {});
      } catch (err: any) {
        console.error('Lỗi ghi Supabase:', err);
        const isRlsError =
          err?.message?.includes('row-level security') ||
          err?.code === '42501' ||
          err?.message?.includes('violates');
        res = {
          success: false,
          message: isRlsError
            ? `Lỗi bảo mật Supabase RLS (42501) hoặc vi phạm ràng buộc dữ liệu: ${err?.message}. Quý Admin hãy mở Supabase SQL Editor và chạy file 'supabase/FIX_RLS.sql' để cấp quyền ghi cho Anon Key!`
            : `Không thể đồng bộ dữ liệu vào cơ sở dữ liệu Supabase: ${err?.message || 'Lỗi không xác định'}. Dữ liệu chưa được lưu vĩnh viễn trên Cloud.`,
          totalRows: params.totalRows,
          successRows: 0,
          errorRows: params.errorRowsCount + params.validRows.length,
          reportSummary: buildFallbackReportSummary(),
        };
      }
    } else {
      res = {
        success: true,
        message: `Đã nạp thành công ${params.validRows.length} bản ghi chấm công (Chế độ cục bộ/Demo).`,
        totalRows: params.totalRows,
        successRows: params.validRows.length,
        errorRows: params.errorRowsCount,
        reportSummary: buildFallbackReportSummary(),
      };
    }

    return res;
  };

  const importPayrollData = async (params: {
    month: number;
    year: number;
    records: PayrollRecord[];
    mode: ImportConflictMode;
    importedByName: string;
  }): Promise<{ success: boolean; count: number; error?: string }> => {
    const res = await payrollService.savePayrollRecords(params);

    setPayrollRecords((prev) => {
      if (params.mode === 'overwrite') {
        const filtered = prev.filter(
          (p) => !(p.month === params.month && p.year === params.year)
        );
        return [...params.records, ...filtered];
      }
      const map = new Map(prev.map((p) => [`${p.employeeId.toUpperCase()}_${p.month}_${p.year}`, p]));
      params.records.forEach((r) =>
        map.set(`${r.employeeId.toUpperCase()}_${r.month}_${r.year}`, r)
      );
      return Array.from(map.values());
    });

    if (isSupabaseConfigured && res.success) {
      try {
        const dbPayroll = await payrollService.getPayrollSummaries(params.month, params.year);
        if (dbPayroll && dbPayroll.length > 0) {
          setPayrollRecords((prev) => {
            const map = new Map(prev.map((p) => [`${p.employeeId.trim().toUpperCase()}_${p.month}_${p.year}`, p]));
            dbPayroll.forEach((p) => map.set(`${p.employeeId.trim().toUpperCase()}_${p.month}_${p.year}`, p));
            return Array.from(map.values());
          });
        }
      } catch (e) {
        console.warn('Lỗi đồng bộ bảng lương từ Supabase sau import:', e);
      }
    }

    return res;
  };

  const deletePayrollRecords = async (records: { id?: string; employeeId: string; month: number; year: number }[]) => {
    if (records.length === 0) return;

    const keysToRemove = new Set(
      records.map((r) => `${r.employeeId.trim().toUpperCase()}_${Number(r.month)}_${Number(r.year)}`)
    );
    const idsToRemove = new Set(records.map((r) => r.id).filter(Boolean));

    setPayrollRecords((prev) => {
      const remaining = prev.filter((p) => {
        if (p.id && idsToRemove.has(p.id)) return false;
        const key = `${p.employeeId.trim().toUpperCase()}_${Number(p.month)}_${Number(p.year)}`;
        return !keysToRemove.has(key);
      });
      saveToStorage('hr_payroll_records', remaining);
      return remaining;
    });

    if (isSupabaseConfigured) {
      try {
        await payrollService.deletePayrollRecords(records);
      } catch (err) {
        console.error('Lỗi khi xóa bảng lương từ Supabase:', err);
      }
    }
  };

  const deletePayrollByPeriod = async (month: number, year: number) => {
    const numMonth = Number(month);
    const numYear = Number(year);

    setPayrollRecords((prev) => {
      const remaining = prev.filter(
        (p) => !(Number(p.month) === numMonth && Number(p.year) === numYear)
      );
      saveToStorage('hr_payroll_records', remaining);
      return remaining;
    });

    if (isSupabaseConfigured) {
      try {
        await payrollService.deletePayrollByPeriod(numMonth, numYear);
      } catch (err) {
        console.error('Lỗi khi xóa bảng lương kỳ từ Supabase:', err);
      }
    }
  };

  const deletePayrollByYear = async (year: number) => {
    const numYear = Number(year);

    setPayrollRecords((prev) => {
      const remaining = prev.filter((p) => Number(p.year) !== numYear);
      saveToStorage('hr_payroll_records', remaining);
      return remaining;
    });

    if (isSupabaseConfigured) {
      try {
        await payrollService.deletePayrollByYear(numYear);
      } catch (err) {
        console.error('Lỗi khi xóa bảng lương năm từ Supabase:', err);
      }
    }
  };

  const importLeaveBalances = async (params: {
    year: number;
    records: LeaveBalance[];
    mode: ImportConflictMode;
    importedByName: string;
  }): Promise<{ success: boolean; count: number; error?: string }> => {
    const res = await leaveService.saveLeaveBalances(params);

    // Cập nhật số dư phép: thay thế theo (employeeId, year), KHÔNG cộng dồn trùng
    setLeaveBalances((prev) => {
      if (params.mode === 'overwrite') {
        const filtered = prev.filter((b) => b.year !== params.year);
        return [...params.records, ...filtered];
      }
      const map = new Map(prev.map((b) => [`${b.employeeId.toUpperCase()}_${b.year}`, b]));
      params.records.forEach((r) => map.set(`${r.employeeId.toUpperCase()}_${r.year}`, r));
      return Array.from(map.values());
    });

    if (isSupabaseConfigured && res.success) {
      try {
        const dbLeave = await leaveService.getLeaveBalances(params.year);
        if (dbLeave && dbLeave.length > 0) {
          setLeaveBalances((prev) => {
            const map = new Map(prev.map((b) => [`${b.employeeId.trim().toUpperCase()}_${b.year}`, b]));
            dbLeave.forEach((b) => map.set(`${b.employeeId.trim().toUpperCase()}_${b.year}`, b));
            return Array.from(map.values());
          });
        }
      } catch (e) {
        console.warn('Lỗi đồng bộ phép tồn từ Supabase sau import:', e);
      }
    }

    return res;
  };

  const importEmployeeLeaveBalances = async (params: {
    records: EmployeeLeaveBalanceRecord[];
    month?: number | null;
    year: number;
    mode: ImportConflictMode;
    importedByName: string;
    batchId?: string;
  }): Promise<{ success: boolean; count: number; error?: string }> => {
    try {
      const batchId = params.batchId || `BATCH-LEAVE-${Date.now()}`;
      const recordsToSave = params.records.map((r) => ({
        ...r,
        month: params.month ?? r.month ?? null,
        year: params.year ?? r.year ?? 2026,
        importBatchId: batchId,
      }));

      // Cập nhật State tức thì
      setEmployeeLeaveBalances((prev) => {
        let updated: EmployeeLeaveBalanceRecord[];
        if (params.mode === 'overwrite') {
          const filtered = prev.filter((p) => {
            if (p.year !== params.year) return true;
            if (params.month !== undefined && params.month !== null) {
              return p.month !== params.month;
            }
            return false;
          });
          updated = [...recordsToSave, ...filtered];
        } else {
          const map = new Map<string, EmployeeLeaveBalanceRecord>();
          prev.forEach((item) => {
            const k = `${item.employeeCode.trim().toUpperCase()}_${item.month ?? 'all'}_${item.year}`;
            map.set(k, item);
          });
          recordsToSave.forEach((item) => {
            const k = `${item.employeeCode.trim().toUpperCase()}_${item.month ?? 'all'}_${item.year}`;
            map.set(k, item);
          });
          updated = Array.from(map.values());
        }
        saveToStorage('hr_employee_leave_balances', updated);
        return updated;
      });

      // Đồng bộ sang danh mục nhân viên nếu có nhân viên mới
      const currentEmpIds = new Set(employees.map((e) => e.id.trim().toUpperCase()));
      const newEmps: Employee[] = [];
      recordsToSave.forEach((r) => {
        const cleanCode = r.employeeCode.trim().toUpperCase();
        if (!currentEmpIds.has(cleanCode)) {
          currentEmpIds.add(cleanCode);
          newEmps.push({
            id: cleanCode,
            fullName: r.employeeName || cleanCode,
            email: `${cleanCode.toLowerCase().replace(/[^a-z0-9]/g, '')}@congtyviet.com`,
            phone: '',
            department: (r.department as any) || 'Phòng Kỹ thuật',
            position: 'Nhân viên',
            startDate: `${params.year}-01-01`,
            status: 'active',
            baseSalary: 12000000,
            allowance: 1500000,
          });
        }
      });
      if (newEmps.length > 0) {
        setEmployees((prev) => {
          const next = [...newEmps, ...prev];
          saveToStorage('hr_employees', next);
          return next;
        });
      }

      // Dual-sync to legacy leaveBalances state
      setLeaveBalances((prev) => {
        const map = new Map(prev.map((b) => [`${b.employeeId.trim().toUpperCase()}_${b.year}`, b]));
        recordsToSave.forEach((r) => {
          const tot = r.leaveBalance2025 + r.leaveGenerated2026;
          map.set(`${r.employeeCode.trim().toUpperCase()}_${r.year}`, {
            employeeId: r.employeeCode,
            year: r.year,
            allocatedDays: r.leaveGenerated2026,
            carriedOverDays: r.leaveBalance2025,
            usedDays: Math.max(0, tot - r.remainingDays),
            adjustedDays: 0,
            remainingDays: r.remainingDays,
            pendingDays: 0,
            totalDays: tot,
          });
        });
        const next = Array.from(map.values());
        saveToStorage('hr_leave_balances', next);
        return next;
      });

      // Lưu lên Supabase nếu có cấu hình
      if (isSupabaseConfigured) {
        await leaveService.saveEmployeeLeaveBalances({
          records: recordsToSave,
          month: params.month,
          year: params.year,
          mode: params.mode,
          importedByName: params.importedByName,
          batchId,
        });
      }

      return { success: true, count: recordsToSave.length };
    } catch (err: any) {
      console.error('Lỗi khi nạp dữ liệu phép tồn:', err);
      return { success: false, count: 0, error: err?.message || 'Lỗi khi lưu phép tồn' };
    }
  };

  const deleteEmployeeLeaveBalances = async (ids: string[]): Promise<void> => {
    setEmployeeLeaveBalances((prev) => {
      const next = prev.filter((r) => !ids.includes(r.id || ''));
      saveToStorage('hr_employee_leave_balances', next);
      return next;
    });

    if (isSupabaseConfigured) {
      await leaveService.deleteEmployeeLeaveBalances(ids);
    }
  };

  const deleteEmployeeLeaveBalancesByPeriod = async (month: number | null, year: number): Promise<void> => {
    setEmployeeLeaveBalances((prev) => {
      const next = prev.filter((r) => {
        if (r.year !== year) return true;
        if (month !== null && month !== undefined) {
          return r.month !== month;
        }
        return false;
      });
      saveToStorage('hr_employee_leave_balances', next);
      return next;
    });

    if (isSupabaseConfigured) {
      await leaveService.deleteEmployeeLeaveBalancesByPeriod(month, year);
    }
  };

  const deleteEmployeeLeaveBalancesByYear = async (year: number): Promise<void> => {
    setEmployeeLeaveBalances((prev) => {
      const next = prev.filter((r) => r.year !== year);
      saveToStorage('hr_employee_leave_balances', next);
      return next;
    });

    if (isSupabaseConfigured) {
      await leaveService.deleteEmployeeLeaveBalancesByYear(year);
    }
  };

  const getEmployeeLeaveBalance = (
    empCode: string,
    month?: number | null,
    year = 2026
  ): EmployeeLeaveBalanceRecord | undefined => {
    const cleanCode = empCode.trim().toUpperCase();
    if (month !== undefined && month !== null) {
      const found = employeeLeaveBalances.find(
        (r) => r.employeeCode.trim().toUpperCase() === cleanCode && r.year === year && r.month === month
      );
      if (found) return found;
    }

    const foundYear = employeeLeaveBalances.find(
      (r) => r.employeeCode.trim().toUpperCase() === cleanCode && r.year === year
    );
    if (foundYear) return foundYear;

    return employeeLeaveBalances.find((r) => r.employeeCode.trim().toUpperCase() === cleanCode);
  };

  const updateEmployeeSalaryPin = async (employeeId: string, newPin: string): Promise<void> => {
    const trimmedPin = newPin.trim();
    setEmployees((prev) =>
      prev.map((e) =>
        e.id.toUpperCase() === employeeId.trim().toUpperCase()
          ? { ...e, salaryPin: trimmedPin }
          : e
      )
    );

    if (isSupabaseConfigured) {
      try {
        await supabase
          .from('employees')
          .update({ salary_pin: trimmedPin })
          .eq('id', employeeId.trim().toUpperCase());
      } catch (err) {
        console.warn('Lỗi cập nhật mã PIN trên Supabase:', err);
      }
    }
  };

  const verifyEmployeeSalaryPin = (
    employeeId: string,
    pin: string
  ): { valid: boolean; message?: string } => {
    const emp = employees.find(
      (e) => e.id.trim().toUpperCase() === employeeId.trim().toUpperCase()
    );
    if (!emp) {
      return { valid: false, message: `Không tìm thấy nhân viên "${employeeId}".` };
    }
    return payrollService.verifySalaryPin(emp, pin);
  };

  const updateSettings = (newSettings: Partial<SystemSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  };

  const getLeaveBalanceByEmployee = (empId: string, year = 2026) => {
    return leaveBalances.find(
      (b) => b.employeeId.trim().toUpperCase() === empId.trim().toUpperCase() && b.year === year
    );
  };

  const getPayrollByEmployee = (empId: string, month?: number, year?: number) => {
    return payrollRecords.find((p) => {
      if (p.employeeId.trim().toUpperCase() !== empId.trim().toUpperCase()) return false;
      if (month && year) {
        return p.month === month && p.year === year;
      }
      return true;
    });
  };

  return (
    <DataContext.Provider
      value={{
        employees,
        attendanceRecords,
        payrollRecords,
        leaveRequests,
        leaveBalances,
        employeeLeaveBalances,
        importLogs,
        importedMatrices,
        settings,
        isDatabaseConnected,
        isLoadingFromDatabase,
        refreshData: loadSupabaseData,
        addEmployee,
        updateEmployee,
        deleteEmployee,
        deleteEmployees,
        addAttendanceRecord,
        updateAttendanceRecord,
        deleteAttendanceRecords,
        deleteAttendanceByEmployeeMonth,
        deleteAttendanceByPeriod,
        deleteAttendanceByYear,
        approveLeaveRequest,
        rejectLeaveRequest,
        addImportLog,
        importAttendanceData,
        importPayrollData,
        deletePayrollRecords,
        deletePayrollByPeriod,
        deletePayrollByYear,
        importLeaveBalances,
        importEmployeeLeaveBalances,
        deleteEmployeeLeaveBalances,
        deleteEmployeeLeaveBalancesByPeriod,
        deleteEmployeeLeaveBalancesByYear,
        getEmployeeLeaveBalance,
        updateEmployeeSalaryPin,
        verifyEmployeeSalaryPin,
        updateSettings,
        getEmployeeById,
        getLeaveBalanceByEmployee,
        getAttendanceByEmployee,
        getAttendanceMatrix,
        getAvailablePeriodsForEmployee,
        getPayrollByEmployee,
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};
