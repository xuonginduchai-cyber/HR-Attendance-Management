import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Search,
  Building2,
  Lock,
  Unlock,
  Printer,
  FileSpreadsheet,
  AlertCircle,
  Clock,
  ShieldAlert,
  Calendar,
  Database,
  CheckCircle2,
  Download,
  AlertTriangle,
  UserCheck,
  CreditCard,
  Briefcase,
  Layers,
  ChevronRight,
  Info,
  ShieldCheck,
  KeyRound,
  RotateCcw,
  UserX,
  X,
  Sparkles,
  Filter,
  Coffee,
  ChevronDown,
  ChevronUp,
  Sun,
  Moon,
  List,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData, buildDailyRecordsFromMatrix } from '../../context/DataContext';
import { Card } from '../../components/common/Card';
import { Modal } from '../../components/common/Modal';
import { AttendanceBadge, LeaveRequestBadge, PaymentStatusBadge } from '../../components/common/Badge';
import { AttendanceMatrixTable } from '../../components/attendance/AttendanceMatrixTable';
import { formatCurrency, formatDate, getDayOfWeek, getAttendanceStatusLabel } from '../../utils/formatters';
import { lookupService, lookupSecurity, LookupResult, CalculatedAttendanceSummary } from '../../services/lookupService';
import { isSupabaseConfigured } from '../../lib/supabase';
import { Employee, AttendanceRecord, PayrollRecord, LeaveBalance, EmployeeAttendanceMatrix } from '../../types';
import { exportAttendanceToExcel } from '../../utils/exportAttendanceExcel';
import { buildMatrixFromAttendanceDaily, isMatrixValidWithData } from '../../utils/excelParser';

type LookupCategory = 'attendance' | 'payroll' | 'leave';

interface EmployeeLookupPageProps {
  initialCategory?: LookupCategory;
}

