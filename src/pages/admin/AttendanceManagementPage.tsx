import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CalendarCheck,
  Calendar,
  Filter,
  Search,
  Edit,
  Upload,
  FileSpreadsheet,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Eye,
  User,
  Building,
  ChevronLeft,
  ChevronRight,
  Layers,
  ArrowUpDown,
  Trash2,
  ChevronDown,
  CheckSquare,
  Square,
  UploadCloud,
  X,
  FileCheck2,
  Sparkles,
  Lock,
  Unlock,
  RefreshCw,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { attendanceService } from '../../services/attendanceService';
import {
  AttendanceRecord,
  AttendanceStatus,
  Department,
  Employee,
  EmployeeStatus,
  ParsedAttendanceRow,
  EmployeeSyncRecord,
  EmployeeAttendanceMatrix,
  ImportConflictMode,
} from '../../types';
import { Card } from '../../components/common/Card';
import { Modal } from '../../components/common/Modal';
import { AttendanceMatrixTable } from '../../components/attendance/AttendanceMatrixTable';
import {
  readExcelWorkbook,
  extractSheetRows,
  detectHeaderRowIndex,
  getHeadersFromRow,
  detectColumnMapping,
  parseAndValidateRows,
  exportStandardTemplateExcel,
  exportCompact1RowTemplateExcel,
  buildMatrixFromAttendanceDaily,
  isDateInPeriod,
  isDateInYear,
} from '../../utils/excelParser';

