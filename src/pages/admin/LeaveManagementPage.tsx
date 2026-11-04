import React, { useState, useMemo, useRef } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Upload,
  FileSpreadsheet,
  Check,
  Search,
  Filter,
  Trash2,
  Edit,
  Download,
  History,
  ChevronDown,
  X,
  Sparkles,
  Layers,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { EmployeeLeaveBalanceRecord, ImportConflictMode } from '../../types';
import { Card } from '../../components/common/Card';
import { Modal } from '../../components/common/Modal';
import {
  exportLeaveBalanceTemplateExcel,
  parseEmployeeLeaveBalanceExcel,
  readExcelWorkbook,
  extractSheetRows,
  detectHeaderRowIndex,
} from '../../utils/excelParser';

export const LeaveManagementPage: React.FC = () => {
  const { currentUser } = useAuth();
  const {
    employees,
    employeeLeaveBalances,
    importEmployeeLeaveBalances,
    deleteEmployeeLeaveBalances,
    deleteEmployeeLeaveBalancesByPeriod,
    deleteEmployeeLeaveBalancesByYear,
  } = useData();

  // Bộ lọc năm & tháng
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>('all');
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Phân trang
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 25;

  // Lựa chọn dòng dữ liệu để xóa
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(new Set());
  const [isDeleteDropdownOpen, setIsDeleteDropdownOpen] = useState(false);

  // Modal Xóa
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    mode: 'selected' | 'month' | 'year' | 'single';
    recordId?: string;
    recordName?: string;
  }>({ isOpen: false, mode: 'selected' });
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string>('');

  // Modal Sửa trực tiếp
  const [editModal, setEditModal] = useState<{
    isOpen: boolean;
    record: EmployeeLeaveBalanceRecord | null;
  }>({ isOpen: false, record: null });
  const [editForm, setEditForm] = useState({
    leaveBalance2025: 0,
    leaveGenerated2026: 0,
    remainingDays: 0,
  });

  // Modal Nạp Excel Phép Tồn
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importYear, setImportYear] = useState<number>(2026);
  const [importMonth, setImportMonth] = useState<number | 'all'>('all');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isParsingExcel, setIsParsingExcel] = useState(false);
  const [parseResult, setParseResult] = useState<{
    validRows: EmployeeLeaveBalanceRecord[];
    errorRows: { rowNum: number; error: string; raw: any }[];
    totalRows: number;
    duplicates: string[];
  } | null>(null);
  const [conflictMode, setConflictMode] = useState<ImportConflictMode>('upsert');
  const [isSubmittingImport, setIsSubmittingImport] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Danh sách phòng ban
  const availableDepartments = useMemo(() => {
    const set = new Set<string>();
    employeeLeaveBalances.forEach((r) => {
      if (r.department) set.add(r.department);
    });
    employees.forEach((e) => {
      if (e.department) set.add(e.department);
    });
    ['Phòng Kỹ thuật', 'Phòng Kinh doanh', 'Phòng Nhân sự', 'Phòng Kế toán', 'Phòng Marketing', 'Utility Part'].forEach((d) =>
      set.add(d)
    );
    return Array.from(set);
  }, [employeeLeaveBalances, employees]);

  // Dữ liệu đã lọc theo Năm, Tháng, Phòng ban, Ô tìm kiếm
  const filteredRecords = useMemo(() => {
    return employeeLeaveBalances.filter((rec) => {
      // 1. Lọc theo Năm
      if (rec.year !== selectedYear) return false;

      // 2. Lọc theo Tháng
      if (selectedMonth !== 'all') {
        if (rec.month !== null && rec.month !== undefined && rec.month !== selectedMonth) {
          return false;
        }
      }

      // 3. Lọc theo Phòng ban
      if (selectedDept !== 'all' && rec.department !== selectedDept) {
        return false;
      }

      // 4. Ô tìm kiếm theo Mã hoặc Tên
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const codeMatch = rec.employeeCode.toLowerCase().includes(query);
        const nameMatch = (rec.employeeName || '').toLowerCase().includes(query);
        if (!codeMatch && !nameMatch) return false;
      }

      return true;
    });
  }, [employeeLeaveBalances, selectedYear, selectedMonth, selectedDept, searchTerm]);

  // Phân trang an toàn
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const paginatedRecords = useMemo(() => {
    const start = (validCurrentPage - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, validCurrentPage, pageSize]);

  // Tổng hợp KPI
  const kpiStats = useMemo(() => {
    const totalEmps = filteredRecords.length;
    let sumBalance2025 = 0;
    let sumGenerated2026 = 0;
    let sumRemaining = 0;

    filteredRecords.forEach((r) => {
      sumBalance2025 += Number(r.leaveBalance2025) || 0;
      sumGenerated2026 += Number(r.leaveGenerated2026) || 0;
      sumRemaining += Number(r.remainingDays) || 0;
    });

    return {
      totalEmps,
      sumBalance2025: Math.round(sumBalance2025 * 10) / 10,
      sumGenerated2026: Math.round(sumGenerated2026 * 10) / 10,
      sumRemaining: Math.round(sumRemaining * 10) / 10,
    };
  }, [filteredRecords]);

  // Toggle chọn tất cả trên trang hiện tại
  const isAllCurrentPageSelected =
    paginatedRecords.length > 0 && paginatedRecords.every((r) => selectedRecordIds.has(r.id || r.employeeCode));

  const handleToggleSelectAll = () => {
    setSelectedRecordIds((prev) => {
      const next = new Set(prev);
      if (isAllCurrentPageSelected) {
        paginatedRecords.forEach((r) => next.delete(r.id || r.employeeCode));
      } else {
        paginatedRecords.forEach((r) => next.add(r.id || r.employeeCode));
      }
      return next;
    });
  };

  const handleToggleSelectRow = (id: string) => {
    setSelectedRecordIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Mở modal sửa trực tiếp
  const handleOpenEdit = (rec: EmployeeLeaveBalanceRecord) => {
    setEditModal({ isOpen: true, record: rec });
    setEditForm({
      leaveBalance2025: rec.leaveBalance2025 || 0,
      leaveGenerated2026: rec.leaveGenerated2026 || 0,
      remainingDays: rec.remainingDays || 0,
    });
  };

  const handleSaveEdit = async () => {
    if (!editModal.record) return;
    const rec = editModal.record;
    const updated: EmployeeLeaveBalanceRecord = {
      ...rec,
      leaveBalance2025: Number(editForm.leaveBalance2025) || 0,
      leaveGenerated2026: Number(editForm.leaveGenerated2026) || 0,
      remainingDays: Number(editForm.remainingDays) || 0,
    };

    await importEmployeeLeaveBalances({
      records: [updated],
      month: rec.month,
      year: rec.year,
      mode: 'upsert',
      importedByName: currentUser?.fullName || 'Admin',
    });

    setActionSuccessMessage(`Đã cập nhật số ngày phép cho nhân viên ${rec.employeeName} (${rec.employeeCode}) thành công!`);
    setEditModal({ isOpen: false, record: null });
  };

  // Xử lý Xóa an toàn
  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      if (deleteModal.mode === 'single' && deleteModal.recordId) {
        await deleteEmployeeLeaveBalances([deleteModal.recordId]);
        setActionSuccessMessage(`Đã xóa bản ghi phép tồn của ${deleteModal.recordName || deleteModal.recordId}!`);
        setSelectedRecordIds((prev) => {
          const next = new Set(prev);
          next.delete(deleteModal.recordId!);
          return next;
        });
      } else if (deleteModal.mode === 'selected') {
        const ids = Array.from(selectedRecordIds);
        await deleteEmployeeLeaveBalances(ids);
        setActionSuccessMessage(`Đã xóa thành công ${ids.length} bản ghi phép tồn đã chọn!`);
        setSelectedRecordIds(new Set());
      } else if (deleteModal.mode === 'month') {
        const targetMonth = selectedMonth === 'all' ? null : selectedMonth;
        await deleteEmployeeLeaveBalancesByPeriod(targetMonth, selectedYear);
        setActionSuccessMessage(
          `Đã xóa toàn bộ dữ liệu phép tồn ${targetMonth ? `Tháng ${targetMonth}/` : ''}${selectedYear}!`
        );
        setSelectedRecordIds(new Set());
      } else if (deleteModal.mode === 'year') {
        await deleteEmployeeLeaveBalancesByYear(selectedYear);
        setActionSuccessMessage(`Đã xóa toàn bộ dữ liệu phép tồn của cả Năm ${selectedYear}!`);
        setSelectedRecordIds(new Set());
      }
      setDeleteModal({ isOpen: false, mode: 'selected' });
    } catch (err: any) {
      alert('Lỗi khi xóa dữ liệu phép tồn: ' + (err?.message || 'Vui lòng thử lại'));
    } finally {
      setIsDeleting(false);
    }
  };

  // Xử lý tệp Excel nạp vào
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFile(file);
    setIsParsingExcel(true);
    setParseResult(null);

    try {
      const { workbook, sheetNames } = await readExcelWorkbook(file);
      const firstSheet = sheetNames[0] || '';
      const rows = extractSheetRows(workbook, firstSheet);
      const headerIdx = detectHeaderRowIndex(rows);
      const res = parseEmployeeLeaveBalanceExcel(
        rows,
        headerIdx,
        importYear,
        importMonth === 'all' ? null : importMonth
      );

      // Kiểm tra trùng lặp mã nhân viên trong file
      const seen = new Set<string>();
      const duplicates: string[] = [];
      res.validRows.forEach((r) => {
        const code = r.employeeCode.toUpperCase();
        if (seen.has(code)) duplicates.push(code);
        else seen.add(code);
      });

      setParseResult({
        ...res,
        duplicates,
      });
    } catch (err: any) {
      alert('Lỗi khi đọc file Excel: ' + (err?.message || 'Định dạng tệp không được hỗ trợ'));
    } finally {
      setIsParsingExcel(false);
    }
  };

  // Lưu dữ liệu Excel vào Supabase
  const handleExecuteImport = async () => {
    if (!parseResult || parseResult.validRows.length === 0) return;
    setIsSubmittingImport(true);

    try {
      const res = await importEmployeeLeaveBalances({
        records: parseResult.validRows,
        month: importMonth === 'all' ? null : importMonth,
        year: importYear,
        mode: conflictMode,
        importedByName: currentUser?.fullName || 'Admin',
      });

      if (res.success) {
        setActionSuccessMessage(`Nạp thành công ${res.count} bản ghi phép tồn vào hệ thống Supabase!`);
        setIsImportModalOpen(false);
        setImportFile(null);
        setParseResult(null);
        setSelectedYear(importYear);
        if (importMonth !== 'all') setSelectedMonth(importMonth);
      } else {
        alert('Lỗi khi nạp dữ liệu: ' + (res.error || 'Vui lòng kiểm tra lại'));
      }
    } catch (err: any) {
      alert('Lỗi khi lưu dữ liệu: ' + (err?.message || 'Vui lòng thử lại'));
    } finally {
      setIsSubmittingImport(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Thông báo thao tác thành công */}
      {actionSuccessMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-xs text-emerald-800 shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{actionSuccessMessage}</span>
          </div>
          <button
            onClick={() => setActionSuccessMessage('')}
            className="p-1 hover:bg-emerald-100 rounded-lg text-emerald-700 transition cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* TOP HEADER: Tiêu đề & Các nút chức năng đồng bộ 100% Quản Lý Công */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-indigo-600 shrink-0" />
            <h1 className="text-xl font-black text-slate-800 tracking-tight">
              Quản Lý Phép Tồn
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Quản lý số ngày phép tồn, phép phát sinh và số ngày còn lại theo năm và tháng của nhân viên
          </p>
        </div>

        {/* Cụm nút thao tác */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Nút Nạp Excel Phép Tồn */}
          <button
            onClick={() => {
              setImportYear(selectedYear);
              setImportMonth(selectedMonth);
              setIsImportModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-indigo-600/30 transition cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>Nạp Excel Phép Tồn</span>
          </button>

          {/* Nút Tải File Mẫu Excel */}
          <button
            onClick={() => exportLeaveBalanceTemplateExcel(employees, selectedMonth === 'all' ? null : selectedMonth, selectedYear)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-emerald-600/30 transition cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Tải File Mẫu Excel</span>
          </button>

          {/* Dropdown Xóa Dữ Liệu */}
          <div className="relative">
            <button
              onClick={() => setIsDeleteDropdownOpen(!isDeleteDropdownOpen)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              <Trash2 className="w-4 h-4 text-rose-600" />
              <span>Xóa Dữ Liệu</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            {isDeleteDropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl z-30 py-2 text-xs">
                <button
                  disabled={selectedRecordIds.size === 0}
                  onClick={() => {
                    setIsDeleteDropdownOpen(false);
                    setDeleteModal({ isOpen: true, mode: 'selected' });
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-rose-50 text-rose-700 font-semibold disabled:opacity-40 disabled:hover:bg-transparent flex items-center gap-2 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xóa nhân viên đã chọn ({selectedRecordIds.size})</span>
                </button>
                <button
                  onClick={() => {
                    setIsDeleteDropdownOpen(false);
                    setDeleteModal({ isOpen: true, mode: 'month' });
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-slate-50 text-slate-700 font-semibold flex items-center gap-2 cursor-pointer"
                >
                  <CalendarDays className="w-3.5 h-3.5 text-indigo-600" />
                  <span>
                    Xóa theo {selectedMonth === 'all' ? `toàn bộ các tháng (${selectedYear})` : `Tháng ${selectedMonth}/${selectedYear}`}
                  </span>
                </button>
                <button
                  onClick={() => {
                    setIsDeleteDropdownOpen(false);
                    setDeleteModal({ isOpen: true, mode: 'year' });
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-slate-50 text-slate-700 font-semibold flex items-center gap-2 cursor-pointer border-t border-slate-100"
                >
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
                  <span>Xóa toàn bộ cả Năm {selectedYear}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Tổng Nhân Viên Có Phép
            </div>
            <div className="text-xl font-black text-slate-800 mt-0.5">
              {kpiStats.totalEmps} <span className="text-xs font-semibold text-slate-400">người</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
            <CalendarDays className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Phép Tồn Năm 2025
            </div>
            <div className="text-xl font-black text-amber-700 mt-0.5">
              {kpiStats.sumBalance2025} <span className="text-xs font-semibold text-slate-400">ngày</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Phép Phát Sinh 2026
            </div>
            <div className="text-xl font-black text-blue-700 mt-0.5">
              {kpiStats.sumGenerated2026} <span className="text-xs font-semibold text-slate-400">ngày</span>
            </div>
          </div>
        </div>

        <div className="bg-emerald-50/80 p-4 rounded-2xl border border-emerald-200 shadow-xs flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-700 shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
              Tổng Số Ngày Còn Lại
            </div>
            <div className="text-2xl font-black text-emerald-800 mt-0.5">
              {kpiStats.sumRemaining} <span className="text-xs font-bold text-emerald-700">ngày</span>
            </div>
          </div>
        </div>
      </div>

      {/* FILTER BAR: Năm, Tháng, Phòng ban, Ô tra cứu mã NV */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Cụm bộ lọc kỳ */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Chọn Năm */}
            <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
              <span className="font-bold text-slate-500">Năm:</span>
              <select
                value={selectedYear}
                onChange={(e) => {
                  setSelectedYear(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value={2026}>2026</option>
                <option value={2025}>2025</option>
                <option value={2027}>2027</option>
                <option value={2024}>2024</option>
                <option value={2028}>2028</option>
              </select>
            </div>

            {/* Chọn Tháng */}
            <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
              <span className="font-bold text-slate-500">Tháng:</span>
              <select
                value={selectedMonth}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedMonth(val === 'all' ? 'all' : Number(val));
                  setCurrentPage(1);
                }}
                className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="all">Tất cả tháng</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>Tháng {m}</option>
                ))}
              </select>
            </div>

            {/* Chọn Phòng ban */}
            <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
              <span className="font-bold text-slate-500">Phòng ban:</span>
              <select
                value={selectedDept}
                onChange={(e) => {
                  setSelectedDept(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="all">Tất cả bộ phận</option>
                {availableDepartments.map((dept) => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Ô nhập mã nhân viên hoặc tên tra cứu */}
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Tra cứu mã NV hoặc tên..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* BẢNG THEO DÕI PHÉP TỒN: 6 CỘT CHUẨN + CHECKBOX & THAO TÁC */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Table Header Bar */}
        <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-800">
              Bảng Theo Dõi Phép Tồn: {selectedMonth === 'all' ? `Cả Năm ${selectedYear}` : `Tháng ${selectedMonth}/${selectedYear}`}
            </h2>
            <p className="text-[11px] text-slate-500">
              Hiển thị {filteredRecords.length} hồ sơ phép tồn • Chọn từng ô hoặc bấm &quot;Chọn tất cả&quot; để xóa hàng loạt
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleSelectAll}
              className="px-3 py-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer"
            >
              {isAllCurrentPageSelected ? 'Bỏ chọn trang này' : 'Chọn tất cả trang này'}
            </button>
          </div>
        </div>

        {/* Responsive Table for Desktop */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={isAllCurrentPageSelected}
                    onChange={handleToggleSelectAll}
                    className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                </th>
                <th className="py-3 px-3 w-14 text-center">STT</th>
                <th className="py-3 px-4">1. Mã Nhân Viên</th>
                <th className="py-3 px-4">2. Họ và Tên</th>
                <th className="py-3 px-4">3. Bộ Phận</th>
                <th className="py-3 px-4 text-center">4. Phép Tồn 2025</th>
                <th className="py-3 px-4 text-center">5. Phát Sinh 2026</th>
                <th className="py-3 px-4 text-center font-black text-emerald-800">6. Số Ngày Còn Lại</th>
                <th className="py-3 px-4 text-center w-28">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {paginatedRecords.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <div className="space-y-2">
                      <AlertCircle className="w-7 h-7 mx-auto text-slate-300" />
                      <div className="font-semibold">Không tìm thấy dữ liệu nhân viên</div>
                      <p className="text-[11px] text-slate-400">
                        Vui lòng kiểm tra lại bộ lọc hoặc bấm &quot;Nạp Excel Phép Tồn&quot; để thêm dữ liệu.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedRecords.map((rec, idx) => {
                  const rowId = rec.id || `${rec.employeeCode}_${rec.year}`;
                  const isChecked = selectedRecordIds.has(rowId);
                  const stt = (validCurrentPage - 1) * pageSize + idx + 1;

                  return (
                    <tr
                      key={rowId}
                      className={`hover:bg-slate-50/80 transition ${
                        isChecked ? 'bg-indigo-50/40' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSelectRow(rowId)}
                          className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>

                      {/* STT */}
                      <td className="py-3 px-3 text-center font-bold text-slate-400">
                        {stt}
                      </td>

                      {/* 1. Mã nhân viên */}
                      <td className="py-3 px-4 font-mono font-bold text-indigo-700">
                        {rec.employeeCode}
                      </td>

                      {/* 2. Tên */}
                      <td className="py-3 px-4 font-bold text-slate-800">
                        {rec.employeeName}
                      </td>

                      {/* 3. Bộ phận */}
                      <td className="py-3 px-4 text-slate-600">
                        {rec.department || '-'}
                      </td>

                      {/* 4. Phép tồn năm 2025 */}
                      <td className="py-3 px-4 text-center font-bold text-slate-800">
                        {rec.leaveBalance2025}
                      </td>

                      {/* 5. Phép phát sinh 2026 */}
                      <td className="py-3 px-4 text-center font-bold text-indigo-700">
                        {rec.leaveGenerated2026}
                      </td>

                      {/* 6. Số ngày còn lại (Nổi bật theo yêu cầu) */}
                      <td className="py-3 px-4 text-center">
                        <span className="inline-block px-3 py-1 bg-emerald-100 text-emerald-800 font-black text-sm rounded-lg border border-emerald-200">
                          {rec.remainingDays}
                        </span>
                      </td>

                      {/* Thao tác */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleOpenEdit(rec)}
                            title="Sửa số ngày phép"
                            className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition cursor-pointer"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() =>
                              setDeleteModal({
                                isOpen: true,
                                mode: 'single',
                                recordId: rowId,
                                recordName: rec.employeeName,
                              })
                            }
                            title="Xóa bản ghi này"
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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

        {/* Phân trang */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
            <div>
              Trang {validCurrentPage} / {totalPages} (Tổng {filteredRecords.length} nhân viên)
            </div>
            <div className="flex items-center gap-1">
              <button
                disabled={validCurrentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition cursor-pointer"
              >
                Trước
              </button>
              <button
                disabled={validCurrentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition cursor-pointer"
              >
                Sau
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL SỬA PHÉP TỒN NHÂN VIÊN */}
      <Modal
        isOpen={editModal.isOpen}
        onClose={() => setEditModal({ isOpen: false, record: null })}
        title={`Cập Nhật Phép Tồn: ${editModal.record?.employeeName} (${editModal.record?.employeeCode})`}
        subtitle="Chỉnh sửa số ngày phép tồn, phát sinh và còn lại"
        size="md"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Phép Tồn 2025:</label>
              <input
                type="number"
                step="0.5"
                value={editForm.leaveBalance2025}
                onChange={(e) =>
                  setEditForm({ ...editForm, leaveBalance2025: parseFloat(e.target.value) || 0 })
                }
                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-800"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Phát Sinh 2026:</label>
              <input
                type="number"
                step="0.5"
                value={editForm.leaveGenerated2026}
                onChange={(e) =>
                  setEditForm({ ...editForm, leaveGenerated2026: parseFloat(e.target.value) || 0 })
                }
                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-indigo-700"
              />
            </div>
            <div>
              <label className="block font-bold text-emerald-800 mb-1">Số Ngày Còn Lại:</label>
              <input
                type="number"
                step="0.5"
                value={editForm.remainingDays}
                onChange={(e) =>
                  setEditForm({ ...editForm, remainingDays: parseFloat(e.target.value) || 0 })
                }
                className="w-full px-3 py-2 bg-emerald-50 border border-emerald-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-black text-emerald-800"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setEditModal({ isOpen: false, record: null })}
              className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold hover:bg-slate-50 cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSaveEdit}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition cursor-pointer"
            >
              Lưu Thay Đổi
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL NẠP EXCEL PHÉP TỒN (QUY TRÌNH 4 BƯỚC) */}
      <Modal
        isOpen={isImportModalOpen}
        onClose={() => {
          setIsImportModalOpen(false);
          setImportFile(null);
          setParseResult(null);
        }}
        title="Nạp Dữ Liệu Phép Tồn Từ Excel"
        subtitle="Hỗ trợ file Excel .xlsx, .xls với cấu trúc chuẩn 6 cột"
        size="xl"
      >
        <div className="space-y-4">
          {/* Bước 1: Chọn kỳ áp dụng */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-700">Kỳ áp dụng:</span>
              <select
                value={importYear}
                onChange={(e) => setImportYear(Number(e.target.value))}
                className="bg-white border border-slate-200 px-2.5 py-1 rounded-lg font-bold text-slate-800"
              >
                <option value={2026}>Năm 2026</option>
                <option value={2025}>Năm 2025</option>
                <option value={2027}>Năm 2027</option>
              </select>

              <select
                value={importMonth}
                onChange={(e) => setImportMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="bg-white border border-slate-200 px-2.5 py-1 rounded-lg font-bold text-slate-800"
              >
                <option value="all">Cả năm (Không chia tháng)</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>Tháng {m}</option>
                ))}
              </select>
            </div>

            {/* Chế độ ghi đè / cập nhật */}
            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-semibold">Chế độ nạp:</span>
              <select
                value={conflictMode}
                onChange={(e) => setConflictMode(e.target.value as ImportConflictMode)}
                className="bg-white border border-slate-200 px-2.5 py-1 rounded-lg font-bold text-slate-800 text-xs"
              >
                <option value="upsert">Cập nhật bổ sung (Upsert)</option>
                <option value="overwrite">Ghi đè kỳ này (Overwrite)</option>
              </select>
            </div>
          </div>

          {/* Bước 2: Chọn tệp Excel */}
          <div className="border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-2xl p-6 text-center space-y-2 bg-slate-50/50 transition">
            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx, .xls"
              onChange={handleFileChange}
              className="hidden"
            />
            <FileSpreadsheet className="w-10 h-10 text-emerald-600 mx-auto" />
            <div className="text-xs font-bold text-slate-700">
              {importFile ? importFile.name : 'Chọn file Excel từ máy tính của bạn'}
            </div>
            <p className="text-[11px] text-slate-400">
              Cột bắt buộc: Mã nhân viên | Tên | Bộ phận | Phép tồn năm 2025 | Phép phát sinh năm 2026 | Số ngày còn lại
            </p>
            <div className="pt-2 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
              >
                {importFile ? 'Chọn lại file khác' : 'Chọn tệp Excel...'}
              </button>
              <button
                type="button"
                onClick={() => exportLeaveBalanceTemplateExcel(employees, importMonth === 'all' ? null : importMonth, importYear)}
                className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Tải file mẫu chuẩn</span>
              </button>
            </div>
          </div>

          {/* Bước 3: Xem trước dữ liệu */}
          {isParsingExcel && (
            <div className="p-8 text-center text-slate-500 text-xs font-semibold">
              Đang phân tích dữ liệu tệp Excel...
            </div>
          )}

          {parseResult && (
            <div className="space-y-3">
              {/* Cảnh báo / Thông tin phân tích */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="font-bold text-slate-800">
                  Xem trước: {parseResult.validRows.length} dòng hợp lệ
                </div>
                {parseResult.duplicates.length > 0 && (
                  <div className="text-amber-600 font-semibold flex items-center gap-1 text-[11px]">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>Trùng lặp {parseResult.duplicates.length} mã nhân viên (đã tự động giữ bản ghi sau cùng)</span>
                  </div>
                )}
              </div>

              {parseResult.errorRows.length > 0 && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs space-y-1 max-h-28 overflow-y-auto">
                  <div className="font-bold flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Lỗi kiểm tra dữ liệu ({parseResult.errorRows.length} dòng không hợp lệ):</span>
                  </div>
                  {parseResult.errorRows.map((err, i) => (
                    <div key={i} className="text-[11px]">• Dòng {err.rowNum}: {err.error}</div>
                  ))}
                </div>
              )}

              {/* Bảng xem trước tối đa 10 dòng đầu */}
              <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="py-2 px-3">Mã NV</th>
                      <th className="py-2 px-3">Họ Tên</th>
                      <th className="py-2 px-3">Bộ Phận</th>
                      <th className="py-2 px-3 text-center">Tồn 2025</th>
                      <th className="py-2 px-3 text-center">Phát Sinh 2026</th>
                      <th className="py-2 px-3 text-center text-emerald-800 font-bold">Còn Lại</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parseResult.validRows.slice(0, 10).map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="py-1.5 px-3 font-mono font-bold text-indigo-700">{r.employeeCode}</td>
                        <td className="py-1.5 px-3 font-semibold text-slate-800">{r.employeeName}</td>
                        <td className="py-1.5 px-3 text-slate-600">{r.department}</td>
                        <td className="py-1.5 px-3 text-center font-bold">{r.leaveBalance2025}</td>
                        <td className="py-1.5 px-3 text-center font-bold text-indigo-700">{r.leaveGenerated2026}</td>
                        <td className="py-1.5 px-3 text-center font-black text-emerald-700">{r.remainingDays}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parseResult.validRows.length > 10 && (
                <div className="text-[11px] text-slate-400 text-center">
                  Và {parseResult.validRows.length - 10} dòng khác...
                </div>
              )}
            </div>
          )}

          {/* Bước 4: Nút xác nhận lưu */}
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                setIsImportModalOpen(false);
                setImportFile(null);
                setParseResult(null);
              }}
              className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold hover:bg-slate-50 cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={!parseResult || parseResult.validRows.length === 0 || isSubmittingImport}
              onClick={handleExecuteImport}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>
                {isSubmittingImport
                  ? 'Đang lưu vào Supabase...'
                  : `Xác Nhận Nhập (${parseResult?.validRows.length || 0} bản ghi)`}
              </span>
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL XÁC NHẬN XÓA DỮ LIỆU AN TOÀN */}
      <Modal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, mode: 'selected' })}
        title="Xác Nhận Xóa Dữ Liệu Phép Tồn"
        subtitle="Hệ thống chỉ xóa dữ liệu phép tồn trong phạm vi đã chọn, tuyệt đối không xóa hồ sơ nhân viên trong danh mục nhân sự."
        size="md"
      >
        <div className="space-y-4">
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-xs text-rose-900">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <strong className="font-bold block">
                {deleteModal.mode === 'single' &&
                  `Bạn có chắc chắn muốn xóa bản ghi phép tồn của ${deleteModal.recordName}?`}
                {deleteModal.mode === 'selected' &&
                  `Bạn có chắc chắn muốn xóa ${selectedRecordIds.size} bản ghi phép tồn đã chọn?`}
                {deleteModal.mode === 'month' &&
                  `Bạn có chắc chắn muốn xóa toàn bộ dữ liệu phép tồn ${
                    selectedMonth === 'all' ? `các tháng trong năm ${selectedYear}` : `Tháng ${selectedMonth}/${selectedYear}`
                  }?`}
                {deleteModal.mode === 'year' &&
                  `Bạn có chắc chắn muốn xóa toàn bộ dữ liệu phép tồn của cả Năm ${selectedYear}?`}
              </strong>
              <p className="text-[11px] text-rose-700">
                Thao tác này sẽ đồng bộ trực tiếp lên cơ sở dữ liệu Supabase. Hồ sơ nhân viên trong danh mục nhân sự vẫn được bảo toàn.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => setDeleteModal({ isOpen: false, mode: 'selected' })}
              className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold hover:bg-slate-50 cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={handleConfirmDelete}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>{isDeleting ? 'Đang xóa...' : 'Xác Nhận Xóa'}</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