export const EmployeeLookupPage: React.FC<EmployeeLookupPageProps> = ({ initialCategory }) => {
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const {
    getEmployeeById,
    getAttendanceByEmployee,
    getPayrollByEmployee,
    getLeaveBalanceByEmployee,
    getEmployeeLeaveBalance,
    getAttendanceMatrix,
    getAvailablePeriodsForEmployee,
    importedMatrices,
    attendanceRecords,
    leaveRequests,
    verifyEmployeeSalaryPin,
  } = useData();

  // Search input state (mặc định trống để người dùng nhập)
  const [employeeIdInput, setEmployeeIdInput] = useState('');

  // Xác định category từ prop hoặc query param ?tab=
  const [category, setCategory] = useState<LookupCategory>(() => {
    if (initialCategory) return initialCategory;
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    if (tabParam === 'payroll' || tabParam === 'leave' || tabParam === 'attendance') {
      return tabParam as LookupCategory;
    }
    return 'attendance';
  });

  const [selectedMonth, setSelectedMonth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('hr_last_imported_period');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.month) return parsed.month;
      }
    } catch {}
    return 10;
  });
  const [selectedYear, setSelectedYear] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('hr_last_imported_period');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.year) return parsed.year;
      }
    } catch {}
    return 2026;
  });
  const [attendanceSubTab, setAttendanceSubTab] = useState<'compact' | 'detailed'>('compact');
  const [tableFilter, setTableFilter] = useState<'all' | 'work' | 'ot' | 'leave'>('all');
  const [showAllOtItems, setShowAllOtItems] = useState(false);

  // Search results state (chỉ hiển thị dữ liệu sau khi người dùng thực hiện tra cứu)
  const [hasSearched, setHasSearched] = useState(false);
  const [searchedEmployeeId, setSearchedEmployeeId] = useState('');
  const [searchError, setSearchError] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Anti-brute-force rate limiting state cho tìm kiếm mã NV
  const [remainingLockout, setRemainingLockout] = useState(0);
  const timerRef = useRef<any>(null);

  // =========================================================================
  // BẢO MẬT TRA CỨU TIỀN LƯƠNG BẰNG MÃ PIN (Privacy & Anti-Brute-Force)
  // =========================================================================
  const [unlockedSalaryEmployees, setUnlockedSalaryEmployees] = useState<Set<string>>(new Set());
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [failedPinAttempts, setFailedPinAttempts] = useState(0);
  const [pinLockoutSeconds, setPinLockoutSeconds] = useState(0);
  const pinTimerRef = useRef<any>(null);

  // Live RPC results from Supabase
  const [rpcResult, setRpcResult] = useState<LookupResult | null>(null);

  // Kiểm tra trạng thái lockout khi load trang
  useEffect(() => {
    const checkLock = () => {
      const sec = lookupSecurity.getRemainingLockoutSeconds();
      setRemainingLockout(sec);
      if (sec > 0 && !timerRef.current) {
        timerRef.current = setInterval(() => {
          const updated = lookupSecurity.getRemainingLockoutSeconds();
          setRemainingLockout(updated);
          if (updated <= 0 && timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
        }, 1000);
      }
    };

    checkLock();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (pinTimerRef.current) clearInterval(pinTimerRef.current);
    };
  }, []);

  // Tự động nhận diện kỳ có dữ liệu từ importedMatrices hoặc attendanceRecords (cho trình duyệt ẩn danh / máy mới)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('hr_last_imported_period');
      if (saved) return;
    } catch {}

    const matList = Object.values(importedMatrices);
    if (matList.length > 0) {
      const first = matList[0];
      if (first.month && first.year) {
        setSelectedMonth(Number(first.month));
        setSelectedYear(Number(first.year));
        return;
      }
    }

    if (attendanceRecords.length > 0) {
      for (const r of attendanceRecords) {
        if (r.date) {
          const parts = r.date.split('-');
          if (parts.length >= 2) {
            const y = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            if (m && y) {
              setSelectedMonth(m);
              setSelectedYear(y);
              return;
            }
          }
        }
      }
    }
  }, [importedMatrices, attendanceRecords]);

  // Countdown timer cho lockout mã PIN
  useEffect(() => {
    if (pinLockoutSeconds > 0 && !pinTimerRef.current) {
      pinTimerRef.current = setInterval(() => {
        setPinLockoutSeconds((prev) => {
          if (prev <= 1) {
            clearInterval(pinTimerRef.current);
            pinTimerRef.current = null;
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
  }, [pinLockoutSeconds]);

  // Thực hiện tra cứu nhân viên (hỗ trợ kiểm tra cả Supabase và dữ liệu hệ thống cục bộ)
  const performSearch = async (
    empIdToSearch: string,
    overrideMonth?: number,
    overrideYear?: number,
    overrideCategory?: LookupCategory
  ) => {
    const securityStatus = lookupSecurity.checkCanQuery();
    if (!securityStatus.allowed) {
      setSearchError(securityStatus.message || 'Hệ thống đang tạm khóa tính năng tra cứu.');
      if (securityStatus.remainingLockoutSeconds) {
        setRemainingLockout(securityStatus.remainingLockoutSeconds);
      }
      return;
    }

    setSearchError('');
    setIsSearching(true);

    const trimmed = empIdToSearch.trim().toUpperCase();
    if (!trimmed) {
      setSearchError('Vui lòng nhập mã nhân viên (Ví dụ: NV001, S0076...)');
      setIsSearching(false);
      return;
    }

    // Nếu chuyển sang nhân viên khác, không tự động mở khóa lương của họ
    if (trimmed !== searchedEmployeeId) {
      setPinInput('');
      setPinError('');
    }

    // CHUẨN HÓA: Dùng đúng tháng & năm người dùng lựa chọn, tuyệt đối không tự ý nhảy tháng khác
    const targetMonth = overrideMonth ?? selectedMonth;
    const targetYear = overrideYear ?? selectedYear;
    const targetCategory = overrideCategory ?? category;
    if (overrideMonth !== undefined) setSelectedMonth(overrideMonth);
    if (overrideYear !== undefined) setSelectedYear(overrideYear);

    // 1. Thử gọi Supabase RPC đúng kỳ tra cứu nếu có cấu hình
    if (isSupabaseConfigured) {
      try {
        const res = await lookupService.lookupEmployee(trimmed, targetMonth, targetYear);
        if (res.success && res.employee) {
          setRpcResult(res);
          setSearchedEmployeeId(trimmed);
          setHasSearched(true);
          setSearchError('');
          setIsSearching(false);
          setRemainingLockout(0);
          lookupSecurity.recordAttempt(true);
          return;
        }
      } catch (err: any) {
        console.warn('Lỗi gọi Supabase RPC, chuyển sang kiểm tra dữ liệu hệ thống cục bộ:', err);
      }
    }

    // 2. Tra cứu cục bộ (Hỗ trợ 100% nhân viên trong bộ nhớ và ma trận nạp từ Excel)
    const localEmp = getEmployeeById(trimmed);
    if (localEmp) {
      lookupSecurity.recordAttempt(true);
      setRpcResult(null);
      setSearchedEmployeeId(trimmed);
      setHasSearched(true);
      setSearchError('');
      setRemainingLockout(0);
    } else {
      lookupSecurity.recordAttempt(false);
      const currentLock = lookupSecurity.getRemainingLockoutSeconds();
      if (currentLock > 0) {
        setRemainingLockout(currentLock);
        setSearchError(`Phát hiện nhiều lần nhập mã không tồn tại. Tạm khóa trong ${currentLock} giây.`);
      } else {
        setSearchError(`Không có dữ liệu: Không tìm thấy nhân viên có mã "${trimmed}" trong danh mục quản lý công kỳ Tháng ${targetMonth}/${targetYear}.`);
      }
      setHasSearched(true);
      setSearchedEmployeeId(trimmed);
      setRpcResult(null);
    }
    setIsSearching(false);
  };

  // Tự động tìm kiếm nếu đường link có tham số ?id= hoặc ?code= (ví dụ: /?id=NV001)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const queryId = params.get('id') || params.get('code');
    if (queryId) {
      const code = queryId.trim().toUpperCase();
      setEmployeeIdInput(code);
      performSearch(code);
    }
  }, [location.search]);

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    performSearch(employeeIdInput);
  };

  // Xác định dữ liệu nhân viên mục tiêu (hỗ trợ cả Supabase RPC lẫn dữ liệu nạp từ Excel trong phiên)
  const currentEmployee: Employee | undefined = searchError
    ? undefined
    : (rpcResult?.employee || getEmployeeById(searchedEmployeeId));

  const attendanceList: AttendanceRecord[] = useMemo(() => {
    // 1. Nếu có dữ liệu từ Supabase RPC của đúng tháng/năm đang tra cứu
    if (rpcResult?.attendanceDaily && rpcResult.attendanceDaily.length > 0) {
      const prefix = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
      const matched = rpcResult.attendanceDaily.filter((r) => r.date.startsWith(prefix));
      if (matched.length > 0) return matched;
    }
    // 2. Tra cứu cục bộ đúng mã nhân viên, tháng và năm
    if (currentEmployee) {
      const records = getAttendanceByEmployee(currentEmployee.id, selectedMonth, selectedYear);
      if (records.length > 0) return records;
      const cached = getAttendanceMatrix(currentEmployee.id, selectedMonth, selectedYear);
      if (cached && isMatrixValidWithData(cached) && Number(cached.month) === Number(selectedMonth) && Number(cached.year) === Number(selectedYear)) {
        return buildDailyRecordsFromMatrix(cached);
      }
    }
    return [];
  }, [rpcResult, currentEmployee, selectedMonth, selectedYear, getAttendanceByEmployee, getAttendanceMatrix]);

  const payrollData: PayrollRecord | undefined =
    rpcResult?.payrollSummary !== undefined && Number(rpcResult.payrollSummary.month) === Number(selectedMonth) && Number(rpcResult.payrollSummary.year) === Number(selectedYear)
      ? rpcResult.payrollSummary
      : currentEmployee
      ? getPayrollByEmployee(currentEmployee.id, selectedMonth, selectedYear)
      : undefined;

  const leaveBalance: LeaveBalance | undefined =
    rpcResult?.leaveBalance ||
    (currentEmployee ? getLeaveBalanceByEmployee(currentEmployee.id, selectedYear) : undefined);

  const employeeLeaveBalanceRecord = currentEmployee
    ? getEmployeeLeaveBalance(currentEmployee.id, selectedMonth, selectedYear)
    : undefined;

  const resolvedLeaveData = useMemo(() => {
    if (employeeLeaveBalanceRecord) {
      return {
        employeeCode: employeeLeaveBalanceRecord.employeeCode,
        employeeName: employeeLeaveBalanceRecord.employeeName,
        department: employeeLeaveBalanceRecord.department,
        leaveBalance2025: employeeLeaveBalanceRecord.leaveBalance2025,
        leaveGenerated2026: employeeLeaveBalanceRecord.leaveGenerated2026,
        remainingDays: employeeLeaveBalanceRecord.remainingDays,
      };
    }
    if (leaveBalance && currentEmployee) {
      return {
        employeeCode: currentEmployee.id,
        employeeName: currentEmployee.fullName,
        department: currentEmployee.department,
        leaveBalance2025: leaveBalance.carriedOverDays || 0,
        leaveGenerated2026: leaveBalance.allocatedDays != null ? leaveBalance.allocatedDays : 0,
        remainingDays: leaveBalance.remainingDays != null ? leaveBalance.remainingDays : 0,
      };
    }
    return null;
  }, [employeeLeaveBalanceRecord, leaveBalance, currentEmployee]);

  const employeeLeaveRequests = currentEmployee
    ? leaveRequests.filter((r) => r.employeeId.toUpperCase() === currentEmployee.id.toUpperCase())
    : [];

  // Bảng ma trận 100% chuẩn cấu trúc file Excel mẫu (mẫu(1).xlsx)
  const matrixData = useMemo<EmployeeAttendanceMatrix | null>(() => {
    if (!currentEmployee) return null;
    // Ưu tiên 1: Lấy ma trận đã lưu trong hệ thống của ĐÚNG selectedMonth và selectedYear
    const cached = getAttendanceMatrix(currentEmployee.id, selectedMonth, selectedYear);
    if (cached && isMatrixValidWithData(cached) && Number(cached.month) === Number(selectedMonth) && Number(cached.year) === Number(selectedYear)) {
      return cached;
    }
    // Ưu tiên 2: Ma trận trả về từ Supabase RPC nếu đúng tháng & năm
    const rpcMat = rpcResult?.calculatedSummary?.matrix;
    if (
      rpcMat &&
      isMatrixValidWithData(rpcMat) &&
      Number(rpcMat.month) === Number(selectedMonth) &&
      Number(rpcMat.year) === Number(selectedYear)
    ) {
      return rpcMat;
    }
    // Ưu tiên 3: Tái tạo ma trận từ danh sách ngày công chi tiết (chỉ khi có ngày công thực tế của tháng này)
    if (attendanceList.length > 0 && attendanceList.some((r) => (Number(r.workHours) || 0) > 0 || r.checkIn)) {
      return buildMatrixFromAttendanceDaily(
        currentEmployee,
        attendanceList,
        selectedMonth,
        selectedYear
      );
    }
    return null;
  }, [currentEmployee, rpcResult, attendanceList, selectedMonth, selectedYear, getAttendanceMatrix]);

  // Kiểm tra tháng đang xem có dữ liệu chấm công không (tránh hiển thị sai lệch kỳ)
  const hasAttendanceData = Boolean(
    isMatrixValidWithData(matrixData) ||
    (attendanceList && attendanceList.some((r) => (Number(r.workHours) || 0) > 0 || r.checkIn || (r.status && r.status !== 'weekend')))
  );

  // Tính toán các chỉ tiêu KPI công (Ưu tiên số liệu tính toán từ Ma trận chuẩn 100% file Excel)
  const calculatedSummary: CalculatedAttendanceSummary = useMemo(() => {
    if (!hasAttendanceData) {
      return {
        standardWorkDays: 22,
        actualWorkDays: 0,
        totalWorkHours: 0,
        onTimeDays: 0,
        lateDays: 0,
        earlyLeaveDays: 0,
        paidLeaveDays: 0,
        unpaidLeaveDays: 0,
        totalLateMinutes: 0,
        totalEarlyMinutes: 0,
        overtimeHours: 0,
      };
    }
    if (rpcResult?.calculatedSummary && (rpcResult.calculatedSummary.totalWorkHours > 0 || rpcResult.calculatedSummary.actualWorkDays > 0)) {
      return rpcResult.calculatedSummary;
    }
    return {
      standardWorkDays: payrollData?.standardWorkDays || 22,
      actualWorkDays:
        payrollData?.actualWorkDays ??
        attendanceList.filter((r) => r.workHours > 0 || r.status === 'on_time' || r.status === 'late').length,
      totalWorkHours: attendanceList.reduce((sum, r) => sum + r.workHours, 0),
      onTimeDays: attendanceList.filter((r) => r.status === 'on_time').length,
      lateDays: attendanceList.filter((r) => r.status === 'late').length,
      earlyLeaveDays: attendanceList.filter((r) => r.status === 'early_leave').length,
      paidLeaveDays:
        payrollData?.paidLeaveDays ?? attendanceList.filter((r) => r.status === 'leave_approved').length,
      unpaidLeaveDays:
        payrollData?.unpaidLeaveDays ?? attendanceList.filter((r) => r.status === 'leave_unapproved').length,
      totalLateMinutes: attendanceList.reduce((sum, r) => sum + r.lateMinutes, 0),
      totalEarlyMinutes: attendanceList.reduce((sum, r) => sum + r.earlyMinutes, 0),
      overtimeHours: attendanceList.reduce(
        (sum, r) => sum + (r.overtimeHours !== undefined && r.overtimeHours > 0 ? r.overtimeHours : (r.workHours > 8 ? r.workHours - 8 : 0)),
        0
      ),
    };
  }, [rpcResult, payrollData, attendanceList, hasAttendanceData]);

  // Helper lấy số giờ tăng ca của 1 bản ghi
  const getRecordOvertime = (rec?: AttendanceRecord): number => {
    if (!rec) return 0;
    if (rec.overtimeHours !== undefined && rec.overtimeHours > 0) return rec.overtimeHours;
    if (rec.workHours > 8) return Math.round((rec.workHours - 8) * 10) / 10;
    return 0;
  };

  // Map ngày -> bản ghi chấm công
  const attendanceMap = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    attendanceList.forEach((r) => {
      map.set(r.date, r);
    });
    return map;
  }, [attendanceList]);

  // Cấu trúc dữ liệu Bảng chấm công chi tiết theo ngày (Hiển thị đủ tất cả các ngày trong tháng theo mẫu.xlsx)
  const fullMonthDays = useMemo(() => {
    const targetMonth = selectedMonth;
    const targetYear = selectedYear;
    const daysInMonth = matrixData?.daysInMonth || new Date(targetYear, targetMonth, 0).getDate();
    const dayNameShortList = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayNameFullList = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

    const days: Array<{
      day: string;
      dayNum: number;
      dateStr: string;
      dayShort: string;
      dayFull: string;
      isWeekend: boolean;
      start: string;
      stop: string;
      workHoursDisplay: string;
      workHoursNum: number;
      otHours: number;
      ot150: number;
      ot210: number;
      otSun200: number;
      otSun270: number;
      night30: number;
      leaveDisplay: string;
      record?: AttendanceRecord;
    }> = [];

    const startRow = matrixData?.rows.find((r) => r.indicatorName.toLowerCase().includes('bắt đầu') || r.indicatorName.toLowerCase().includes('start'));
    const stopRow = matrixData?.rows.find((r) => r.indicatorName.toLowerCase().includes('kết thúc') || r.indicatorName.toLowerCase().includes('stop'));
    const workRow = matrixData?.rows.find((r) => r.indicatorName.toLowerCase().includes('thời gian làm việc') || r.indicatorName.toLowerCase().includes('work hours'));
    const leaveRow = matrixData?.rows.find((r) => r.indicatorName.toLowerCase().includes('nghỉ làm') || r.indicatorName.toLowerCase().includes('leave'));
    const ot150Row = matrixData?.rows.find((r) => r.indicatorName.toLowerCase().includes('150%'));
    const ot210Row = matrixData?.rows.find((r) => r.indicatorName.toLowerCase().includes('210%'));
    const night30Row = matrixData?.rows.find((r) => r.indicatorName.toLowerCase().includes('30%'));
    const otSun200Row = matrixData?.rows.find((r) => r.indicatorName.toLowerCase().includes('200%'));
    const otSun270Row = matrixData?.rows.find((r) => r.indicatorName.toLowerCase().includes('270%'));

    for (let d = 1; d <= daysInMonth; d++) {
      const dayStr = String(d).padStart(2, '0');
      const dateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${dayStr}`;
      const dateObj = new Date(targetYear, targetMonth - 1, d);
      const dayOfWeekIdx = dateObj.getDay();
      const dayShort = dayNameShortList[dayOfWeekIdx];
      const dayFull = dayNameFullList[dayOfWeekIdx];

      let isWeekend = dayOfWeekIdx === 0 || dayOfWeekIdx === 6;
      if (matrixData?.daysOfWeek && matrixData.daysOfWeek[d]) {
        const dow = matrixData.daysOfWeek[d].toLowerCase();
        if (dow === 'sun' || dow === 'sat' || dow === 'cn' || dow === 't7') {
          isWeekend = true;
        }
      }

      const record = attendanceMap.get(dateStr);
      let otHours = getRecordOvertime(record);

      let start = '-';
      let stop = '-';
      let workHoursDisplay = '-';
      let workHoursNum = 0;
      let leaveDisplay = '-';

      if (record) {
        if (record.checkIn) start = record.checkIn;
        if (record.checkOut) stop = record.checkOut;
        if (record.workHours && record.workHours > 0) {
          workHoursDisplay = String(record.workHours);
          workHoursNum = record.workHours;
        }

        if (record.leaveCode && record.leaveCode !== '-' && record.leaveCode !== '0') {
          leaveDisplay = record.leaveCode;
        } else if (record.status === 'leave_approved' || record.status === 'leave_unapproved') {
          if (record.note && /P\b|phép/i.test(record.note)) leaveDisplay = 'P';
          else if (record.note && /HL/i.test(record.note)) leaveDisplay = 'HL';
          else if (record.note && /KP|không\s*lương/i.test(record.note)) leaveDisplay = 'KP';
          else leaveDisplay = 'P';
        }
      }

      // Ưu tiên dữ liệu trực tiếp từ matrixData.rows chuẩn cấu trúc Excel
      if (startRow && startRow.values[d] && startRow.values[d] !== '-') {
        start = String(startRow.values[d]);
      }
      if (stopRow && stopRow.values[d] && stopRow.values[d] !== '-') {
        stop = String(stopRow.values[d]);
      }
      if (workRow && workRow.values[d] && workRow.values[d] !== '-') {
        workHoursDisplay = String(workRow.values[d]);
        workHoursNum = Number(workRow.values[d]) || workHoursNum;
      }
      if (leaveRow && leaveRow.values[d] && leaveRow.values[d] !== '-' && leaveRow.values[d] !== '0') {
        leaveDisplay = String(leaveRow.values[d]);
      }

      const ot150 = Number(ot150Row?.values[d]) || 0;
      const ot210 = Number(ot210Row?.values[d]) || 0;
      const otSun200 = Number(otSun200Row?.values[d]) || 0;
      const otSun270 = Number(otSun270Row?.values[d]) || 0;
      const night30 = Number(night30Row?.values[d]) || 0;

      const sumMatrixOt = ot150 + ot210 + otSun200 + otSun270;
      if (sumMatrixOt > 0) {
        otHours = sumMatrixOt;
      }

      days.push({
        day: dayStr,
        dayNum: d,
        dateStr,
        dayShort,
        dayFull,
        isWeekend,
        start,
        stop,
        workHoursDisplay,
        workHoursNum,
        otHours,
        ot150,
        ot210,
        otSun200,
        otSun270,
        night30,
        leaveDisplay,
        record,
      });
    }

    return days;
  }, [matrixData, selectedYear, selectedMonth, attendanceMap]);

  // Nhóm 2 – Các loại công tăng ca và phụ cấp theo tiêu đề file Excel
  const overtimeIndicatorsList = useMemo(() => {
    if (rpcResult?.calculatedSummary?.overtimeIndicators && rpcResult.calculatedSummary.overtimeIndicators.length > 0) {
      return rpcResult.calculatedSummary.overtimeIndicators;
    }

    const daysWithOt = fullMonthDays.filter((d) => d.otHours > 0);
    const totalOtHours = daysWithOt.reduce((sum, d) => sum + d.otHours, 0);

    const daysWithPaidLeave = fullMonthDays.filter((d) => d.leaveDisplay === 'P' || d.leaveDisplay === 'HL');
    const paidLeaveCount = daysWithPaidLeave.length;

    const getMatrixTotal = (nameSub: string, fallback: number = 0) => {
      if (!matrixData) return fallback;
      const row = matrixData.rows.find((r) => r.indicatorName.toLowerCase().includes(nameSub.toLowerCase()));
      if (row && typeof row.total === 'number') return row.total;
      return fallback;
    };

    return [
      {
        name: 'TC ngày thường (150%)',
        rate: '150%',
        total: getMatrixTotal('150%', Number(totalOtHours.toFixed(1))),
        unit: 'giờ',
        dates: daysWithOt.map((d) => `Ngày ${d.day} (+${d.otHours}h)`).join(', '),
      },
      {
        name: 'TC đêm ngày thường (210%)',
        rate: '210%',
        total: getMatrixTotal('210%', 0),
        unit: 'giờ',
        dates: '',
      },
      {
        name: 'Phụ cấp ca đêm (30%)',
        rate: '30%',
        total: getMatrixTotal('30%', 0),
        unit: 'giờ',
        dates: '',
      },
      {
        name: 'TC ngày Chủ nhật (200%)',
        rate: '200%',
        total: getMatrixTotal('200%', 0),
        unit: 'giờ',
        dates: '',
      },
      {
        name: 'TC đêm Chủ nhật (270%)',
        rate: '270%',
        total: getMatrixTotal('270%', 0),
        unit: 'giờ',
        dates: '',
      },
      {
        name: 'TC ngày lễ (300%)',
        rate: '300%',
        total: getMatrixTotal('300%', 0),
        unit: 'giờ',
        dates: '',
      },
      {
        name: 'TC đêm ngày lễ (390%)',
        rate: '390%',
        total: getMatrixTotal('390%', 0),
        unit: 'giờ',
        dates: '',
      },
      {
        name: 'Nghỉ có lương + ngày lễ',
        rate: '100%',
        total: paidLeaveCount,
        unit: 'ngày',
        dates: daysWithPaidLeave.map((d) => `Ngày ${d.day}`).join(', '),
      },
      {
        name: 'Nghỉ HL',
        rate: '100%',
        total: getMatrixTotal('HL', fullMonthDays.filter((d) => d.leaveDisplay === 'HL').length),
        unit: 'ngày',
        dates: '',
      },
      {
        name: 'Nghỉ phép',
        rate: '100%',
        total: getMatrixTotal('phép', fullMonthDays.filter((d) => d.leaveDisplay === 'P').length),
        unit: 'ngày',
        dates: fullMonthDays.filter((d) => d.leaveDisplay === 'P').map((d) => `Ngày ${d.day}`).join(', '),
      },
    ];
  }, [rpcResult, fullMonthDays, matrixData]);

  // Thống kê nhanh toàn bộ tháng cho thanh chỉ số KPI mini
  const attendanceStats = useMemo(() => {
    const totalDays = fullMonthDays.length;
    const workDays = fullMonthDays.filter((d) => d.workHoursDisplay !== '-').length;
    const otDays = fullMonthDays.filter((d) => d.otHours > 0).length;
    const totalOtHours = fullMonthDays.reduce((sum, d) => sum + d.otHours, 0);
    const leaveDays = fullMonthDays.filter((d) => d.leaveDisplay !== '-').length;
    const weekendDays = fullMonthDays.filter((d) => d.isWeekend).length;
    const totalWorkHours = fullMonthDays.reduce((sum, d) => sum + d.workHoursNum, 0);
    return {
      totalDays,
      workDays,
      otDays,
      totalOtHours: Number(totalOtHours.toFixed(1)),
      leaveDays,
      weekendDays,
      totalWorkHours: Number(totalWorkHours.toFixed(1)),
    };
  }, [fullMonthDays]);

  // Bộ lọc dữ liệu bảng chấm công chi tiết
  const filteredMonthDays = useMemo(() => {
    if (tableFilter === 'work') return fullMonthDays.filter((d) => d.workHoursDisplay !== '-');
    if (tableFilter === 'ot') return fullMonthDays.filter((d) => d.otHours > 0);
    if (tableFilter === 'leave') return fullMonthDays.filter((d) => d.leaveDisplay !== '-');
    return fullMonthDays;
  }, [fullMonthDays, tableFilter]);

  // =========================================================================
  // XÁC THỰC MÃ PIN BẢO MẬT TIỀN LƯƠNG
  // =========================================================================
  const isSalaryUnlocked = currentEmployee ? unlockedSalaryEmployees.has(currentEmployee.id) : false;

  const handleVerifySalaryPin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentEmployee) return;

    if (pinLockoutSeconds > 0) {
      setPinError(`Bạn đang bị tạm khóa xác thực mã PIN. Vui lòng chờ ${pinLockoutSeconds} giây.`);
      return;
    }

    const check = verifyEmployeeSalaryPin(currentEmployee.id, pinInput);
    if (check.valid) {
      setUnlockedSalaryEmployees((prev) => new Set([...prev, currentEmployee.id]));
      setPinError('');
      setFailedPinAttempts(0);
    } else {
      const nextFailCount = failedPinAttempts + 1;
      setFailedPinAttempts(nextFailCount);

      if (nextFailCount >= 5) {
        setPinLockoutSeconds(60);
        setPinError('Bạn đã nhập sai mã PIN 5 lần liên tiếp. Nhằm bảo mật thu nhập, tạm khóa xác thực trong 60 giây.');
      } else {
        setPinError(`Mã PIN không đúng (Lần thử ${nextFailCount}/5). Mặc định là 1234.`);
      }
    }
  };

  const handleLockSalary = () => {
    if (!currentEmployee) return;
    setUnlockedSalaryEmployees((prev) => {
      const next = new Set(prev);
      next.delete(currentEmployee.id);
      return next;
    });
    setPinInput('');
  };

  // Xuất file Excel
  const handleExportExcel = () => {
    if (!currentEmployee) return;
    exportAttendanceToExcel({
      employee: currentEmployee,
      attendanceDaily: attendanceList,
      summary: calculatedSummary,
      payrollSummary: isSalaryUnlocked ? payrollData : undefined,
      month: selectedMonth,
      year: selectedYear,
    });
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Top Header - Bị ẩn khi in */}
      <header className="no-print h-16 bg-white border-b border-slate-200/80 px-4 sm:px-8 flex items-center justify-between sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-700 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-extrabold text-slate-800 tracking-tight">
              HỆ THỐNG TRA CỨU NHÂN SỰ COASIA OPTICS
            </h1>
            <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
              Chấm Công &bull; Phiếu Lương (Bảo Mật PIN) &bull; Số Dư Phép Năm
            </p>
          </div>
        </div>
      </header>

      {/* Hero Search Section - Bị ẩn khi in */}
      <div className="no-print bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 text-white py-8 sm:py-12 px-4 shadow-inner">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 mb-2">
              <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Cổng tra cứu tự phục vụ người lao động</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Tra Cứu Thông Tin Nhân Sự Cá Nhân
            </h2>
            <p className="text-xs sm:text-sm text-indigo-200/80 mt-1 max-w-lg mx-auto">
              Tra cứu bảng chấm công theo ngày, phiếu lương bảo mật mã PIN và số dư phép năm minh bạch
            </p>
          </div>

          {/* Search Box Card */}
          <div className="bg-white rounded-2xl shadow-2xl p-4 sm:p-6 text-slate-800 border border-slate-100">
            <form onSubmit={handleSearch} className="space-y-4">
              {/* Row 1: 3 Nút Chọn Nội Dung Tra Cứu (To, Rõ Ràng, Nổi Bật) */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-2 uppercase tracking-wider">
                  Chọn nội dung tra cứu:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                  {/* Nút 1: Check Công */}
                  <button
                    type="button"
                    onClick={() => setCategory('attendance')}
                    className={`py-3 px-4 rounded-xl text-sm sm:text-base font-black flex items-center justify-center gap-2.5 transition-all shadow-xs cursor-pointer ${
                      category === 'attendance'
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 ring-2 ring-indigo-500/20'
                        : 'bg-slate-100 hover:bg-slate-200/80 text-slate-700'
                    }`}
                  >
                    <Clock className={`w-5 h-5 ${category === 'attendance' ? 'text-indigo-200' : 'text-indigo-600'}`} />
                    <span>Check Công</span>
                  </button>

                  {/* Nút 2: Check Lương */}
                  <button
                    type="button"
                    onClick={() => {
                      setCategory('payroll');
                      if (searchedEmployeeId) {
                        performSearch(searchedEmployeeId, selectedMonth, selectedYear, 'payroll');
                      }
                    }}
                    className={`py-3 px-4 rounded-xl text-sm sm:text-base font-black flex items-center justify-center gap-2.5 transition-all shadow-xs cursor-pointer ${
                      category === 'payroll'
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 ring-2 ring-indigo-500/20'
                        : 'bg-slate-100 hover:bg-slate-200/80 text-slate-700'
                    }`}
                  >
                    <CreditCard className={`w-5 h-5 ${category === 'payroll' ? 'text-amber-200' : 'text-amber-600'}`} />
                    <span className="flex items-center gap-1.5">
                      <span>Check Lương</span>
                      <Lock className="w-3.5 h-3.5 opacity-80" />
                    </span>
                  </button>

                  {/* Nút 3: Tra Phép */}
                  <button
                    type="button"
                    onClick={() => {
                      setCategory('leave');
                      if (searchedEmployeeId) {
                        performSearch(searchedEmployeeId, selectedMonth, selectedYear, 'leave');
                      }
                    }}
                    className={`py-3 px-4 rounded-xl text-sm sm:text-base font-black flex items-center justify-center gap-2.5 transition-all shadow-xs cursor-pointer ${
                      category === 'leave'
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 ring-2 ring-indigo-500/20'
                        : 'bg-slate-100 hover:bg-slate-200/80 text-slate-700'
                    }`}
                  >
                    <Coffee className={`w-5 h-5 ${category === 'leave' ? 'text-emerald-200' : 'text-emerald-600'}`} />
                    <span>Tra Phép</span>
                  </button>
                </div>
              </div>

              {/* Row 2: Ô Nhập Mã NV Nhỏ Vừa Đủ + Chọn Kỳ (Chỉ 2 Năm) + Nút Tra Cứu */}
              <div className="flex flex-col md:flex-row md:items-end gap-3 pt-3 border-t border-slate-100">
                {/* Ô nhập mã nhân viên: Nhỏ vừa đủ */}
                <div className="w-full md:w-56 shrink-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Mã nhân viên *
                    </label>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Search className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      value={employeeIdInput}
                      disabled={remainingLockout > 0}
                      onChange={(e) => setEmployeeIdInput(e.target.value)}
                      placeholder="VD: NV001, S0076..."
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>

                {/* Chọn Tháng / Năm (Chỉ 2 năm: 2026, 2025) */}
                <div className="flex items-center gap-2 flex-wrap">
                  {category !== 'leave' && (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                        Tháng:
                      </label>
                      <select
                        value={selectedMonth}
                        disabled={remainingLockout > 0}
                        onChange={(e) => {
                          const m = Number(e.target.value);
                          setSelectedMonth(m);
                          if (searchedEmployeeId) {
                            performSearch(searchedEmployeeId, m, selectedYear);
                          }
                        }}
                        className="w-28 py-2.5 px-3 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 bg-slate-50 font-bold"
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                          <option key={m} value={m}>Tháng {m}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                      {category === 'leave' ? 'Năm số dư phép:' : 'Năm:'}
                    </label>
                    <select
                      value={selectedYear}
                      disabled={remainingLockout > 0}
                      onChange={(e) => {
                        const y = Number(e.target.value);
                        setSelectedYear(y);
                        if (searchedEmployeeId) {
                          performSearch(searchedEmployeeId, selectedMonth, y);
                        }
                      }}
                      className="w-28 py-2.5 px-3 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 bg-slate-50 font-bold"
                    >
                      <option value={2026}>Năm 2026</option>
                      <option value={2025}>Năm 2025</option>
                    </select>
                  </div>
                </div>

                {/* Nút Tra Cứu Dữ Liệu */}
                <div className="md:ml-auto w-full md:w-auto">
                  <button
                    type="submit"
                    disabled={isSearching || remainingLockout > 0}
                    className="w-full md:w-auto py-2.5 px-6 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-600/30 hover:shadow-indigo-600/40 transition flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <Search className="w-4 h-4" />
                    <span>
                      {remainingLockout > 0
                        ? `Khóa (${remainingLockout}s)`
                        : isSearching
                        ? 'Đang kiểm tra...'
                        : 'Tra Cứu Dữ Liệu'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Anti-brute-force alert */}
              {remainingLockout > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-center gap-2 animate-pulse">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <span>
                    Chống dò mã: Phát hiện nhiều lần nhập mã không tồn tại. Vui lòng thử lại sau{' '}
                    <strong>{remainingLockout} giây</strong>.
                  </span>
                </div>
              )}
            </form>
          </div>
        </div>
      </div>

      {/* Main Results Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {searchError && (
          <div className="no-print p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2.5 shadow-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600" />
            <span className="font-semibold">{searchError}</span>
          </div>
        )}

        {/* Trạng thái khi tra cứu công nhưng nhân viên không có dữ liệu trong danh mục quản lý công */}
        {hasSearched && category === 'attendance' && !hasAttendanceData && !searchError && (
          <div className="no-print p-8 text-center bg-white rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
              <Calendar className="w-7 h-7" />
            </div>
            <h4 className="text-base font-bold text-slate-800">
              Không có dữ liệu trong danh mục quản lý công
            </h4>
            <p className="text-xs text-slate-600 font-semibold">
              Chưa có dữ liệu bảng chấm công cho kỳ Tháng {selectedMonth}/{selectedYear}
            </p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Mã nhân viên <strong>{searchedEmployeeId || employeeIdInput}</strong> không có dữ liệu chấm công trong danh mục quản lý công kỳ Tháng {selectedMonth}/{selectedYear}. Vui lòng kiểm tra lại mã nhân viên hoặc chọn kỳ công khác.
            </p>
            {currentEmployee && (() => {
              const available = getAvailablePeriodsForEmployee(currentEmployee.id);
              if (available.length === 0) return null;
              return (
                <div className="pt-2 text-xs">
                  <span className="text-slate-500 font-medium">Kỳ hiện có dữ liệu của nhân viên này: </span>
                  <div className="flex items-center justify-center gap-2 mt-1.5 flex-wrap">
                    {available.map((p) => (
                      <button
                        key={`${p.month}_${p.year}`}
                        type="button"
                        onClick={() => {
                          setSelectedMonth(p.month);
                          setSelectedYear(p.year);
                          performSearch(currentEmployee.id, p.month, p.year, 'attendance');
                        }}
                        className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition cursor-pointer"
                      >
                        Xem Tháng {p.month}/{p.year} &rarr;
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Trạng thái khi đã tra cứu nhưng không tìm thấy nhân viên */}
        {hasSearched && !currentEmployee && !searchError && category !== 'attendance' && (
          <div className="no-print p-8 text-center bg-white rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
            <UserX className="w-12 h-12 text-slate-300 mx-auto" />
            <h4 className="text-base font-bold text-slate-700">Không tìm thấy thông tin nhân viên</h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Không tìm thấy hồ sơ tương ứng với mã "{searchedEmployeeId}". Vui lòng kiểm tra lại mã nhân viên hoặc liên hệ Phòng Nhân sự để được hỗ trợ.
            </p>
          </div>
        )}

        {hasSearched && currentEmployee && (category !== 'attendance' || hasAttendanceData) && (
          <div className="space-y-6 animate-fadeIn">
            {/* A. THÔNG TIN NHÂN VIÊN (Hiển thị ở phần đầu theo đúng yêu cầu) */}
            <div className="no-print bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <img
                  src={
                    currentEmployee.avatarUrl ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(
                      currentEmployee.fullName
                    )}&background=4f46e5&color=ffffff&bold=true`
                  }
                  alt={currentEmployee.fullName}
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-indigo-100 shadow-sm"
                />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-lg font-black text-slate-800">{currentEmployee.fullName}</h3>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200" title="Mã nhân viên">
                      Mã NV: {currentEmployee.id}
                    </span>
                    {/* Trạng thái hợp đồng: Thử việc / Chính thức */}
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        currentEmployee.status === 'probation'
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : currentEmployee.status === 'active'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {currentEmployee.status === 'probation'
                        ? 'Thử việc'
                        : currentEmployee.status === 'active'
                        ? 'Chính thức'
                        : 'Đã nghỉ việc'}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                      Kỳ: Tháng {selectedMonth}/{selectedYear}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-y-1 gap-x-4 text-xs text-slate-600 mt-2">
                    <div>
                      <span className="text-slate-400">Bộ phận:</span>{' '}
                      <strong className="text-indigo-900 bg-indigo-50/70 px-2 py-0.5 rounded font-bold">
                        {currentEmployee.department}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400">Chức vụ:</span>{' '}
                      <strong className="text-slate-800 font-semibold">{currentEmployee.position}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400">Ngày vào làm:</span>{' '}
                      <strong className="text-slate-800">{formatDate(currentEmployee.startDate)}</strong>
                    </div>
                  </div>

                  {currentEmployee.bankAccount && currentEmployee.bankAccount.accountNumber && (
                    <p className="text-[11px] text-slate-400 mt-1">
                      TK nhận lương: {currentEmployee.bankAccount.bankName} - {currentEmployee.bankAccount.accountNumber}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* =========================================================================
                TAB CONTENT 1: ATTENDANCE (CHẤM CÔNG CHI TIẾT & KPI)
                ========================================================================= */}
            {category === 'attendance' && (
              <div className="space-y-6">
                {/* 7 THẺ TỔNG HỢP CHỈ TIÊU CÔNG & PHỤ CẤP THEO FILE MẪU */}
                {(() => {
                  const totalWorkHours = hasAttendanceData
                    ? (matrixData?.summary?.totalWorkHours ?? calculatedSummary.totalWorkHours)
                    : 0;
                  const ot150 = hasAttendanceData
                    ? (matrixData?.summary?.overtime150 ?? (calculatedSummary.overtimeHours || 0))
                    : 0;
                  const ot210 = hasAttendanceData ? (matrixData?.summary?.overtime210 ?? 0) : 0;
                  const nightAllowance30 = hasAttendanceData ? (matrixData?.summary?.nightAllowance30 ?? 0) : 0;
                  const otSun200 = hasAttendanceData ? (matrixData?.summary?.overtimeSunday200 ?? 0) : 0;
                  const otSun270 = hasAttendanceData ? (matrixData?.summary?.overtimeSunday270 ?? 0) : 0;
                  const totalLeaveDays = hasAttendanceData
                    ? (matrixData?.summary?.totalLeaveDays ?? (calculatedSummary.paidLeaveDays || 0))
                    : 0;

                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                      {/* Thẻ 1: Tổng Giờ Làm */}
                      <div className="bg-white p-2.5 rounded-xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition flex flex-col justify-between">
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate">
                            Tổng Giờ Làm
                          </span>
                          <div className="w-5 h-5 rounded-md bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
                            <Clock className="w-3 h-3" />
                          </div>
                        </div>
                        <div className="flex items-baseline gap-1 my-0.5">
                          <span className="text-base sm:text-lg font-bold text-indigo-700 font-mono">
                            {totalWorkHours}
                          </span>
                          <span className="text-[10px] font-medium text-slate-400">giờ</span>
                        </div>
                        <div className="text-[9px] text-slate-500 font-medium truncate pt-1 border-t border-slate-100 flex items-center justify-between">
                          <span>Đi làm: {hasAttendanceData ? calculatedSummary.actualWorkDays : 0} ngày</span>
                        </div>
                      </div>

                      {/* Thẻ 2: Tăng Ca Thường (150%) */}
                      <div className="bg-white p-2.5 rounded-xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition flex flex-col justify-between">
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider truncate">
                            Tăng Ca Thường
                          </span>
                          <div className="w-5 h-5 rounded-md bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                            <Sun className="w-3 h-3" />
                          </div>
                        </div>
                        <div className="flex items-baseline gap-1 my-0.5">
                          <span className="text-base sm:text-lg font-bold text-amber-700 font-mono">
                            {ot150}
                          </span>
                          <span className="text-[10px] font-medium text-slate-400">giờ</span>
                        </div>
                        <div className="text-[9px] text-amber-600 font-medium truncate pt-1 border-t border-slate-100">
                          TC ngày (150%)
                        </div>
                      </div>

                      {/* Thẻ 3: Tăng Ca Đêm (210%) */}
                      <div className="bg-white p-2.5 rounded-xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition flex flex-col justify-between">
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider truncate">
                            Tăng Ca Đêm
                          </span>
                          <div className="w-5 h-5 rounded-md bg-purple-50 text-purple-700 flex items-center justify-center shrink-0">
                            <Moon className="w-3 h-3" />
                          </div>
                        </div>
                        <div className="flex items-baseline gap-1 my-0.5">
                          <span className="text-base sm:text-lg font-bold text-purple-700 font-mono">
                            {ot210}
                          </span>
                          <span className="text-[10px] font-medium text-slate-400">giờ</span>
                        </div>
                        <div className="text-[9px] text-purple-600 font-medium truncate pt-1 border-t border-slate-100">
                          TC đêm (210%)
                        </div>
                      </div>

                      {/* Thẻ 4: Phụ Cấp Ca Đêm (30%) */}
                      <div className="bg-white p-2.5 rounded-xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition flex flex-col justify-between">
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="text-[10px] font-bold text-sky-700 uppercase tracking-wider truncate">
                            Phụ Cấp Ca Đêm
                          </span>
                          <div className="w-5 h-5 rounded-md bg-sky-50 text-sky-700 flex items-center justify-center shrink-0">
                            <Sparkles className="w-3 h-3" />
                          </div>
                        </div>
                        <div className="flex items-baseline gap-1 my-0.5">
                          <span className="text-base sm:text-lg font-bold text-sky-700 font-mono">
                            {nightAllowance30}
                          </span>
                          <span className="text-[10px] font-medium text-slate-400">giờ</span>
                        </div>
                        <div className="text-[9px] text-sky-600 font-medium truncate pt-1 border-t border-slate-100">
                          PC ca đêm (30%)
                        </div>
                      </div>

                      {/* Thẻ 5: Tăng Ca Chủ Nhật (200%) */}
                      <div className="bg-white p-2.5 rounded-xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition flex flex-col justify-between">
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider truncate">
                            Tăng Ca CN
                          </span>
                          <div className="w-5 h-5 rounded-md bg-rose-50 text-rose-700 flex items-center justify-center shrink-0">
                            <Calendar className="w-3 h-3" />
                          </div>
                        </div>
                        <div className="flex items-baseline gap-1 my-0.5">
                          <span className="text-base sm:text-lg font-bold text-rose-700 font-mono">
                            {otSun200}
                          </span>
                          <span className="text-[10px] font-medium text-slate-400">giờ</span>
                        </div>
                        <div className="text-[9px] text-rose-600 font-medium truncate pt-1 border-t border-slate-100">
                          TC ngày CN (200%)
                        </div>
                      </div>

                      {/* Thẻ 6: Tăng Ca Đêm CN (270%) */}
                      <div className="bg-white p-2.5 rounded-xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition flex flex-col justify-between">
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="text-[10px] font-bold text-fuchsia-700 uppercase tracking-wider truncate">
                            TC Đêm CN
                          </span>
                          <div className="w-5 h-5 rounded-md bg-fuchsia-50 text-fuchsia-700 flex items-center justify-center shrink-0">
                            <Moon className="w-3 h-3" />
                          </div>
                        </div>
                        <div className="flex items-baseline gap-1 my-0.5">
                          <span className="text-base sm:text-lg font-bold text-fuchsia-700 font-mono">
                            {otSun270}
                          </span>
                          <span className="text-[10px] font-medium text-slate-400">giờ</span>
                        </div>
                        <div className="text-[9px] text-fuchsia-600 font-medium truncate pt-1 border-t border-slate-100">
                          TC đêm CN (270%)
                        </div>
                      </div>

                      {/* Thẻ 7: Tổng Ngày Nghỉ */}
                      <div className="bg-white p-2.5 rounded-xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition flex flex-col justify-between">
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider truncate">
                            Tổng Ngày Nghỉ
                          </span>
                          <div className="w-5 h-5 rounded-md bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                            <Coffee className="w-3 h-3" />
                          </div>
                        </div>
                        <div className="flex items-baseline gap-1 my-0.5">
                          <span className="text-base sm:text-lg font-bold text-emerald-700 font-mono">
                            {totalLeaveDays}
                          </span>
                          <span className="text-[10px] font-medium text-slate-400">ngày</span>
                        </div>
                        <div className="text-[9px] text-emerald-600 font-medium truncate pt-1 border-t border-slate-100">
                          Nghỉ làm (P, HL)
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* BẢNG CÔNG & SUB-TABS (XEM RÚT GỌN MOBILE & BẢNG CHI TIẾT EXCEL) */}
                <div className="space-y-4 pt-1">
                  {/* Tiêu đề & Sub-Tabs Switch */}
                  <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="text-xs sm:text-sm font-extrabold text-slate-800 uppercase tracking-wide flex items-center gap-2 flex-wrap">
                        <span>BẢNG CHẤM CÔNG THÁNG {selectedMonth}/{selectedYear} (CHUẨN 100% FILE EXCEL MẪU)</span>
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {attendanceSubTab === 'compact'
                          ? 'Xem rút gọn lịch làm việc theo từng ngày (tối ưu hiển thị điện thoại di động)'
                          : 'Bảng công ma trận chi tiết 38 cột ngang chuẩn 100% cấu trúc Excel mẫu'}
                      </p>
                    </div>

                    {/* Sub-tab navigation buttons */}
                    <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0 self-start sm:self-center">
                      <button
                        type="button"
                        onClick={() => setAttendanceSubTab('compact')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                          attendanceSubTab === 'compact'
                            ? 'bg-white text-indigo-700 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                        }`}
                      >
                        <List className="w-3.5 h-3.5" />
                        <span>Xem Rút Gọn (Mobile)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setAttendanceSubTab('detailed')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                          attendanceSubTab === 'detailed'
                            ? 'bg-white text-indigo-700 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                        }`}
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        <span>Bảng Chi Tiết (Excel)</span>
                      </button>
                    </div>
                  </div>

                  {/* NỘI DUNG SUB-TAB 1: XEM RÚT GỌN (TỐI ƯU MOBILE - DẠNG 1/10 - 08:00 - 17:00) */}
                  {attendanceSubTab === 'compact' && (
                    <div>
                      {!hasAttendanceData ? (
                        <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 text-xs space-y-3">
                          <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mx-auto">
                            <Calendar className="w-6 h-6" />
                          </div>
                          <h4 className="text-sm font-extrabold text-slate-700">
                            Chưa có dữ liệu bảng chấm công cho kỳ Tháng {selectedMonth}/{selectedYear}
                          </h4>
                          <p className="text-xs text-slate-400 max-w-md mx-auto">
                            Nhân viên <strong>{currentEmployee.fullName}</strong> ({currentEmployee.id}) chưa có dữ liệu chấm công cho Tháng {selectedMonth}/{selectedYear}.
                          </p>
                          {(() => {
                            const available = getAvailablePeriodsForEmployee(currentEmployee.id);
                            if (available.length === 0) return null;
                            return (
                              <div className="pt-2 text-xs">
                                <span className="text-slate-500 font-medium">Kỳ hiện có dữ liệu của nhân viên này: </span>
                                <div className="flex items-center justify-center gap-2 mt-1.5 flex-wrap">
                                  {available.map((p) => (
                                    <button
                                      key={`${p.month}_${p.year}`}
                                      type="button"
                                      onClick={() => {
                                        setSelectedMonth(p.month);
                                        setSelectedYear(p.year);
                                        performSearch(currentEmployee.id, p.month, p.year);
                                      }}
                                      className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition cursor-pointer"
                                    >
                                      Xem Tháng {p.month}/{p.year} &rarr;
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {/* Thống kê nhanh */}
                          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                            <span>
                              Tháng {selectedMonth}/{selectedYear}:{' '}
                              <strong className="text-slate-700">{fullMonthDays.length} ngày</strong>
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                <span>Đi làm: <strong className="text-emerald-700">{fullMonthDays.filter(d => (d.start !== '-' && d.stop !== '-') || d.workHoursNum > 0).length}</strong></span>
                              </span>
                              <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                <span>Nghỉ: <strong className="text-amber-700">{fullMonthDays.filter(d => d.leaveDisplay !== '-').length}</strong></span>
                              </span>
                            </div>
                          </div>

                          {/* Danh sách ngày rút gọn */}
                          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
                            {fullMonthDays.map((dItem) => {
                              const hasTime = dItem.start !== '-' && dItem.stop !== '-';
                              const hasWorked = hasTime || dItem.workHoursNum > 0;
                              const isLeave = dItem.leaveDisplay !== '-';

                              // Chuỗi hiển thị chính dạng chuẩn: 1/10 - 08:00 - 17:00
                              let mainDisplayText = `${dItem.dayNum}/${selectedMonth} - ${dItem.start} - ${dItem.stop}`;
                              if (!hasTime) {
                                if (isLeave) {
                                  mainDisplayText = `${dItem.dayNum}/${selectedMonth} - Nghỉ phép (${dItem.leaveDisplay})`;
                                } else if (dItem.isWeekend) {
                                  mainDisplayText = `${dItem.dayNum}/${selectedMonth} - Nghỉ cuối tuần`;
                                } else if (dItem.start !== '-') {
                                  mainDisplayText = `${dItem.dayNum}/${selectedMonth} - ${dItem.start} - (chưa ra)`;
                                } else {
                                  mainDisplayText = `${dItem.dayNum}/${selectedMonth} - Không có dữ liệu`;
                                }
                              }

                              return (
                                <div
                                  key={dItem.day}
                                  className={`p-3 sm:px-4 sm:py-3 flex items-center justify-between gap-2.5 transition ${
                                    dItem.isWeekend && !hasWorked
                                      ? 'bg-slate-50/70'
                                      : isLeave
                                      ? 'bg-amber-50/30'
                                      : 'hover:bg-indigo-50/20'
                                  }`}
                                >
                                  {/* Left: Icon & Dòng hiển thị ngày giờ */}
                                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                                    <div
                                      className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold ${
                                        hasWorked
                                          ? 'bg-emerald-100 text-emerald-700'
                                          : isLeave
                                          ? 'bg-amber-100 text-amber-700'
                                          : dItem.isWeekend
                                          ? 'bg-slate-200 text-slate-500'
                                          : 'bg-slate-100 text-slate-400'
                                      }`}
                                    >
                                      {hasWorked ? (
                                        <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                      ) : isLeave ? (
                                        <Coffee className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                      ) : (
                                        <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                      )}
                                    </div>

                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                        {/* DÒNG HIỂN THỊ CHÍNH DẠNG: 1/10 - 08:00 - 17:00 */}
                                        <span className="font-mono font-bold text-slate-900 text-xs sm:text-sm tracking-tight">
                                          {mainDisplayText}
                                        </span>
                                        {/* Nhãn Thứ / Chủ Nhật */}
                                        <span
                                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                            dItem.isWeekend
                                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                              : 'bg-slate-100 text-slate-600'
                                          }`}
                                        >
                                          {dItem.dayFull}
                                        </span>
                                      </div>

                                      {/* Chi tiết phụ nếu có tăng ca */}
                                      {hasWorked && (dItem.ot150 > 0 || dItem.ot210 > 0 || dItem.otSun200 > 0 || dItem.otSun270 > 0 || dItem.night30 > 0) && (
                                        <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-slate-500 mt-0.5">
                                          {dItem.ot150 > 0 && <span className="text-amber-600 font-semibold">TC 150%: {dItem.ot150}h</span>}
                                          {dItem.ot210 > 0 && <span className="text-purple-600 font-semibold">&bull; TC đêm 210%: {dItem.ot210}h</span>}
                                          {dItem.otSun200 > 0 && <span className="text-rose-600 font-semibold">&bull; TC CN 200%: {dItem.otSun200}h</span>}
                                          {dItem.otSun270 > 0 && <span className="text-fuchsia-600 font-semibold">&bull; TC đêm CN: {dItem.otSun270}h</span>}
                                          {dItem.night30 > 0 && <span className="text-sky-600 font-semibold">&bull; PC ca đêm: {dItem.night30}h</span>}
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Right: Badges số giờ công & tăng ca */}
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {hasWorked && dItem.workHoursNum > 0 && (
                                      <span className="px-2 py-0.5 rounded-lg text-[11px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 whitespace-nowrap">
                                        {dItem.workHoursNum}h
                                      </span>
                                    )}
                                    {hasWorked && dItem.otHours > 0 && (
                                      <span className="hidden sm:inline-flex px-1.5 py-0.5 rounded-lg text-[11px] font-mono font-bold bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
                                        +{dItem.otHours}h TC
                                      </span>
                                    )}
                                    {isLeave && (
                                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 whitespace-nowrap">
                                        Phép ({dItem.leaveDisplay})
                                      </span>
                                    )}
                                    {!hasWorked && !isLeave && dItem.isWeekend && (
                                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-slate-100 text-slate-500 whitespace-nowrap">
                                        Cuối tuần
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* NỘI DUNG SUB-TAB 2: BẢNG CHI TIẾT (MA TRẬN NGANG EXCEL MẪU) */}
                  {attendanceSubTab === 'detailed' && (
                    <div>
                      {matrixData ? (
                        <AttendanceMatrixTable
                          matrix={matrixData}
                          employeeInfo={{
                            stt: 1,
                            id: currentEmployee.id,
                            fullName: currentEmployee.fullName,
                            department: currentEmployee.department,
                            startDate: currentEmployee.startDate,
                            position: currentEmployee.position,
                            status: currentEmployee.status,
                          }}
                          hideHeaderCard={true}
                          hideSummaryCards={true}
                          title={`BẢNG CHẤM CÔNG THÁNG ${selectedMonth}/${selectedYear} (CHUẨN 100% FILE EXCEL MẪU)`}
                        />
                      ) : (
                        <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 text-xs space-y-3">
                          <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mx-auto">
                            <Calendar className="w-6 h-6" />
                          </div>
                          <h4 className="text-sm font-extrabold text-slate-700">
                            Chưa có dữ liệu bảng chấm công cho kỳ Tháng {selectedMonth}/{selectedYear}
                          </h4>
                          <p className="text-xs text-slate-400 max-w-md mx-auto">
                            Nhân viên <strong>{currentEmployee.fullName}</strong> ({currentEmployee.id}) chưa có dữ liệu chấm công cho Tháng {selectedMonth}/{selectedYear}.
                          </p>
                          {(() => {
                            const available = getAvailablePeriodsForEmployee(currentEmployee.id);
                            if (available.length === 0) return null;
                            return (
                              <div className="pt-2 text-xs">
                                <span className="text-slate-500 font-medium">Kỳ hiện có dữ liệu của nhân viên này: </span>
                                <div className="flex items-center justify-center gap-2 mt-1.5 flex-wrap">
                                  {available.map((p) => (
                                    <button
                                      key={`${p.month}_${p.year}`}
                                      type="button"
                                      onClick={() => {
                                        setSelectedMonth(p.month);
                                        setSelectedYear(p.year);
                                        performSearch(currentEmployee.id, p.month, p.year);
                                      }}
                                      className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition cursor-pointer"
                                    >
                                      Xem Tháng {p.month}/{p.year} &rarr;
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* =========================================================================
                TAB CONTENT 2: PAYROLL (BẢO MẬT MÃ PIN CÁ NHÂN)
                ========================================================================= */}
            {category === 'payroll' && (
              <div className="space-y-4">
                {/* Nếu chưa xác thực mã PIN -> Hiển thị màn hình khóa bảo mật */}
                {!isSalaryUnlocked ? (
                  <div className="bg-white rounded-2xl border border-slate-200/90 p-8 shadow-sm max-w-lg mx-auto text-center space-y-5">
                    <div className="w-16 h-16 rounded-3xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 mx-auto shadow-inner">
                      <Lock className="w-8 h-8" />
                    </div>

                    <div>
                      <h4 className="text-lg font-black text-slate-800">
                        Bảo Mật Thu Nhập & Phiếu Lương Cá Nhân
                      </h4>
                      <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                        Thu nhập là thông tin bảo mật cá nhân. Để đảm bảo không ai khác xem được số tiền lương của bạn, vui lòng nhập <strong>Mã PIN bảo mật</strong> do công ty cấp.
                      </p>
                    </div>

                    <form onSubmit={handleVerifySalaryPin} className="space-y-4 pt-2">
                      <div className="relative max-w-xs mx-auto">
                        <KeyRound className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="password"
                          maxLength={6}
                          disabled={pinLockoutSeconds > 0}
                          value={pinInput}
                          onChange={(e) => setPinInput(e.target.value)}
                          placeholder="Nhập mã PIN (4 số)..."
                          className="w-full pl-11 pr-4 py-3 border border-slate-300 rounded-xl text-center text-base font-mono font-bold tracking-widest focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50"
                        />
                      </div>

                      {pinError && (
                        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center justify-center gap-2">
                          <AlertCircle className="w-4 h-4 flex-shrink-0" />
                          <span>{pinError}</span>
                        </div>
                      )}

                      {pinLockoutSeconds > 0 && (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-semibold animate-pulse">
                          Khóa tạm thời: Vui lòng chờ {pinLockoutSeconds} giây để thử lại.
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={pinLockoutSeconds > 0 || !pinInput.trim()}
                        className="w-full max-w-xs mx-auto py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-md shadow-indigo-600/30 transition flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Unlock className="w-4 h-4" />
                        <span>Xác Thực & Xem Phiếu Lương</span>
                      </button>

                      <p className="text-[11px] text-slate-400 italic">
                        Mã PIN mặc định: <strong>1234</strong> (hoặc 4 số cuối số điện thoại).<br />
                        Nếu quên mã PIN, vui lòng liên hệ Admin / Phòng Nhân sự để được cấp lại.
                      </p>
                    </form>
                  </div>
                ) : (
                  /* Đã mở khóa mã PIN thành công -> Hiển thị chi tiết phiếu lương */
                  <div className="space-y-4">
                    {/* Thanh trạng thái đã mở khóa & nút khóa lại */}
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-xs text-emerald-800">
                      <div className="flex items-center gap-2 font-semibold">
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        <span>Phiếu lương đã được mở khóa an toàn</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleLockSalary}
                        className="px-3 py-1 bg-white hover:bg-emerald-100 border border-emerald-300 rounded-lg text-emerald-700 font-bold flex items-center gap-1 transition cursor-pointer"
                        title="Khóa lại để người bên cạnh không nhìn thấy thu nhập"
                      >
                        <Lock className="w-3 h-3 text-amber-600" />
                        <span>Khóa lại</span>
                      </button>
                    </div>

                    {payrollData ? (
                      <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-sm space-y-6">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 gap-2">
                          <div>
                            <span className="text-xs font-mono font-bold text-indigo-600">
                              MÃ PHIẾU: {payrollData.id}
                            </span>
                            <h4 className="text-base font-black text-slate-800 mt-0.5">
                              PHIẾU LƯƠNG CHI TIẾT THÁNG {selectedMonth}/{selectedYear}
                            </h4>
                          </div>
                          <div className="flex items-center gap-3">
                            <PaymentStatusBadge status={payrollData.paymentStatus} />
                          </div>
                        </div>

                        {/* Work Days Summary */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50 p-3 rounded-xl border border-slate-100">
                          <div>
                            <span className="text-slate-400 block font-medium">Ngày công chuẩn:</span>
                            <span className="font-extrabold text-slate-800 text-sm">
                              {payrollData.standardWorkDays} ngày
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block font-medium">Ngày công thực tế:</span>
                            <span className="font-extrabold text-emerald-600 text-sm">
                              {payrollData.actualWorkDays} ngày
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block font-medium">Nghỉ phép hưởng lương:</span>
                            <span className="font-extrabold text-slate-800 text-sm">
                              {payrollData.paidLeaveDays} ngày
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block font-medium">Ngày thanh toán:</span>
                            <span className="font-extrabold text-slate-800 text-sm">
                              {payrollData.paymentDate || '01 hàng tháng'}
                            </span>
                          </div>
                        </div>

                        {/* Incomes & Deductions 2 Columns */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                          {/* Column 1: Earnings */}
                          <div className="p-4 rounded-xl border border-emerald-100 bg-emerald-50/20 space-y-2.5">
                            <h5 className="font-bold text-emerald-800 uppercase tracking-wider">
                              1. Các Khoản Thu Nhập
                            </h5>
                            <div className="flex justify-between py-1 border-b border-emerald-100">
                              <span className="text-slate-600">Lương cơ bản:</span>
                              <span className="font-semibold text-slate-800">
                                {formatCurrency(payrollData.baseSalary)}
                              </span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-emerald-100">
                              <span className="text-slate-600">Phụ cấp ăn trưa, đi lại:</span>
                              <span className="font-semibold text-slate-800">
                                {formatCurrency(payrollData.allowance)}
                              </span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-emerald-100">
                              <span className="text-slate-600">Thưởng KPI & hiệu quả:</span>
                              <span className="font-semibold text-slate-800">
                                {formatCurrency(payrollData.bonus)}
                              </span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-emerald-100">
                              <span className="text-slate-600">Làm thêm giờ (OT):</span>
                              <span className="font-semibold text-slate-800">
                                {formatCurrency(payrollData.overtimePay)}
                              </span>
                            </div>
                          </div>

                          {/* Column 2: Deductions */}
                          <div className="p-4 rounded-xl border border-rose-100 bg-rose-50/20 space-y-2.5">
                            <h5 className="font-bold text-rose-800 uppercase tracking-wider">
                              2. Các Khoản Khấu Trừ
                            </h5>
                            <div className="flex justify-between py-1 border-b border-rose-100">
                              <span className="text-slate-600">BHXH, BHYT, BHTN (10.5%):</span>
                              <span className="font-semibold text-rose-700">
                                -{formatCurrency(payrollData.insuranceDeduction)}
                              </span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-rose-100">
                              <span className="text-slate-600">Thuế thu nhập cá nhân (TNCN):</span>
                              <span className="font-semibold text-rose-700">
                                -{formatCurrency(payrollData.taxDeduction)}
                              </span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-rose-100">
                              <span className="text-slate-600">Trừ phạt đi muộn:</span>
                              <span className="font-semibold text-rose-700">
                                -{formatCurrency(payrollData.latePenalty)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Visual Ratio Bar between Earnings and Net Salary */}
                        <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2 text-xs">
                          <div className="flex items-center justify-between font-bold">
                            <span className="text-emerald-700">
                              Tổng thu nhập: {formatCurrency(payrollData.baseSalary + payrollData.allowance + payrollData.bonus + payrollData.overtimePay)}
                            </span>
                            <span className="text-rose-600">
                              Tổng khấu trừ: -{formatCurrency(payrollData.insuranceDeduction + payrollData.taxDeduction + payrollData.latePenalty)}
                            </span>
                          </div>
                          {/* 2-color breakdown bar */}
                          <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden flex">
                            <div
                              className="bg-emerald-500 h-full transition-all duration-500"
                              style={{
                                width: `${Math.round(
                                  (payrollData.netSalary /
                                    Math.max(1, payrollData.baseSalary + payrollData.allowance + payrollData.bonus + payrollData.overtimePay)) *
                                    100
                                )}%`,
                              }}
                              title="Thực lĩnh (NET)"
                            />
                            <div
                              className="bg-rose-400 h-full flex-1 transition-all duration-500"
                              title="Các khoản khấu trừ"
                            />
                          </div>
                          <div className="flex justify-between text-[11px] text-slate-500">
                            <span>Tỷ lệ thực lĩnh: {Math.round((payrollData.netSalary / Math.max(1, payrollData.baseSalary + payrollData.allowance + payrollData.bonus + payrollData.overtimePay)) * 100)}%</span>
                            <span>Khấu trừ BHXH & Thuế: {100 - Math.round((payrollData.netSalary / Math.max(1, payrollData.baseSalary + payrollData.allowance + payrollData.bonus + payrollData.overtimePay)) * 100)}%</span>
                          </div>
                        </div>

                        {/* Net Salary Highlight Box */}
                        <div className="p-5 rounded-2xl bg-gradient-to-r from-indigo-700 to-indigo-600 text-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-lg shadow-indigo-600/20">
                          <div>
                            <span className="text-xs uppercase font-semibold text-indigo-200">
                              LƯƠNG THỰC LĨNH CHUYỂN KHOẢN (NET)
                            </span>
                            <div className="text-2xl sm:text-3xl font-black mt-0.5">
                              {formatCurrency(payrollData.netSalary)}
                            </div>
                          </div>

                          {currentEmployee.bankAccount && currentEmployee.bankAccount.accountNumber && (
                            <div className="text-xs sm:text-right bg-white/10 p-2.5 rounded-xl border border-white/10">
                              <span className="text-indigo-200 block text-[11px]">Tài khoản thụ hưởng:</span>
                              <span className="font-bold">{currentEmployee.bankAccount.bankName}</span>
                              <span className="font-mono block">
                                {currentEmployee.bankAccount.accountNumber}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 text-xs">
                        Chưa có dữ liệu bảng lương cho tháng {selectedMonth}/{selectedYear}.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* =========================================================================
                TAB CONTENT 3: TRA CỨU PHÉP TỒN (HIỂN THỊ CHUẨN 6 TRƯỜNG & NỔI BẬT SỐ NGÀY CÒN LẠI)
                ========================================================================= */}
            {category === 'leave' && (
              <div className="space-y-4">
                {resolvedLeaveData ? (
                  <div className="space-y-4">
                    {/* Bảng thông tin chuẩn 6 trường theo đúng thứ tự yêu cầu */}
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                      <div className="p-4 bg-gradient-to-r from-emerald-50 via-teal-50 to-indigo-50 border-b border-emerald-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                            Kết Quả Tra Cứu Phép Tồn Nhân Viên
                          </div>
                          <div className="text-lg font-black text-slate-800 mt-0.5">
                            {resolvedLeaveData.employeeName} ({resolvedLeaveData.employeeCode})
                          </div>
                          <div className="text-xs text-slate-500 font-medium">
                            Bộ phận: {resolvedLeaveData.department}
                          </div>
                        </div>
                        <div className="bg-white/90 backdrop-blur-xs px-4 py-2.5 rounded-xl border border-emerald-200 shadow-xs flex items-center gap-3">
                          <span className="text-xs font-bold text-slate-600 uppercase">Số ngày còn lại:</span>
                          <span className="text-2xl font-black text-emerald-700 bg-emerald-100/70 px-3 py-0.5 rounded-lg border border-emerald-300">
                            {resolvedLeaveData.remainingDays} ngày
                          </span>
                        </div>
                      </div>

                      {/* 6 Metric Cards */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-slate-200">
                        <div className="bg-white p-3.5 text-xs">
                          <span className="text-slate-400 block mb-1 font-semibold uppercase text-[10px]">1. Mã nhân viên</span>
                          <span className="text-base font-bold font-mono text-indigo-700">{resolvedLeaveData.employeeCode}</span>
                        </div>
                        <div className="bg-white p-3.5 text-xs">
                          <span className="text-slate-400 block mb-1 font-semibold uppercase text-[10px]">2. Tên</span>
                          <span className="text-base font-bold text-slate-800 line-clamp-1">{resolvedLeaveData.employeeName}</span>
                        </div>
                        <div className="bg-white p-3.5 text-xs">
                          <span className="text-slate-400 block mb-1 font-semibold uppercase text-[10px]">3. Bộ phận</span>
                          <span className="text-base font-bold text-slate-700 line-clamp-1">{resolvedLeaveData.department}</span>
                        </div>
                        <div className="bg-white p-3.5 text-xs">
                          <span className="text-slate-400 block mb-1 font-semibold uppercase text-[10px]">4. Phép tồn năm 2025</span>
                          <span className="text-xl font-black text-slate-800">{resolvedLeaveData.leaveBalance2025}</span>
                          <span className="text-[10px] text-slate-400 block">ngày</span>
                        </div>
                        <div className="bg-white p-3.5 text-xs">
                          <span className="text-indigo-600 block mb-1 font-semibold uppercase text-[10px]">5. Phép phát sinh 2026</span>
                          <span className="text-xl font-black text-indigo-800">{resolvedLeaveData.leaveGenerated2026}</span>
                          <span className="text-[10px] text-indigo-500 block">ngày</span>
                        </div>
                        <div className="bg-emerald-50/70 p-3.5 text-xs border-l-2 border-emerald-500">
                          <span className="text-emerald-700 block mb-1 font-black uppercase text-[10px]">6. Số ngày còn lại</span>
                          <span className="text-2xl font-black text-emerald-800">{resolvedLeaveData.remainingDays}</span>
                          <span className="text-[10px] text-emerald-700 block font-bold">ngày phép</span>
                        </div>
                      </div>

                      {/* Bảng chi tiết 6 trường rõ ràng */}
                      <div className="overflow-x-auto border-t border-slate-200">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                            <tr>
                              <th className="py-2.5 px-4 w-16 text-center">STT</th>
                              <th className="py-2.5 px-4">Tên trường</th>
                              <th className="py-2.5 px-4 text-right">Giá trị dữ liệu</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-medium">
                            <tr className="hover:bg-slate-50/60">
                              <td className="py-2.5 px-4 text-center font-bold text-slate-400">1</td>
                              <td className="py-2.5 px-4 text-slate-700 font-semibold">Mã nhân viên</td>
                              <td className="py-2.5 px-4 text-right font-mono font-bold text-indigo-700">{resolvedLeaveData.employeeCode}</td>
                            </tr>
                            <tr className="hover:bg-slate-50/60">
                              <td className="py-2.5 px-4 text-center font-bold text-slate-400">2</td>
                              <td className="py-2.5 px-4 text-slate-700 font-semibold">Tên</td>
                              <td className="py-2.5 px-4 text-right font-bold text-slate-900">{resolvedLeaveData.employeeName}</td>
                            </tr>
                            <tr className="hover:bg-slate-50/60">
                              <td className="py-2.5 px-4 text-center font-bold text-slate-400">3</td>
                              <td className="py-2.5 px-4 text-slate-700 font-semibold">Bộ phận</td>
                              <td className="py-2.5 px-4 text-right text-slate-700">{resolvedLeaveData.department}</td>
                            </tr>
                            <tr className="hover:bg-slate-50/60">
                              <td className="py-2.5 px-4 text-center font-bold text-slate-400">4</td>
                              <td className="py-2.5 px-4 text-slate-700 font-semibold">Phép tồn năm 2025</td>
                              <td className="py-2.5 px-4 text-right font-bold text-slate-800">{resolvedLeaveData.leaveBalance2025} ngày</td>
                            </tr>
                            <tr className="hover:bg-slate-50/60">
                              <td className="py-2.5 px-4 text-center font-bold text-slate-400">5</td>
                              <td className="py-2.5 px-4 text-slate-700 font-semibold">Phép phát sinh năm 2026</td>
                              <td className="py-2.5 px-4 text-right font-bold text-indigo-700">{resolvedLeaveData.leaveGenerated2026} ngày</td>
                            </tr>
                            <tr className="bg-emerald-50/80 font-bold hover:bg-emerald-50">
                              <td className="py-3 px-4 text-center text-emerald-700 font-black">6</td>
                              <td className="py-3 px-4 text-emerald-900 font-black text-sm">Số ngày còn lại</td>
                              <td className="py-3 px-4 text-right">
                                <span className="inline-block px-3 py-1 bg-emerald-600 text-white font-black text-base rounded-lg shadow-xs">
                                  {resolvedLeaveData.remainingDays} ngày
                                </span>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-rose-200 p-8 text-center text-rose-600 text-xs shadow-xs space-y-2">
                    <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
                    <div className="text-sm font-bold text-rose-700">
                      Không tìm thấy dữ liệu nhân viên
                    </div>
                    <p className="text-slate-500 text-xs max-w-md mx-auto">
                      Vui lòng kiểm tra lại mã nhân viên hoặc liên hệ bộ phận Hành chính Nhân sự để cập nhật số dư phép năm.
                    </p>
                  </div>
                )}

                {/* Danh sách đơn xin nghỉ */}
                <Card title={`Lịch Sử Đơn Xin Nghỉ Phép (${employeeLeaveRequests.length})`}>
                  {employeeLeaveRequests.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-xs">
                      Bạn chưa gửi đơn xin nghỉ phép nào trong hệ thống.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase">
                          <tr>
                            <th className="py-2.5 px-3">Mã Đơn</th>
                            <th className="py-2.5 px-3">Loại Nghỉ</th>
                            <th className="py-2.5 px-3">Thời Gian Nghỉ</th>
                            <th className="py-2.5 px-3 text-center">Số Ngày</th>
                            <th className="py-2.5 px-3">Lý Do</th>
                            <th className="py-2.5 px-3">Trạng Thái</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {employeeLeaveRequests.map((req) => (
                            <tr key={req.id} className="hover:bg-slate-50/80">
                              <td className="py-2.5 px-3 font-mono font-bold text-slate-700">{req.id}</td>
                              <td className="py-2.5 px-3 font-medium text-slate-800">
                                {req.leaveType === 'annual' && 'Nghỉ phép năm'}
                                {req.leaveType === 'sick' && 'Nghỉ ốm'}
                                {req.leaveType === 'unpaid' && 'Nghỉ không lương'}
                                {req.leaveType === 'maternity' && 'Nghỉ thai sản'}
                              </td>
                              <td className="py-2.5 px-3 text-slate-700">
                                {formatDate(req.startDate)}
                                {req.startDate !== req.endDate ? ` → ${formatDate(req.endDate)}` : ''}
                              </td>
                              <td className="py-2.5 px-3 text-center font-bold text-slate-800">
                                {req.daysCount} ngày
                              </td>
                              <td className="py-2.5 px-3 text-slate-600 italic">{req.reason}</td>
                              <td className="py-2.5 px-3">
                                <LeaveRequestBadge status={req.status} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              </div>
            )}
          </div>
        )}

        {/* PRINT-ONLY OFFICIAL HR SHEET */}
        {currentEmployee && (
          <div className="print-only">
            <div className="text-center pb-4 border-b-2 border-slate-900 mb-4">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-700">
                CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
              </p>
              <p className="text-xs font-semibold text-slate-600 mb-2">
                Độc lập – Tự do – Hạnh phúc
              </p>
              <h2 className="text-lg font-black uppercase text-slate-900 mt-2">
                BẢNG XÁC NHẬN CHẤM CÔNG VÀ KẾT QUẢ LÀM VIỆC
              </h2>
              <p className="text-xs font-bold text-slate-700">
                Kỳ tính công: Tháng {selectedMonth} năm {selectedYear}
              </p>
            </div>

            <table className="w-full text-xs border border-slate-400 mb-4">
              <tbody>
                <tr className="border-b border-slate-300">
                  <td className="py-1.5 px-2 font-bold w-1/4 bg-slate-100">Họ và tên:</td>
                  <td className="py-1.5 px-2 font-black text-slate-900 w-1/4">{currentEmployee.fullName}</td>
                  <td className="py-1.5 px-2 font-bold w-1/4 bg-slate-100">Mã nhân viên:</td>
                  <td className="py-1.5 px-2 font-mono font-bold w-1/4">{currentEmployee.id}</td>
                </tr>
                <tr className="border-b border-slate-300">
                  <td className="py-1.5 px-2 font-bold bg-slate-100">Phòng ban / Bộ phận:</td>
                  <td className="py-1.5 px-2">{currentEmployee.department}</td>
                  <td className="py-1.5 px-2 font-bold bg-slate-100">Trạng thái hợp đồng:</td>
                  <td className="py-1.5 px-2 font-bold">{currentEmployee.status === 'probation' ? 'Thử việc' : 'Chính thức'}</td>
                </tr>
                <tr className="border-b border-slate-300">
                  <td className="py-1.5 px-2 font-bold bg-slate-100">Ngày vào làm việc:</td>
                  <td className="py-1.5 px-2">{formatDate(currentEmployee.startDate)}</td>
                  <td className="py-1.5 px-2 font-bold bg-slate-100">Kỳ tính công:</td>
                  <td className="py-1.5 px-2 font-bold">Tháng {selectedMonth}/{selectedYear}</td>
                </tr>
              </tbody>
            </table>

            <table className="w-full text-xs border border-slate-400 mb-4 text-center">
              <thead className="bg-slate-100 font-bold border-b border-slate-400">
                <tr>
                  <th className="py-1 px-2 border-r border-slate-300">Công chuẩn</th>
                  <th className="py-1 px-2 border-r border-slate-300">Công thực tế</th>
                  <th className="py-1 px-2 border-r border-slate-300">Tổng giờ làm</th>
                  <th className="py-1 px-2 border-r border-slate-300">Đúng giờ</th>
                  <th className="py-1 px-2 border-r border-slate-300">Đi muộn</th>
                  <th className="py-1 px-2 border-r border-slate-300">Nghỉ phép</th>
                  <th className="py-1 px-2">Tăng ca (OT)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="py-1.5 px-2 border-r border-slate-300 font-bold">{calculatedSummary.standardWorkDays} ngày</td>
                  <td className="py-1.5 px-2 border-r border-slate-300 font-black">{calculatedSummary.actualWorkDays} ngày</td>
                  <td className="py-1.5 px-2 border-r border-slate-300 font-bold">{calculatedSummary.totalWorkHours}h</td>
                  <td className="py-1.5 px-2 border-r border-slate-300">{calculatedSummary.onTimeDays} ngày</td>
                  <td className="py-1.5 px-2 border-r border-slate-300">{calculatedSummary.lateDays} buổi</td>
                  <td className="py-1.5 px-2 border-r border-slate-300">{calculatedSummary.paidLeaveDays} ngày</td>
                  <td className="py-1.5 px-2 font-bold">{calculatedSummary.overtimeHours}h</td>
                </tr>
              </tbody>
            </table>

            {/* Bảng chấm công chi tiết theo ngày (6 cột theo mẫu.xlsx) */}
            <h4 className="text-xs font-black uppercase mb-1">BẢNG CHẤM CÔNG CHI TIẾT THEO NGÀY (THÁNG {selectedMonth}/{selectedYear})</h4>
            <table className="w-full text-xs border border-slate-400 mb-4 text-center">
              <thead className="bg-slate-100 font-bold border-b border-slate-400">
                <tr>
                  <th className="py-1 px-2 border-r border-slate-300 w-12">Ngày</th>
                  <th className="py-1 px-2 border-r border-slate-300 w-16">Thứ</th>
                  <th className="py-1 px-2 border-r border-slate-300">Bắt đầu</th>
                  <th className="py-1 px-2 border-r border-slate-300">Kết thúc</th>
                  <th className="py-1 px-2 border-r border-slate-300">Thời gian làm việc</th>
                  <th className="py-1 px-2">Nghỉ làm</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-300 font-mono">
                {fullMonthDays.map((d) => (
                  <tr key={d.dateStr}>
                    <td className="py-0.5 px-1 border-r border-slate-300 font-bold">{d.day}</td>
                    <td className="py-0.5 px-1 border-r border-slate-300 font-sans font-semibold">{d.dayShort}</td>
                    <td className="py-0.5 px-1 border-r border-slate-300">{d.start}</td>
                    <td className="py-0.5 px-1 border-r border-slate-300">{d.stop}</td>
                    <td className="py-0.5 px-1 border-r border-slate-300 font-bold">
                      {d.workHoursDisplay !== '-' ? `${d.workHoursDisplay}h` : '-'}
                      {d.otHours > 0 ? ` (+${d.otHours}h OT)` : ''}
                    </td>
                    <td className="py-0.5 px-1 font-bold">{d.leaveDisplay}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Bảng tổng hợp công tăng ca và phụ cấp (Nhóm 2) */}
            <h4 className="text-xs font-black uppercase mb-1">NHÓM 2 – CÁC LOẠI CÔNG TĂNG CA VÀ PHỤ CẤP</h4>
            <table className="w-full text-xs border border-slate-400 mb-6 text-center">
              <thead className="bg-slate-100 font-bold border-b border-slate-400">
                <tr>
                  <th className="py-1 px-2 border-r border-slate-300 w-12">STT</th>
                  <th className="py-1 px-2 border-r border-slate-300 text-left">Nội dung chỉ tiêu</th>
                  <th className="py-1 px-2 border-r border-slate-300">Tỷ lệ quy đổi</th>
                  <th className="py-1 px-2 border-r border-slate-300">Tổng cộng</th>
                  <th className="py-1 px-2 border-r border-slate-300">Đơn vị</th>
                  <th className="py-1 px-2 text-left">Chi tiết phát sinh</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-300">
                {overtimeIndicatorsList.map((ind: any, i: number) => (
                  <tr key={i}>
                    <td className="py-0.5 px-1 border-r border-slate-300 font-mono">{i + 5}</td>
                    <td className="py-0.5 px-2 border-r border-slate-300 text-left font-semibold">{ind.name}</td>
                    <td className="py-0.5 px-1 border-r border-slate-300 font-mono">{ind.rate || '-'}</td>
                    <td className="py-0.5 px-1 border-r border-slate-300 font-mono font-bold">{ind.total > 0 ? ind.total : '-'}</td>
                    <td className="py-0.5 px-1 border-r border-slate-300">{ind.unit || 'giờ'}</td>
                    <td className="py-0.5 px-2 text-left italic text-[11px]">{ind.dates || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="avoid-break mt-8 pt-4">
              <div className="text-right text-xs italic mb-4">
                Ngày ...... tháng ...... năm 20......
              </div>
              <div className="grid grid-cols-3 gap-4 text-center text-xs">
                <div>
                  <p className="font-bold uppercase">NGƯỜI LAO ĐỘNG</p>
                  <p className="italic text-slate-500 text-[11px]">(Ký và ghi rõ họ tên)</p>
                  <div className="h-16"></div>
                  <p className="font-bold">{currentEmployee.fullName}</p>
                </div>
                <div>
                  <p className="font-bold uppercase">PHỤ TRÁCH BỘ PHẬN</p>
                  <p className="italic text-slate-500 text-[11px]">(Ký và ghi rõ họ tên)</p>
                  <div className="h-16"></div>
                </div>
                <div>
                  <p className="font-bold uppercase">PHÒNG NHÂN SỰ</p>
                  <p className="italic text-slate-500 text-[11px]">(Ký và đóng dấu)</p>
                  <div className="h-16"></div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="no-print mt-auto py-6 border-t border-slate-200 text-center text-xs text-slate-500 bg-white shadow-inner">
        HỆ THỐNG TRA CỨU NHÂN SỰ COASIA OPTICS &bull; Phiên bản 2026
      </footer>
    </div>
  );
};