export const AttendanceManagementPage: React.FC = () => {
  const { currentUser } = useAuth();
  const {
    employees,
    attendanceRecords,
    payrollRecords,
    importedMatrices,
    isLoadingFromDatabase,
    updateEmployee,
    deleteEmployees,
    deleteAttendanceByEmployeeMonth,
    deleteAttendanceByPeriod,
    deleteAttendanceByYear,
    importAttendanceData,
    getAttendanceMatrix,
    getEmployeeById,
    getPayrollByEmployee,
  } = useData();
  const [searchParams, setSearchParams] = useSearchParams();

  // State hỗ trợ tải chi tiết theo nhu cầu cho từng nhân viên khi bấm [Chi tiết]
  const [employeeSpecificDaily, setEmployeeSpecificDaily] = useState<AttendanceRecord[]>([]);

  // Chế độ xem: 'monthly_employees' (Danh sách tổng hợp kỳ tháng) hoặc 'matrix' (Bảng ma trận 9 chỉ tiêu chuẩn file mẫu)
  const [viewMode, setViewMode] = useState<'monthly_employees' | 'matrix'>('monthly_employees');
  const [selectedMatrixEmpId, setSelectedMatrixEmpId] = useState<string>('');

  // Filters kỳ công: Tự động đồng bộ với kỳ có dữ liệu gần nhất trong hệ thống
  const paramMonth = searchParams.get('month');
  const paramYear = searchParams.get('year');
  const [selectedMonth, setSelectedMonth] = useState<number>(() => {
    if (paramMonth) return parseInt(paramMonth, 10);
    try {
      const saved = localStorage.getItem('hr_last_imported_period');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.month) return Number(parsed.month);
      }
    } catch {}
    return 10;
  });
  const [selectedYear, setSelectedYear] = useState<number>(() => {
    if (paramYear) return parseInt(paramYear, 10);
    try {
      const saved = localStorage.getItem('hr_last_imported_period');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.year) return Number(parsed.year);
      }
    } catch {}
    return 2026;
  });

  // Tự động nhận diện kỳ có dữ liệu từ importedMatrices hoặc attendanceRecords nếu chưa có trong URL
  useEffect(() => {
    if (!paramMonth) {
      try {
        const saved = localStorage.getItem('hr_last_imported_period');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.month && Number(parsed.month) !== selectedMonth) {
            setSelectedMonth(Number(parsed.month));
          }
          if (parsed.year && Number(parsed.year) !== selectedYear) {
            setSelectedYear(Number(parsed.year));
          }
          return;
        }
      } catch {}

      const matricesList = Object.values(importedMatrices);
      if (matricesList.length > 0) {
        const first = matricesList[0];
        if (first.month && Number(first.month) !== selectedMonth) {
          setSelectedMonth(Number(first.month));
        }
        if (first.year && Number(first.year) !== selectedYear) {
          setSelectedYear(Number(first.year));
        }
        return;
      }

      if (payrollRecords.length > 0) {
        const first = payrollRecords[0];
        if (first.month && Number(first.month) !== selectedMonth) {
          setSelectedMonth(Number(first.month));
        }
        if (first.year && Number(first.year) !== selectedYear) {
          setSelectedYear(Number(first.year));
        }
        return;
      }

      if (attendanceRecords.length > 0) {
        for (const r of attendanceRecords) {
          if (r.date) {
            const parts = r.date.split('-');
            if (parts.length >= 2) {
              const m = parseInt(parts[1], 10);
              const y = parseInt(parts[0], 10);
              if (m && y) {
                if (m !== selectedMonth) setSelectedMonth(m);
                if (y !== selectedYear) setSelectedYear(y);
                return;
              }
            }
          }
        }
      }
    }
  }, [importedMatrices, attendanceRecords, payrollRecords, paramMonth]);

  // Filters nhật ký ngày
  const [selectedDate, setSelectedDate] = useState('2026-11-04');
  const [selectedDept, setSelectedDept] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Phân trang
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Lựa chọn bản ghi để xóa (Checkboxes)
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(new Set());
  const [singleEmployeeToDelete, setSingleEmployeeToDelete] = useState<Employee | null>(null);

  // Modal xác nhận xóa dữ liệu
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState<
    'single_employee' | 'selected_employees' | 'month' | 'year' | 'period'
  >('selected_employees');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteSuccessMessage, setDeleteSuccessMessage] = useState<string>('');

  // Dropdown Xóa Dữ Liệu gọn gàng
  const [isDeleteDropdownOpen, setIsDeleteDropdownOpen] = useState(false);
  const deleteDropdownRef = useRef<HTMLDivElement>(null);
  const [isTopDeleteDropdownOpen, setIsTopDeleteDropdownOpen] = useState(false);
  const topDeleteDropdownRef = useRef<HTMLDivElement>(null);

  const [deleteTargetMonth, setDeleteTargetMonth] = useState<number>(selectedMonth);
  const [deleteTargetYear, setDeleteTargetYear] = useState<number>(selectedYear);

  useEffect(() => {
    setDeleteTargetMonth(selectedMonth);
    setDeleteTargetYear(selectedYear);
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (deleteDropdownRef.current && !deleteDropdownRef.current.contains(e.target as Node)) {
        setIsDeleteDropdownOpen(false);
      }
      if (topDeleteDropdownRef.current && !topDeleteDropdownRef.current.contains(e.target as Node)) {
        setIsTopDeleteDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Modals xem chi tiết bảng công
  const [detailEmployee, setDetailEmployee] = useState<Employee | null>(null);

  // Modal Sửa thông tin nhân viên
  const [employeeToEdit, setEmployeeToEdit] = useState<Employee | null>(null);
  const [isEditEmployeeModalOpen, setIsEditEmployeeModalOpen] = useState(false);
  const [isSavingEmployee, setIsSavingEmployee] = useState(false);
  const [editEmployeeForm, setEditEmployeeForm] = useState({
    fullName: '',
    department: '',
    position: '',
    startDate: '',
    status: 'active' as EmployeeStatus,
    phone: '',
    email: '',
  });

  // Helper tính ngày công từ ma trận chuẩn xác và toàn diện
  const countValidDaysInMatrix = (mat: EmployeeAttendanceMatrix): number => {
    if (mat.summary?.totalWorkDays > 0) {
      return mat.summary.totalWorkDays;
    }
    if (!mat.rows || mat.rows.length === 0) return 0;

    const activeDays = new Set<number>();

    // 1. Quét các dòng giờ làm / ngày công
    const workRows = mat.rows.filter(
      (r) =>
        /thời\s*gian\s*làm\s*việc|giờ\s*làm|work\s*hours|^công$|^ngày\s*công$|^giờ\s*công$|công\s*thực\s*tế|làm\s*việc|số\s*giờ/i.test(
          r.indicatorName
        ) || (r.dataType === 'hours' && !/tăng\s*ca|ot|150%|200%|210%|270%|ca\s*đêm/i.test(r.indicatorName))
    );
    workRows.forEach((r) => {
      if (r.values) {
        Object.entries(r.values).forEach(([d, val]) => {
          if (val === undefined || val === null || val === '' || val === '-') return;
          const num = typeof val === 'number' ? val : parseFloat(String(val).replace(',', '.'));
          if (!isNaN(num) && num > 0) {
            activeDays.add(Number(d));
          } else if (String(val).trim().toLowerCase() === 'x' || String(val).trim() === '+') {
            activeDays.add(Number(d));
          }
        });
      }
    });

    // 2. Quét các dòng check-in / check-out (bắt đầu, kết thúc, vào, ra, start, stop)
    const timeRows = mat.rows.filter((r) =>
      /bắt\s*đầu|^start$|kết\s*thúc|^stop$|giờ\s*vào|vào|giờ\s*ra|ra|check.*in|check.*out|time\s*in|time\s*out/i.test(
        r.indicatorName
      )
    );
    timeRows.forEach((r) => {
      if (r.values) {
        Object.entries(r.values).forEach(([d, val]) => {
          if (!val) return;
          const str = String(val).trim();
          if (str && str !== '-' && str !== '0') {
            activeDays.add(Number(d));
          }
        });
      }
    });

    // 3. Quét các dòng tăng ca làm thêm (nếu có OT thì ngày đó chắc chắn có đi làm)
    const otRows = mat.rows.filter((r) =>
      /150%|200%|210%|270%|tăng\s*ca|ot|chủ\s*nhật/i.test(r.indicatorName)
    );
    otRows.forEach((r) => {
      if (r.values) {
        Object.entries(r.values).forEach(([d, val]) => {
          if (val === undefined || val === null || val === '' || val === '-') return;
          const num = typeof val === 'number' ? val : parseFloat(String(val).replace(',', '.'));
          if (!isNaN(num) && num > 0) {
            activeDays.add(Number(d));
          }
        });
      }
    });

    if (activeDays.size > 0) {
      return activeDays.size;
    }

    if (mat.summary?.totalWorkHours && mat.summary.totalWorkHours > 0) {
      return Math.max(1, Math.round(mat.summary.totalWorkHours / 8));
    }

    return 0;
  };

  // Modal NẠP EXCEL CHẤM CÔNG (Bắt buộc chọn tháng/năm trước)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importMonth, setImportMonth] = useState<number>(selectedMonth);
  const [importYear, setImportYear] = useState<number>(selectedYear);
  const [isPeriodLocked, setIsPeriodLocked] = useState<boolean>(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseResult, setParseResult] = useState<{
    attendanceRows: ParsedAttendanceRow[];
    employeesSyncList: EmployeeSyncRecord[];
    matrices: EmployeeAttendanceMatrix[];
    isMatrix: boolean;
  } | null>(null);
  const [previewEmpId, setPreviewEmpId] = useState<string>('');
  const [conflictMode, setConflictMode] = useState<ImportConflictMode>('upsert');
  const [isSubmittingImport, setIsSubmittingImport] = useState(false);
  const [importSuccessAlert, setImportSuccessAlert] = useState<string>('');
  const [fileValidationError, setFileValidationError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cập nhật URL search params nếu có
  useEffect(() => {
    if (paramMonth) setSelectedMonth(parseInt(paramMonth, 10));
    if (paramYear) setSelectedYear(parseInt(paramYear, 10));
  }, [paramMonth, paramYear]);

  // Đồng bộ kỳ nạp khi mở modal
  useEffect(() => {
    if (isImportModalOpen) {
      setImportMonth(selectedMonth);
      setImportYear(selectedYear);
      setIsPeriodLocked(false);
      setImportFile(null);
      setParseResult(null);
      setFileValidationError('');
    }
  }, [isImportModalOpen, selectedMonth, selectedYear]);

  // Danh sách chấm công trong tháng/năm đã chọn (Hỗ trợ đa định dạng ngày YYYY-MM-DD và DD/MM/YYYY)
  const monthRecords = useMemo(() => {
    const isoPrefix = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
    const isoAltPrefix = `${selectedYear}-${selectedMonth}-`;
    const slashSuffix = `/${String(selectedMonth).padStart(2, '0')}/${selectedYear}`;
    const slashAltSuffix = `/${selectedMonth}/${selectedYear}`;

    return attendanceRecords.filter((r) => {
      if (!r.date) return false;
      const d = r.date.trim();
      return (
        d.startsWith(isoPrefix) ||
        d.startsWith(isoAltPrefix) ||
        d.endsWith(slashSuffix) ||
        d.endsWith(slashAltSuffix) ||
        isDateInPeriod(d, selectedMonth, selectedYear)
      );
    });
  }, [attendanceRecords, selectedMonth, selectedYear]);

  // Danh sách nhân viên có dữ liệu trong danh mục quản lý công kỳ đã chọn
  const periodEmployees = useMemo(() => {
    const idsWithData = new Set<string>();

    // 1. Quét từ bản ghi chi tiết ngày của kỳ đã chọn
    monthRecords.forEach((r) => {
      if (r.employeeId) idsWithData.add(r.employeeId.trim().toUpperCase());
    });

    // 2. Quét từ ma trận công đã nạp của kỳ đã chọn
    Object.entries(importedMatrices).forEach(([key, mat]) => {
      if (mat && Number(mat.month) === Number(selectedMonth) && Number(mat.year) === Number(selectedYear)) {
        if (mat.employeeId) idsWithData.add(mat.employeeId.trim().toUpperCase());
      } else if (key) {
        const parts = key.split('_');
        if (parts.length >= 3) {
          const kYear = Number(parts[parts.length - 1]);
          const kMonth = Number(parts[parts.length - 2]);
          const kEmp = parts.slice(0, parts.length - 2).join('_');
          if (kMonth === Number(selectedMonth) && kYear === Number(selectedYear)) {
            idsWithData.add(kEmp.trim().toUpperCase());
          }
        }
      }
    });

    // 2b. Quét từ bảng lương / tổng hợp công kỳ đã chọn (attendance_summaries)
    payrollRecords.forEach((p) => {
      if (Number(p.month) === Number(selectedMonth) && Number(p.year) === Number(selectedYear)) {
        if (p.employeeId) idsWithData.add(p.employeeId.trim().toUpperCase());
      }
    });

    // 3. Quét từ danh mục hồ sơ nhân viên trong hệ thống (chỉ giữ lại nhân viên CÓ dữ liệu công trong kỳ)
    employees.forEach((emp) => {
      if (emp && emp.id) {
        const cleanId = emp.id.trim().toUpperCase();
        const hasRecordsInMonth = monthRecords.some((r) => r.employeeId.trim().toUpperCase() === cleanId);
        const hasMatrixInMonth = Object.entries(importedMatrices).some(([key, mat]) => {
          if (!mat) return false;
          if (mat.employeeId.trim().toUpperCase() !== cleanId) return false;
          return Number(mat.month) === Number(selectedMonth) && Number(mat.year) === Number(selectedYear);
        });
        if (hasRecordsInMonth || hasMatrixInMonth) {
          idsWithData.add(cleanId);
        }
      }
    });

    if (idsWithData.size === 0) {
      return [];
    }

    const resultEmps: Employee[] = [];
    const addedIds = new Set<string>();

    idsWithData.forEach((cleanId) => {
      if (addedIds.has(cleanId)) return;

      // 1. Tìm trong employees state
      let emp = employees.find((e) => e.id.trim().toUpperCase() === cleanId);

      // 2. Tìm qua getEmployeeById
      if (!emp) {
        emp = getEmployeeById(cleanId);
      }

      // 3. Lấy từ importedMatrices của đúng kỳ này
      if (!emp) {
        const mat = Object.values(importedMatrices).find(
          (m) =>
            m.employeeId.trim().toUpperCase() === cleanId &&
            Number(m.month) === Number(selectedMonth) &&
            Number(m.year) === Number(selectedYear)
        );
        if (mat) {
          emp = {
            id: mat.employeeId.trim().toUpperCase(),
            fullName: mat.fullName || cleanId,
            email: `${cleanId.toLowerCase().replace(/[^a-z0-9]/g, '')}@congtyviet.com`,
            phone: '',
            department: (mat.department as any) || 'Phòng Kỹ thuật',
            position: 'Nhân viên',
            startDate: mat.startDate || `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`,
            status: 'active',
            baseSalary: 12000000,
            allowance: 1500000,
          };
        }
      }

      // 4. Nếu vẫn chưa có, tạo profile tạm từ ID
      if (!emp) {
        emp = {
          id: cleanId,
          fullName: `Nhân viên ${cleanId}`,
          email: `${cleanId.toLowerCase().replace(/[^a-z0-9]/g, '')}@congtyviet.com`,
          phone: '',
          department: 'Phòng Kỹ thuật',
          position: 'Nhân viên',
          startDate: `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`,
          status: 'active',
          baseSalary: 12000000,
          allowance: 1500000,
        };
      }

      resultEmps.push(emp);
      addedIds.add(cleanId);
    });

    return resultEmps;
  }, [employees, monthRecords, importedMatrices, payrollRecords, selectedMonth, selectedYear, getEmployeeById]);

  // Thống kê theo nhân viên trong tháng/năm (Đúng danh mục quản lý công của kỳ này)
  const employeeStats = useMemo(() => {
    return periodEmployees
      .filter((emp) => {
        const matchDept = selectedDept === 'all' || emp.department === selectedDept;
        const matchSearch =
          emp.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          emp.id.toLowerCase().includes(searchTerm.toLowerCase());
        return matchDept && matchSearch;
      })
      .map((emp) => {
        const cleanEmpId = emp.id.trim().toUpperCase();
        const empRecords = monthRecords.filter((r) => r.employeeId.trim().toUpperCase() === cleanEmpId);
        let mat = getAttendanceMatrix(emp.id, selectedMonth, selectedYear);

        let isUsingFallbackMatrix = false;

        // 1. Tính số ngày có mặt từ bản ghi chi tiết ngày (nếu có)
        let actualDays = 0;
        if (empRecords.length > 0) {
          actualDays = empRecords.filter(
            (r) =>
              (Number(r.workHours) || 0) > 0 ||
              Boolean(r.checkIn && r.checkIn !== '-' && r.checkIn !== '0') ||
              (r.status && r.status !== 'weekend' && r.status !== 'leave_unapproved')
          ).length;
        }

        // 2. Nếu actualDays = 0 hoặc empRecords không có, ưu tiên trích xuất từ ma trận công của kỳ này
        if (actualDays === 0 && mat) {
          actualDays = mat.summary?.totalWorkDays > 0 ? mat.summary.totalWorkDays : 0;
          if (actualDays === 0) {
            actualDays = countValidDaysInMatrix(mat);
          }
        }

        // 2b. Nếu vẫn bằng 0, trích xuất từ bảng tổng hợp công / lương kỳ này (attendance_summaries)
        if (actualDays === 0) {
          const payroll = getPayrollByEmployee(emp.id, selectedMonth, selectedYear);
          if (payroll && payroll.actualWorkDays > 0) {
            actualDays = payroll.actualWorkDays;
          }
        }

        // 3. Tính tổng giờ làm chính xác
        let totalWorkHours = empRecords.reduce((acc, r) => acc + (Number(r.workHours) || 0), 0);
        if (totalWorkHours === 0 && mat?.summary?.totalWorkHours && mat.summary.totalWorkHours > 0) {
          totalWorkHours = mat.summary.totalWorkHours;
        }
        if (totalWorkHours === 0 && mat?.rows) {
          const workRow = mat.rows.find((r) =>
            /thời\s*gian\s*làm\s*việc|giờ\s*làm|^công$|^ngày\s*công$/i.test(r.indicatorName)
          );
          if (workRow?.total && typeof workRow.total === 'number' && workRow.total > 0) {
            totalWorkHours = workRow.total;
          }
        }
        if (totalWorkHours === 0 && actualDays > 0) {
          totalWorkHours = actualDays * 8;
        }

        // 4. Nếu kỳ đang chọn chưa có công (0 ngày, 0h), tự động tìm kiếm ma trận gần nhất có công trong hệ thống
        if (actualDays === 0 && totalWorkHours === 0) {
          const fallbackMat = getAttendanceMatrix(emp.id);
          if (fallbackMat) {
            const fbDays =
              fallbackMat.summary?.totalWorkDays > 0
                ? fallbackMat.summary.totalWorkDays
                : countValidDaysInMatrix(fallbackMat);
            const fbHours =
              fallbackMat.summary?.totalWorkHours > 0
                ? fallbackMat.summary.totalWorkHours
                : fbDays > 0
                ? fbDays * 8
                : 0;

            if (fbDays > 0 || fbHours > 0) {
              mat = fallbackMat;
              actualDays = fbDays;
              totalWorkHours = fbHours;
              isUsingFallbackMatrix = true;
            }
          }
        }

        // 5. Nếu vẫn bằng 0, quét tìm trong toàn bộ bản ghi attendanceRecords kỳ khác
        if (actualDays === 0 && totalWorkHours === 0) {
          const anyEmpRecords = attendanceRecords.filter(
            (r) => r.employeeId.trim().toUpperCase() === cleanEmpId
          );
          if (anyEmpRecords.length > 0) {
            const validDays = anyEmpRecords.filter(
              (r) =>
                (Number(r.workHours) || 0) > 0 ||
                Boolean(r.checkIn && r.checkIn !== '-' && r.checkIn !== '0') ||
                (r.status && r.status !== 'weekend' && r.status !== 'leave_unapproved')
            ).length;
            if (validDays > 0) {
              actualDays = validDays;
              totalWorkHours = anyEmpRecords.reduce((acc, r) => acc + (Number(r.workHours) || 0), 0);
              if (totalWorkHours === 0) totalWorkHours = validDays * 8;
              isUsingFallbackMatrix = true;
              if (!mat) {
                const firstRec = anyEmpRecords[0];
                const p = firstRec.date ? firstRec.date.split('-') : [];
                const m = p.length >= 2 ? parseInt(p[1], 10) : selectedMonth;
                const y = p.length >= 1 ? parseInt(p[0], 10) : selectedYear;
                mat = buildMatrixFromAttendanceDaily(emp, anyEmpRecords, m, y);
              }
            }
          }
        }

        const lateCount = empRecords.filter((r) => r.status === 'late').length;
        const totalLateMinutes = empRecords.reduce((acc, r) => acc + (Number(r.lateMinutes) || 0), 0);

        return {
          employee: emp,
          actualDays,
          lateCount,
          totalWorkHours,
          totalLateMinutes,
          recordsCount: empRecords.length > 0 ? empRecords.length : (mat ? mat.daysInMonth : 0),
          isUsingFallbackMatrix,
          matMonth: mat ? mat.month : selectedMonth,
          matYear: mat ? mat.year : selectedYear,
        };
      });
  }, [periodEmployees, monthRecords, selectedDept, searchTerm, selectedMonth, selectedYear, getAttendanceMatrix, attendanceRecords]);

  // Phân trang danh sách nhân viên an toàn
  const totalEmployeePages = Math.max(1, Math.ceil(employeeStats.length / pageSize));
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalEmployeePages);
  const paginatedEmployeeStats = useMemo(() => {
    const start = (validCurrentPage - 1) * pageSize;
    return employeeStats.slice(start, start + pageSize);
  }, [employeeStats, validCurrentPage, pageSize]);

  // Danh sách phòng ban linh hoạt từ dữ liệu thực tế
  const availableDepartments = useMemo(() => {
    const deptSet = new Set<string>();
    periodEmployees.forEach((e) => {
      if (e.department) deptSet.add(e.department);
    });
    employees.forEach((e) => {
      if (e.department) deptSet.add(e.department);
    });
    ['Phòng Kỹ thuật', 'Phòng Kinh doanh', 'Phòng Nhân sự', 'Phòng Kế toán', 'Phòng Marketing'].forEach((d) =>
      deptSet.add(d)
    );
    return Array.from(deptSet);
  }, [periodEmployees, employees]);

  // Tải chi tiết bản ghi ngày từ Supabase khi mở modal nếu chưa có trong bộ nhớ
  useEffect(() => {
    setEmployeeSpecificDaily([]);
    if (!detailEmployee) return;
    const cleanId = detailEmployee.id.trim().toUpperCase();
    const hasMonthRecords = monthRecords.some((r) => r.employeeId.trim().toUpperCase() === cleanId);
    if (!hasMonthRecords) {
      attendanceService
        .getAttendanceByEmployeeMonth(cleanId, selectedMonth, selectedYear)
        .then((fetched) => {
          if (fetched && fetched.length > 0) {
            setEmployeeSpecificDaily(fetched);
          }
        })
        .catch(() => {});
    }
  }, [detailEmployee, selectedMonth, selectedYear, monthRecords]);

  // Ma trận chi tiết công của một nhân viên đang mở modal
  const detailEmployeeMatrix = useMemo(() => {
    if (!detailEmployee) return null;
    let cached = getAttendanceMatrix(detailEmployee.id, selectedMonth, selectedYear);
    if (cached) return cached;

    const empAtt = monthRecords.filter(
      (r) => r.employeeId.trim().toUpperCase() === detailEmployee.id.trim().toUpperCase()
    );
    const effectiveRecords = empAtt.length > 0 ? empAtt : employeeSpecificDaily;
    if (effectiveRecords.length > 0) {
      return buildMatrixFromAttendanceDaily(detailEmployee, effectiveRecords, selectedMonth, selectedYear);
    }

    // Nếu có tổng hợp công trong bảng lương/tổng hợp kỳ này, dựng ma trận trực quan đầy đủ
    const empPayroll = getPayrollByEmployee(detailEmployee.id, selectedMonth, selectedYear);
    if (empPayroll && empPayroll.actualWorkDays > 0) {
      const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
      const syntheticRecords: AttendanceRecord[] = [];
      let daysCount = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const dow = new Date(selectedYear, selectedMonth - 1, d).getDay();
        const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const isWeekend = dow === 0 || dow === 6;
        if (!isWeekend && daysCount < empPayroll.actualWorkDays) {
          syntheticRecords.push({
            id: `SYN-${detailEmployee.id}-${dateStr}`,
            employeeId: detailEmployee.id,
            date: dateStr,
            checkIn: '08:00',
            checkOut: '17:30',
            workHours: 8,
            overtimeHours: 0,
            lateMinutes: 0,
            earlyMinutes: 0,
            status: 'on_time',
          });
          daysCount++;
        }
      }
      if (syntheticRecords.length > 0) {
        return buildMatrixFromAttendanceDaily(detailEmployee, syntheticRecords, selectedMonth, selectedYear);
      }
    }

    // FALLBACK AN TOÀN: Lấy ma trận đã nạp gần nhất của nhân viên này
    cached = getAttendanceMatrix(detailEmployee.id);
    if (cached) return cached;

    const allEmpAtt = attendanceRecords.filter(
      (r) => r.employeeId.trim().toUpperCase() === detailEmployee.id.trim().toUpperCase()
    );
    if (allEmpAtt.length > 0) {
      const rec = allEmpAtt[0];
      const p = rec.date ? rec.date.split('-') : [];
      const m = p.length >= 2 ? parseInt(p[1], 10) : selectedMonth;
      const y = p.length >= 1 ? parseInt(p[0], 10) : selectedYear;
      return buildMatrixFromAttendanceDaily(detailEmployee, allEmpAtt, m, y);
    }

    return null;
  }, [detailEmployee, monthRecords, employeeSpecificDaily, selectedMonth, selectedYear, getAttendanceMatrix, attendanceRecords, getPayrollByEmployee]);

  const activeMatrixEmployee = useMemo(() => {
    if (selectedMatrixEmpId) {
      const found = periodEmployees.find(
        (e) => e.id.trim().toUpperCase() === selectedMatrixEmpId.trim().toUpperCase()
      );
      if (found) return found;
    }
    return periodEmployees[0] || null;
  }, [periodEmployees, selectedMatrixEmpId]);

  const activeEmployeeMatrix = useMemo(() => {
    if (!activeMatrixEmployee) return null;
    let cached = getAttendanceMatrix(activeMatrixEmployee.id, selectedMonth, selectedYear);
    if (cached) return cached;

    const empAtt = monthRecords.filter(
      (r) => r.employeeId.trim().toUpperCase() === activeMatrixEmployee.id.trim().toUpperCase()
    );
    if (empAtt.length > 0) {
      return buildMatrixFromAttendanceDaily(activeMatrixEmployee, empAtt, selectedMonth, selectedYear);
    }

    cached = getAttendanceMatrix(activeMatrixEmployee.id);
    if (cached) return cached;

    return null;
  }, [activeMatrixEmployee, selectedMonth, selectedYear, getAttendanceMatrix, monthRecords]);

  // Xử lý Checkbox Chọn nhân viên (Monthly)
  const isAllPageEmployeesSelected =
    paginatedEmployeeStats.length > 0 &&
    paginatedEmployeeStats.every((item) => selectedEmployeeIds.has(item.employee.id));

  const handleToggleSelectAllEmployees = () => {
    setSelectedEmployeeIds((prev) => {
      const next = new Set(prev);
      if (isAllPageEmployeesSelected) {
        paginatedEmployeeStats.forEach((item) => next.delete(item.employee.id));
      } else {
        paginatedEmployeeStats.forEach((item) => next.add(item.employee.id));
      }
      return next;
    });
  };

  const handleToggleEmployee = (empId: string) => {
    setSelectedEmployeeIds((prev) => {
      const next = new Set(prev);
      if (next.has(empId)) next.delete(empId);
      else next.add(empId);
      return next;
    });
  };

  // Xử lý XÓA DỮ LIỆU & XÓA NHÂN VIÊN
  const handleDeleteSingleEmployee = (emp: Employee) => {
    setSingleEmployeeToDelete(emp);
    setDeleteMode('single_employee');
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      if (deleteMode === 'single_employee' && singleEmployeeToDelete) {
        await deleteEmployees([singleEmployeeToDelete.id]);
        setDeleteSuccessMessage(
          `Đã xóa thành công nhân viên ${singleEmployeeToDelete.fullName} (${singleEmployeeToDelete.id}) cùng toàn bộ dữ liệu chấm công, lương và phép năm khỏi hệ thống!`
        );
        setSelectedEmployeeIds((prev) => {
          const next = new Set(prev);
          next.delete(singleEmployeeToDelete.id);
          return next;
        });
        setSingleEmployeeToDelete(null);
      } else if (deleteMode === 'selected_employees') {
        const empIds = Array.from(selectedEmployeeIds);
        await deleteEmployees(empIds);
        setDeleteSuccessMessage(
          `Đã xóa thành công ${empIds.length} nhân viên đã chọn cùng toàn bộ dữ liệu chấm công, lương và phép năm khỏi hệ thống!`
        );
        setSelectedEmployeeIds(new Set());
      } else if (deleteMode === 'month') {
        await deleteAttendanceByPeriod(deleteTargetMonth, deleteTargetYear);
        setDeleteSuccessMessage(
          `Đã xóa thành công toàn bộ dữ liệu chấm công Tháng ${deleteTargetMonth}/${deleteTargetYear} khỏi hệ thống!`
        );
        setSelectedEmployeeIds(new Set());
        setSelectedMatrixEmpId('');
        setDetailEmployee(null);
      } else if (deleteMode === 'year') {
        await deleteAttendanceByYear(deleteTargetYear);
        setDeleteSuccessMessage(
          `Đã xóa thành công toàn bộ dữ liệu chấm công cả Năm ${deleteTargetYear} khỏi hệ thống!`
        );
        setSelectedEmployeeIds(new Set());
        setSelectedMatrixEmpId('');
        setDetailEmployee(null);
      } else if (deleteMode === 'period') {
        const empIds = employeeStats.map((item) => item.employee.id);
        await deleteEmployees(empIds);
        setDeleteSuccessMessage(
          `Đã xóa thành công toàn bộ ${empIds.length} nhân viên trong Tháng ${selectedMonth}/${selectedYear} cùng dữ liệu liên quan khỏi hệ thống!`
        );
        setSelectedEmployeeIds(new Set());
      }
      setIsDeleteModalOpen(false);
    } catch (err: any) {
      alert('Lỗi khi xóa dữ liệu: ' + (err?.message || 'Vui lòng thử lại'));
    } finally {
      setIsDeleting(false);
    }
  };

  // Xử lý Sửa thông tin nhân viên
  const handleOpenEditEmployee = (emp: Employee) => {
    setEmployeeToEdit(emp);
    setEditEmployeeForm({
      fullName: emp.fullName || '',
      department: emp.department || '',
      position: emp.position || '',
      startDate: emp.startDate || '',
      status: emp.status || 'active',
      phone: emp.phone || '',
      email: emp.email || '',
    });
    setIsEditEmployeeModalOpen(true);
  };

  const handleSaveEditEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeToEdit) return;
    setIsSavingEmployee(true);
    try {
      const updated: Employee = {
        ...employeeToEdit,
        fullName: editEmployeeForm.fullName.trim(),
        department: editEmployeeForm.department.trim(),
        position: editEmployeeForm.position.trim(),
        startDate: editEmployeeForm.startDate,
        status: editEmployeeForm.status,
        phone: editEmployeeForm.phone.trim(),
        email: editEmployeeForm.email.trim(),
      };
      await updateEmployee(updated);
      setDeleteSuccessMessage(`Đã cập nhật thông tin nhân viên ${updated.fullName} (${updated.id}) thành công!`);
      setIsEditEmployeeModalOpen(false);
    } catch (err: any) {
      alert('Lỗi cập nhật nhân viên: ' + (err?.message || 'Vui lòng thử lại'));
    } finally {
      setIsSavingEmployee(false);
    }
  };

  // Xử lý Đọc & Kiểm tra file Excel nạp vào
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isPeriodLocked) {
      setFileValidationError('Vui lòng xác nhận chọn Tháng và Năm kỳ công ở Bước 1 trước khi tải file.');
      return;
    }

    setImportFile(file);
    setFileValidationError('');
    setIsParsing(true);

    try {
      const { workbook, sheetNames: sheets } = await readExcelWorkbook(file);
      const firstSheet = sheets[0] || '';
      const rows = extractSheetRows(workbook, firstSheet);

      if (rows.length < 2) {
        setFileValidationError('Tệp Excel không chứa đủ dữ liệu để phân tích.');
        setIsParsing(false);
        return;
      }

      const headerIdx = detectHeaderRowIndex(rows);
      const sheetHeaders = getHeadersFromRow(rows, headerIdx);
      const mapping = detectColumnMapping(sheetHeaders);

      const res = parseAndValidateRows(
        rows,
        headerIdx,
        mapping,
        sheetHeaders,
        employees,
        importMonth,
        importYear
      );

      if (res.attendanceRows.length === 0) {
        setFileValidationError(
          `Không tìm thấy dòng dữ liệu chấm công phù hợp cho Tháng ${importMonth}/${importYear} trong tệp này.`
        );
      }

      setParseResult(res);
      if (res.matrices && res.matrices.length > 0) {
        setPreviewEmpId(res.matrices[0].employeeId);
      }
    } catch (err: any) {
      setFileValidationError('Lỗi đọc tệp Excel: ' + (err?.message || 'Định dạng tệp không được hỗ trợ'));
    } finally {
      setIsParsing(false);
    }
  };

  // Thực hiện Lưu dữ liệu Excel vào Hệ Thống
  const handleExecuteImport = async () => {
    if (!parseResult) return;
    setIsSubmittingImport(true);

    try {
      const validRows = parseResult.attendanceRows.filter((r) => r.isValid);
      const errorRows = parseResult.attendanceRows.filter((r) => !r.isValid);

      const importRes = await importAttendanceData({
        month: importMonth,
        year: importYear,
        validRows,
        totalRows: parseResult.attendanceRows.length,
        errorRowsCount: errorRows.length,
        errorDetails: errorRows.map((r) => ({
          row: r.rowNum,
          error: r.errors.join('; ') || 'Lỗi dữ liệu',
        })),
        file: importFile || undefined,
        importedByName: currentUser?.fullName || 'Admin',
        mode: conflictMode,
        employeesSyncList: parseResult.employeesSyncList,
        matrices: parseResult.matrices,
      });

      // Cập nhật selectedMonth & selectedYear trên giao diện chính sang kỳ vừa nạp
      setSelectedMonth(importMonth);
      setSelectedYear(importYear);
      setSearchParams({ month: String(importMonth), year: String(importYear) }, { replace: true });
      try {
        localStorage.setItem(
          'hr_last_imported_period',
          JSON.stringify({ month: importMonth, year: importYear })
        );
      } catch {}
      setViewMode('monthly_employees');
      if (parseResult.matrices && parseResult.matrices.length > 0) {
        setSelectedMatrixEmpId(parseResult.matrices[0].employeeId);
      }
      setCurrentPage(1);

      setImportSuccessAlert(
        importRes.message ||
          `Đã nạp thành công ${validRows.length} bản ghi chấm công cho kỳ Tháng ${importMonth}/${importYear}!`
      );
      setIsImportModalOpen(false);
      setImportFile(null);
      setParseResult(null);
      setIsPeriodLocked(false);
    } catch (err: any) {
      setFileValidationError('Lỗi khi lưu dữ liệu vào hệ thống: ' + (err?.message || 'Vui lòng thử lại'));
    } finally {
      setIsSubmittingImport(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Thông báo thao tác thành công */}
      {deleteSuccessMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-xs text-emerald-800 shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{deleteSuccessMessage}</span>
          </div>
          <button
            onClick={() => setDeleteSuccessMessage('')}
            className="p-1 hover:bg-emerald-100 rounded-lg text-emerald-700 transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {importSuccessAlert && (
        <div className="p-3.5 bg-indigo-50 border border-indigo-200 rounded-2xl flex items-center justify-between text-xs text-indigo-800 shadow-xs">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
            <span className="font-semibold">{importSuccessAlert}</span>
          </div>
          <button
            onClick={() => setImportSuccessAlert('')}
            className="p-1 hover:bg-indigo-100 rounded-lg text-indigo-700 transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Quản Lý & Theo Dõi Chấm Công</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Dữ liệu đồng bộ trực tiếp từ Supabase qua tính năng Nạp Excel theo kỳ hoặc điểm danh máy quẹt
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Switch View Mode Buttons */}
          <div className="p-1 bg-slate-200/80 rounded-xl flex items-center text-xs font-semibold">
            <button
              onClick={() => {
                setViewMode('monthly_employees');
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg transition ${
                viewMode === 'monthly_employees'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Danh Sách Nhân Viên
            </button>
            <button
              onClick={() => {
                setViewMode('matrix');
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg transition ${
                viewMode === 'matrix'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Bảng Công Chi Tiết (File Mẫu)
            </button>
          </div>

          {/* Nạp Dữ Liệu Chấm Công bằng Excel (Bắt buộc chọn tháng/năm) */}
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm shadow-emerald-600/30 transition cursor-pointer"
            title="Mở hộp thoại nạp bảng công Excel chuẩn (bắt buộc chọn kỳ trước)"
          >
            <Upload className="w-4 h-4" />
            <span>Nạp Excel Chấm Công</span>
          </button>

          {/* Dropdown Xóa Dữ Liệu Theo Tháng hoặc Theo Năm */}
          <div className="relative" ref={topDeleteDropdownRef}>
            <button
              type="button"
              onClick={() => setIsTopDeleteDropdownOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
              title="Tùy chọn xóa dữ liệu chấm công theo tháng hoặc theo năm"
            >
              <Trash2 className="w-4 h-4 text-rose-600" />
              <span>Xóa Dữ Liệu</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-rose-500 transition-transform duration-150 ${
                  isTopDeleteDropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {isTopDeleteDropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-40 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  Tùy Chọn Xóa Dữ Liệu Chấm Công
                </div>

                {/* 1. Xóa theo tháng */}
                <button
                  type="button"
                  onClick={() => {
                    setIsTopDeleteDropdownOpen(false);
                    setDeleteTargetMonth(selectedMonth);
                    setDeleteTargetYear(selectedYear);
                    setDeleteMode('month');
                    setIsDeleteModalOpen(true);
                  }}
                  className="w-full text-left px-3 py-2.5 text-xs hover:bg-rose-50 flex items-start gap-2.5 transition text-slate-700 hover:text-rose-700 group cursor-pointer"
                >
                  <div className="w-7 h-7 rounded-lg bg-rose-100/70 text-rose-600 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-rose-200">
                    <Trash2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-800 group-hover:text-rose-700">
                      Xóa Theo Tháng ({selectedMonth}/{selectedYear})
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Xóa toàn bộ dữ liệu công Tháng {selectedMonth}/{selectedYear}
                    </div>
                  </div>
                </button>

                {/* 2. Xóa theo năm */}
                <button
                  type="button"
                  onClick={() => {
                    setIsTopDeleteDropdownOpen(false);
                    setDeleteTargetYear(selectedYear);
                    setDeleteMode('year');
                    setIsDeleteModalOpen(true);
                  }}
                  className="w-full text-left px-3 py-2.5 text-xs hover:bg-rose-50 flex items-start gap-2.5 transition text-slate-700 hover:text-rose-700 group cursor-pointer border-t border-slate-100"
                >
                  <div className="w-7 h-7 rounded-lg bg-rose-100/70 text-rose-600 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-rose-200">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-800 group-hover:text-rose-700">
                      Xóa Theo Năm (Cả Năm {selectedYear})
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Xóa toàn bộ dữ liệu công 12 tháng Năm {selectedYear}
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Chọn Tháng / Năm (hiển thị cho cả Danh sách nhân viên và Ma trận công) */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Kỳ chấm công (Tháng / Năm):
            </label>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={selectedMonth}
                onChange={(e) => {
                  const m = parseInt(e.target.value, 10);
                  setSelectedMonth(m);
                  setSearchParams({ month: String(m), year: String(selectedYear) }, { replace: true });
                  setCurrentPage(1);
                  setSelectedEmployeeIds(new Set());
                  try {
                    localStorage.setItem('hr_last_imported_period', JSON.stringify({ month: m, year: selectedYear }));
                  } catch {}
                }}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-medium text-slate-700"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    Tháng {m}
                  </option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => {
                  const y = parseInt(e.target.value, 10);
                  setSelectedYear(y);
                  setSearchParams({ month: String(selectedMonth), year: String(y) }, { replace: true });
                  setCurrentPage(1);
                  setSelectedEmployeeIds(new Set());
                  try {
                    localStorage.setItem('hr_last_imported_period', JSON.stringify({ month: selectedMonth, year: y }));
                  } catch {}
                }}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-medium text-slate-700"
              >
                {[2024, 2025, 2026, 2027, 2028].map((y) => (
                  <option key={y} value={y}>
                    Năm {y}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Department Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Phòng ban:
            </label>
            <select
              value={selectedDept}
              onChange={(e) => {
                setSelectedDept(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-medium text-slate-700"
            >
              <option value="all">Tất cả phòng ban</option>
              {availableDepartments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 pt-5">
            <span className="text-xs text-slate-500 font-medium">
              Tổng công ghi nhận trong kỳ:
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold text-xs border border-indigo-200">
              {monthRecords.length} bản ghi
            </span>
          </div>

          {/* Search box */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Tìm nhân viên:
            </label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Mã hoặc tên nhân viên..."
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* CHẾ ĐỘ 1: BẢNG MA TRẬN CHẤM CÔNG CHI TIẾT 100% CHUẨN FILE EXCEL MẪU (GIỐNG BƯỚC 3 XEM TRƯỚC) */}
      {viewMode === 'matrix' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold border border-emerald-200 shrink-0">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-slate-800 uppercase tracking-wide">
                  Bảng Chấm Công Chi Tiết (Chuẩn 100% File Excel Mẫu)
                </h3>
                <p className="text-xs text-slate-500">
                  Kỳ Tháng {selectedMonth}/{selectedYear} &bull; Hiển thị đúng 9 dòng chỉ tiêu thời gian và tăng ca theo từng ngày
                </p>
              </div>
            </div>

            {/* Dropdown chọn nhân viên xem ma trận */}
            {periodEmployees.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-700 shrink-0">
                  Xem nhân viên:
                </label>
                <select
                  value={activeMatrixEmployee?.id || ''}
                  onChange={(e) => setSelectedMatrixEmpId(e.target.value)}
                  className="px-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-slate-50 font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  {periodEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.id} - {emp.fullName} ({emp.department})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {activeEmployeeMatrix && activeMatrixEmployee ? (
            <AttendanceMatrixTable
              matrix={activeEmployeeMatrix}
              employeeInfo={{
                id: activeMatrixEmployee.id,
                fullName: activeMatrixEmployee.fullName,
                department: activeMatrixEmployee.department,
                startDate: activeMatrixEmployee.startDate,
                position: activeMatrixEmployee.position,
                status: activeMatrixEmployee.status,
              }}
              hideHeaderCard={false}
              title={`BẢNG CÔNG THÁNG ${selectedMonth}/${selectedYear} – ${activeMatrixEmployee.fullName} (${activeMatrixEmployee.id})`}
            />
          ) : (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 space-y-3">
              <AlertCircle className="w-8 h-8 text-slate-400 mx-auto" />
              <div className="text-sm font-bold text-slate-700">
                Chưa có dữ liệu bảng công chi tiết cho kỳ Tháng {selectedMonth}/{selectedYear}
              </div>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Quý Admin vui lòng bấm nút "Nạp Excel Chấm Công" phía trên để nạp tệp bảng công hoặc chuyển sang kỳ có dữ liệu.
              </p>
              <button
                type="button"
                onClick={() => setIsImportModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>Nạp Excel Kỳ Tháng {selectedMonth}/{selectedYear} Ngay</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* CHẾ ĐỘ 2: BẢNG TỔNG HỢP CÔNG THEO NHÂN VIÊN TRONG KỲ (Luôn hiển thị ở dưới ma trận công hoặc hiển thị độc lập) */}
      {(viewMode === 'monthly_employees' || viewMode === 'matrix') && (
        <div className="space-y-3">
          {/* Thanh công cụ khi có nhân viên được chọn */}
          {selectedEmployeeIds.size > 0 && (
            <div className="bg-indigo-50/90 border border-indigo-200 rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs animate-in fade-in duration-200">
              <div className="flex items-center gap-2.5 text-indigo-950 font-bold">
                <CheckSquare className="w-4 h-4 text-indigo-600" />
                <span>
                  Đã chọn <strong className="text-indigo-700 underline">{selectedEmployeeIds.size}</strong> nhân viên trong Tháng {selectedMonth}/{selectedYear}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedEmployeeIds(new Set())}
                  className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-medium transition cursor-pointer"
                >
                  Bỏ chọn tất cả
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteMode('selected_employees');
                    setIsDeleteModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold shadow-xs transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xóa {selectedEmployeeIds.size} nhân viên đã chọn khỏi hệ thống</span>
                </button>
              </div>
            </div>
          )}

          {/* Cảnh báo & Nút chuyển nhanh nếu kỳ đang chọn chưa có công nhưng hệ thống có dữ liệu ở kỳ khác */}
          {monthRecords.length === 0 && Object.values(importedMatrices).length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-amber-900 shadow-xs animate-in fade-in duration-200">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  Kỳ <strong>Tháng {selectedMonth}/{selectedYear}</strong> chưa có dữ liệu chấm công. Dữ liệu công đã nạp trong hệ thống là{' '}
                  <strong>
                    Tháng {Object.values(importedMatrices)[0]?.month || 10}/{Object.values(importedMatrices)[0]?.year || 2026}
                  </strong>.
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const targetM = Number(Object.values(importedMatrices)[0]?.month) || 10;
                  const targetY = Number(Object.values(importedMatrices)[0]?.year) || 2026;
                  setSelectedMonth(targetM);
                  setSelectedYear(targetY);
                  setSearchParams({ month: String(targetM), year: String(targetY) }, { replace: true });
                  try {
                    localStorage.setItem('hr_last_imported_period', JSON.stringify({ month: targetM, year: targetY }));
                  } catch {}
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold transition shadow-xs cursor-pointer self-start sm:self-auto shrink-0"
              >
                <span>Chuyển sang Tháng {Object.values(importedMatrices)[0]?.month || 10}/{Object.values(importedMatrices)[0]?.year || 2026} ngay</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <Card
            title={`Bảng Theo Dõi Chấm Công Theo Nhân Viên: Tháng ${selectedMonth}/${selectedYear}`}
            subtitle={`Chọn từng ô hoặc chọn tất cả để xóa nhân viên • Bấm "Chi tiết" để xem bảng công file mẫu • Bấm "Sửa" để cập nhật thông tin`}
            action={
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleToggleSelectAllEmployees}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
                  title="Chọn hoặc bỏ chọn tất cả nhân viên trên trang hiện tại"
                >
                  {isAllPageEmployeesSelected ? (
                    <>
                      <Square className="w-3.5 h-3.5" />
                      <span>Bỏ chọn trang này</span>
                    </>
                  ) : (
                    <>
                      <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Chọn tất cả trang này</span>
                    </>
                  )}
                </button>

                {/* Dropdown Xóa Dữ Liệu gọn gàng theo tháng / theo năm / theo nhân viên */}
                <div className="relative" ref={deleteDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsDeleteDropdownOpen((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
                    title="Tùy chọn xóa dữ liệu chấm công hoặc nhân viên"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                    <span>Xóa Dữ Liệu</span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-rose-500 transition-transform duration-150 ${
                        isDeleteDropdownOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {isDeleteDropdownOpen && (
                    <div className="absolute right-0 mt-1.5 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-30 animate-in fade-in zoom-in-95 duration-100">
                      <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                        Tùy Chọn Xóa Dữ Liệu
                      </div>

                      {/* Xóa theo tháng */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsDeleteDropdownOpen(false);
                          setDeleteTargetMonth(selectedMonth);
                          setDeleteTargetYear(selectedYear);
                          setDeleteMode('month');
                          setIsDeleteModalOpen(true);
                        }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-rose-50 flex items-start gap-2.5 transition text-slate-700 hover:text-rose-700 group cursor-pointer"
                      >
                        <div className="w-6 h-6 rounded-lg bg-rose-100/70 text-rose-600 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-rose-200">
                          <Trash2 className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="font-bold text-slate-800 group-hover:text-rose-700">
                            Xóa Theo Tháng ({selectedMonth}/{selectedYear})
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Xóa dữ liệu chấm công Tháng {selectedMonth}/{selectedYear}
                          </div>
                        </div>
                      </button>

                      {/* Xóa theo năm */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsDeleteDropdownOpen(false);
                          setDeleteTargetMonth(selectedMonth);
                          setDeleteTargetYear(selectedYear);
                          setDeleteMode('year');
                          setIsDeleteModalOpen(true);
                        }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-rose-50 flex items-start gap-2.5 transition text-slate-700 hover:text-rose-700 group cursor-pointer"
                      >
                        <div className="w-6 h-6 rounded-lg bg-rose-100/70 text-rose-600 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-rose-200">
                          <Calendar className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="font-bold text-slate-800 group-hover:text-rose-700">
                            Xóa Theo Năm (Cả Năm {selectedYear})
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Xóa toàn bộ công cả 12 tháng Năm {selectedYear}
                          </div>
                        </div>
                      </button>

                      {/* Xóa nhân viên đã chọn nếu có */}
                      {selectedEmployeeIds.size > 0 && (
                        <div className="border-t border-slate-100 mt-1 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setIsDeleteDropdownOpen(false);
                              setDeleteMode('selected_employees');
                              setIsDeleteModalOpen(true);
                            }}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-rose-50 flex items-start gap-2.5 transition text-rose-700 font-bold group cursor-pointer"
                          >
                            <div className="w-6 h-6 rounded-lg bg-rose-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                              <Trash2 className="w-3.5 h-3.5" />
                            </div>
                            <div>
                              <div className="font-bold text-rose-700">
                                Xóa {selectedEmployeeIds.size} NV Đã Chọn
                              </div>
                              <div className="text-[11px] text-rose-500 font-normal">
                                Xóa vĩnh viễn nhân viên đã tick chọn
                              </div>
                            </div>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            }
          >
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                  <tr>
                    {/* Checkbox Chọn tất cả */}
                    <th className="py-3 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={isAllPageEmployeesSelected}
                        onChange={handleToggleSelectAllEmployees}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        title="Chọn/Bỏ chọn tất cả trên trang"
                      />
                    </th>
                    <th className="py-3 px-4">Nhân Viên</th>
                    <th className="py-3 px-4">Phòng Ban</th>
                    <th className="py-3 px-4 text-center">Số Ngày Có Mặt</th>
                    <th className="py-3 px-4 text-center">Số Lần Muộn</th>
                    <th className="py-3 px-4 text-center">Tổng Giờ Làm</th>
                    <th className="py-3 px-4 text-center">Tổng Phút Muộn</th>
                    <th className="py-3 px-4 text-center">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedEmployeeStats.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-slate-400 bg-white">
                        {isLoadingFromDatabase ? (
                          <div className="flex flex-col items-center justify-center gap-2">
                            <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
                            <span className="font-bold text-sm text-slate-700">
                              Đang đồng bộ dữ liệu chấm công từ Supabase...
                            </span>
                            <p className="text-xs text-slate-400 max-w-sm">
                              Hệ thống đang tải danh sách nhân viên và dữ liệu công Tháng {selectedMonth}/{selectedYear}.
                            </p>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center gap-2">
                            <Calendar className="w-8 h-8 text-slate-300" />
                            <span className="font-bold text-sm text-slate-700">
                              Không có dữ liệu chấm công cho Tháng {selectedMonth}/{selectedYear}
                            </span>
                            <p className="text-xs text-slate-400 max-w-sm">
                              Dữ liệu kỳ này chưa được nạp hoặc đã được xóa hoàn tất khỏi hệ thống.
                            </p>
                          </div>
                        )}
                      </td>
                    </tr>
                  ) : (
                    paginatedEmployeeStats.map((item) => {
                      const isSelected = selectedEmployeeIds.has(item.employee.id);
                      return (
                        <tr
                          key={item.employee.id}
                          className={`hover:bg-slate-50/80 transition ${
                            isSelected ? 'bg-indigo-50/40' : ''
                          }`}
                        >
                          {/* Checkbox chọn từng nhân viên */}
                          <td className="py-3 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleEmployee(item.employee.id)}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-800">
                              {item.employee.fullName}
                            </div>
                            <div className="text-[11px] font-mono font-bold text-indigo-600">
                              {item.employee.id}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-slate-600">{item.employee.department}</td>
                          <td className="py-3 px-4 text-center">
                            <span className="font-bold text-slate-800 text-sm">
                              {item.actualDays}
                            </span>
                            <span className="text-slate-400 text-[11px]"> / 22 ngày</span>
                            {item.isUsingFallbackMatrix && (
                              <div className="text-[10px] text-indigo-600 font-semibold mt-0.5">
                                (Kỳ T{item.matMonth}/{item.matYear})
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {item.lateCount > 0 ? (
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                {item.lateCount} lần
                              </span>
                            ) : (
                              <span className="text-emerald-600 font-medium">0 lần</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center font-semibold text-slate-800">
                            {item.totalWorkHours.toFixed(1)}h
                            {item.isUsingFallbackMatrix && (
                              <div className="text-[10px] text-indigo-600 font-medium">
                                (Kỳ T{item.matMonth})
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {item.totalLateMinutes > 0 ? (
                              <span className="font-medium text-rose-600">
                                {item.totalLateMinutes} phút
                              </span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                              <button
                                onClick={() => setDetailEmployee(item.employee)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition cursor-pointer"
                                title="Xem bảng công chi tiết (View)"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Chi tiết</span>
                              </button>
                              <button
                                onClick={() => handleOpenEditEmployee(item.employee)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition cursor-pointer"
                                title="Sửa thông tin nhân viên"
                              >
                                <Edit className="w-3.5 h-3.5" />
                                <span>Sửa</span>
                              </button>
                              <button
                                onClick={() => handleDeleteSingleEmployee(item.employee)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition cursor-pointer"
                                title="Xóa nhân viên này và toàn bộ dữ liệu khỏi hệ thống"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Xóa NV</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Phân trang danh sách nhân viên */}
            {totalEmployeePages > 1 && (
              <div className="flex items-center justify-between pt-4 text-xs text-slate-500">
                <span>
                  Hiển thị nhân viên {(currentPage - 1) * pageSize + 1} -{' '}
                  {Math.min(currentPage * pageSize, employeeStats.length)} trong tổng số{' '}
                  {employeeStats.length} nhân viên
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="px-3 py-1 font-semibold text-slate-700">
                    Trang {currentPage} / {totalEmployeePages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalEmployeePages, p + 1))}
                    disabled={currentPage === totalEmployeePages}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* MODAL XÁC NHẬN XÓA NHÂN VIÊN & DỮ LIỆU (TUÂN THỦ ACCIDENTAL DATA LOSS PREVENTION) */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => !isDeleting && setIsDeleteModalOpen(false)}
        title={
          deleteMode === 'single_employee'
            ? 'Xác Nhận Xóa Nhân Viên Khỏi Hệ Thống'
            : deleteMode === 'selected_employees'
            ? `Xác Nhận Xóa ${selectedEmployeeIds.size} Nhân Viên Khỏi Hệ Thống`
            : deleteMode === 'month' || deleteMode === 'period'
            ? `Xác Nhận Xóa Dữ Liệu Chấm Công Tháng ${deleteTargetMonth}/${deleteTargetYear}`
            : `Xác Nhận Xóa Dữ Liệu Chấm Công Cả Năm ${deleteTargetYear}`
        }
        subtitle="Cảnh báo: Thao tác này sẽ xóa vĩnh viễn dữ liệu được chọn khỏi hệ thống"
        size="md"
      >
        <div className="space-y-4 text-xs text-slate-700">
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-rose-950 text-sm mb-1">
                {deleteMode === 'single_employee'
                  ? `Xóa nhân viên ${singleEmployeeToDelete?.fullName} (${singleEmployeeToDelete?.id})`
                  : deleteMode === 'selected_employees'
                  ? `Xóa ${selectedEmployeeIds.size} nhân viên đã chọn khỏi hệ thống`
                  : deleteMode === 'month' || deleteMode === 'period'
                  ? `Xóa dữ liệu chấm công Tháng ${deleteTargetMonth}/${deleteTargetYear}`
                  : `Xóa toàn bộ dữ liệu chấm công cả Năm ${deleteTargetYear}`}
              </div>
              <p className="text-rose-800 leading-relaxed">
                {deleteMode === 'single_employee'
                  ? `CẢNH BÁO: Thao tác này sẽ XÓA VĨNH VIỄN nhân viên ${singleEmployeeToDelete?.fullName} (Mã NV: ${singleEmployeeToDelete?.id}) khỏi hệ thống, đồng thời xóa toàn bộ dữ liệu chấm công, bảng lương và phép năm liên quan. Thao tác không thể hoàn tác!`
                  : deleteMode === 'selected_employees'
                  ? `CẢNH BÁO: Thao tác này sẽ XÓA TOÀN BỘ ${selectedEmployeeIds.size} nhân viên đã chọn khỏi hệ thống, cùng toàn bộ lịch sử chấm công, bảng lương và phép năm của các nhân viên này. Thao tác không thể hoàn tác!`
                  : deleteMode === 'month' || deleteMode === 'period'
                  ? `CẢNH BÁO: Thao tác này sẽ XÓA TOÀN BỘ dữ liệu chấm công và ma trận công của Tháng ${deleteTargetMonth}/${deleteTargetYear} khỏi hệ thống! Thao tác không thể hoàn tác.`
                  : `CẢNH BÁO NGUY HIỂM: Thao tác này sẽ XÓA TOÀN BỘ dữ liệu chấm công và ma trận công của TOÀN BỘ 12 THÁNG TRONG NĂM ${deleteTargetYear} khỏi hệ thống! Thao tác không thể hoàn tác.`}
              </p>
            </div>
          </div>

          {/* Bộ chọn tháng / năm trực tiếp trong modal xóa */}
          {deleteMode === 'month' && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
              <span className="block text-[11px] font-bold text-slate-700">
                Kỳ chấm công muốn xóa:
              </span>
              <div className="flex items-center gap-2">
                <div>
                  <label className="block text-[10px] text-slate-500 font-semibold mb-0.5">Tháng:</label>
                  <select
                    value={deleteTargetMonth}
                    onChange={(e) => setDeleteTargetMonth(Number(e.target.value))}
                    className="py-1.5 px-3 text-xs border border-slate-300 rounded-lg bg-white font-bold"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                      <option key={m} value={m}>Tháng {m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 font-semibold mb-0.5">Năm:</label>
                  <select
                    value={deleteTargetYear}
                    onChange={(e) => setDeleteTargetYear(Number(e.target.value))}
                    className="py-1.5 px-3 text-xs border border-slate-300 rounded-lg bg-white font-bold"
                  >
                    {[2024, 2025, 2026, 2027, 2028].map((y) => (
                      <option key={y} value={y}>Năm {y}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {deleteMode === 'year' && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
              <span className="block text-[11px] font-bold text-slate-700">
                Năm muốn xóa toàn bộ dữ liệu công (cả 12 tháng):
              </span>
              <div className="w-36">
                <select
                  value={deleteTargetYear}
                  onChange={(e) => setDeleteTargetYear(Number(e.target.value))}
                  className="w-full py-1.5 px-3 text-xs border border-slate-300 rounded-lg bg-white font-bold"
                >
                  {[2024, 2025, 2026, 2027, 2028].map((y) => (
                    <option key={y} value={y}>Năm {y}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => setIsDeleteModalOpen(false)}
              className="px-4 py-2 text-xs border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Hủy bỏ
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={handleConfirmDelete}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold shadow-xs transition cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>{isDeleting ? 'Đang xóa...' : 'Xác Nhận Xóa Ngay'}</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL NẠP EXCEL CHẤM CÔNG (BẮT BUỘC CHỌN THÁNG/NĂM TRƯỚC) */}
      <Modal
        isOpen={isImportModalOpen}
        onClose={() => {
          if (!isSubmittingImport) {
            setIsImportModalOpen(false);
            setParseResult(null);
            setImportFile(null);
            setIsPeriodLocked(false);
          }
        }}
        title="Nạp Dữ Liệu Bảng Chấm Công Bằng Excel"
        subtitle="Hỗ trợ file ma trận chuẩn (mẫu.xlsx) gồm 9 chỉ tiêu công chi tiết khớp 100% giao diện tra cứu"
        size="2xl"
      >
        <div className="space-y-5 text-xs text-slate-700">
          {/* BƯỚC 1: BẮT BUỘC CHỌN THÁNG VÀ NĂM TRƯỚC KHI NẠP */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs">
                  1
                </span>
                <span className="font-bold text-slate-900 text-sm">
                  Bước 1: Bắt Buộc Chọn Kỳ Công (Tháng & Năm)
                </span>
              </div>
              {isPeriodLocked && (
                <button
                  type="button"
                  onClick={() => {
                    setIsPeriodLocked(false);
                    setParseResult(null);
                    setImportFile(null);
                    setFileValidationError('');
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100/60 rounded-lg transition cursor-pointer"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Thay đổi kỳ công</span>
                </button>
              )}
            </div>

            <p className="text-[11px] text-amber-800 bg-amber-50/80 border border-amber-200 p-2.5 rounded-xl">
              ⚠️ <strong>QUY ĐỊNH BẮT BUỘC:</strong> Quý Admin bắt buộc phải chọn chính xác <strong>Tháng</strong> và <strong>Năm</strong> của kỳ chấm công trước khi tải tệp Excel lên. Dữ liệu ngày 1 đến ngày 31 trong tệp sẽ được đối soát theo đúng kỳ đã chọn.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Chọn Tháng công:
                </label>
                <select
                  disabled={isPeriodLocked}
                  value={importMonth}
                  onChange={(e) => setImportMonth(parseInt(e.target.value, 10))}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white font-medium focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-slate-100 disabled:text-slate-500"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      Tháng {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Chọn Năm công:
                </label>
                <select
                  disabled={isPeriodLocked}
                  value={importYear}
                  onChange={(e) => setImportYear(parseInt(e.target.value, 10))}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white font-medium focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-slate-100 disabled:text-slate-500"
                >
                  {[2024, 2025, 2026, 2027].map((y) => (
                    <option key={y} value={y}>
                      Năm {y}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                {!isPeriodLocked ? (
                  <button
                    type="button"
                    onClick={() => setIsPeriodLocked(true)}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Xác Nhận Kỳ (Tháng {importMonth}/{importYear})</span>
                  </button>
                ) : (
                  <div className="py-2 px-3 bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold rounded-xl flex items-center justify-center gap-1.5 text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Đã Khóa: Tháng {importMonth}/{importYear}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* BƯỚC 2: TẢI LÊN FILE EXCEL CHUẨN */}
          <div
            className={`p-4 border rounded-2xl space-y-3 transition ${
              !isPeriodLocked
                ? 'bg-slate-100/70 border-dashed border-slate-300 opacity-60 pointer-events-none'
                : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs">
                2
              </span>
              <span className="font-bold text-slate-900 text-sm">
                Bước 2: Tải Lên Tệp Excel Chấm Công
              </span>
            </div>

            {!isPeriodLocked ? (
              <p className="text-slate-500 text-xs italic">
                🔒 Vui lòng nhấn "Xác Nhận Kỳ" ở Bước 1 trước để mở cổng tải tệp.
              </p>
            ) : (
              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".xlsx, .xls, .csv"
                  className="hidden"
                />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/20 hover:bg-indigo-50/40 p-6 rounded-2xl text-center cursor-pointer transition flex flex-col items-center justify-center gap-2"
                >
                  <UploadCloud className="w-8 h-8 text-indigo-600" />
                  <div className="font-semibold text-slate-800 text-xs sm:text-sm">
                    {importFile ? importFile.name : 'Nhấp hoặc kéo thả tệp Excel chấm công vào đây'}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Hỗ trợ tệp <strong>.xlsx</strong>, <strong>.xls</strong> hoặc <strong>.csv</strong> &bull; Tối đa 25MB
                  </div>
                  {importFile && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 text-emerald-800 font-bold rounded-full text-[11px] mt-1">
                      <FileCheck2 className="w-3.5 h-3.5" />
                      <span>{(importFile.size / 1024).toFixed(1)} KB &bull; Đã sẵn sàng phân tích</span>
                    </div>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-slate-100">
                  <span className="text-[11px] text-slate-500 font-medium">Chưa có file mẫu?</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => exportCompact1RowTemplateExcel(employees, importMonth, importYear)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Tải Mẫu 1 Dòng / NV (&gt;700 NV)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => exportStandardTemplateExcel(employees, importMonth, importYear)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Tải Mẫu 9 Chỉ Tiêu</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {fileValidationError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-center gap-2 text-xs">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{fileValidationError}</span>
              </div>
            )}
          </div>

          {/* BƯỚC 3: XEM TRƯỚC VÀ XÁC THỰC MA TRẬN DỮ LIỆU */}
          {parseResult && (
            <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                    3
                  </span>
                  <span className="font-bold text-slate-900 text-sm">
                    Bước 3: Xem Trước & Kiểm Tra Dữ Liệu
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg font-bold text-[11px]">
                    ✓ {parseResult.attendanceRows.filter((r) => r.isValid).length} bản ghi hợp lệ
                  </span>
                  {parseResult.employeesSyncList.filter((e) => e.action === 'create').length > 0 && (
                    <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg font-bold text-[11px]">
                      + {parseResult.employeesSyncList.filter((e) => e.action === 'create').length} nhân viên mới
                    </span>
                  )}
                  {parseResult.attendanceRows.filter((r) => !r.isValid).length > 0 && (
                    <span className="px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg font-bold text-[11px]">
                      ! {parseResult.attendanceRows.filter((r) => !r.isValid).length} dòng lỗi
                    </span>
                  )}
                </div>
              </div>

              {/* Tùy chọn xử lý khi có dữ liệu trùng trong kỳ */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-700">
                  Phương thức lưu cho Tháng {importMonth}/{importYear}:
                </span>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 cursor-pointer font-medium text-slate-700">
                    <input
                      type="radio"
                      name="conflictMode"
                      value="upsert"
                      checked={conflictMode === 'upsert'}
                      onChange={() => setConflictMode('upsert')}
                      className="text-indigo-600"
                    />
                    <span>Bổ sung / Cập nhật (Khuyên dùng)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer font-medium text-slate-700">
                    <input
                      type="radio"
                      name="conflictMode"
                      value="overwrite"
                      checked={conflictMode === 'overwrite'}
                      onChange={() => setConflictMode('overwrite')}
                      className="text-indigo-600"
                    />
                    <span>Ghi đè toàn bộ kỳ này</span>
                  </label>
                </div>
              </div>

              {/* Xem trước ma trận công từng nhân viên nếu là ma trận chuẩn */}
              {parseResult.matrices && parseResult.matrices.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <label className="font-semibold text-slate-700 text-xs">
                      Chọn nhân viên để xem trước bảng công chi tiết:
                    </label>
                    <select
                      value={previewEmpId}
                      onChange={(e) => setPreviewEmpId(e.target.value)}
                      className="px-2.5 py-1 text-xs border border-slate-200 rounded-lg bg-white font-medium"
                    >
                      {parseResult.matrices.map((m) => (
                        <option key={m.employeeId} value={m.employeeId}>
                          {m.employeeId} - {m.fullName} ({m.department})
                        </option>
                      ))}
                    </select>
                  </div>

                  {(() => {
                    const activeMat = parseResult.matrices.find((m) => m.employeeId === previewEmpId) || parseResult.matrices[0];
                    if (!activeMat) return null;
                    return (
                      <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-200 p-2 bg-slate-50/50">
                        <AttendanceMatrixTable
                          matrix={activeMat}
                          hideHeaderCard={false}
                          title={`XEM TRƯỚC BẢNG CÔNG: ${activeMat.fullName} (${activeMat.employeeId})`}
                        />
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* NÚT THAO TÁC MODAL */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              disabled={isSubmittingImport}
              onClick={() => {
                setIsImportModalOpen(false);
                setParseResult(null);
                setImportFile(null);
                setIsPeriodLocked(false);
              }}
              className="px-4 py-2 text-xs border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Hủy bỏ
            </button>
            <button
              type="button"
              disabled={!parseResult || isSubmittingImport || parseResult.attendanceRows.filter((r) => r.isValid).length === 0}
              onClick={handleExecuteImport}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl font-bold shadow-xs transition cursor-pointer"
            >
              {isSubmittingImport ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Đang lưu vào hệ thống...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Lưu Dữ Liệu Tháng {importMonth}/{importYear}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL XEM CHI TIẾT CHẤM CÔNG CỦA MỘT NHÂN VIÊN THEO MẪU MẪU(1).XLSX */}
      <Modal
        isOpen={!!detailEmployee}
        onClose={() => setDetailEmployee(null)}
        title={`Bảng Chấm Công Chi Tiết: ${detailEmployee?.fullName} (${detailEmployee?.id})`}
        subtitle={`Kỳ chấm công: Tháng ${detailEmployeeMatrix?.month || selectedMonth}/${detailEmployeeMatrix?.year || selectedYear} - Bộ phận: ${detailEmployee?.department}`}
        size="full"
      >
        <div className="space-y-4">
          {detailEmployeeMatrix && (Number(detailEmployeeMatrix.month) !== Number(selectedMonth) || Number(detailEmployeeMatrix.year) !== Number(selectedYear)) && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-amber-900">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  Bảng công này thuộc <strong>Kỳ Tháng {detailEmployeeMatrix.month}/{detailEmployeeMatrix.year}</strong> (khác với kỳ đang lọc ngoài bảng là Tháng {selectedMonth}/{selectedYear}).
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedMonth(detailEmployeeMatrix.month);
                  setSelectedYear(detailEmployeeMatrix.year);
                  setSearchParams({ month: String(detailEmployeeMatrix.month), year: String(detailEmployeeMatrix.year) }, { replace: true });
                  try {
                    localStorage.setItem('hr_last_imported_period', JSON.stringify({ month: detailEmployeeMatrix.month, year: detailEmployeeMatrix.year }));
                  } catch {}
                }}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-xs shrink-0 cursor-pointer"
              >
                Chuyển bộ lọc sang Tháng {detailEmployeeMatrix.month}/{detailEmployeeMatrix.year}
              </button>
            </div>
          )}
          {detailEmployeeMatrix && detailEmployee ? (
            <AttendanceMatrixTable
              matrix={detailEmployeeMatrix}
              employeeInfo={{
                id: detailEmployee.id,
                fullName: detailEmployee.fullName,
                department: detailEmployee.department,
                startDate: detailEmployee.startDate,
                position: detailEmployee.position,
                status: detailEmployee.status,
              }}
              hideHeaderCard={false}
              title={`BẢNG CÔNG THÁNG ${detailEmployeeMatrix.month}/${detailEmployeeMatrix.year} - ${detailEmployee.fullName} (${detailEmployee.id})`}
            />
          ) : (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 space-y-3">
              <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
              <div className="text-sm font-bold text-slate-700">
                Chưa có dữ liệu bảng công chi tiết cho nhân viên {detailEmployee?.fullName} ({detailEmployee?.id}) trong Tháng {selectedMonth}/${selectedYear}
              </div>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Nhân viên này có thể có dữ liệu ở kỳ công khác (ví dụ: Tháng 10/2026). Quý Admin có thể chọn chuyển sang kỳ phù hợp ở bộ lọc đầu trang.
              </p>
            </div>
          )}

          <div className="flex justify-end pt-3 border-t border-slate-100">
            <button
              onClick={() => setDetailEmployee(null)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold cursor-pointer text-xs"
            >
              Đóng
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL SỬA THÔNG TIN NHÂN VIÊN */}
      <Modal
        isOpen={isEditEmployeeModalOpen}
        onClose={() => !isSavingEmployee && setIsEditEmployeeModalOpen(false)}
        title={`Sửa Thông Tin Nhân Viên: ${employeeToEdit?.fullName} (${employeeToEdit?.id})`}
        subtitle="Cập nhật họ tên, phòng ban, chức vụ, ngày vào làm và trạng thái làm việc"
        size="md"
      >
        <form onSubmit={handleSaveEditEmployee} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Mã nhân viên:</label>
            <input
              type="text"
              value={employeeToEdit?.id || ''}
              disabled
              className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-100 font-mono font-bold text-slate-600 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Họ và tên *:</label>
            <input
              type="text"
              required
              value={editEmployeeForm.fullName}
              onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, fullName: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-800 outline-none"
              placeholder="Nhập họ và tên..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Phòng ban *:</label>
              <input
                type="text"
                required
                value={editEmployeeForm.department}
                onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, department: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800 outline-none"
                placeholder="VD: Phòng Kỹ thuật, HR..."
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Chức vụ:</label>
              <input
                type="text"
                value={editEmployeeForm.position}
                onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, position: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800 outline-none"
                placeholder="VD: Kỹ sư, Chuyên viên..."
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Ngày vào làm việc:</label>
              <input
                type="date"
                value={editEmployeeForm.startDate}
                onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, startDate: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800 outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Trạng thái:</label>
              <select
                value={editEmployeeForm.status}
                onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, status: e.target.value as EmployeeStatus })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800 outline-none bg-white"
              >
                <option value="active">Chính thức</option>
                <option value="probation">Thử việc</option>
                <option value="inactive">Đã nghỉ việc</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Số điện thoại:</label>
              <input
                type="tel"
                value={editEmployeeForm.phone}
                onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, phone: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800 outline-none"
                placeholder="0912..."
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Email:</label>
              <input
                type="email"
                value={editEmployeeForm.email}
                onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, email: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800 outline-none"
                placeholder="email@company.com"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              disabled={isSavingEmployee}
              onClick={() => setIsEditEmployeeModalOpen(false)}
              className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSavingEmployee}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition shadow-xs cursor-pointer"
            >
              {isSavingEmployee ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Đang lưu...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Lưu Thay Đổi</span>
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
