import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  Banknote,
  Calendar,
  Download,
  Eye,
  CheckCircle2,
  Clock,
  Printer,
  DollarSign,
  TrendingUp,
  CreditCard,
  Building,
  Upload,
  FileSpreadsheet,
  AlertCircle,
  AlertTriangle,
  Search,
  Filter,
  Check,
  X,
  KeyRound,
  ShieldCheck,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { PayrollRecord, ImportConflictMode, ParsedPayrollRow, ExcelPayrollMapping } from '../../types';
import { Card } from '../../components/common/Card';
import { StatCard } from '../../components/common/StatCard';
import { PaymentStatusBadge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';
import { formatCurrency, formatDate } from '../../utils/formatters';
import {
  readExcelWorkbook,
  extractSheetRows,
  detectHeaderRowIndex,
  getHeadersFromRow,
  autoDetectPayrollColumns,
  parsePayrollRows,
  downloadPayrollTemplate,
} from '../../utils/excelParser';
import { payrollService } from '../../services/payrollService';

export const PayrollPage: React.FC = () => {
  const {
    employees,
    payrollRecords,
    settings,
    importPayrollData,
    updateEmployeeSalaryPin,
    deletePayrollRecords,
    deletePayrollByPeriod,
    deletePayrollByYear,
  } = useData();

  const [selectedMonth, setSelectedMonth] = useState(10);
  const [selectedYear, setSelectedYear] = useState(2026);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'pending' | 'draft'>('all');
  const [selectedSlip, setSelectedSlip] = useState<{ record: PayrollRecord; empName: string } | null>(null);

  // =========================================================================
  // STATE CHO CHỌN DÒNG (CHECKBOXES) & XÓA DỮ LIỆU DẠNG DROPDOWN
  // =========================================================================
  const [selectedRecordKeys, setSelectedRecordKeys] = useState<Set<string>>(new Set());
  const [isDeleteDropdownOpen, setIsDeleteDropdownOpen] = useState(false);
  const deleteDropdownRef = useRef<HTMLDivElement>(null);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState<'selected' | 'month' | 'year' | 'single'>('month');
  const [singleRecordToDelete, setSingleRecordToDelete] = useState<{ record: PayrollRecord; empName: string } | null>(null);
  const [deleteTargetMonth, setDeleteTargetMonth] = useState<number>(10);
  const [deleteTargetYear, setDeleteTargetYear] = useState<number>(2026);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string>('');

  // Phân trang danh sách bảng lương
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 20;

  // Đồng bộ kỳ mục tiêu khi thay đổi tháng/năm trên bộ lọc
  useEffect(() => {
    setDeleteTargetMonth(selectedMonth);
    setDeleteTargetYear(selectedYear);
    setSelectedRecordKeys(new Set());
    setCurrentPage(1);
  }, [selectedMonth, selectedYear]);

  // Đóng dropdown khi click ra ngoài
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (deleteDropdownRef.current && !deleteDropdownRef.current.contains(e.target as Node)) {
        setIsDeleteDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Modal đổi mã PIN cho nhân viên
  const [pinModalEmp, setPinModalEmp] = useState<{ empId: string; empName: string; currentPin: string } | null>(null);
  const [newPinInput, setNewPinInput] = useState('');
  const [pinSuccessMsg, setPinSuccessMsg] = useState('');

  // =========================================================================
  // STATE CHO MODAL IMPORT EXCEL BẢNG LƯƠNG
  // =========================================================================
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [rawRows, setRawRows] = useState<any[][]>([]);
  const [headerIndex, setHeaderIndex] = useState(0);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ExcelPayrollMapping>({
    employeeIdCol: '',
    fullNameCol: '',
    standardWorkDaysCol: '',
    actualWorkDaysCol: '',
    baseSalaryCol: '',
    allowanceCol: '',
    bonusCol: '',
    overtimePayCol: '',
    latePenaltyCol: '',
    insuranceDeductionCol: '',
    taxDeductionCol: '',
    netSalaryCol: '',
    paymentStatusCol: '',
    paymentDateCol: '',
  });

  const [parsedValidRows, setParsedValidRows] = useState<ParsedPayrollRow[]>([]);
  const [parsedErrorRows, setParsedErrorRows] = useState<ParsedPayrollRow[]>([]);
  const [conflictMode, setConflictMode] = useState<ImportConflictMode>('upsert');
  const [hasExistingData, setHasExistingData] = useState(false);
  const [existingDataCount, setExistingDataCount] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [importReport, setImportReport] = useState<{
    success: boolean;
    count: number;
    errorCount: number;
    message: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter records by month/year & search
  const currentPayrolls = useMemo(() => {
    return payrollRecords.filter((p) => {
      const matchMonth = p.month === selectedMonth && p.year === selectedYear;
      if (!matchMonth) return false;

      const emp = employees.find((e) => e.id.toUpperCase() === p.employeeId.toUpperCase());
      const matchSearch =
        !searchTerm ||
        p.employeeId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (emp && emp.fullName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (emp && emp.department.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchStatus = statusFilter === 'all' || p.paymentStatus === statusFilter;

      return matchSearch && matchStatus;
    });
  }, [payrollRecords, selectedMonth, selectedYear, searchTerm, statusFilter, employees]);

  // Aggregate stats
  const totalNet = currentPayrolls.reduce((sum, p) => sum + p.netSalary, 0);
  const totalInsurance = currentPayrolls.reduce((sum, p) => sum + p.insuranceDeduction, 0);
  const totalTax = currentPayrolls.reduce((sum, p) => sum + p.taxDeduction, 0);
  const paidCount = currentPayrolls.filter((p) => p.paymentStatus === 'paid').length;

  // Phân trang an toàn
  const totalPages = Math.max(1, Math.ceil(currentPayrolls.length / pageSize));
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const paginatedPayrolls = useMemo(() => {
    const start = (validCurrentPage - 1) * pageSize;
    return currentPayrolls.slice(start, start + pageSize);
  }, [currentPayrolls, validCurrentPage, pageSize]);

  // Kiểm tra đã chọn tất cả các dòng trên trang hiện tại
  const isAllCurrentPageSelected = useMemo(() => {
    if (paginatedPayrolls.length === 0) return false;
    return paginatedPayrolls.every((p) => {
      const key = p.id || `${p.employeeId.toUpperCase()}_${p.month}_${p.year}`;
      return selectedRecordKeys.has(key);
    });
  }, [paginatedPayrolls, selectedRecordKeys]);

  // Chọn hoặc bỏ chọn tất cả các dòng trên trang hiện tại
  const handleToggleSelectAll = () => {
    setSelectedRecordKeys((prev) => {
      const next = new Set(prev);
      if (isAllCurrentPageSelected) {
        paginatedPayrolls.forEach((p) => {
          const key = p.id || `${p.employeeId.toUpperCase()}_${p.month}_${p.year}`;
          next.delete(key);
        });
      } else {
        paginatedPayrolls.forEach((p) => {
          const key = p.id || `${p.employeeId.toUpperCase()}_${p.month}_${p.year}`;
          next.add(key);
        });
      }
      return next;
    });
  };

  // Chọn hoặc bỏ chọn từng dòng
  const handleToggleSelectRow = (key: string) => {
    setSelectedRecordKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Xác nhận thực hiện xóa dữ liệu bảng lương
  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      if (deleteMode === 'month') {
        await deletePayrollByPeriod(deleteTargetMonth, deleteTargetYear);
        setActionSuccessMessage(`Đã xóa toàn bộ dữ liệu bảng lương Tháng ${deleteTargetMonth}/${deleteTargetYear}!`);
        setSelectedRecordKeys(new Set());
      } else if (deleteMode === 'year') {
        await deletePayrollByYear(deleteTargetYear);
        setActionSuccessMessage(`Đã xóa toàn bộ dữ liệu bảng lương cả Năm ${deleteTargetYear}!`);
        setSelectedRecordKeys(new Set());
      } else if (deleteMode === 'selected') {
        const recordsToDelete = currentPayrolls.filter((p) => {
          const key = p.id || `${p.employeeId.toUpperCase()}_${p.month}_${p.year}`;
          return selectedRecordKeys.has(key);
        });
        await deletePayrollRecords(recordsToDelete);
        setActionSuccessMessage(`Đã xóa ${recordsToDelete.length} bản ghi bảng lương đã chọn!`);
        setSelectedRecordKeys(new Set());
      } else if (deleteMode === 'single' && singleRecordToDelete) {
        await deletePayrollRecords([singleRecordToDelete.record]);
        setActionSuccessMessage(
          `Đã xóa bản ghi lương của nhân viên ${singleRecordToDelete.empName} (${singleRecordToDelete.record.employeeId})!`
        );
        const key =
          singleRecordToDelete.record.id ||
          `${singleRecordToDelete.record.employeeId.toUpperCase()}_${singleRecordToDelete.record.month}_${singleRecordToDelete.record.year}`;
        setSelectedRecordKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        setSingleRecordToDelete(null);
      }
      setIsDeleteModalOpen(false);
    } catch (err: any) {
      alert(`Lỗi khi xóa bảng lương: ${err?.message || 'Vui lòng thử lại'}`);
    } finally {
      setIsDeleting(false);
    }
  };

  // =========================================================================
  // XỬ LÝ NHẬP FILE EXCEL BẢNG LƯƠNG
  // =========================================================================
  const handleOpenImportModal = async () => {
    setIsImportModalOpen(true);
    setImportFile(null);
    setRawRows([]);
    setImportReport(null);

    // Kiểm tra dữ liệu kỳ hiện tại
    const existInfo = await payrollService.checkExistingPayroll(selectedMonth, selectedYear);
    setHasExistingData(existInfo.hasData);
    setExistingDataCount(existInfo.count);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFile(file);
    try {
      const { workbook, sheetNames: names } = await readExcelWorkbook(file);
      setSheetNames(names);
      const defaultSheet = names[0] || '';
      setSelectedSheet(defaultSheet);

      const rows = extractSheetRows(workbook, defaultSheet);
      setRawRows(rows);

      const detectedHeader = detectHeaderRowIndex(rows);
      setHeaderIndex(detectedHeader);

      const detectedHeaders = getHeadersFromRow(rows, detectedHeader);
      setHeaders(detectedHeaders);

      const detectedMapping = autoDetectPayrollColumns(detectedHeaders);
      setMapping(detectedMapping);

      // Parse thử dữ liệu
      const parsed = parsePayrollRows(rows, detectedMapping, detectedHeader, selectedMonth, selectedYear, employees);
      setParsedValidRows(parsed.validRows);
      setParsedErrorRows(parsed.errorRows);
    } catch (err: any) {
      alert(`Lỗi đọc file Excel: ${err.message}`);
    }
  };

  const reparseRowsWithMapping = (updatedMapping: ExcelPayrollMapping) => {
    setMapping(updatedMapping);
    if (rawRows.length > 0) {
      const parsed = parsePayrollRows(rawRows, updatedMapping, headerIndex, selectedMonth, selectedYear, employees);
      setParsedValidRows(parsed.validRows);
      setParsedErrorRows(parsed.errorRows);
    }
  };

  const handleExecuteImportPayroll = async () => {
    if (parsedValidRows.length === 0) {
      alert('Không có dòng dữ liệu hợp lệ nào để lưu!');
      return;
    }

    setIsImporting(true);
    try {
      const recordsToSave: PayrollRecord[] = parsedValidRows.map((r, idx) => ({
        id: `PR-${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${r.employeeId}-${idx}`,
        employeeId: r.employeeId,
        month: selectedMonth,
        year: selectedYear,
        standardWorkDays: r.standardWorkDays,
        actualWorkDays: r.actualWorkDays,
        paidLeaveDays: r.paidLeaveDays,
        unpaidLeaveDays: r.unpaidLeaveDays,
        baseSalary: r.baseSalary,
        allowance: r.allowance,
        bonus: r.bonus,
        overtimePay: r.overtimePay,
        latePenalty: r.latePenalty,
        insuranceDeduction: r.insuranceDeduction,
        taxDeduction: r.taxDeduction,
        netSalary: r.netSalary,
        paymentStatus: r.paymentStatus,
        paymentDate: r.paymentDate,
      }));

      const res = await importPayrollData({
        month: selectedMonth,
        year: selectedYear,
        records: recordsToSave,
        mode: conflictMode,
        importedByName: 'Admin HR Manager',
      });

      setImportReport({
        success: res.success,
        count: parsedValidRows.length,
        errorCount: parsedErrorRows.length,
        message: res.success
          ? `Nhập thành công ${parsedValidRows.length} bản ghi bảng lương vào hệ thống!`
          : `Lỗi: ${res.error || 'Không thể lưu bảng lương.'}`,
      });
    } catch (err: any) {
      setImportReport({
        success: false,
        count: 0,
        errorCount: parsedErrorRows.length,
        message: `Lỗi ngoại lệ: ${err.message}`,
      });
    } finally {
      setIsImporting(false);
    }
  };

  // Đổi PIN bảo mật nhân viên
  const handleOpenPinModal = (empId: string) => {
    const emp = employees.find((e) => e.id.toUpperCase() === empId.toUpperCase());
    if (!emp) return;
    setPinModalEmp({
      empId: emp.id,
      empName: emp.fullName,
      currentPin: emp.salaryPin || '1234',
    });
    setNewPinInput(emp.salaryPin || '1234');
    setPinSuccessMsg('');
  };

  const handleSavePin = async () => {
    if (!pinModalEmp) return;
    const cleanPin = newPinInput.trim();
    if (!cleanPin) {
      alert('Vui lòng nhập mã PIN hợp lệ (4-6 ký tự số).');
      return;
    }
    await updateEmployeeSalaryPin(pinModalEmp.empId, cleanPin);
    setPinSuccessMsg(`Đã đổi mã PIN thành công cho nhân viên ${pinModalEmp.empId}: ${cleanPin}`);
    setTimeout(() => {
      setPinModalEmp(null);
    }, 1200);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Quản Lý & Quyết Toán Bảng Lương</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Tính toán tự động theo ngày công thực tế, phụ cấp, tiền thưởng và các khoản khấu trừ quy định
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Month/Year selector */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-sm text-xs">
            <Calendar className="w-3.5 h-3.5 text-indigo-600" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="bg-transparent font-semibold text-slate-700 outline-none cursor-pointer"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                <option key={m} value={m}>
                  Tháng {m}
                </option>
              ))}
            </select>
            <span className="text-slate-300">/</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-transparent font-semibold text-slate-700 outline-none cursor-pointer"
            >
              <option value={2026}>2026</option>
              <option value={2025}>2025</option>
              <option value={2024}>2024</option>
            </select>
          </div>

          {/* Import Excel Button */}
          <button
            onClick={handleOpenImportModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm shadow-emerald-600/30 transition cursor-pointer"
            title="Mở hộp thoại nạp bảng lương từ file Excel"
          >
            <Upload className="w-4 h-4" />
            <span>Nạp Excel Bảng Lương</span>
          </button>

          {/* Tải File Mẫu Excel Bảng Lương Button */}
          <button
            onClick={() => downloadPayrollTemplate(selectedMonth, selectedYear, employees)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold shadow-sm transition cursor-pointer"
            title="Tải tệp Excel mẫu bảng lương chuẩn để điền dữ liệu"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Tải File Mẫu Bảng Lương</span>
          </button>

          {/* Dropdown Xóa Dữ Liệu */}
          <div className="relative" ref={deleteDropdownRef}>
            <button
              type="button"
              onClick={() => setIsDeleteDropdownOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
              title="Tùy chọn xóa dữ liệu bảng lương"
            >
              <Trash2 className="w-4 h-4 text-rose-600" />
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
                  Tùy Chọn Xóa Bảng Lương
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
                      Xóa bảng lương Tháng {selectedMonth}/{selectedYear}
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
                      Xóa bảng lương toàn bộ các tháng Năm {selectedYear}
                    </div>
                  </div>
                </button>

                {/* Xóa nhân viên đã chọn nếu có */}
                {selectedRecordKeys.size > 0 && (
                  <div className="border-t border-slate-100 mt-1 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsDeleteDropdownOpen(false);
                        setDeleteMode('selected');
                        setIsDeleteModalOpen(true);
                      }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-rose-50 flex items-start gap-2.5 transition text-rose-700 font-bold group cursor-pointer"
                    >
                      <div className="w-6 h-6 rounded-lg bg-rose-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                        <Trash2 className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="font-bold text-rose-700">
                          Xóa {selectedRecordKeys.size} Bản Ghi Đã Chọn
                        </div>
                        <div className="text-[11px] text-rose-500 font-normal">
                          Xóa các bản ghi lương đã tick chọn
                        </div>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Thông báo kết quả thao tác */}
      {actionSuccessMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionSuccessMessage}</span>
          </div>
          <button
            onClick={() => setActionSuccessMessage('')}
            className="p-1 hover:bg-emerald-100 rounded text-emerald-600 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Thanh tác vụ khi có dòng được chọn */}
      {selectedRecordKeys.size > 0 && (
        <div className="bg-indigo-50/90 border border-indigo-200 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2 text-xs font-semibold text-indigo-900">
            <CheckCircle2 className="w-4 h-4 text-indigo-600" />
            <span>
              Đã chọn <strong className="text-indigo-700 underline">{selectedRecordKeys.size}</strong> bản ghi lương trong Tháng {selectedMonth}/{selectedYear}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedRecordKeys(new Set())}
              className="px-3 py-1 text-xs text-slate-600 hover:text-slate-800 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition cursor-pointer"
            >
              Bỏ chọn
            </button>
            <button
              type="button"
              onClick={() => {
                setDeleteMode('selected');
                setIsDeleteModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1 text-xs bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold shadow-xs transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Xóa {selectedRecordKeys.size} bản ghi đã chọn</span>
            </button>
          </div>
        </div>
      )}

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Tổng thực chi lương"
          value={formatCurrency(totalNet)}
          icon={Banknote}
          colorScheme="indigo"
          subValue={`T${selectedMonth}/${selectedYear}`}
        />
        <StatCard
          title="Tổng bảo hiểm (10.5%)"
          value={formatCurrency(totalInsurance)}
          icon={CreditCard}
          colorScheme="sky"
          subValue="BHXH, BHYT, BHTN"
        />
        <StatCard
          title="Thuế TNCN khấu trừ"
          value={formatCurrency(totalTax)}
          icon={TrendingUp}
          colorScheme="amber"
          subValue="Tạm khấu trừ"
        />
        <StatCard
          title="Tình trạng chi trả"
          value={`${paidCount}/${currentPayrolls.length}`}
          icon={CheckCircle2}
          colorScheme="emerald"
          subValue="nhân viên đã nhận"
        />
      </div>

      {/* Filters & Search Toolbar */}
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {(['all', 'paid', 'pending', 'draft'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg font-medium transition ${statusFilter === s
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
              >
                {s === 'all' && 'Tất cả trạng thái'}
                {s === 'paid' && 'Đã chi trả'}
                {s === 'pending' && 'Đang chờ duyệt'}
                {s === 'draft' && 'Dự thảo'}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm theo mã NV, tên, phòng ban..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
        </div>
      </Card>

      {/* Desktop Table */}
      <div className="hidden lg:block bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={isAllCurrentPageSelected}
                    onChange={handleToggleSelectAll}
                    className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    title="Chọn / Bỏ chọn tất cả trên trang này"
                  />
                </th>
                <th className="py-3 px-2 w-12 text-center">STT</th>
                <th className="py-3 px-3">Mã NV</th>
                <th className="py-3 px-3">Họ và Tên</th>
                <th className="py-3 px-3 text-center">Công chuẩn</th>
                <th className="py-3 px-3 text-center">Công thực</th>
                <th className="py-3 px-3 text-right">Lương cơ bản</th>
                <th className="py-3 px-3 text-right">Phụ cấp</th>
                <th className="py-3 px-3 text-right">Thưởng</th>
                <th className="py-3 px-3 text-right">Phạt muộn</th>
                <th className="py-3 px-3 text-right">BHXH (10.5%)</th>
                <th className="py-3 px-3 text-right font-bold text-indigo-700">Thực lĩnh</th>
                <th className="py-3 px-3 text-center">Trạng thái</th>
                <th className="py-3 px-3 text-center">Mã PIN</th>
                <th className="py-3 px-3 text-center w-24">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedPayrolls.length === 0 ? (
                <tr>
                  <td colSpan={15} className="text-center py-8 text-slate-400">
                    Không tìm thấy bản ghi lương nào cho kỳ Tháng {selectedMonth}/{selectedYear}.
                  </td>
                </tr>
              ) : (
                paginatedPayrolls.map((p, idx) => {
                  const emp = employees.find((e) => e.id.toUpperCase() === p.employeeId.toUpperCase());
                  const rowKey = p.id || `${p.employeeId.toUpperCase()}_${p.month}_${p.year}`;
                  const isChecked = selectedRecordKeys.has(rowKey);
                  const stt = (validCurrentPage - 1) * pageSize + idx + 1;

                  return (
                    <tr
                      key={rowKey}
                      className={`hover:bg-slate-50/80 transition ${
                        isChecked ? 'bg-indigo-50/40' : ''
                      }`}
                    >
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSelectRow(rowKey)}
                          className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>
                      <td className="py-3 px-2 text-center font-mono text-slate-400 font-semibold">{stt}</td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-800">{p.employeeId}</td>
                      <td className="py-3 px-3 font-semibold text-slate-800">
                        {emp?.fullName || 'Nhân viên'}
                        <span className="block text-[10px] text-slate-400 font-normal">
                          {emp?.department}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center text-slate-600">{p.standardWorkDays}</td>
                      <td className="py-3 px-3 text-center font-bold text-slate-800">
                        {p.actualWorkDays}
                      </td>
                      <td className="py-3 px-3 text-right text-slate-700">
                        {formatCurrency(p.baseSalary)}
                      </td>
                      <td className="py-3 px-3 text-right text-slate-600">
                        {formatCurrency(p.allowance)}
                      </td>
                      <td className="py-3 px-3 text-right text-emerald-600 font-medium">
                        +{formatCurrency(p.bonus)}
                      </td>
                      <td className="py-3 px-3 text-right text-rose-600 font-medium">
                        {p.latePenalty > 0 ? `-${formatCurrency(p.latePenalty)}` : '0 ₫'}
                      </td>
                      <td className="py-3 px-3 text-right text-slate-500">
                        -{formatCurrency(p.insuranceDeduction)}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-indigo-700 text-sm">
                        {formatCurrency(p.netSalary)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <PaymentStatusBadge status={p.paymentStatus} />
                      </td>
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => handleOpenPinModal(p.employeeId)}
                          className="px-2 py-0.5 rounded font-mono text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1 mx-auto transition"
                          title="Bấm để đổi mã PIN tra cứu lương"
                        >
                          <KeyRound className="w-3 h-3 text-slate-400" />
                          <span>{emp?.salaryPin || '1234'}</span>
                        </button>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() =>
                              setSelectedSlip({ record: p, empName: emp?.fullName || 'Nhân viên' })
                            }
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition cursor-pointer"
                            title="Xem phiếu lương"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setSingleRecordToDelete({ record: p, empName: emp?.fullName || p.employeeId });
                              setDeleteMode('single');
                              setIsDeleteModalOpen(true);
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            title="Xóa bản ghi lương này"
                          >
                            <Trash2 className="w-4 h-4" />
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
      </div>

      {/* Mobile Card View */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:hidden gap-3">
        {paginatedPayrolls.map((p) => {
          const emp = employees.find((e) => e.id.toUpperCase() === p.employeeId.toUpperCase());
          const rowKey = p.id || `${p.employeeId.toUpperCase()}_${p.month}_${p.year}`;
          const isChecked = selectedRecordKeys.has(rowKey);

          return (
            <div
              key={rowKey}
              className={`bg-white rounded-xl border p-4 shadow-sm space-y-3 transition ${
                isChecked ? 'border-indigo-400 bg-indigo-50/20' : 'border-slate-200/80'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleToggleSelectRow(rowKey)}
                    className="mt-1 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <div>
                    <h4 className="font-bold text-sm text-slate-800">{emp?.fullName}</h4>
                    <span className="text-xs font-mono font-semibold text-indigo-600">
                      {p.employeeId} &bull; {p.actualWorkDays}/{p.standardWorkDays} ngày công
                    </span>
                  </div>
                </div>
                <PaymentStatusBadge status={p.paymentStatus} />
              </div>

              <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600">Lương thực lĩnh:</span>
                <span className="text-base font-bold text-indigo-700">
                  {formatCurrency(p.netSalary)}
                </span>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
                <button
                  onClick={() => handleOpenPinModal(p.employeeId)}
                  className="text-slate-500 hover:text-indigo-600 flex items-center gap-1 font-mono text-[11px]"
                >
                  <KeyRound className="w-3.5 h-3.5" /> PIN: {emp?.salaryPin || '1234'}
                </button>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() =>
                      setSelectedSlip({ record: p, empName: emp?.fullName || 'Nhân viên' })
                    }
                    className="px-2.5 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg flex items-center gap-1 transition cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" /> Phiếu
                  </button>
                  <button
                    onClick={() => {
                      setSingleRecordToDelete({ record: p, empName: emp?.fullName || p.employeeId });
                      setDeleteMode('single');
                      setIsDeleteModalOpen(true);
                    }}
                    className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                    title="Xóa bản ghi lương này"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Phân trang danh sách bảng lương */}
      {totalPages > 1 && (
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs shadow-xs">
          <div className="text-slate-500">
            Hiển thị <strong>{(validCurrentPage - 1) * pageSize + 1}</strong> -{' '}
            <strong>{Math.min(validCurrentPage * pageSize, currentPayrolls.length)}</strong> trên tổng số{' '}
            <strong>{currentPayrolls.length}</strong> bản ghi lương
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={validCurrentPage === 1}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition"
              title="Trang trước"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="px-3 py-1 font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg">
              Trang {validCurrentPage} / {totalPages}
            </div>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={validCurrentPage === totalPages}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition"
              title="Trang tiếp"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* MODAL XÁC NHẬN XÓA BẢNG LƯƠNG (GIỐNG PHẦN QUẢN LÝ CÔNG) */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => !isDeleting && setIsDeleteModalOpen(false)}
        title={
          deleteMode === 'single'
            ? 'Xác Nhận Xóa Bản Ghi Lương Nhân Viên'
            : deleteMode === 'selected'
            ? `Xác Nhận Xóa ${selectedRecordKeys.size} Bản Ghi Lương Đã Chọn`
            : deleteMode === 'month'
            ? `Xác Nhận Xóa Dữ Liệu Bảng Lương Tháng ${deleteTargetMonth}/${deleteTargetYear}`
            : `Xác Nhận Xóa Dữ Liệu Bảng Lương Cả Năm ${deleteTargetYear}`
        }
        subtitle="Cảnh báo: Thao tác này sẽ xóa vĩnh viễn dữ liệu bảng lương khỏi hệ thống"
        size="md"
      >
        <div className="space-y-4 text-xs text-slate-700">
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-rose-950 text-sm mb-1">
                {deleteMode === 'single'
                  ? `Xóa bản ghi lương của ${singleRecordToDelete?.empName} (${singleRecordToDelete?.record.employeeId})`
                  : deleteMode === 'selected'
                  ? `Xóa ${selectedRecordKeys.size} bản ghi lương đã tick chọn`
                  : deleteMode === 'month'
                  ? `Xóa dữ liệu bảng lương Tháng ${deleteTargetMonth}/${deleteTargetYear}`
                  : `Xóa toàn bộ dữ liệu bảng lương cả Năm ${deleteTargetYear}`}
              </div>
              <p className="text-rose-800 leading-relaxed">
                {deleteMode === 'single'
                  ? `CẢNH BÁO: Thao tác này sẽ XÓA VĨNH VIỄN bản ghi lương Tháng ${singleRecordToDelete?.record.month}/${singleRecordToDelete?.record.year} của nhân viên ${singleRecordToDelete?.empName} (Mã NV: ${singleRecordToDelete?.record.employeeId}) khỏi hệ thống. Thao tác không thể hoàn tác!`
                  : deleteMode === 'selected'
                  ? `CẢNH BÁO: Thao tác này sẽ XÓA TOÀN BỘ ${selectedRecordKeys.size} bản ghi lương đã tick chọn khỏi hệ thống. Thao tác không thể hoàn tác!`
                  : deleteMode === 'month'
                  ? `CẢNH BÁO: Thao tác này sẽ XÓA TOÀN BỘ dữ liệu quyết toán bảng lương của Tháng ${deleteTargetMonth}/${deleteTargetYear} khỏi hệ thống! Thao tác không thể hoàn tác.`
                  : `CẢNH BÁO NGUY HIỂM: Thao tác này sẽ XÓA TOÀN BỘ dữ liệu bảng lương của TOÀN BỘ 12 THÁNG TRONG NĂM ${deleteTargetYear} khỏi hệ thống! Thao tác không thể hoàn tác.`}
              </p>
            </div>
          </div>

          {/* Bộ chọn tháng / năm trực tiếp trong modal xóa */}
          {deleteMode === 'month' && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
              <span className="block text-[11px] font-bold text-slate-700">
                Kỳ lương muốn xóa:
              </span>
              <div className="flex items-center gap-2">
                <div>
                  <label className="block text-[10px] text-slate-500 font-semibold mb-0.5">Tháng:</label>
                  <select
                    value={deleteTargetMonth}
                    onChange={(e) => setDeleteTargetMonth(Number(e.target.value))}
                    className="py-1.5 px-3 text-xs border border-slate-300 rounded-lg bg-white font-bold outline-none cursor-pointer"
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
                    className="py-1.5 px-3 text-xs border border-slate-300 rounded-lg bg-white font-bold outline-none cursor-pointer"
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
                Năm muốn xóa toàn bộ bảng lương (cả 12 tháng):
              </span>
              <div className="w-36">
                <select
                  value={deleteTargetYear}
                  onChange={(e) => setDeleteTargetYear(Number(e.target.value))}
                  className="w-full py-1.5 px-3 text-xs border border-slate-300 rounded-lg bg-white font-bold outline-none cursor-pointer"
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
              className="px-4 py-2 text-xs border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 cursor-pointer transition"
            >
              Hủy bỏ
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={handleConfirmDelete}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              <span>{isDeleting ? 'Đang xóa...' : 'Xác Nhận Xóa Ngay'}</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* Pay Slip Modal */}
      <Modal
        isOpen={!!selectedSlip}
        onClose={() => setSelectedSlip(null)}
        title="Phiếu Lương Chi Tiết (Pay Slip)"
        subtitle={`Kỳ lương: Tháng ${selectedMonth}/${selectedYear}`}
        size="lg"
      >
        {selectedSlip && (
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
              <div>
                <p className="text-slate-400 font-semibold uppercase">{settings.companyName}</p>
                <h4 className="text-base font-bold text-slate-800 mt-0.5">
                  {selectedSlip.empName} ({selectedSlip.record.employeeId})
                </h4>
              </div>
              <div className="sm:text-right">
                <p className="text-slate-500">
                  Ngày thanh toán: <strong>{selectedSlip.record.paymentDate || '01 hàng tháng'}</strong>
                </p>
                <p className="text-slate-500">
                  Số ngày công: <strong>{selectedSlip.record.actualWorkDays} / {selectedSlip.record.standardWorkDays} ngày</strong>
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              {/* Incomes */}
              <div className="p-4 rounded-xl border border-emerald-100 bg-emerald-50/30 space-y-2">
                <h5 className="font-bold text-emerald-800 uppercase tracking-wider mb-2">
                  (I) Các Khoản Thu Nhập
                </h5>
                <div className="flex justify-between py-1 border-b border-emerald-100">
                  <span className="text-slate-600">Lương cơ bản hợp đồng:</span>
                  <span className="font-semibold text-slate-800">
                    {formatCurrency(selectedSlip.record.baseSalary)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-emerald-100">
                  <span className="text-slate-600">Phụ cấp ăn trưa & đi lại:</span>
                  <span className="font-semibold text-slate-800">
                    {formatCurrency(selectedSlip.record.allowance)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-emerald-100">
                  <span className="text-slate-600">Tiền thưởng hiệu quả (KPI):</span>
                  <span className="font-semibold text-slate-800">
                    {formatCurrency(selectedSlip.record.bonus)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-emerald-100">
                  <span className="text-slate-600">Làm thêm giờ (Overtime):</span>
                  <span className="font-semibold text-slate-800">
                    {formatCurrency(selectedSlip.record.overtimePay)}
                  </span>
                </div>
              </div>

              {/* Deductions */}
              <div className="p-4 rounded-xl border border-rose-100 bg-rose-50/30 space-y-2">
                <h5 className="font-bold text-rose-800 uppercase tracking-wider mb-2">
                  (II) Các Khoản Khấu Trừ
                </h5>
                <div className="flex justify-between py-1 border-b border-rose-100">
                  <span className="text-slate-600">BHXH, BHYT, BHTN (10.5%):</span>
                  <span className="font-semibold text-rose-700">
                    -{formatCurrency(selectedSlip.record.insuranceDeduction)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-rose-100">
                  <span className="text-slate-600">Thuế thu nhập cá nhân (TNCN):</span>
                  <span className="font-semibold text-rose-700">
                    -{formatCurrency(selectedSlip.record.taxDeduction)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-rose-100">
                  <span className="text-slate-600">Phạt đi muộn / vi phạm:</span>
                  <span className="font-semibold text-rose-700">
                    -{formatCurrency(selectedSlip.record.latePenalty)}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-indigo-600 text-white flex items-center justify-between">
              <div>
                <span className="text-xs uppercase font-medium text-indigo-200 block">
                  Tổng Lương Thực Nhận (Net Salary)
                </span>
                <span className="text-xl font-bold">
                  {formatCurrency(selectedSlip.record.netSalary)}
                </span>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* =========================================================================
          MODAL IMPORT EXCEL BẢNG LƯƠNG
          ========================================================================= */}
      <Modal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        title="Nhập Dữ Liệu Bảng Lương Từ Excel"
        subtitle={`Kỳ lương mục tiêu: Tháng ${selectedMonth}/${selectedYear}`}
        size="xl"
      >
        <div className="space-y-5 text-xs">
          {/* Cảnh báo dữ liệu trùng nếu kỳ đã có bảng lương */}
          {hasExistingData && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold">Cảnh báo: Kỳ Tháng {selectedMonth}/{selectedYear} đã có {existingDataCount} bản ghi lương!</strong>
                <p className="mt-0.5 text-[11px] text-amber-700">
                  Bạn có thể chọn phương thức ghi đè toàn bộ hoặc cập nhật theo mã nhân viên bên dưới.
                </p>
              </div>
            </div>
          )}

          {/* Chọn File và Tải File Mẫu */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <div>
              <label className="block font-bold text-slate-800 mb-1">
                Tải lên tệp Excel bảng lương (.xlsx, .xls)
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
              />
            </div>

            <button
              type="button"
              onClick={() => downloadPayrollTemplate(selectedMonth, selectedYear, employees)}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-slate-700 font-medium transition cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Tải file Excel mẫu</span>
            </button>
          </div>

          {/* Preview và Ánh xạ cột khi đã chọn file */}
          {rawRows.length > 0 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Chọn Sheet:</label>
                  <select
                    value={selectedSheet}
                    onChange={(e) => {
                      setSelectedSheet(e.target.value);
                    }}
                    className="w-full py-1.5 px-2.5 border border-slate-200 rounded-lg bg-white"
                  >
                    {sheetNames.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Dòng tiêu đề (Header):</label>
                  <select
                    value={headerIndex}
                    onChange={(e) => {
                      const idx = Number(e.target.value);
                      setHeaderIndex(idx);
                      const newH = getHeadersFromRow(rawRows, idx);
                      setHeaders(newH);
                      const newM = autoDetectPayrollColumns(newH);
                      reparseRowsWithMapping(newM);
                    }}
                    className="w-full py-1.5 px-2.5 border border-slate-200 rounded-lg bg-white"
                  >
                    {rawRows.slice(0, 10).map((_, idx) => (
                      <option key={idx} value={idx}>Dòng {idx + 1}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Xử lý dữ liệu trùng:</label>
                  <div className="flex gap-2">
                    <label className="flex items-center gap-1 text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name="conflictPayroll"
                        value="upsert"
                        checked={conflictMode === 'upsert'}
                        onChange={() => setConflictMode('upsert')}
                      />
                      <span>Cập nhật (Upsert)</span>
                    </label>
                    <label className="flex items-center gap-1 text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name="conflictPayroll"
                        value="overwrite"
                        checked={conflictMode === 'overwrite'}
                        onChange={() => setConflictMode('overwrite')}
                      />
                      <span className="text-rose-600 font-semibold">Ghi đè (Overwrite)</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Ánh xạ cột */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <span className="font-bold text-slate-800 block">Ánh xạ cột Excel vào trường dữ liệu:</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-500 font-semibold">Mã nhân viên *:</label>
                    <select
                      value={mapping.employeeIdCol}
                      onChange={(e) => reparseRowsWithMapping({ ...mapping, employeeIdCol: e.target.value })}
                      className="w-full py-1 px-1.5 text-[11px] border border-slate-200 rounded bg-white"
                    >
                      <option value="">-- Chọn cột --</option>
                      {headers.map((h) => (<option key={h} value={h}>{h}</option>))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-500 font-semibold">Họ và tên:</label>
                    <select
                      value={mapping.fullNameCol}
                      onChange={(e) => reparseRowsWithMapping({ ...mapping, fullNameCol: e.target.value })}
                      className="w-full py-1 px-1.5 text-[11px] border border-slate-200 rounded bg-white"
                    >
                      <option value="">-- Tự động --</option>
                      {headers.map((h) => (<option key={h} value={h}>{h}</option>))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-500 font-semibold">Lương cơ bản:</label>
                    <select
                      value={mapping.baseSalaryCol}
                      onChange={(e) => reparseRowsWithMapping({ ...mapping, baseSalaryCol: e.target.value })}
                      className="w-full py-1 px-1.5 text-[11px] border border-slate-200 rounded bg-white"
                    >
                      <option value="">-- Mặc định --</option>
                      {headers.map((h) => (<option key={h} value={h}>{h}</option>))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-500 font-semibold">Lương thực lĩnh (NET):</label>
                    <select
                      value={mapping.netSalaryCol}
                      onChange={(e) => reparseRowsWithMapping({ ...mapping, netSalaryCol: e.target.value })}
                      className="w-full py-1 px-1.5 text-[11px] border border-slate-200 rounded bg-white"
                    >
                      <option value="">-- Tự động tính --</option>
                      {headers.map((h) => (<option key={h} value={h}>{h}</option>))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Tóm tắt kiểm tra dữ liệu */}
              <div className="flex items-center gap-3 text-xs">
                <span className="px-2.5 py-1 rounded bg-slate-100 font-semibold text-slate-700">
                  Tổng dòng: {parsedValidRows.length + parsedErrorRows.length}
                </span>
                <span className="px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                  Hợp lệ: {parsedValidRows.length} dòng
                </span>
                {parsedErrorRows.length > 0 && (
                  <span className="px-2.5 py-1 rounded bg-rose-50 text-rose-700 border border-rose-200 font-semibold">
                    Lỗi: {parsedErrorRows.length} dòng
                  </span>
                )}
              </div>

              {/* Bảng xem trước dữ liệu hợp lệ (5 dòng) */}
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-100 text-slate-700 font-semibold">
                    <tr>
                      <th className="py-1.5 px-2">Mã NV</th>
                      <th className="py-1.5 px-2">Họ tên</th>
                      <th className="py-1.5 px-2 text-right">Lương CB</th>
                      <th className="py-1.5 px-2 text-right">Phụ cấp</th>
                      <th className="py-1.5 px-2 text-right">Thưởng</th>
                      <th className="py-1.5 px-2 text-right">BHXH</th>
                      <th className="py-1.5 px-2 text-right font-bold text-indigo-700">Thực lĩnh</th>
                      <th className="py-1.5 px-2">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedValidRows.slice(0, 5).map((r, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-1.5 px-2 font-mono font-bold text-slate-800">{r.employeeId}</td>
                        <td className="py-1.5 px-2">{r.fullName}</td>
                        <td className="py-1.5 px-2 text-right">{r.baseSalary.toLocaleString('vi-VN')} đ</td>
                        <td className="py-1.5 px-2 text-right">{r.allowance.toLocaleString('vi-VN')} đ</td>
                        <td className="py-1.5 px-2 text-right text-emerald-600">+{r.bonus.toLocaleString('vi-VN')} đ</td>
                        <td className="py-1.5 px-2 text-right text-slate-500">-{r.insuranceDeduction.toLocaleString('vi-VN')} đ</td>
                        <td className="py-1.5 px-2 text-right font-bold text-indigo-700">{r.netSalary.toLocaleString('vi-VN')} đ</td>
                        <td className="py-1.5 px-2"><PaymentStatusBadge status={r.paymentStatus} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Danh sách lỗi nếu có */}
              {parsedErrorRows.length > 0 && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-1 max-h-32 overflow-y-auto">
                  <span className="font-bold text-rose-800 block text-[11px]">Chi tiết các dòng không hợp lệ:</span>
                  {parsedErrorRows.map((err, idx) => (
                    <div key={idx} className="text-[11px] text-rose-700 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>Dòng {err.rowNum} (Mã: {err.employeeId || 'trống'}): {err.errors.join(', ')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Báo cáo kết quả sau khi lưu */}
          {importReport && (
            <div
              className={`p-3.5 rounded-xl border flex items-center gap-2.5 ${importReport.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
            >
              {importReport.success ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
              )}
              <span className="font-semibold">{importReport.message}</span>
            </div>
          )}

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsImportModalOpen(false)}
              className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition"
            >
              Đóng
            </button>
            <button
              type="button"
              disabled={isImporting || parsedValidRows.length === 0}
              onClick={handleExecuteImportPayroll}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>{isImporting ? 'Đang lưu vào Supabase...' : `Xác Nhận Lưu (${parsedValidRows.length} dòng)`}</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* =========================================================================
          MODAL ĐỔI MÃ PIN TRA CỨU LƯƠNG NHÂN VIÊN
          ========================================================================= */}
      <Modal
        isOpen={!!pinModalEmp}
        onClose={() => setPinModalEmp(null)}
        title="Quản Lý Mã PIN Tra Cứu Lương"
        subtitle={`Nhân viên: ${pinModalEmp?.empName} (${pinModalEmp?.empId})`}
        size="sm"
      >
        {pinModalEmp && (
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-900 space-y-1">
              <p className="flex items-center gap-1 font-semibold">
                <ShieldCheck className="w-4 h-4 text-indigo-600" />
                Bảo vệ thu nhập cá nhân của người lao động
              </p>
              <p className="text-[11px] text-slate-500">
                Nhân viên phải nhập đúng mã PIN này mới có thể mở khóa xem phiếu lương trên trang tra cứu công khai.
              </p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Mã PIN tra cứu mới:
              </label>
              <input
                type="text"
                maxLength={6}
                value={newPinInput}
                onChange={(e) => setNewPinInput(e.target.value)}
                placeholder="Nhập 4-6 chữ số..."
                className="w-full py-2 px-3 border border-slate-200 rounded-lg font-mono font-bold text-sm tracking-widest focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Mã PIN mặc định: <strong>1234</strong>
              </span>
            </div>

            {pinSuccessMsg && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-[11px] flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>{pinSuccessMsg}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPinModalEmp(null)}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSavePin}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-sm transition"
              >
                Lưu Mã PIN
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
