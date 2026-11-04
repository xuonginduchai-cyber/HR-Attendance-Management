import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  FileSpreadsheet,
  UploadCloud,
  FileCheck2,
  AlertTriangle,
  Download,
  CheckCircle,
  XCircle,
  RefreshCw,
  ArrowRight,
  Database,
  Layers,
  Calendar,
  AlertCircle,
  Search,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  UserCheck,
  Users,
  Eye,
  Info,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/common/Card';
import { Modal } from '../../components/common/Modal';
import { isSupabaseConfigured } from '../../lib/supabase';
import {
  readExcelWorkbook,
  extractSheetRows,
  detectHeaderRowIndex,
  getHeadersFromRow,
  detectColumnMapping,
  parseAndValidateRows,
  exportErrorsToExcel,
  exportStandardTemplateExcel,
  exportCompact1RowTemplateExcel,
  detectMatrixDayColumns,
} from '../../utils/excelParser';
import {
  ExcelColumnMapping,
  ParsedAttendanceRow,
  ImportConflictMode,
  ImportConflictInfo,
  EmployeeSyncRecord,
  ImportReportSummary,
  EmployeeAttendanceMatrix,
} from '../../types';
import { AttendanceMatrixTable } from '../../components/attendance/AttendanceMatrixTable';
import { importService } from '../../services/importService';

export const ExcelImportPage: React.FC = () => {
  const { employees, importAttendanceData } = useData();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // 1. CHỌN THÁNG & NĂM (Đọc từ query params hoặc kỳ import gần nhất)
  const paramMonth = searchParams.get('month');
  const paramYear = searchParams.get('year');
  const [targetMonth, setTargetMonth] = useState<number>(() => {
    if (paramMonth) return Number(paramMonth);
    try {
      const saved = localStorage.getItem('hr_last_imported_period');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.month) return parsed.month;
      }
    } catch {}
    return 10;
  });
  const [targetYear, setTargetYear] = useState<number>(() => {
    if (paramYear) return Number(paramYear);
    try {
      const saved = localStorage.getItem('hr_last_imported_period');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.year) return parsed.year;
      }
    } catch {}
    return 2026;
  });

  // 2. FILE & WORKBOOK STATE
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [fileSize, setFileSize] = useState<number>(0);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState<string>('');
  const [rawRows, setRawRows] = useState<any[][]>([]);
  const [isMatrixFormat, setIsMatrixFormat] = useState<boolean>(false);

  // 3. CẤU HÌNH DÒNG TIÊU ĐỀ & ÁNH XẠ CỘT
  const [headerRowIdx, setHeaderRowIdx] = useState<number>(0);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<ExcelColumnMapping>({
    employeeIdCol: '',
    fullNameCol: '',
    departmentCol: '',
    startDateCol: '',
    positionCol: '',
    dateCol: '',
    checkInCol: '',
    checkOutCol: '',
    noteCol: '',
  });

  // 4. TRẠNG THÁI XỬ LÝ & KẾT QUẢ PARSE
  const [isReadingFile, setIsReadingFile] = useState<boolean>(false);
  const [parsedRows, setParsedRows] = useState<ParsedAttendanceRow[]>([]);
  const [employeesSyncList, setEmployeesSyncList] = useState<EmployeeSyncRecord[]>([]);
  const [parsedMatrices, setParsedMatrices] = useState<EmployeeAttendanceMatrix[]>([]);
  const [selectedMatrixEmpId, setSelectedMatrixEmpId] = useState<string>('');
  const [previewViewMode, setPreviewViewMode] = useState<'matrix' | 'rows'>('matrix');
  const [filterMode, setFilterMode] = useState<'all' | 'valid' | 'new_emp' | 'error'>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 15;

  const updateParsedData = (res: {
    attendanceRows: ParsedAttendanceRow[];
    employeesSyncList: EmployeeSyncRecord[];
    matrices: EmployeeAttendanceMatrix[];
    isMatrix: boolean;
  }) => {
    setParsedRows(res.attendanceRows);
    setEmployeesSyncList(res.employeesSyncList);
    setParsedMatrices(res.matrices || []);
    if (res.matrices && res.matrices.length > 0) {
      setSelectedMatrixEmpId((prev) => {
        const exists = res.matrices.some((m) => m.employeeId === prev);
        return exists ? prev : res.matrices[0].employeeId;
      });
    }
    if (res.isMatrix) {
      setPreviewViewMode('matrix');
    }
    setCurrentPage(1);
  };

  // 5. KIỂM TRA TRÙNG DỮ LIỆU CŨ TRONG THÁNG/NĂM
  const [conflictInfo, setConflictInfo] = useState<ImportConflictInfo>({
    hasExistingData: false,
    existingCount: 0,
    month: 11,
    year: 2026,
  });
  const [conflictMode, setConflictMode] = useState<ImportConflictMode>('upsert');

  // 6. XÁC NHẬN & TIẾN TRÌNH LƯU
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 7. BÁO CÁO SAU KHI IMPORT (MỤC II)
  const [postImportReport, setPostImportReport] = useState<ImportReportSummary | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportModalTab, setReportModalTab] = useState<'summary' | 'new_emps' | 'updated_emps' | 'errors'>('summary');

  // Kiểm tra dữ liệu cũ mỗi khi thay đổi Tháng hoặc Năm
  useEffect(() => {
    let isMounted = true;
    const checkConflict = async () => {
      try {
        const res = await importService.checkExistingAttendanceData(targetMonth, targetYear);
        if (isMounted) {
          setConflictInfo({
            hasExistingData: res.hasData,
            existingCount: res.count,
            month: targetMonth,
            year: targetYear,
          });
        }
      } catch (err) {
        console.warn('Không thể kiểm tra dữ liệu cũ:', err);
      }
    };

    checkConflict();
    return () => {
      isMounted = false;
    };
  }, [targetMonth, targetYear]);

  // Xử lý khi có file Excel mới được chọn
  const handleProcessFile = async (file: File) => {
    setSelectedFile(file);
    setFileName(file.name);
    setFileSize(file.size);
    setIsReadingFile(true);
    setPostImportReport(null);

    try {
      const { workbook, sheetNames: sheets } = await readExcelWorkbook(file);
      setSheetNames(sheets);

      const firstSheet = sheets[0] || '';
      setActiveSheet(firstSheet);

      const rows = extractSheetRows(workbook, firstSheet);
      setRawRows(rows);

      const detectedHeaderIdx = detectHeaderRowIndex(rows);
      setHeaderRowIdx(detectedHeaderIdx);

      const detectedHeaders = getHeadersFromRow(rows, detectedHeaderIdx);
      setHeaders(detectedHeaders);

      const matrixCheck = detectMatrixDayColumns(detectedHeaders);
      setIsMatrixFormat(matrixCheck.isMatrix);

      const detectedMapping = detectColumnMapping(detectedHeaders);
      setColumnMapping(detectedMapping);

      const parseResult = parseAndValidateRows(
        rows,
        detectedHeaderIdx,
        detectedMapping,
        detectedHeaders,
        employees,
        targetMonth,
        targetYear
      );
      updateParsedData(parseResult);
    } catch (err: any) {
      console.error('Lỗi khi đọc file Excel:', err);
      alert('Không thể đọc file Excel này: ' + (err.message || 'File hỏng hoặc sai định dạng'));
    } finally {
      setIsReadingFile(false);
    }
  };

  // Đổi sheet
  const handleSheetChange = async (sheetName: string) => {
    if (!selectedFile) return;
    setActiveSheet(sheetName);
    setIsReadingFile(true);

    try {
      const { workbook } = await readExcelWorkbook(selectedFile);
      const rows = extractSheetRows(workbook, sheetName);
      setRawRows(rows);

      const detectedHeaderIdx = detectHeaderRowIndex(rows);
      setHeaderRowIdx(detectedHeaderIdx);

      const detectedHeaders = getHeadersFromRow(rows, detectedHeaderIdx);
      setHeaders(detectedHeaders);

      const matrixCheck = detectMatrixDayColumns(detectedHeaders);
      setIsMatrixFormat(matrixCheck.isMatrix);

      const detectedMapping = detectColumnMapping(detectedHeaders);
      setColumnMapping(detectedMapping);

      const parseResult = parseAndValidateRows(
        rows,
        detectedHeaderIdx,
        detectedMapping,
        detectedHeaders,
        employees,
        targetMonth,
        targetYear
      );
      updateParsedData(parseResult);
    } catch (err) {
      console.error('Lỗi đổi sheet:', err);
    } finally {
      setIsReadingFile(false);
    }
  };

  // Thay đổi dòng tiêu đề
  const handleHeaderRowChange = (idx: number) => {
    setHeaderRowIdx(idx);
    const newHeaders = getHeadersFromRow(rawRows, idx);
    setHeaders(newHeaders);

    const matrixCheck = detectMatrixDayColumns(newHeaders);
    setIsMatrixFormat(matrixCheck.isMatrix);

    const newMapping = detectColumnMapping(newHeaders);
    setColumnMapping(newMapping);

    const parseResult = parseAndValidateRows(
      rawRows,
      idx,
      newMapping,
      newHeaders,
      employees,
      targetMonth,
      targetYear
    );
    updateParsedData(parseResult);
  };

  // Thay đổi ánh xạ từng cột thủ công
  const handleMappingFieldChange = (field: keyof ExcelColumnMapping, value: string) => {
    const updated = { ...columnMapping, [field]: value };
    setColumnMapping(updated);

    const parseResult = parseAndValidateRows(
      rawRows,
      headerRowIdx,
      updated,
      headers,
      employees,
      targetMonth,
      targetYear
    );
    updateParsedData(parseResult);
  };

  // Thay đổi Tháng hoặc Năm mục tiêu
  const handleTargetMonthYearChange = (newMonth: number, newYear: number) => {
    setTargetMonth(newMonth);
    setTargetYear(newYear);

    if (rawRows.length > 0 && headers.length > 0) {
      const parseResult = parseAndValidateRows(
        rawRows,
        headerRowIdx,
        columnMapping,
        headers,
        employees,
        newMonth,
        newYear
      );
      updateParsedData(parseResult);
    }
  };

  // Drag & drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleProcessFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleProcessFile(e.target.files[0]);
    }
  };

  // Dùng file test mẫu nhanh
  const handleUseSampleTestFile = async (type: 'valid' | 'new_emps' | 'matrix' | 'sample1' | 'errors') => {
    let sampleFileName = 'Bang_Cham_Cong_Hop_Le_Thang_11_2026.xlsx';
    let fileTargetMonth = 11;
    if (type === 'sample1') {
      sampleFileName = 'mẫu(1).xlsx';
      fileTargetMonth = 10;
    } else if (type === 'new_emps') {
      sampleFileName = 'Bang_Cham_Cong_Co_Nhan_Vien_Moi.xlsx';
      fileTargetMonth = 11;
    } else if (type === 'matrix') {
      sampleFileName = 'Cong_T10_Mau_Chuan_63_Cot.xlsx';
      fileTargetMonth = 10;
    } else if (type === 'errors') {
      sampleFileName = 'Bang_Cham_Cong_Co_Loi_Kiem_Thu.xlsx';
      fileTargetMonth = 11;
    }

    setTargetMonth(fileTargetMonth);

    try {
      setIsReadingFile(true);
      const res = await fetch(`/templates/${sampleFileName}`);
      if (!res.ok) {
        throw new Error('Chưa tìm thấy file mẫu trên server');
      }
      const blob = await res.blob();
      const file = new File([blob], sampleFileName, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      await handleProcessFile(file);
    } catch (err: any) {
      console.warn('Lỗi tải file mẫu:', err);
      alert('Đang tải file mẫu... Vui lòng thử lại sau vài giây!');
    } finally {
      setIsReadingFile(false);
    }
  };

  // Thống kê nhân viên
  const totalEmployeesRecognized = employeesSyncList.length;
  const newEmployeesToCreate = useMemo(
    () => employeesSyncList.filter((e) => e.action === 'create'),
    [employeesSyncList]
  );
  const updatedEmployees = useMemo(
    () => employeesSyncList.filter((e) => e.action === 'update'),
    [employeesSyncList]
  );
  const existingEmployees = useMemo(
    () => employeesSyncList.filter((e) => e.action === 'keep' || e.action === 'update'),
    [employeesSyncList]
  );

  // Nhân viên đang được chọn để xem trước bảng ma trận
  const selectedMatrix = useMemo(() => {
    if (parsedMatrices.length === 0) return null;
    return parsedMatrices.find((m) => m.employeeId === selectedMatrixEmpId) || parsedMatrices[0];
  }, [parsedMatrices, selectedMatrixEmpId]);

  // Thống kê dòng chấm công
  const totalRowsCount = parsedRows.length;
  const validRowsList = useMemo(() => parsedRows.filter((r) => r.isValid), [parsedRows]);
  const errorRowsList = useMemo(() => parsedRows.filter((r) => !r.isValid), [parsedRows]);
  const validCount = validRowsList.length;
  const errorCount = errorRowsList.length;

  // Lọc và tìm kiếm trong bảng Preview
  const displayRows = useMemo(() => {
    return parsedRows.filter((row) => {
      if (filterMode === 'valid' && !row.isValid) return false;
      if (filterMode === 'new_emp' && !row.isNewEmployee) return false;
      if (filterMode === 'error' && row.isValid) return false;

      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchId = row.employeeId.toLowerCase().includes(term);
        const matchName = row.fullName.toLowerCase().includes(term);
        const matchDate = row.date.toLowerCase().includes(term);
        return matchId || matchName || matchDate;
      }
      return true;
    });
  }, [parsedRows, filterMode, searchTerm]);

  // Phân trang
  const totalPages = Math.ceil(displayRows.length / pageSize) || 1;
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return displayRows.slice(start, start + pageSize);
  }, [displayRows, currentPage, pageSize]);

  // Xuất file lỗi ra Excel
  const handleExportErrors = () => {
    exportErrorsToExcel(errorRowsList, targetMonth, targetYear);
  };

  // Tải file mẫu chuẩn về máy
  const handleDownloadStandardTemplate = () => {
    exportStandardTemplateExcel(employees, targetMonth, targetYear);
  };

  // Mở modal xác nhận trước khi lưu
  const handleOpenConfirmModal = () => {
    if (validCount === 0) {
      alert('Không có dòng dữ liệu nào hợp lệ để nhập vào hệ thống!');
      return;
    }
    setIsConfirmModalOpen(true);
  };

  // Thực hiện ghi dữ liệu thật vào Supabase
  const handleExecuteImport = async () => {
    setIsSubmitting(true);
    try {
      const adminName = currentUser?.fullName || 'Nguyễn Quản Trị';

      const result = await importAttendanceData({
        month: targetMonth,
        year: targetYear,
        validRows: validRowsList,
        totalRows: totalRowsCount,
        errorRowsCount: errorCount,
        errorDetails: errorRowsList.map((e) => ({
          row: e.rowNum,
          error: e.errors.join('; '),
        })),
        file: selectedFile || undefined,
        importedByName: adminName,
        mode: conflictMode,
        employeesSyncList,
        matrices: parsedMatrices && parsedMatrices.length > 0 ? parsedMatrices : undefined,
      });

      if (result.reportSummary) {
        setPostImportReport(result.reportSummary);
        setIsReportModalOpen(true);
      }

      setIsConfirmModalOpen(false);

      try {
        localStorage.setItem(
          'hr_last_imported_period',
          JSON.stringify({ month: targetMonth, year: targetYear })
        );
      } catch {}

      setConflictInfo({
        hasExistingData: true,
        existingCount: validCount,
        month: targetMonth,
        year: targetYear,
      });
    } catch (err: any) {
      console.error('Lỗi khi ghi dữ liệu:', err);
      alert('Đã xảy ra lỗi khi lưu vào Supabase: ' + (err.message || 'Lỗi server'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-800">
              Nhập File Excel Chấm Công & Tự Động Tạo Nhân Viên
            </h2>
            {isSupabaseConfigured && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <Database className="w-3.5 h-3.5 text-emerald-600" />
                <span>Supabase Live</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Tự động nhận diện mã nhân viên, tạo hồ sơ nhân viên mới, cập nhật thông tin và lưu công an toàn vào Supabase
          </p>
        </div>

        {/* Nút hành động tải mẫu */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => exportCompact1RowTemplateExcel(employees, targetMonth, targetYear)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold shadow-sm transition cursor-pointer"
            title="Tải tệp Excel mẫu 1 dòng / nhân viên: Nạp siêu tốc cho > 700 NV (1 phát ăn ngay, tự sinh 9 chỉ tiêu)"
          >
            <Sparkles className="w-4 h-4 text-indigo-600 animate-pulse" />
            <span>Mẫu 1 Dòng / NV (Nạp Nhanh &gt;700 NV)</span>
          </button>
          <button
            onClick={handleDownloadStandardTemplate}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold shadow-sm transition cursor-pointer"
            title="Tải file mẫu Excel chuẩn 9 chỉ tiêu để điền dữ liệu"
          >
            <Download className="w-4 h-4 text-indigo-600" />
            <span>Tải Mẫu 9 Chỉ Tiêu (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* BƯỚC 1: CHỌN THÁNG, NĂM & CẢNH BÁO DỮ LIỆU ĐÃ TỒN TẠI */}
      <Card>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 flex-shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
                Bước 1: Chọn Kỳ Chấm Công Cần Nhập
              </span>
              <p className="text-xs text-slate-500">
                Dữ liệu ngày trong file Excel sẽ được đối chiếu chính xác với Tháng và Năm này
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Tháng</label>
              <select
                value={targetMonth}
                onChange={(e) =>
                  handleTargetMonthYearChange(parseInt(e.target.value, 10), targetYear)
                }
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    Tháng {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Năm</label>
              <select
                value={targetYear}
                onChange={(e) =>
                  handleTargetMonthYearChange(targetMonth, parseInt(e.target.value, 10))
                }
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {[2024, 2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>
                    Năm {y}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Cảnh báo xung đột nếu tháng/năm này đã có dữ liệu */}
        {conflictInfo.hasExistingData && (
          <div className="mt-4 p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-xs text-amber-900">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1.5">
              <div className="font-bold">
                Cảnh báo: Kỳ Tháng {targetMonth}/{targetYear} hiện đã có{' '}
                <span className="text-amber-800 underline font-black">
                  {conflictInfo.existingCount}
                </span>{' '}
                bản ghi chấm công trong cơ sở dữ liệu!
              </div>
              <p className="text-[11px] text-amber-800">
                Hãy lựa chọn phương thức xử lý khi bấm xác nhận nhập dữ liệu:
              </p>
              <div className="flex flex-wrap gap-4 pt-1">
                <label className="flex items-center gap-1.5 cursor-pointer font-medium">
                  <input
                    type="radio"
                    name="conflictMode"
                    value="upsert"
                    checked={conflictMode === 'upsert'}
                    onChange={() => setConflictMode('upsert')}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>
                    <strong>Bổ sung & Cập nhật (Khuyên dùng):</strong> Giữ nguyên ngày khác, cập nhật
                    nếu trùng (Mã NV, Ngày)
                  </span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer font-medium text-rose-700">
                  <input
                    type="radio"
                    name="conflictMode"
                    value="overwrite"
                    checked={conflictMode === 'overwrite'}
                    onChange={() => setConflictMode('overwrite')}
                    className="text-rose-600 focus:ring-rose-500"
                  />
                  <span>
                    <strong>Ghi đè toàn bộ:</strong> Xóa sạch dữ liệu cũ của Tháng {targetMonth}/
                    {targetYear} trước khi nạp dữ liệu mới
                  </span>
                </label>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* BƯỚC 2: CHỌN VÀ TẢI FILE EXCEL */}
      <Card>
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition ${
            dragActive
              ? 'border-indigo-500 bg-indigo-50/50'
              : 'border-slate-300 hover:border-slate-400 bg-slate-50/50'
          }`}
        >
          <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-100/70 text-indigo-600 flex items-center justify-center mb-3">
            <UploadCloud className="w-7 h-7" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">
            Kéo thả file Excel chấm công (.xlsx, .xls, .csv) vào đây
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-xl mx-auto">
            Hỗ trợ cả file danh sách theo dòng và file ma trận nhóm 9 dòng trích xuất từ máy chấm công (như file Công t10.xls). Tự động tạo hồ sơ nhân viên mới nếu mã chưa có trên hệ thống.
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
            <label className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm cursor-pointer transition inline-flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4" />
              <span>Duyệt File Từ Máy Tính</span>
              <input
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileInputChange}
                className="hidden"
              />
            </label>

            {/* Nút test file chuẩn mẫu(1).xlsx */}
            <button
              onClick={() => handleUseSampleTestFile('sample1')}
              className="px-3.5 py-2 bg-indigo-50 border border-indigo-300 hover:bg-indigo-100 text-indigo-800 rounded-lg text-xs font-semibold shadow-sm transition inline-flex items-center gap-1.5"
              title="Thử nghiệm nạp file mẫu chuẩn mẫu(1).xlsx với nhân viên S0076 (Bùi Quang Tùng - Utility Part)"
            >
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>Thử File Chuẩn mẫu(1).xlsx (S0076)</span>
            </button>

            {/* Nút test file có nhân viên mới */}
            <button
              onClick={() => handleUseSampleTestFile('new_emps')}
              className="px-3.5 py-2 bg-emerald-50 border border-emerald-300 hover:bg-emerald-100 text-emerald-800 rounded-lg text-xs font-semibold shadow-sm transition inline-flex items-center gap-1.5"
              title="Thử nghiệm tạo nhân viên mới (NV009, NV010) và cập nhật NV cũ"
            >
              <UserPlus className="w-4 h-4 text-emerald-600" />
              <span>Thử File Có NV Mới (Auto-create)</span>
            </button>

            {/* Nút test file ma trận kiểu Công T10 */}
            <button
              onClick={() => handleUseSampleTestFile('matrix')}
              className="px-3.5 py-2 bg-purple-50 border border-purple-200 hover:bg-purple-100 text-purple-800 rounded-lg text-xs font-semibold shadow-sm transition inline-flex items-center gap-1.5"
              title="Thử nghiệm cấu trúc ma trận 31 ngày nhóm 9 dòng như file Công T10"
            >
              <Layers className="w-4 h-4 text-purple-600" />
              <span>Thử File Kiểu Công T10 (31 ngày)</span>
            </button>

            {/* Nút test file có lỗi */}
            <button
              onClick={() => handleUseSampleTestFile('errors')}
              className="px-3.5 py-2 bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-semibold shadow-sm transition inline-flex items-center gap-1.5"
            >
              <AlertCircle className="w-4 h-4 text-rose-600" />
              <span>Thử File Có Lỗi (Test Case)</span>
            </button>
          </div>

          {fileName && (
            <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-medium border border-indigo-200">
              <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
              <span>
                {fileName} ({(fileSize / 1024).toFixed(1)} KB)
              </span>
              {isMatrixFormat && (
                <span className="ml-1 px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[10px] font-bold">
                  Ma trận 31 ngày (Công T10)
                </span>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* TRẠNG THÁI LOADING KHI ĐỌC FILE */}
      {isReadingFile && (
        <div className="p-8 text-center bg-white rounded-xl border border-slate-200 shadow-sm">
          <RefreshCw className="w-6 h-6 mx-auto animate-spin text-indigo-600 mb-2" />
          <p className="text-xs font-medium text-slate-600">
            Đang phân tích cấu trúc Workbook, đối chiếu danh bạ nhân viên và chuẩn hóa dữ liệu...
          </p>
        </div>
      )}

      {/* BƯỚC 3: THỐNG KÊ NHÂN VIÊN & DỮ LIỆU ĐỌC ĐƯỢC */}
      {parsedRows.length > 0 && !isReadingFile && (
        <div className="space-y-4">
          {/* Card Thống Kê Phân Loại Nhân Viên */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 bg-white rounded-xl border border-slate-200 text-xs shadow-xs">
              <div className="flex items-center gap-2 text-slate-500 font-medium mb-1">
                <Users className="w-4 h-4 text-indigo-600" />
                <span>Tổng số nhân viên</span>
              </div>
              <span className="text-2xl font-black text-slate-800">{totalEmployeesRecognized}</span>
              <span className="text-[11px] text-slate-400 block mt-0.5">nhận diện từ file</span>
            </div>

            <div className="p-4 bg-emerald-50/70 rounded-xl border border-emerald-200 text-xs shadow-xs">
              <div className="flex items-center gap-2 text-emerald-800 font-semibold mb-1">
                <UserPlus className="w-4 h-4 text-emerald-600" />
                <span>Nhân viên mới sẽ tạo</span>
              </div>
              <span className="text-2xl font-black text-emerald-700">
                {newEmployeesToCreate.length}
              </span>
              <span className="text-[11px] text-emerald-600 block mt-0.5">
                tự động lưu vào bảng employees
              </span>
            </div>

            <div className="p-4 bg-amber-50/70 rounded-xl border border-amber-200 text-xs shadow-xs">
              <div className="flex items-center gap-2 text-amber-800 font-semibold mb-1">
                <RefreshCw className="w-4 h-4 text-amber-600" />
                <span>Nhân viên cập nhật</span>
              </div>
              <span className="text-2xl font-black text-amber-700">{updatedEmployees.length}</span>
              <span className="text-[11px] text-amber-600 block mt-0.5">
                cập nhật họ tên / bộ phận
              </span>
            </div>

            <div className="p-4 bg-blue-50/70 rounded-xl border border-blue-200 text-xs shadow-xs">
              <div className="flex items-center gap-2 text-blue-800 font-semibold mb-1">
                <UserCheck className="w-4 h-4 text-blue-600" />
                <span>Nhân viên đã có sẵn</span>
              </div>
              <span className="text-2xl font-black text-blue-700">
                {existingEmployees.length - updatedEmployees.length}
              </span>
              <span className="text-[11px] text-blue-600 block mt-0.5">giữ nguyên thông tin</span>
            </div>
          </div>

          {/* Thẻ KPIs thống kê kết quả kiểm tra công */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div
              onClick={() => setFilterMode('all')}
              className={`p-4 bg-white rounded-xl border text-xs cursor-pointer transition ${
                filterMode === 'all'
                  ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-sm'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <span className="text-slate-400 block font-medium">Tổng số dòng công</span>
              <span className="text-2xl font-black text-slate-800">{totalRowsCount}</span>
              <span className="text-[11px] text-slate-500 block mt-1">Bấm để xem tất cả</span>
            </div>

            <div
              onClick={() => setFilterMode('valid')}
              className={`p-4 bg-emerald-50/50 rounded-xl border text-xs cursor-pointer transition ${
                filterMode === 'valid'
                  ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-sm bg-emerald-50'
                  : 'border-emerald-200 hover:border-emerald-300'
              }`}
            >
              <span className="text-emerald-700 block font-semibold">Dòng công hợp lệ</span>
              <span className="text-2xl font-black text-emerald-700">{validCount}</span>
              <span className="text-[11px] text-emerald-600 block mt-1">
                {(totalRowsCount > 0 ? (validCount / totalRowsCount) * 100 : 0).toFixed(0)}% sẵn
                sàng nạp
              </span>
            </div>

            <div
              onClick={() => setFilterMode('error')}
              className={`p-4 bg-rose-50/50 rounded-xl border text-xs cursor-pointer transition ${
                filterMode === 'error'
                  ? 'border-rose-500 ring-2 ring-rose-500/20 shadow-sm bg-rose-50'
                  : 'border-rose-200 hover:border-rose-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-rose-700 font-semibold">Dòng phát hiện lỗi</span>
                {errorCount > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExportErrors();
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-white px-2 py-0.5 rounded border border-rose-300 hover:bg-rose-100 shadow-xs"
                  >
                    <Download className="w-3 h-3" />
                    <span>Tải file lỗi (.xlsx)</span>
                  </button>
                )}
              </div>
              <span className="text-2xl font-black text-rose-700 mt-1 block">{errorCount}</span>
              <span className="text-[11px] text-rose-600 block mt-1">
                {errorCount === 0 ? 'Không có lỗi nào' : 'Bấm để lọc xem riêng dòng lỗi'}
              </span>
            </div>
          </div>

          {/* Bảng xem trước dữ liệu (Preview Table) */}
          <Card
            title={`Bản Xem Trước Dữ Liệu: ${fileName}`}
            subtitle={`Đang xem ${displayRows.length} dòng (${
              filterMode === 'all'
                ? 'Tất cả'
                : filterMode === 'valid'
                ? 'Chỉ dòng hợp lệ'
                : filterMode === 'new_emp'
                ? 'Chỉ nhân viên mới'
                : 'Chỉ dòng lỗi'
            })`}
            action={
              <div className="flex items-center gap-2">
                {errorCount > 0 && (
                  <button
                    onClick={handleExportErrors}
                    className="inline-flex items-center gap-1 px-3 py-2 bg-white border border-rose-300 hover:bg-rose-50 text-rose-700 rounded-xl text-xs font-semibold shadow-sm transition"
                  >
                    <Download className="w-4 h-4 text-rose-600" />
                    <span>Tải Lỗi ({errorCount})</span>
                  </button>
                )}

                <button
                  onClick={handleOpenConfirmModal}
                  disabled={validCount === 0 || isSubmitting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-sm transition"
                >
                  <FileCheck2 className="w-4 h-4" />
                  <span>
                    Xác Nhận Nhập ({validCount} dòng công & {newEmployeesToCreate.length} NV mới)
                  </span>
                </button>
              </div>
            }
          >
            {/* Chuyển đổi chế độ xem trước: Bảng ma trận ngang vs Danh sách dòng */}
            {parsedMatrices.length > 0 && (
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-semibold mb-4 w-fit">
                <button
                  type="button"
                  onClick={() => setPreviewViewMode('matrix')}
                  className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer ${
                    previewViewMode === 'matrix'
                      ? 'bg-white text-indigo-700 shadow-xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Ma Trận Ngang (Chuẩn File Mẫu Excel)</span>
                  <span className="px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[10px] font-bold">
                    {parsedMatrices.length} nhân viên
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewViewMode('rows')}
                  className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer ${
                    previewViewMode === 'rows'
                      ? 'bg-white text-indigo-700 shadow-xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Danh Sách Từng Dòng Điểm Danh ({totalRowsCount})</span>
                </button>
              </div>
            )}

            {previewViewMode === 'matrix' && selectedMatrix ? (
              <div className="space-y-4">
                {/* Thanh chọn nhân viên xem trước */}
                <div className="p-3.5 bg-slate-50 border border-slate-200/90 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Users className="w-4 h-4 text-indigo-600" />
                    <span className="text-xs font-bold text-slate-700">Chọn nhân viên xem trước:</span>
                    <select
                      value={selectedMatrixEmpId}
                      onChange={(e) => setSelectedMatrixEmpId(e.target.value)}
                      className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 shadow-xs focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      {parsedMatrices.map((m) => (
                        <option key={m.employeeId} value={m.employeeId}>
                          {m.employeeId} - {m.fullName} ({m.department}) - {m.rows.length} chỉ tiêu
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2 text-xs flex-wrap">
                    <span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold">
                      {selectedMatrix.rows.length} chỉ tiêu
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
                      Tổng giờ: {selectedMatrix.summary.totalWorkHours}h
                    </span>
                    {selectedMatrix.summary.overtime150 > 0 && (
                      <span className="px-2.5 py-1 rounded-full bg-purple-50 text-purple-800 border border-purple-200 font-bold">
                        TC 150%: {selectedMatrix.summary.overtime150}h
                      </span>
                    )}
                    {selectedMatrix.summary.overtime210 > 0 && (
                      <span className="px-2.5 py-1 rounded-full bg-violet-50 text-violet-800 border border-violet-200 font-bold">
                        TC 210%: {selectedMatrix.summary.overtime210}h
                      </span>
                    )}
                    {selectedMatrix.summary.nightAllowance30 > 0 && (
                      <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-800 border border-blue-200 font-bold">
                        Phụ cấp đêm: {selectedMatrix.summary.nightAllowance30}h
                      </span>
                    )}
                  </div>
                </div>

                {/* Bảng ma trận ngang chuẩn file mẫu */}
                <AttendanceMatrixTable
                  matrix={selectedMatrix}
                  employeeInfo={{
                    stt: parsedMatrices.findIndex((m) => m.employeeId === selectedMatrix.employeeId) + 1,
                    id: selectedMatrix.employeeId,
                    fullName: selectedMatrix.fullName,
                    department: selectedMatrix.department,
                    startDate: selectedMatrix.startDate,
                  }}
                  hideHeaderCard={false}
                  title={`BẢN XEM TRƯỚC BẢNG CÔNG: ${selectedMatrix.fullName} (${selectedMatrix.employeeId})`}
                />
              </div>
            ) : (
              <div>
                {/* Thanh công cụ tìm kiếm & lọc nhanh */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div className="relative max-w-xs w-full">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Tìm mã NV, họ tên, ngày..."
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-slate-500 font-medium">Lọc:</span>
                    <button
                      onClick={() => {
                        setFilterMode('all');
                        setCurrentPage(1);
                      }}
                      className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                        filterMode === 'all'
                          ? 'bg-slate-800 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Tất cả ({totalRowsCount})
                    </button>
                    <button
                      onClick={() => {
                        setFilterMode('valid');
                        setCurrentPage(1);
                      }}
                      className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                        filterMode === 'valid'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      }`}
                    >
                      Hợp lệ ({validCount})
                    </button>
                    <button
                      onClick={() => {
                        setFilterMode('new_emp');
                        setCurrentPage(1);
                      }}
                      className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                        filterMode === 'new_emp'
                          ? 'bg-purple-600 text-white'
                          : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                      }`}
                    >
                      NV mới ({newEmployeesToCreate.length} NV)
                    </button>
                    <button
                      onClick={() => {
                        setFilterMode('error');
                        setCurrentPage(1);
                      }}
                      className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                        filterMode === 'error'
                          ? 'bg-rose-600 text-white'
                          : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                      }`}
                    >
                      Có lỗi ({errorCount})
                    </button>
                  </div>
                </div>

                {/* Bảng dữ liệu */}
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-3">Dòng</th>
                        <th className="py-2.5 px-3">Mã NV</th>
                        <th className="py-2.5 px-3">Họ và Tên</th>
                        <th className="py-2.5 px-3">Bộ Phận</th>
                        <th className="py-2.5 px-3">Ngày</th>
                        <th className="py-2.5 px-3">Giờ Vào</th>
                        <th className="py-2.5 px-3">Giờ Ra</th>
                        <th className="py-2.5 px-3">Hồ Sơ Nhân Viên</th>
                        <th className="py-2.5 px-3">Trạng Thái Công</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedRows.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-8 text-center text-slate-400">
                            Không có dòng dữ liệu nào khớp với bộ lọc hiện tại.
                          </td>
                        </tr>
                      ) : (
                        paginatedRows.map((row) => (
                          <tr
                            key={row.rowNum}
                            className={
                              row.isValid
                                ? 'hover:bg-slate-50/80 transition'
                                : 'bg-rose-50/50 hover:bg-rose-50 transition'
                            }
                          >
                            <td className="py-2.5 px-3 font-mono text-slate-400">#{row.rowNum}</td>
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                              {row.employeeId || <span className="text-rose-500 italic">(Trống)</span>}
                            </td>
                            <td className="py-2.5 px-3 text-slate-700">{row.fullName}</td>
                            <td className="py-2.5 px-3 text-slate-600">{row.department || '-'}</td>
                            <td className="py-2.5 px-3 text-slate-600 font-mono">
                              {row.date || <span className="text-rose-500 italic">(Trống)</span>}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-medium text-slate-800">
                              {row.checkIn || <span className="text-rose-500 italic">--:--</span>}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-medium text-slate-800">
                              {row.checkOut || <span className="text-slate-400">--:--</span>}
                            </td>
                            <td className="py-2.5 px-3">
                              {row.isNewEmployee ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                  <UserPlus className="w-3 text-purple-600" />
                                  <span>NV Mới (Tự tạo)</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700">
                                  <UserCheck className="w-3 text-emerald-600" />
                                  <span>Đã có hồ sơ</span>
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3">
                              {row.isValid ? (
                                <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                                  <CheckCircle className="w-3.5 h-3.5" />
                                  <span>Hợp lệ ({row.status === 'late' ? 'Muộn' : 'Chuẩn'})</span>
                                </span>
                              ) : (
                                <div className="space-y-0.5">
                                  {row.errors.map((err, errIdx) => (
                                    <div
                                      key={errIdx}
                                      className="flex items-center gap-1 text-rose-600 font-medium text-[11px]"
                                    >
                                      <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
                                      <span>{err}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Phân trang */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4 text-xs text-slate-500">
                    <span>
                      Hiển thị dòng {(currentPage - 1) * pageSize + 1} -{' '}
                      {Math.min(currentPage * pageSize, displayRows.length)} trong tổng số{' '}
                      {displayRows.length} dòng
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="px-3 py-1 font-semibold text-slate-700">
                        Trang {currentPage} / {totalPages}
                      </span>
                      <button
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* MODAL XÁC NHẬN NHẬP DỮ LIỆU CHÍNH THỨC */}
      <Modal
        isOpen={isConfirmModalOpen}
        onClose={() => !isSubmitting && setIsConfirmModalOpen(false)}
        title="Xác Nhận Lưu Dữ Liệu Vào Supabase"
      >
        <div className="space-y-4 text-xs text-slate-600">
          <p>
            Bạn đang chuẩn bị nạp dữ liệu chấm công từ file <strong>{fileName}</strong> vào cơ sở dữ
            liệu chính thức của hệ thống.
          </p>

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Kỳ chấm công:</span>
              <span className="font-bold text-slate-800">
                Tháng {targetMonth}/{targetYear}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Nhân viên mới sẽ tự động tạo hồ sơ:</span>
              <span className="font-bold text-purple-700">
                {newEmployeesToCreate.length} nhân viên
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Nhân viên cập nhật thông tin:</span>
              <span className="font-bold text-amber-700">
                {updatedEmployees.length} nhân viên
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Tổng số dòng công hợp lệ sẽ nạp:</span>
              <span className="font-bold text-emerald-600">{validCount} dòng</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Số dòng lỗi bỏ qua:</span>
              <span className="font-bold text-rose-600">{errorCount} dòng</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Chế độ ghi đè công:</span>
              <span className="font-bold text-indigo-600">
                {conflictMode === 'overwrite' ? 'Ghi đè kỳ này' : 'Bổ sung / Cập nhật trùng'}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              onClick={() => setIsConfirmModalOpen(false)}
              disabled={isSubmitting}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition"
            >
              Hủy Bỏ
            </button>
            <button
              onClick={handleExecuteImport}
              disabled={isSubmitting}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-semibold transition inline-flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Đang đồng bộ nhân viên & lưu công...</span>
                </>
              ) : (
                <>
                  <FileCheck2 className="w-4 h-4" />
                  <span>Xác Nhận Nạp Dữ Liệu</span>
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL BÁO CÁO SAU KHI IMPORT (MỤC II) */}
      <Modal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        title="Báo Cáo Kết Quả Nhập Dữ Liệu Chấm Công & Nhân Sự"
        size="lg"
      >
        {postImportReport && (
          <div className="space-y-4 text-xs">
            {/* 6 Chỉ số báo cáo bắt buộc theo Mục II */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                <span className="text-slate-400 block text-[11px]">Tổng số NV nhận diện</span>
                <span className="text-xl font-black text-slate-800">
                  {postImportReport.totalEmployeesRecognized}
                </span>
              </div>
              <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-center">
                <span className="text-blue-600 block text-[11px]">Số NV đã tồn tại</span>
                <span className="text-xl font-black text-blue-700">
                  {postImportReport.existingEmployeesCount}
                </span>
              </div>
              <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 text-center">
                <span className="text-purple-600 block text-[11px]">Số NV mới được tạo</span>
                <span className="text-xl font-black text-purple-700">
                  {postImportReport.newEmployeesCreatedCount}
                </span>
              </div>
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-center">
                <span className="text-amber-600 block text-[11px]">Số NV cập nhật thông tin</span>
                <span className="text-xl font-black text-amber-700">
                  {postImportReport.updatedEmployeesCount}
                </span>
              </div>
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-center">
                <span className="text-emerald-600 block text-[11px]">Số NV nhập công thành công</span>
                <span className="text-xl font-black text-emerald-700">
                  {postImportReport.successfulAttendanceEmployeesCount}
                </span>
              </div>
              <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-center">
                <span className="text-rose-600 block text-[11px]">Số NV nhập thất bại</span>
                <span className="text-xl font-black text-rose-700">
                  {postImportReport.failedAttendanceEmployeesCount}
                </span>
              </div>
              <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-center col-span-2">
                <span className="text-rose-600 block text-[11px]">Tổng số dòng dữ liệu lỗi</span>
                <span className="text-xl font-black text-rose-700">
                  {postImportReport.totalErrorRows}
                </span>
              </div>
            </div>

            {/* Tabs chuyển đổi xem danh sách chi tiết */}
            <div className="flex border-b border-slate-200 pt-2 text-xs font-semibold gap-2">
              <button
                onClick={() => setReportModalTab('summary')}
                className={`pb-2 px-3 border-b-2 transition ${
                  reportModalTab === 'summary'
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Tổng Quan
              </button>
              <button
                onClick={() => setReportModalTab('new_emps')}
                className={`pb-2 px-3 border-b-2 transition ${
                  reportModalTab === 'new_emps'
                    ? 'border-purple-600 text-purple-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                NV Mới Được Tạo ({postImportReport.newEmployeesList.length})
              </button>
              <button
                onClick={() => setReportModalTab('updated_emps')}
                className={`pb-2 px-3 border-b-2 transition ${
                  reportModalTab === 'updated_emps'
                    ? 'border-amber-600 text-amber-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                NV Được Cập Nhật ({postImportReport.updatedEmployeesList.length})
              </button>
            </div>

            {/* Tab 1: Tổng quan */}
            {reportModalTab === 'summary' && (
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <p className="text-slate-700 font-medium">
                  Đợt nhập dữ liệu đã được xử lý an toàn theo quy trình giao dịch kiểm soát tính toàn vẹn:
                </p>
                <ul className="list-disc list-inside space-y-1 text-slate-600">
                  <li>
                    Đã tạo thành công <strong>{postImportReport.newEmployeesCreatedCount}</strong> hồ
                    sơ nhân viên mới vào cơ sở dữ liệu.
                  </li>
                  <li>
                    Đã cập nhật thông tin cho <strong>{postImportReport.updatedEmployeesCount}</strong>{' '}
                    nhân viên đã có sẵn.
                  </li>
                  <li>
                    Đã lưu và liên kết dữ liệu chấm công cho{' '}
                    <strong>{postImportReport.successfulAttendanceEmployeesCount}</strong> nhân viên
                    qua khóa ngoại <code>employee_id</code>.
                  </li>
                  <li>Không tạo tài khoản đăng nhập Supabase Auth cho nhân viên.</li>
                  <li>Không ảnh hưởng hay xóa dữ liệu của các kỳ trước.</li>
                </ul>
              </div>
            )}

            {/* Tab 2: Danh sách nhân viên mới được tạo */}
            {reportModalTab === 'new_emps' && (
              <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-60 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold sticky top-0">
                    <tr>
                      <th className="py-2 px-3">Mã NV</th>
                      <th className="py-2 px-3">Họ và Tên</th>
                      <th className="py-2 px-3">Bộ Phận</th>
                      <th className="py-2 px-3">Ngày Vào Làm</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {postImportReport.newEmployeesList.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-slate-400">
                          Không có nhân viên mới nào trong file này.
                        </td>
                      </tr>
                    ) : (
                      postImportReport.newEmployeesList.map((emp) => (
                        <tr key={emp.id} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-mono font-bold text-indigo-700">{emp.id}</td>
                          <td className="py-2 px-3 font-medium text-slate-800">{emp.fullName}</td>
                          <td className="py-2 px-3 text-slate-600">{emp.department}</td>
                          <td className="py-2 px-3 font-mono text-slate-600">{emp.startDate}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Tab 3: Danh sách nhân viên được cập nhật */}
            {reportModalTab === 'updated_emps' && (
              <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-60 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold sticky top-0">
                    <tr>
                      <th className="py-2 px-3">Mã NV</th>
                      <th className="py-2 px-3">Họ và Tên</th>
                      <th className="py-2 px-3">Bộ Phận</th>
                      <th className="py-2 px-3">Các Trường Đã Thay Đổi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {postImportReport.updatedEmployeesList.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-slate-400">
                          Không có nhân viên nào bị thay đổi thông tin.
                        </td>
                      </tr>
                    ) : (
                      postImportReport.updatedEmployeesList.map((emp) => (
                        <tr key={emp.id} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-mono font-bold text-amber-700">{emp.id}</td>
                          <td className="py-2 px-3 font-medium text-slate-800">{emp.fullName}</td>
                          <td className="py-2 px-3 text-slate-600">{emp.department}</td>
                          <td className="py-2 px-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                              {emp.changedFields?.join(', ') || 'Thông tin'}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Footer hành động */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    navigate(`/admin/attendance?month=${targetMonth}&year=${targetYear}`)
                  }
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-xs"
                >
                  Xem Bảng Chấm Công Kỳ Này
                </button>
                <button
                  onClick={() => navigate('/admin/employees')}
                  className="px-3.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold shadow-xs"
                >
                  Xem Danh Sách Nhân Viên
                </button>
              </div>

              <button
                onClick={() => setIsReportModalOpen(false)}
                className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold"
              >
                Đóng Báo Cáo
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
