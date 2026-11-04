import * as XLSX from 'xlsx';
import {
  ExcelColumnMapping,
  ParsedAttendanceRow,
  Employee,
  AttendanceStatus,
  AttendanceRecord,
  EmployeeSyncRecord,
  ExcelPayrollMapping,
  ParsedPayrollRow,
  ExcelLeaveMapping,
  ParsedLeaveRow,
  EmployeeAttendanceMatrix,
  EmployeeAttendanceMatrixRow,
  EmployeeLeaveBalanceRecord,
} from '../types';

/**
 * Đọc file Excel từ File object và trả về workbook cùng danh sách tên sheet
 */
export const readExcelWorkbook = async (
  file: File
): Promise<{ workbook: XLSX.WorkBook; sheetNames: string[] }> => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {
    type: 'array',
    cellDates: true,
    raw: false,
  });

  return {
    workbook,
    sheetNames: workbook.SheetNames || [],
  };
};

/**
 * Trích xuất dữ liệu của một sheet thành mảng 2 chiều (rows)
 */
export const extractSheetRows = (
  workbook: XLSX.WorkBook,
  sheetName: string
): any[][] => {
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) return [];

  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    raw: false,
    defval: '',
  });

  return rawRows;
};

/**
 * Tự động phát hiện dòng tiêu đề (Header Row Index)
 * Quét 10 dòng đầu để tìm dòng có nhiều từ khóa cột nhất
 */
export const detectHeaderRowIndex = (rows: any[][]): number => {
  if (!rows || rows.length === 0) return 0;

  const headerKeywords = [
    'mã',
    'nhân viên',
    'họ',
    'tên',
    'ngày',
    'bộ phận',
    'phòng',
    'giờ vào',
    'giờ ra',
    'check in',
    'check out',
    'vào',
    'ra',
    'date',
    'employee',
    'id',
  ];

  let bestIndex = 0;
  let maxMatches = -1;

  const checkLimit = Math.min(rows.length, 10);
  for (let i = 0; i < checkLimit; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;

    let score = 0;
    for (const cell of row) {
      const text = String(cell || '').trim().toLowerCase();
      if (!text) continue;

      // Nếu ô là số ngày từ 1..31 trong bảng ma trận
      const num = parseInt(text, 10);
      if (!isNaN(num) && num >= 1 && num <= 31 && String(num) === text) {
        score += 2;
        continue;
      }

      for (const kw of headerKeywords) {
        if (text.includes(kw)) {
          score += 1;
          break;
        }
      }
    }

    if (score > maxMatches && score >= 2) {
      maxMatches = score;
      bestIndex = i;
    }
  }

  return bestIndex;
};

/**
 * Lấy danh sách tiêu đề cột từ dòng tiêu đề đã chọn
 */
export const getHeadersFromRow = (
  rows: any[][],
  headerIndex: number
): string[] => {
  if (!rows || !rows[headerIndex]) return [];
  const rawHeader = rows[headerIndex];

  return rawHeader.map((col: any, idx: number) => {
    const name = String(col || '').trim();
    return name || `Cột ${String.fromCharCode(65 + (idx % 26))}${idx >= 26 ? Math.floor(idx / 26) : ''}`;
  });
};

/**
 * Kiểm tra xem tệp Excel có phải định dạng ma trận (Matrix Format như Công t10.xls)
 * Có ít nhất 15 cột ngày (1..31)
 */
export const detectMatrixDayColumns = (
  headers: string[]
): { isMatrix: boolean; dayColumns: { day: number; colIdx: number }[] } => {
  const dayColumns: { day: number; colIdx: number }[] = [];

  headers.forEach((h, colIdx) => {
    const clean = String(h || '').trim();
    const num = parseInt(clean, 10);
    // Nhận diện cột ngày 1..31 hoặc Ngày 01..31
    if (!isNaN(num) && num >= 1 && num <= 31) {
      if (clean === String(num) || clean === String(num).padStart(2, '0') || clean.toLowerCase() === `ngày ${num}`) {
        dayColumns.push({ day: num, colIdx });
      }
    }
  });

  return {
    isMatrix: dayColumns.length >= 15,
    dayColumns,
  };
};

/**
 * Tự động ánh xạ cột Excel sang các trường dữ liệu hệ thống
 */
export const detectColumnMapping = (headers: string[]): ExcelColumnMapping => {
  const mapping: ExcelColumnMapping = {
    employeeIdCol: '',
    fullNameCol: '',
    departmentCol: '',
    startDateCol: '',
    positionCol: '',
    dateCol: '',
    checkInCol: '',
    checkOutCol: '',
    noteCol: '',
  };

  headers.forEach((h) => {
    const clean = h.trim().toLowerCase();

    // Mã nhân viên
    if (
      !mapping.employeeIdCol &&
      /mã\s*(nhân\s*viên|nv|cc|chấm\s*công|số)?|employee\s*id|emp\s*id|^id$|^manv$/i.test(clean)
    ) {
      mapping.employeeIdCol = h;
    }
    // Họ và tên
    else if (
      !mapping.fullNameCol &&
      /họ\s*(và|&)?\s*tên|tên\s*(nhân\s*viên|nv)?|full\s*name|^name$/i.test(clean)
    ) {
      mapping.fullNameCol = h;
    }
    // Bộ phận / Phòng ban
    else if (
      !mapping.departmentCol &&
      /bộ\s*phận|phòng\s*ban|department|dept|phòng$/i.test(clean)
    ) {
      mapping.departmentCol = h;
    }
    // Ngày vào làm
    else if (
      !mapping.startDateCol &&
      /ngày\s*vào(\s*làm)?|ngày\s*bắt\s*đầu|start\s*date|hire\s*date/i.test(clean)
    ) {
      mapping.startDateCol = h;
    }
    // Chức vụ
    else if (
      !mapping.positionCol &&
      /chức\s*vụ|vị\s*trí|position|title|chức\s*danh/i.test(clean)
    ) {
      mapping.positionCol = h;
    }
    // Ngày chấm công
    else if (
      !mapping.dateCol &&
      /ngày(\s*chấm\s*công|\s*điểm\s*danh|\s*làm\s*việc)?|^date$|work\s*date/i.test(clean)
    ) {
      mapping.dateCol = h;
    }
    // Giờ vào
    else if (
      !mapping.checkInCol &&
      /giờ\s*vào|vào|check\s*in|time\s*in|^in$/i.test(clean)
    ) {
      mapping.checkInCol = h;
    }
    // Giờ ra
    else if (
      !mapping.checkOutCol &&
      /giờ\s*ra|ra|check\s*out|time\s*out|^out$/i.test(clean)
    ) {
      mapping.checkOutCol = h;
    }
    // Ghi chú
    else if (
      !mapping.noteCol &&
      /ghi\s*chú|lý\s*do|note|notes/i.test(clean)
    ) {
      mapping.noteCol = h;
    }
  });

  return mapping;
};

/**
 * Chuẩn hóa giá trị ngày từ ô Excel (hỗ trợ Serial Number, ISO string, DD/MM/YYYY)
 */
export const parseExcelDate = (val: any): string => {
  if (val === null || val === undefined || val === '') return '';

  if (val instanceof Date && !isNaN(val.getTime())) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Số serial ngày của Excel (ví dụ: 46330)
  if (typeof val === 'number') {
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (!isNaN(date.getTime())) {
      const y = date.getUTCFullYear();
      const m = String(date.getUTCMonth() + 1).padStart(2, '0');
      const d = String(date.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  const s = String(val).trim();

  // YYYY-MM-DD hoặc YYYY/MM/DD
  const isoMatch = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, '0');
    const d = isoMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // DD/MM/YYYY hoặc DD-MM-YYYY
  const dmyMatch = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, '0');
    const m = dmyMatch[2].padStart(2, '0');
    const y = dmyMatch[3];
    return `${y}-${m}-${d}`;
  }

  return s;
};

/**
 * Helper tính giờ kết thúc làm việc dựa vào giờ bắt đầu và số giờ làm (tính cả 1h nghỉ trưa nếu làm >= 5h)
 */
export const formatTimeAfterHours = (startTime: string, hours: number): string => {
  const [h, m] = startTime.split(':').map(Number);
  const lunchMinutes = hours >= 5 ? 60 : 0;
  const totalMinutes = Math.round(h * 60 + m + hours * 60 + lunchMinutes);
  const endH = String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0');
  const endM = String(totalMinutes % 60).padStart(2, '0');
  return `${endH}:${endM}`;
};

/**
 * Phân tích ô dữ liệu trong bảng chấm công 1 dòng/nhân viên:
 * Hỗ trợ: số giờ làm (8, 7.5, 4), chữ X (8h), khoảng giờ (08:00-17:30), làm + tăng ca (8+2), ký hiệu phép (P, KP, CT, L).
 */
export const parseCompactDayCell = (
  val: any
): {
  workHours: number;
  checkIn: string | null;
  checkOut: string | null;
  leaveCode: string | null;
  otHours: number;
} => {
  if (val === null || val === undefined) {
    return { workHours: 0, checkIn: null, checkOut: null, leaveCode: null, otHours: 0 };
  }
  const str = String(val).trim();
  if (str === '' || str === '-' || str === '0') {
    return { workHours: 0, checkIn: null, checkOut: null, leaveCode: null, otHours: 0 };
  }

  // Chữ 'X' hoặc 'x': Ký hiệu chuẩn ngày làm việc đủ 8h trong bảng công Việt Nam
  if (str.toUpperCase() === 'X') {
    return { workHours: 8, checkIn: '08:00', checkOut: '17:30', leaveCode: null, otHours: 0 };
  }

  // 1. Dạng số giờ làm việc: 8, 8.5, 4, 8h, 7,5
  const numMatch = str.match(/^(\d+(?:[.,]\d+)?)\s*(?:h|giờ)?$/i);
  if (numMatch) {
    const hours = parseFloat(numMatch[1].replace(',', '.'));
    if (!isNaN(hours) && hours > 0) {
      const ot = hours > 8 ? Math.round((hours - 8) * 10) / 10 : 0;
      return {
        workHours: Math.min(hours, 24),
        checkIn: '08:00',
        checkOut: formatTimeAfterHours('08:00', hours),
        leaveCode: null,
        otHours: ot,
      };
    }
  }

  // 2. Dạng khoảng giờ vào - ra: 08:00-17:30 hoặc 8:00-17:00
  const rangeMatch = str.match(/^(\d{1,2}:\d{2})\s*[-–~]\s*(\d{1,2}:\d{2})$/);
  if (rangeMatch) {
    const inTime = parseExcelTime(rangeMatch[1]);
    const outTime = parseExcelTime(rangeMatch[2]);
    const [hIn, mIn] = inTime.split(':').map(Number);
    const [hOut, mOut] = outTime.split(':').map(Number);
    const diff = Math.max(0, hOut * 60 + mOut - (hIn * 60 + mIn));
    const netMinutes = diff > 300 ? diff - 60 : diff;
    const hours = Math.round((netMinutes / 60) * 10) / 10;
    return {
      workHours: hours,
      checkIn: inTime,
      checkOut: outTime,
      leaveCode: null,
      otHours: hours > 8 ? hours - 8 : 0,
    };
  }

  // 3. Dạng làm việc + tăng ca kết hợp: "8+2", "8 + 2h", "8(OT2)"
  const comboMatch = str.match(/^(\d+(?:[.,]\d+)?)\s*(?:\+|\(ot|\(tc)?\s*(\d+(?:[.,]\d+)?)/i);
  if (comboMatch) {
    const baseH = parseFloat(comboMatch[1].replace(',', '.'));
    const otH = parseFloat(comboMatch[2].replace(',', '.'));
    return {
      workHours: baseH,
      checkIn: '08:00',
      checkOut: formatTimeAfterHours('08:00', baseH + otH),
      leaveCode: null,
      otHours: otH,
    };
  }

  // 4. Ký hiệu nghỉ phép: P (phép), KP (không phép), CT (công tác), L (lễ), F (off), RO (nghỉ ca)
  if (/^[A-Za-z0-9_]{1,6}$/.test(str)) {
    const upper = str.toUpperCase();
    if (upper === 'X') {
      return { workHours: 8, checkIn: '08:00', checkOut: '17:30', leaveCode: null, otHours: 0 };
    }
    return {
      workHours: 0,
      checkIn: null,
      checkOut: null,
      leaveCode: upper,
      otHours: 0,
    };
  }

  return { workHours: 0, checkIn: null, checkOut: null, leaveCode: str, otHours: 0 };
};

/**
 * Chuẩn hóa giá trị giờ từ ô Excel (hỗ trợ siêu dung sai: phân số ngày, HH:mm, HH:mm:ss, AM/PM, 8h30, 8.30, 8h, số nguyên)
 */
export const parseExcelTime = (val: any): string => {
  if (val === null || val === undefined || val === '') return '';

  if (val instanceof Date && !isNaN(val.getTime())) {
    const h = String(val.getHours()).padStart(2, '0');
    const m = String(val.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }

  if (typeof val === 'number') {
    let totalMinutes = 0;
    if (val < 1) {
      // Phân số trong ngày (0.33333 -> 08:00)
      totalMinutes = Math.round(val * 24 * 60);
    } else if (val < 24) {
      // Giờ nguyên (8 -> 08:00, 17.5 -> 17:30)
      totalMinutes = Math.round(val * 60);
    } else {
      const frac = val - Math.floor(val);
      totalMinutes = Math.round(frac * 24 * 60);
    }
    const h = String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0');
    const m = String(totalMinutes % 60).padStart(2, '0');
    return `${h}:${m}`;
  }

  const s = String(val).replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  if (s === '-' || s === '0' || s === '--' || s === 'null' || s === 'undefined') {
    return '';
  }

  // 12-hour AM/PM format (ví dụ: 8:00 AM, 05:30 PM, 12:00 PM)
  const matchAmPm = s.match(/^(\d{1,2}):(\d{1,2})(?::\d{1,2})?\s*(AM|PM)$/i);
  if (matchAmPm) {
    let h = parseInt(matchAmPm[1], 10);
    const m = parseInt(matchAmPm[2], 10);
    const period = matchAmPm[3].toUpperCase();
    if (period === 'PM' && h < 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    return `${String(h % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }

  // HH:mm hoặc HH:mm:ss (ví dụ: 08:00, 8:00, 08:00:00, 17:30:45)
  const matchColon = s.match(/^(\d{1,2}):(\d{1,2})(?::\d{1,2})?$/);
  if (matchColon) {
    const h = Math.min(23, parseInt(matchColon[1], 10));
    const m = Math.min(59, parseInt(matchColon[2], 10));
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // 8h30, 8H30, 8h, 17H
  const matchH = s.match(/^(\d{1,2})\s*[hH]\s*(\d{1,2})?$/);
  if (matchH) {
    const h = Math.min(23, parseInt(matchH[1], 10));
    const m = matchH[2] ? Math.min(59, parseInt(matchH[2], 10)) : 0;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // 8.30 hoặc 08.30 (dấu chấm phân cách)
  const matchDot = s.match(/^(\d{1,2})\.(\d{1,2})$/);
  if (matchDot) {
    const h = Math.min(23, parseInt(matchDot[1], 10));
    const m = Math.min(59, parseInt(matchDot[2], 10));
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // Số nguyên đứng độc lập (ví dụ: "8" -> "08:00", "17" -> "17:00")
  const matchJustNum = s.match(/^(\d{1,2})$/);
  if (matchJustNum) {
    const h = parseInt(matchJustNum[1], 10);
    if (h >= 0 && h <= 24) {
      return `${String(h % 24).padStart(2, '0')}:00`;
    }
  }

  return s;
};

/**
 * Phân tích và kiểm tra dữ liệu Excel:
 * Tự động hỗ trợ cả định dạng ma trận nhóm 9 dòng (như Công t10.xls) và dạng bảng danh sách chuẩn.
 * Tự động nhận diện nhân viên mới và nhân viên được cập nhật thông tin.
 */
export const parseAndValidateRows = (
  rows: any[][],
  headerIndex: number,
  mapping: ExcelColumnMapping,
  headers: string[],
  existingEmployees: Employee[],
  targetMonth: number,
  targetYear: number
): {
  attendanceRows: ParsedAttendanceRow[];
  employeesSyncList: EmployeeSyncRecord[];
  matrices: EmployeeAttendanceMatrix[];
  daysOfWeekMap: Record<number, string>;
  isMatrix: boolean;
} => {
  const colIndexMap: Record<string, number> = {};
  headers.forEach((h, idx) => {
    colIndexMap[h] = idx;
  });

  const empIdColIdx = colIndexMap[mapping.employeeIdCol];
  const fullNameColIdx = mapping.fullNameCol ? colIndexMap[mapping.fullNameCol] : -1;
  const deptColIdx = mapping.departmentCol ? colIndexMap[mapping.departmentCol] : -1;
  const startDateColIdx = mapping.startDateCol ? colIndexMap[mapping.startDateCol] : -1;
  const posColIdx = mapping.positionCol ? colIndexMap[mapping.positionCol] : -1;

  // Bản đồ nhân viên hiện tại trong database (key: uppercase id)
  const existingEmpMap = new Map<string, Employee>();
  existingEmployees.forEach((emp) => {
    existingEmpMap.set(emp.id.trim().toUpperCase(), emp);
  });

  // Kiểm tra định dạng ma trận (Matrix Format như mẫu.xlsx & Công t10.xls với các cột ngày 1..31)
  const matrixInfo = detectMatrixDayColumns(headers);

  const parsedAttendanceRows: ParsedAttendanceRow[] = [];
  const employeeMetaMap = new Map<string, EmployeeSyncRecord>();
  const matrices: EmployeeAttendanceMatrix[] = [];

  const daysInTargetMonth = new Date(targetYear, targetMonth, 0).getDate();
  const dayNamesShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const daysOfWeekMap: Record<number, string> = {};

  // Mặc định tính thứ theo lịch thực tế của tháng/năm mục tiêu
  for (let d = 1; d <= daysInTargetMonth; d++) {
    const dayOfWeek = new Date(targetYear, targetMonth - 1, d).getDay();
    daysOfWeekMap[d] = dayNamesShort[dayOfWeek];
  }

  // Helper đăng ký hoặc phân loại nhân viên
  const registerEmployee = (
    empId: string,
    fullName: string,
    department: string,
    startDateStr: string,
    position?: string
  ): EmployeeSyncRecord => {
    const key = empId.toUpperCase();
    if (employeeMetaMap.has(key)) {
      return employeeMetaMap.get(key)!;
    }

    const trimmedId = empId.trim();
    const trimmedName = fullName.trim();
    const trimmedDept = department.trim() || 'Phòng Kỹ thuật';

    let validStartDate = parseExcelDate(startDateStr);
    let errorReason: string | undefined = undefined;

    if (!trimmedId) {
      errorReason = 'Thiếu mã nhân viên';
    } else if (!trimmedName && !existingEmpMap.has(key)) {
      errorReason = 'Thiếu họ và tên nhân viên (không thể tạo hồ sơ nhân viên mới)';
    } else if (startDateStr && !validStartDate) {
      errorReason = `Ngày vào làm "${startDateStr}" sai định dạng`;
    }

    // Nếu không có ngày vào làm, mặc định lấy ngày 1 của tháng hiện tại
    if (!validStartDate) {
      validStartDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
    }

    let action: 'create' | 'update' | 'keep' | 'error' = 'keep';
    const changedFields: string[] = [];

    if (errorReason) {
      action = 'error';
    } else if (!existingEmpMap.has(key)) {
      action = 'create';
    } else {
      // Đã có trong database -> kiểm tra xem có thay đổi họ tên, bộ phận, ngày vào không
      const dbEmp = existingEmpMap.get(key)!;
      if (trimmedName && dbEmp.fullName !== trimmedName) {
        changedFields.push('Họ và tên');
      }
      if (trimmedDept && dbEmp.department !== trimmedDept) {
        changedFields.push('Bộ phận');
      }
      if (startDateStr && dbEmp.startDate !== validStartDate) {
        changedFields.push('Ngày vào làm');
      }

      if (changedFields.length > 0) {
        action = 'update';
      }
    }

    const rec: EmployeeSyncRecord = {
      id: trimmedId,
      fullName: trimmedName || (existingEmpMap.get(key)?.fullName || trimmedId),
      department: trimmedDept,
      startDate: validStartDate,
      position: position || 'Nhân viên',
      action,
      errorReason,
      changedFields,
    };

    employeeMetaMap.set(key, rec);
    return rec;
  };

  // =========================================================================
  // TRƯỜNG HỢP A: ĐỊNH DẠNG MA TRẬN (MATRIX FORMAT - THEO FILE MẪU MẪU(1).XLSX)
  // Mỗi nhân viên gồm nhiều dòng chỉ tiêu (Bắt đầu, Kết thúc, Giờ làm, Nghỉ làm, TC 150%, 210%...)
  // =========================================================================
  if (matrixInfo.isMatrix && matrixInfo.dayColumns.length >= 15) {
    let currentEmpRec: EmployeeSyncRecord | null = null;
    let currentBlockRows: any[][] = [];

    // Nhận diện dòng thứ trong tuần (Subheader row) nếu có ngay sau dòng tiêu đề
    let dataStartRowIdx = headerIndex + 1;
    if (rows.length > headerIndex + 1) {
      const candidateRow = rows[headerIndex + 1];
      let matchCount = 0;
      matrixInfo.dayColumns.forEach(({ day, colIdx }) => {
        const val = String(candidateRow[colIdx] || '').trim().toLowerCase();
        if (/^(thu|fri|sat|sun|mon|tue|wed|t2|t3|t4|t5|t6|t7|cn|thứ\s*[2-7]|chủ\s*nhật)$/i.test(val)) {
          matchCount++;
        }
      });

      if (matchCount >= 5) {
        matrixInfo.dayColumns.forEach(({ day, colIdx }) => {
          const val = String(candidateRow[colIdx] || '').trim();
          if (val) daysOfWeekMap[day] = val;
        });
        dataStartRowIdx = headerIndex + 2;
      }
    }

    // Tìm cột "Nội dung chỉ tiêu" (Mặc định cột F / index 5)
    let indicatorColIdx = headers.findIndex((h) =>
      /nội\s*dung(\s*chỉ\s*tiêu)?|chỉ\s*tiêu|loại\s*dòng|tiêu\s*chí|hạng\s*mục|indicator/i.test(h)
    );
    if (indicatorColIdx === -1 && headers.length > 5) {
      indicatorColIdx = 5; // Cột F trong file mẫu.xlsx
    }

    const flushBlock = (empRec: EmployeeSyncRecord, block: any[][]) => {
      // 1. Phân loại các dòng trong block của nhân viên dựa theo cột chỉ tiêu
      let startRow: any[] | null = null;
      let stopRow: any[] | null = null;
      let workHoursRow: any[] | null = null;
      let leaveRow: any[] | null = null;
      const otherIndicatorRows: { name: string; row: any[] }[] = [];

      block.forEach((r) => {
        const indName = String(
          (indicatorColIdx >= 0 ? r[indicatorColIdx] : '') || r[5] || r[4] || ''
        ).trim();

        if (/bắt\s*đầu|^start$|giờ\s*vào|vào|time\s*in/i.test(indName)) {
          startRow = r;
        } else if (/kết\s*thúc|^stop$|giờ\s*ra|ra|time\s*out/i.test(indName)) {
          stopRow = r;
        } else if (
          /thời\s*gian\s*làm\s*việc|giờ\s*làm|công\s*làm|work\s*hours|^công$|^ngày\s*công$|^giờ\s*công$|công\s*thực\s*tế|tổng\s*công|số\s*giờ|làm\s*việc/i.test(
            indName
          )
        ) {
          workHoursRow = r;
        } else if (/nghỉ\s*làm|nghỉ$|leave/i.test(indName)) {
          leaveRow = r;
        } else if (indName && !/thứ|day\s*of\s*week/i.test(indName)) {
          otherIndicatorRows.push({ name: indName, row: r });
        }
      });

      // PHÁT HIỆN ĐỊNH DẠNG SIÊU TỐC "1 DÒNG / NHÂN VIÊN" (DÀNH CHO CÔNG TY > 700 NHÂN VIÊN)
      // Khi mỗi nhân viên chỉ chiếm đúng 1 dòng trên file Excel (thay vì 9 dòng rời rạc)
      const hasExplicitIndicator = block.some((r) => {
        const indName = String((indicatorColIdx >= 0 ? r[indicatorColIdx] : '') || r[5] || r[4] || '').trim();
        return /bắt\s*đầu|^start$|kết\s*thúc|^stop$|thời\s*gian\s*làm\s*việc|nghỉ\s*làm|TC\s*ngày\s*thường/i.test(indName);
      });

      if (block.length === 1 && !hasExplicitIndicator) {
        const singleRow = block[0];

        // Tìm các cột tổng hợp công ở cuối dòng (nếu có trong file Excel)
        let summaryDaysVal = 0;
        let summaryHoursVal = 0;
        let summaryOt150 = 0;
        let summaryOt210 = 0;
        let summaryNight30 = 0;
        let summaryOtSun200 = 0;
        let summaryOtSun270 = 0;
        let summaryLeave = 0;

        headers.forEach((h, cIdx) => {
          const val = singleRow[cIdx];
          if (val === undefined || val === null || val === '') return;
          const num = typeof val === 'number' ? val : parseFloat(String(val).replace(',', '.'));
          if (isNaN(num)) return;

          if (/tổng\s*(số\s*)?ngày\s*công|công\s*tt|ngày\s*công/i.test(h)) summaryDaysVal = num;
          else if (/tổng\s*(số\s*)?giờ(\s*làm)?|work\s*hours/i.test(h)) summaryHoursVal = num;
          else if (/150%|tc\s*(ngày\s*)?thường|tăng\s*ca\s*thường/i.test(h)) summaryOt150 = num;
          else if (/210%|tc\s*đêm\s*ngày\s*thường/i.test(h)) summaryOt210 = num;
          else if (/30%|phụ\s*cấp\s*(ca\s*)?đêm/i.test(h)) summaryNight30 = num;
          else if (/200%|tc\s*(ngày\s*)?chủ\s*nhật|tc\s*cn/i.test(h)) summaryOtSun200 = num;
          else if (/270%|tc\s*đêm\s*chủ\s*nhật|tc\s*đêm\s*cn/i.test(h)) summaryOtSun270 = num;
          else if (/nghỉ\s*phép|phép\s*năm|tổng\s*nghỉ/i.test(h)) summaryLeave = num;
        });

        // Tự động kiến tạo 9 dòng ma trận ảo đầy đủ khớp 100% giao diện tra cứu và xem chi tiết
        const startValues: Record<number, string | number> = {};
        const stopValues: Record<number, string | number> = {};
        const workHoursValues: Record<number, string | number> = {};
        const leaveValues: Record<number, string | number> = {};
        const ot150Values: Record<number, string | number> = {};
        const ot210Values: Record<number, string | number> = {};
        const night30Values: Record<number, string | number> = {};
        const otSun200Values: Record<number, string | number> = {};
        const otSun270Values: Record<number, string | number> = {};

        let calcWorkDays = 0;
        let calcWorkHours = 0;
        let calcLeaveDays = 0;
        let calcOt150 = 0;

        matrixInfo.dayColumns.forEach(({ day, colIdx }) => {
          if (day > daysInTargetMonth) return;
          const cellVal = singleRow[colIdx];
          const parsed = parseCompactDayCell(cellVal);

          startValues[day] = parsed.checkIn || '-';
          stopValues[day] = parsed.checkOut || '-';
          workHoursValues[day] = parsed.workHours > 0 ? parsed.workHours : '-';
          leaveValues[day] = parsed.leaveCode || '-';
          ot150Values[day] = parsed.otHours > 0 ? parsed.otHours : '-';
          ot210Values[day] = '-';
          night30Values[day] = '-';
          otSun200Values[day] = '-';
          otSun270Values[day] = '-';

          if (parsed.workHours > 0) {
            calcWorkDays++;
            calcWorkHours += parsed.workHours;
          }
          if (parsed.leaveCode) {
            calcLeaveDays++;
          }
          if (parsed.otHours > 0) {
            calcOt150 += parsed.otHours;
          }

          // Ghi nhận bản ghi ngày nếu có đi làm hoặc có nghỉ phép (tránh tạo hàng nghìn dòng cuối tuần rỗng)
          if (parsed.checkIn || parsed.checkOut || parsed.workHours > 0 || parsed.leaveCode || parsed.otHours > 0) {
            const date = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            let status: AttendanceStatus = 'on_time';
            if (parsed.leaveCode) {
              status = /KP|không\s*lương/i.test(parsed.leaveCode) ? 'leave_unapproved' : 'leave_approved';
            }

            parsedAttendanceRows.push({
              rowNum: parsedAttendanceRows.length + 1,
              raw: { date, checkIn: parsed.checkIn, checkOut: parsed.checkOut, workHours: parsed.workHours, leaveCode: parsed.leaveCode, otHours: parsed.otHours },
              employeeId: empRec.id,
              fullName: empRec.fullName,
              department: empRec.department,
              startDate: empRec.startDate,
              date,
              checkIn: parsed.checkIn || '',
              checkOut: parsed.checkOut || '',
              workHours: parsed.workHours,
              overtimeHours: parsed.otHours,
              leaveCode: parsed.leaveCode || undefined,
              status,
              lateMinutes: 0,
              earlyMinutes: 0,
              note: parsed.leaveCode ? (parsed.leaveCode === 'P' ? 'Nghỉ phép (P)' : `Nghỉ: ${parsed.leaveCode}`) : (parsed.otHours > 0 ? `Tăng ca (+${parsed.otHours}h OT)` : 'Chấm công tự động'),
              isValid: true,
              isNewEmployee: empRec.action === 'create',
              errors: [],
              warnings: [],
            });
          }
        });

        const finalTotalWorkDays = summaryDaysVal > 0 ? summaryDaysVal : calcWorkDays;
        const finalTotalWorkHours = summaryHoursVal > 0 ? summaryHoursVal : calcWorkHours;
        const finalTotalLeaveDays = summaryLeave > 0 ? summaryLeave : calcLeaveDays;
        const finalOt150 = summaryOt150 > 0 ? summaryOt150 : calcOt150;

        const compactMatrix: EmployeeAttendanceMatrix = {
          employeeId: empRec.id,
          fullName: empRec.fullName,
          department: empRec.department,
          startDate: empRec.startDate,
          month: targetMonth,
          year: targetYear,
          daysInMonth: daysInTargetMonth,
          daysOfWeek: daysOfWeekMap,
          rows: [
            { indicatorName: 'Bắt đầu / Start', dataType: 'time', values: startValues, total: '-', unit: '' },
            { indicatorName: 'Kết thúc / Stop', dataType: 'time', values: stopValues, total: '-', unit: '' },
            { indicatorName: 'Thời gian làm việc', dataType: 'hours', values: workHoursValues, total: finalTotalWorkHours, unit: 'giờ' },
            { indicatorName: 'Nghỉ làm', dataType: 'leave', values: leaveValues, total: finalTotalLeaveDays, unit: 'ngày' },
            { indicatorName: 'TC ngày thường (150%)', dataType: 'hours', values: ot150Values, total: finalOt150, unit: 'giờ' },
            { indicatorName: 'TC đêm ngày thường (210%)', dataType: 'hours', values: ot210Values, total: summaryOt210, unit: 'giờ' },
            { indicatorName: 'Phụ cấp ca đêm (30%)', dataType: 'hours', values: night30Values, total: summaryNight30, unit: 'giờ' },
            { indicatorName: 'TC ngày Chủ nhật (200%)', dataType: 'hours', values: otSun200Values, total: summaryOtSun200, unit: 'giờ' },
            { indicatorName: 'TC đêm Chủ nhật (270%)', dataType: 'hours', values: otSun270Values, total: summaryOtSun270, unit: 'giờ' },
          ],
          summary: {
            totalWorkHours: finalTotalWorkHours,
            totalWorkDays: finalTotalWorkDays,
            totalLeaveDays: finalTotalLeaveDays,
            overtime150: finalOt150,
            overtime210: summaryOt210,
            nightAllowance30: summaryNight30,
            overtimeSunday200: summaryOtSun200,
            overtimeSunday270: summaryOtSun270,
            otherOvertime: 0,
          },
        };

        matrices.push(compactMatrix);
        return;
      }

      // Nếu không nhận diện được qua tên chỉ tiêu, dùng mặc định dòng 0 là vào, dòng 1 là ra
      if (!startRow && block.length > 0) startRow = block[0];
      if (!stopRow && block.length > 1) stopRow = block[1];
      if (!workHoursRow && block.length > 2) workHoursRow = block[2];
      if (!leaveRow && block.length > 3) leaveRow = block[3];

      // 2. Xây dựng ma trận chi tiết giống 100% file Excel mẫu (EmployeeAttendanceMatrix)
      const matrixRows: EmployeeAttendanceMatrixRow[] = [];
      let mTotalWorkHours = 0;
      let mTotalLeaveDays = 0;
      let mOvertime150 = 0;
      let mOvertime210 = 0;
      let mNightAllowance30 = 0;
      let mOvertimeSunday200 = 0;
      let mOvertimeSunday270 = 0;
      let mOtherOvertime = 0;

      block.forEach((r) => {
        const rawIndName = String(
          (indicatorColIdx >= 0 ? r[indicatorColIdx] : '') || r[5] || r[4] || ''
        ).trim();
        if (!rawIndName || /thứ|day\s*of\s*week/i.test(rawIndName)) return;

        let dataType: 'time' | 'hours' | 'leave' | 'count' = 'hours';
        const isTime = /bắt\s*đầu|^start$|giờ\s*vào|vào|time\s*in|kết\s*thúc|^stop$|giờ\s*ra|ra|time\s*out/i.test(rawIndName);
        const isLeave = /nghỉ\s*làm|nghỉ$|leave/i.test(rawIndName);
        const isWorkHours =
          /thời\s*gian\s*làm\s*việc|giờ\s*làm|công\s*làm|work\s*hours|^công$|^ngày\s*công$|^giờ\s*công$|công\s*thực\s*tế|tổng\s*công|số\s*giờ|làm\s*việc/i.test(
            rawIndName
          );
        const isOt150 = /150%|ngày\s*thường/i.test(rawIndName) && !/đêm/i.test(rawIndName);
        const isOt210 = /210%|đêm\s*ngày\s*thường/i.test(rawIndName);
        const isNight30 = /30%|phụ\s*cấp\s*ca\s*đêm|ca\s*đêm/i.test(rawIndName) && !/210%|270%/i.test(rawIndName);
        const isOtSun200 = /200%|chủ\s*nhật/i.test(rawIndName) && !/đêm/i.test(rawIndName);
        const isOtSun270 = /270%|đêm\s*chủ\s*nhật/i.test(rawIndName);

        if (isTime) dataType = 'time';
        else if (isLeave) dataType = 'leave';
        else dataType = 'hours';

        const rowValues: Record<number, string | number> = {};
        let numericSum = 0;
        let leaveCount = 0;

        matrixInfo.dayColumns.forEach(({ day, colIdx }) => {
          if (day > daysInTargetMonth) return;
          const cellVal = r[colIdx];

          if (dataType === 'time') {
            const timeStr = parseExcelTime(cellVal);
            rowValues[day] = timeStr || '-';
          } else if (dataType === 'leave') {
            let lCode = String(cellVal !== undefined && cellVal !== null ? cellVal : '').trim();
            if (lCode === '0' || lCode === '') lCode = '-';
            rowValues[day] = lCode;
            if (lCode !== '-') leaveCount++;
          } else {
            if (cellVal !== undefined && cellVal !== null && String(cellVal).trim() !== '' && String(cellVal).trim() !== '-' && !isNaN(Number(cellVal))) {
              const num = Number(cellVal);
              rowValues[day] = num;
              numericSum += num;
            } else {
              rowValues[day] = '-';
            }
          }
        });

        // Tính cột TỔNG thống kê riêng từng dòng chỉ tiêu theo Mục 4C
        let total: number | string = '-';
        let unit = 'giờ';

        if (dataType === 'time') {
          total = '-';
          unit = '';
        } else if (dataType === 'leave') {
          total = leaveCount;
          unit = 'ngày';
          mTotalLeaveDays += leaveCount;
        } else {
          total = Math.round(numericSum * 100) / 100;
          unit = 'giờ';

          if (isWorkHours) {
            mTotalWorkHours += total;
          } else if (isOt150) {
            mOvertime150 += total;
          } else if (isOt210) {
            mOvertime210 += total;
          } else if (isNight30) {
            mNightAllowance30 += total;
          } else if (isOtSun200) {
            mOvertimeSunday200 += total;
          } else if (isOtSun270) {
            mOvertimeSunday270 += total;
          } else if (/TC|tăng\s*ca|ot/i.test(rawIndName)) {
            mOtherOvertime += total;
          }
        }

        matrixRows.push({
          indicatorName: rawIndName,
          dataType,
          values: rowValues,
          total,
          unit,
        });
      });

      // Lưu bảng ma trận của nhân viên
      const empMatrix: EmployeeAttendanceMatrix = {
        employeeId: empRec.id,
        fullName: empRec.fullName,
        department: empRec.department,
        startDate: empRec.startDate,
        month: targetMonth,
        year: targetYear,
        daysInMonth: daysInTargetMonth,
        daysOfWeek: daysOfWeekMap,
        rows: matrixRows,
        summary: {
          totalWorkHours: mTotalWorkHours,
          totalWorkDays: 0,
          totalLeaveDays: mTotalLeaveDays,
          overtime150: mOvertime150,
          overtime210: mOvertime210,
          nightAllowance30: mNightAllowance30,
          overtimeSunday200: mOvertimeSunday200,
          overtimeSunday270: mOvertimeSunday270,
          otherOvertime: mOtherOvertime,
        },
      };

      // 3. Xử lý các bản ghi chấm công từng ngày (attendance_daily)
      let calculatedWorkDays = 0;
      matrixInfo.dayColumns.forEach(({ day, colIdx }) => {
        if (day > daysInTargetMonth) return;

        const date = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const rawCheckIn = startRow ? startRow[colIdx] : undefined;
        const rawCheckOut = stopRow ? stopRow[colIdx] : undefined;
        const rawWorkHours = workHoursRow ? workHoursRow[colIdx] : undefined;
        const rawLeave = leaveRow ? leaveRow[colIdx] : undefined;

        const checkIn = parseExcelTime(rawCheckIn);
        const checkOut = parseExcelTime(rawCheckOut);

        let leaveCode = String(rawLeave || '').trim();
        if (leaveCode === '-' || leaveCode === '0') {
          leaveCode = '';
        }

        // Tính số giờ làm việc theo ngày
        let workHours = 0;
        if (rawWorkHours !== undefined && rawWorkHours !== '') {
          const cleanNum = typeof rawWorkHours === 'number' ? rawWorkHours : parseFloat(String(rawWorkHours).replace(',', '.'));
          if (!isNaN(cleanNum)) {
            workHours = cleanNum <= 1 && cleanNum > 0 ? cleanNum * 8 : cleanNum;
          } else if (String(rawWorkHours).trim().toLowerCase() === 'x' || String(rawWorkHours).trim() === '+') {
            workHours = 8;
          }
        } else if (checkIn && checkOut) {
          const [hIn, mIn] = checkIn.split(':').map(Number);
          const [hOut, mOut] = checkOut.split(':').map(Number);
          const diffMinutes = Math.max(0, hOut * 60 + mOut - (hIn * 60 + mIn));
          workHours = Math.round(Math.min(8, diffMinutes / 60) * 10) / 10;
        } else if (checkIn || checkOut) {
          workHours = 8;
        }

        if (workHours > 0) calculatedWorkDays++;

        // Tính giờ tăng ca từ các dòng chỉ tiêu tăng ca
        let otHours = 0;
        const dayOtDetails: Record<string, number | string> = {};
        otherIndicatorRows.forEach(({ name, row }) => {
          const val = row[colIdx];
          if (val !== undefined && val !== '' && !isNaN(Number(val))) {
            const numVal = Number(val);
            if (numVal > 0) {
              dayOtDetails[name] = numVal;
              if (/TC|tăng\s*ca|overtime|200%|210%|270%|150%/i.test(name)) {
                otHours += numVal;
              }
            }
          }
        });

        if (otHours === 0 && workHours > 8) {
          otHours = workHours - 8;
        }

        // Nếu ngày đó có quẹt thẻ, có giờ làm, hoặc có ghi nhận nghỉ phép
        if (checkIn || checkOut || workHours > 0 || leaveCode || otHours > 0) {
          const errors: string[] = [];
          if (empRec.action === 'error' && empRec.errorReason) {
            errors.push(empRec.errorReason);
          }

          if (checkIn && !/^\d{2}:\d{2}$/.test(checkIn)) {
            // Tự động làm sạch giờ nếu có thể, không loại bỏ dòng nếu có giờ làm hoặc nghỉ phép
            const fixedIn = parseExcelTime(checkIn);
            if (/^\d{2}:\d{2}$/.test(fixedIn)) {
              // Đã tự sửa thành công
            } else if (workHours > 0 || leaveCode) {
              // Có giờ làm hoặc nghỉ phép -> Giữ lại bản ghi an toàn
            } else {
              errors.push(`Giờ vào "${checkIn}" không đúng định dạng HH:mm`);
            }
          }
          if (checkOut && !/^\d{2}:\d{2}$/.test(checkOut)) {
            const fixedOut = parseExcelTime(checkOut);
            if (/^\d{2}:\d{2}$/.test(fixedOut)) {
              // Đã tự sửa thành công
            } else if (workHours > 0 || leaveCode) {
              // Giữ lại bản ghi an toàn
            } else {
              errors.push(`Giờ ra "${checkOut}" không đúng định dạng HH:mm`);
            }
          }

          let status: AttendanceStatus = 'on_time';
          let lateMinutes = 0;
          let earlyMinutes = 0;

          if (leaveCode) {
            status = /KP|không\s*lương/i.test(leaveCode) ? 'leave_unapproved' : 'leave_approved';
          } else {
            if (checkIn && /^\d{2}:\d{2}$/.test(checkIn)) {
              const [h, m] = checkIn.split(':').map(Number);
              const totalIn = h * 60 + m;
              if (totalIn > 8 * 60 + 15) {
                status = 'late';
                lateMinutes = totalIn - 8 * 60;
              }
            }

            if (checkOut && /^\d{2}:\d{2}$/.test(checkOut)) {
              const [h, m] = checkOut.split(':').map(Number);
              const totalOut = h * 60 + m;
              if (totalOut < 17 * 60 + 30) {
                if (status !== 'late') status = 'early_leave';
                earlyMinutes = Math.max(0, 17 * 60 + 30 - totalOut);
              }
            }
          }

          let note = '';
          if (leaveCode) {
            note = leaveCode === 'P' ? 'Nghỉ phép (P)' : `Nghỉ: ${leaveCode}`;
          } else if (status === 'late') {
            note = `Đi muộn ${lateMinutes} phút`;
          } else if (otHours > 0) {
            note = `Tăng ca (+${otHours}h OT)`;
          } else {
            note = 'Chấm công tự động';
          }

          parsedAttendanceRows.push({
            rowNum: parsedAttendanceRows.length + 1,
            raw: { date, checkIn, checkOut, workHours, leaveCode, otHours, dayOtDetails },
            employeeId: empRec.id,
            fullName: empRec.fullName,
            department: empRec.department,
            startDate: empRec.startDate,
            date,
            checkIn: checkIn || '',
            checkOut: checkOut || '',
            note,
            leaveCode: leaveCode || undefined,
            overtimeHours: otHours,
            overtimeDetails: dayOtDetails,
            status,
            workHours,
            lateMinutes,
            earlyMinutes,
            isValid: errors.length === 0,
            isNewEmployee: empRec.action === 'create',
            errors,
            warnings: [],
          });
        }
      });

      if (calculatedWorkDays === 0 && mTotalWorkHours > 0) {
        calculatedWorkDays = Math.max(1, Math.round(mTotalWorkHours / 8));
      }
      empMatrix.summary.totalWorkDays = calculatedWorkDays;
      matrices.push(empMatrix);
    };

    for (let i = dataStartRowIdx; i < rows.length; i++) {
      const row = rows[i];
      if (!Array.isArray(row) || row.every((c) => c === null || c === undefined || String(c).trim() === '')) {
        continue;
      }

      const rawId = empIdColIdx !== undefined && empIdColIdx >= 0 ? row[empIdColIdx] : row[0];
      const empIdStr = String(rawId || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();

      // Kiểm tra xem dòng này có bắt đầu một nhân viên mới hay không
      const isNewEmployeeRow =
        empIdStr &&
        (!currentEmpRec || empIdStr.toUpperCase() !== currentEmpRec.id.toUpperCase()) &&
        !/tổng\s*cộng|tổng\s*hợp|báo\s*cáo|thứ/i.test(empIdStr);

      if (isNewEmployeeRow) {
        if (currentEmpRec && currentBlockRows.length > 0) {
          flushBlock(currentEmpRec, currentBlockRows);
        }

        const rawName = fullNameColIdx >= 0 ? row[fullNameColIdx] : row[1];
        const rawDept = deptColIdx >= 0 ? row[deptColIdx] : row[2];
        const rawStart = startDateColIdx >= 0 ? row[startDateColIdx] : row[3];
        const rawPos = posColIdx >= 0 ? row[posColIdx] : '';

        currentEmpRec = registerEmployee(
          empIdStr,
          String(rawName || ''),
          String(rawDept || ''),
          String(rawStart || ''),
          String(rawPos || '')
        );
        currentBlockRows = [row];
      } else if (currentEmpRec) {
        currentBlockRows.push(row);
      }
    }

    if (currentEmpRec && currentBlockRows.length > 0) {
      flushBlock(currentEmpRec, currentBlockRows);
    }
  }

  // =========================================================================
  // TRƯỜNG HỢP B: ĐỊNH DẠNG BẢNG DANH SÁCH CHUẨN (ROW-BY-ROW TABULAR)
  // =========================================================================
  else {
    const dateColIdx = colIndexMap[mapping.dateCol];
    const checkInColIdx = colIndexMap[mapping.checkInCol];
    const checkOutColIdx = mapping.checkOutCol ? colIndexMap[mapping.checkOutCol] : -1;
    const noteColIdx = mapping.noteCol ? colIndexMap[mapping.noteCol] : -1;

    const seenRecords = new Map<string, number>();

    for (let i = headerIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!Array.isArray(row) || row.every((c) => c === null || c === undefined || String(c).trim() === '')) {
        continue;
      }

      const rowNum = i + 1;
      const errors: string[] = [];
      const warnings: string[] = [];

      const rawEmpId = empIdColIdx !== undefined && empIdColIdx >= 0 ? row[empIdColIdx] : '';
      const employeeId = String(rawEmpId !== null && rawEmpId !== undefined ? rawEmpId : '').trim();

      const rawFullName = fullNameColIdx >= 0 && row[fullNameColIdx] ? String(row[fullNameColIdx]).trim() : '';
      const rawDept = deptColIdx >= 0 && row[deptColIdx] ? String(row[deptColIdx]).trim() : '';
      const rawStart = startDateColIdx >= 0 && row[startDateColIdx] ? String(row[startDateColIdx]).trim() : '';
      const rawPos = posColIdx >= 0 && row[posColIdx] ? String(row[posColIdx]).trim() : '';

      const rawDate = dateColIdx !== undefined && dateColIdx >= 0 ? row[dateColIdx] : '';
      const date = parseExcelDate(rawDate);

      const rawCheckIn = checkInColIdx !== undefined && checkInColIdx >= 0 ? row[checkInColIdx] : '';
      const checkIn = parseExcelTime(rawCheckIn);

      const rawCheckOut = checkOutColIdx >= 0 ? row[checkOutColIdx] : '';
      const checkOut = parseExcelTime(rawCheckOut);

      const note = noteColIdx >= 0 && row[noteColIdx] ? String(row[noteColIdx]).trim() : '';

      // Đăng ký nhân viên vào danh sách kiểm soát
      let empRec: EmployeeSyncRecord | null = null;
      if (employeeId) {
        empRec = registerEmployee(employeeId, rawFullName, rawDept, rawStart, rawPos);
        if (empRec.action === 'error' && empRec.errorReason) {
          errors.push(empRec.errorReason);
        }
      } else {
        errors.push('Thiếu mã nhân viên');
      }

      // Kiểm tra Ngày chấm công
      if (!date) {
        errors.push('Thiếu ngày chấm công');
      } else {
        const dateParts = date.split('-');
        if (dateParts.length !== 3) {
          errors.push(`Định dạng ngày "${date}" không hợp lệ (cần YYYY-MM-DD hoặc DD/MM/YYYY)`);
        } else {
          const y = parseInt(dateParts[0], 10);
          const m = parseInt(dateParts[1], 10);
          const d = parseInt(dateParts[2], 10);

          if (isNaN(y) || isNaN(m) || isNaN(d) || m < 1 || m > 12 || d < 1 || d > 31) {
            errors.push(`Giá trị ngày "${date}" không tồn tại trên lịch`);
          } else if (m !== targetMonth || y !== targetYear) {
            errors.push(
              `Ngày ${date} không thuộc kỳ Tháng ${targetMonth}/${targetYear} đã chọn (thuộc ${m}/${y})`
            );
          }
        }
      }

      // Kiểm tra Trùng lặp trong cùng file
      if (employeeId && date) {
        const recordKey = `${employeeId.toUpperCase()}_${date}`;
        if (seenRecords.has(recordKey)) {
          const firstRow = seenRecords.get(recordKey)!;
          errors.push(
            `Trùng lặp dữ liệu: Mã "${employeeId}" ngày ${date} đã xuất hiện tại dòng #${firstRow}`
          );
        } else {
          seenRecords.set(recordKey, rowNum);
        }
      }

      // Kiểm tra Giờ vào (cho phép nghỉ phép nếu ghi trong ghi chú)
      const isLeaveDay = /nghỉ|phép|om|thai|p|ro|kp|holiday/i.test(note);
      if (!checkIn && !isLeaveDay) {
        errors.push('Thiếu giờ vào làm (Check-in)');
      } else if (checkIn && !/^\d{2}:\d{2}$/.test(checkIn)) {
        const fixedIn = parseExcelTime(checkIn);
        if (!/^\d{2}:\d{2}$/.test(fixedIn)) {
          errors.push(`Giờ vào "${checkIn}" không đúng định dạng HH:mm (ví dụ: 08:00)`);
        }
      }

      // Kiểm tra Giờ ra (nếu có)
      if (checkOut && !/^\d{2}:\d{2}$/.test(checkOut)) {
        const fixedOut = parseExcelTime(checkOut);
        if (!/^\d{2}:\d{2}$/.test(fixedOut)) {
          errors.push(`Giờ ra "${checkOut}" không đúng định dạng HH:mm (ví dụ: 17:30)`);
        }
      }

      // Tính toán trạng thái và số phút muộn
      let status: AttendanceStatus = 'on_time';
      let lateMinutes = 0;
      let earlyMinutes = 0;
      let workHours = 8;

      if (checkIn && /^\d{2}:\d{2}$/.test(checkIn)) {
        const [h, m] = checkIn.split(':').map(Number);
        const totalInMins = h * 60 + m;
        const standardInMins = 8 * 60; // 08:00
        const gracePeriodMins = 8 * 60 + 15; // 08:15

        if (totalInMins > gracePeriodMins) {
          status = 'late';
          lateMinutes = totalInMins - standardInMins;
        }
      }

      if (checkOut && /^\d{2}:\d{2}$/.test(checkOut)) {
        const [h, m] = checkOut.split(':').map(Number);
        const totalOutMins = h * 60 + m;
        const standardOutMins = 17 * 60 + 30; // 17:30

        if (totalOutMins < standardOutMins) {
          if (status !== 'late') status = 'early_leave';
          earlyMinutes = Math.max(0, standardOutMins - totalOutMins);
        }
      }

      const rawObject: Record<string, any> = {};
      headers.forEach((h, cIdx) => {
        rawObject[h] = row[cIdx];
      });

      parsedAttendanceRows.push({
        rowNum,
        raw: rawObject,
        employeeId,
        fullName: empRec?.fullName || rawFullName || employeeId,
        department: empRec?.department || rawDept || 'Phòng Kỹ thuật',
        startDate: empRec?.startDate || rawStart || `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`,
        date,
        checkIn,
        checkOut: checkOut || '',
        note: note || (status === 'late' ? `Đi muộn ${lateMinutes} phút` : 'Chấm công tự động'),
        status,
        workHours,
        lateMinutes,
        earlyMinutes,
        isValid: errors.length === 0,
        isNewEmployee: empRec?.action === 'create',
        errors,
        warnings,
      });
    }

    // Tự động xây dựng ma trận cho các nhân viên dạng bảng phẳng
    const empIds = Array.from(employeeMetaMap.keys());
    empIds.forEach((empKey) => {
      const empRec = employeeMetaMap.get(empKey)!;
      const empDailyRows = parsedAttendanceRows.filter(
        (r) => r.employeeId.toUpperCase() === empKey && r.isValid
      );
      const convertedMatrix = buildMatrixFromAttendanceDaily(
        {
          id: empRec.id,
          fullName: empRec.fullName,
          department: empRec.department,
          startDate: empRec.startDate,
        },
        empDailyRows as any[],
        targetMonth,
        targetYear
      );
      matrices.push(convertedMatrix);
    });
  }

  const employeesSyncList = Array.from(employeeMetaMap.values());

  return {
    attendanceRows: parsedAttendanceRows,
    employeesSyncList,
    matrices,
    daysOfWeekMap,
    isMatrix: matrixInfo.isMatrix,
  };
};

/**
 * Kiểm tra một ma trận chấm công có dữ liệu công thực tế hay không (tránh khung ma trận rỗng)
 */
export const isMatrixValidWithData = (mat?: EmployeeAttendanceMatrix | null): boolean => {
  if (!mat || !mat.rows || mat.rows.length === 0) return false;
  if (mat.summary && ((Number(mat.summary.totalWorkDays) || 0) > 0 || (Number(mat.summary.totalWorkHours) || 0) > 0)) {
    return true;
  }
  return mat.rows.some((row) => {
    if (typeof row.total === 'number' && row.total > 0) return true;
    const values = Object.values(row.values || {});
    return values.some((v) => v !== '' && v !== '-' && v !== 0 && v !== null && v !== undefined);
  });
};

/**
 * Xây dựng bảng ma trận chi tiết từ danh sách bản ghi chấm công ngày (hỗ trợ hiển thị 100% giống Excel mẫu)
 */
export const buildMatrixFromAttendanceDaily = (
  employee: Employee | { id: string; fullName: string; department?: string; startDate?: string },
  attendanceList: AttendanceRecord[],
  month: number,
  year: number
): EmployeeAttendanceMatrix => {
  const daysInMonth = new Date(year, month, 0).getDate();
  const dayNamesShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const daysOfWeek: Record<number, string> = {};

  const startValues: Record<number, string | number> = {};
  const stopValues: Record<number, string | number> = {};
  const workHoursValues: Record<number, string | number> = {};
  const leaveValues: Record<number, string | number> = {};
  const ot150Values: Record<number, string | number> = {};
  const ot210Values: Record<number, string | number> = {};
  const night30Values: Record<number, string | number> = {};
  const otSun200Values: Record<number, string | number> = {};
  const otSun270Values: Record<number, string | number> = {};

  let sumWorkHours = 0;
  let sumLeave = 0;
  let sum150 = 0;
  let sum210 = 0;
  let sumNight = 0;
  let sumSun200 = 0;
  let sumSun270 = 0;

  const attMap = new Map<string, AttendanceRecord>();
  attendanceList.forEach((r) => attMap.set(r.date, r));

  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month - 1, d);
    const dow = dateObj.getDay();
    daysOfWeek[d] = dayNamesShort[dow];
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const rec = attMap.get(dateStr);

    if (rec) {
      startValues[d] = rec.checkIn || '-';
      stopValues[d] = rec.checkOut || '-';

      if (rec.workHours && rec.workHours > 0) {
        workHoursValues[d] = rec.workHours;
        sumWorkHours += rec.workHours;
      } else {
        workHoursValues[d] = '-';
      }

      if (rec.leaveCode && rec.leaveCode !== '-') {
        leaveValues[d] = rec.leaveCode;
        sumLeave += 1;
      } else if (rec.status === 'leave_approved' || rec.status === 'leave_unapproved') {
        leaveValues[d] = 'P';
        sumLeave += 1;
      } else {
        leaveValues[d] = '-';
      }

      // Phân tích chi tiết chỉ tiêu tăng ca từ overtimeDetails nếu có
      const otDetails = rec.overtimeDetails || {};
      let val150 = 0;
      let val210 = 0;
      let valNight30 = 0;
      let valSun200 = 0;
      let valSun270 = 0;

      Object.entries(otDetails).forEach(([k, v]) => {
        const num = Number(v) || 0;
        if (num > 0) {
          if (/150%/i.test(k) || (/ngày\s*thường/i.test(k) && !/đêm/i.test(k))) {
            val150 += num;
          } else if (/210%/i.test(k) || (/đêm/i.test(k) && /thường/i.test(k))) {
            val210 += num;
          } else if (/30%/i.test(k) || /phụ\s*cấp\s*ca\s*đêm/i.test(k)) {
            valNight30 += num;
          } else if (/200%/i.test(k) || (/chủ\s*nhật/i.test(k) && !/đêm/i.test(k))) {
            valSun200 += num;
          } else if (/270%/i.test(k) || (/đêm/i.test(k) && /chủ\s*nhật/i.test(k))) {
            valSun270 += num;
          }
        }
      });

      // Nếu không có breakdown trong overtimeDetails thì suy đoán từ overtimeHours/workHours
      const ot = rec.overtimeHours || (rec.workHours > 8 ? rec.workHours - 8 : 0);
      if (val150 === 0 && val210 === 0 && valSun200 === 0 && valSun270 === 0 && ot > 0) {
        if (dow === 0) {
          valSun200 = ot;
        } else {
          val150 = ot;
        }
      }

      if (val150 > 0) { ot150Values[d] = val150; sum150 += val150; } else { ot150Values[d] = '-'; }
      if (val210 > 0) { ot210Values[d] = val210; sum210 += val210; } else { ot210Values[d] = '-'; }
      if (valNight30 > 0) { night30Values[d] = valNight30; sumNight += valNight30; } else { night30Values[d] = '-'; }
      if (valSun200 > 0) { otSun200Values[d] = valSun200; sumSun200 += valSun200; } else { otSun200Values[d] = '-'; }
      if (valSun270 > 0) { otSun270Values[d] = valSun270; sumSun270 += valSun270; } else { otSun270Values[d] = '-'; }
    } else {
      startValues[d] = '-';
      stopValues[d] = '-';
      workHoursValues[d] = '-';
      leaveValues[d] = '-';
      ot150Values[d] = '-';
      ot210Values[d] = '-';
      night30Values[d] = '-';
      otSun200Values[d] = '-';
      otSun270Values[d] = '-';
    }
  }

  const rows: EmployeeAttendanceMatrixRow[] = [
    { indicatorName: 'Bắt đầu / Start', dataType: 'time', values: startValues, total: '-' },
    { indicatorName: 'Kết thúc / Stop', dataType: 'time', values: stopValues, total: '-' },
    { indicatorName: 'Thời gian làm việc', dataType: 'hours', values: workHoursValues, total: Math.round(sumWorkHours * 100) / 100, unit: 'giờ' },
    { indicatorName: 'Nghỉ làm', dataType: 'leave', values: leaveValues, total: sumLeave, unit: 'ngày' },
    { indicatorName: 'TC ngày thường (150%)', dataType: 'hours', values: ot150Values, total: Math.round(sum150 * 100) / 100, unit: 'giờ' },
    { indicatorName: 'TC đêm ngày thường (210%)', dataType: 'hours', values: ot210Values, total: Math.round(sum210 * 100) / 100, unit: 'giờ' },
    { indicatorName: 'Phụ cấp ca đêm (30%)', dataType: 'hours', values: night30Values, total: Math.round(sumNight * 100) / 100, unit: 'giờ' },
    { indicatorName: 'TC ngày Chủ nhật (200%)', dataType: 'hours', values: otSun200Values, total: Math.round(sumSun200 * 100) / 100, unit: 'giờ' },
    { indicatorName: 'TC đêm Chủ nhật (270%)', dataType: 'hours', values: otSun270Values, total: Math.round(sumSun270 * 100) / 100, unit: 'giờ' },
  ];

  return {
    employeeId: employee.id,
    fullName: employee.fullName,
    department: employee.department || 'Phòng Kỹ thuật',
    startDate: employee.startDate || `${year}-${String(month).padStart(2, '0')}-01`,
    month,
    year,
    daysInMonth,
    daysOfWeek,
    rows,
    summary: {
      totalWorkHours: Math.round(sumWorkHours * 100) / 100,
      totalWorkDays: attendanceList.filter((r) => r.workHours > 0).length,
      totalLeaveDays: sumLeave,
      overtime150: Math.round(sum150 * 100) / 100,
      overtime210: Math.round(sum210 * 100) / 100,
      nightAllowance30: Math.round(sumNight * 100) / 100,
      overtimeSunday200: Math.round(sumSun200 * 100) / 100,
      overtimeSunday270: Math.round(sumSun270 * 100) / 100,
      otherOvertime: 0,
    },
  };
};

/**
 * Tải danh sách các dòng lỗi xuất ra file Excel (.xlsx)
 */
export const exportErrorsToExcel = (
  errorRows: ParsedAttendanceRow[],
  targetMonth: number,
  targetYear: number
) => {
  if (errorRows.length === 0) return;

  const data = errorRows.map((r) => ({
    'Dòng Excel': r.rowNum,
    'Mã nhân viên': r.employeeId || '(Trống)',
    'Họ và tên': r.fullName || '(Trống)',
    'Ngày chấm công': r.date || '(Trống)',
    'Giờ vào': r.checkIn || '(Trống)',
    'Giờ ra': r.checkOut || '(Trống)',
    'Nguyên nhân lỗi': r.errors.join('; '),
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  worksheet['!cols'] = [
    { wch: 12 },
    { wch: 16 },
    { wch: 25 },
    { wch: 16 },
    { wch: 12 },
    { wch: 12 },
    { wch: 55 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Danh_Sach_Loi');

  const fileName = `Danh_Sach_Loi_Cham_Cong_Thang_${targetMonth}_${targetYear}.xlsx`;
  XLSX.writeFile(workbook, fileName);
};

/**
 * Tải file Excel mẫu chấm công chuẩn (mẫu.xlsx) cấu trúc ma trận 14 dòng chỉ tiêu theo nhân viên:
 * A: STT, B: Mã nhân viên, C: Họ và tên, D: Ngày vào làm việc, E: Bộ phận, F: Nội dung chỉ tiêu,
 * G:AK: Ngày 1 đến ngày 31, AN:BH: Các cột tổng hợp công và phụ cấp.
 */
export const exportStandardTemplateExcel = (
  employees: Employee[] = [],
  month = 10,
  year = 2026,
  customFileName?: string
) => {
  const sampleEmps =
    employees.length > 0
      ? employees.slice(0, 4)
      : [
          { id: 'S0076', fullName: 'Bùi Quang Tùng', department: 'Utility Part', startDate: '2018-12-24' },
          { id: 'NV001', fullName: 'Trần Văn An', department: 'Phòng Kỹ thuật', startDate: '2022-03-15' },
          { id: 'NV002', fullName: 'Lê Thị Bích', department: 'Phòng Nhân sự', startDate: '2021-08-01' },
          { id: 'NV003', fullName: 'Phạm Minh Cường', department: 'Phòng Kỹ thuật', startDate: '2023-01-10' },
        ];

  const daysInMonth = new Date(year, month, 0).getDate();

  // 9 dòng chỉ tiêu đúng theo cấu trúc file mẫu & bảng tra cứu nhân viên
  const indicators = [
    'Bắt đầu / Start',
    'Kết thúc / Stop',
    'Thời gian làm việc',
    'Nghỉ làm',
    'TC ngày thường (150%)',
    'TC đêm ngày thường (210%)',
    'Phụ cấp ca đêm (30%)',
    'TC ngày Chủ nhật (200%)',
    'TC đêm Chủ nhật (270%)',
  ];

  // Hàng 1: Tiêu đề cột & số thứ tự ngày 1..31 & cột TỔNG
  const headerRow: string[] = [
    'STT',                 // Col A (0)
    'Mã NV',               // Col B (1)
    'Họ và tên',           // Col C (2)
    'Ngày vào làm việc',   // Col D (3)
    'Bộ phận',             // Col E (4)
    'Nội dung chỉ tiêu',   // Col F (5)
  ];

  // G:AK: Ngày 1 đến ngày 31
  for (let d = 1; d <= 31; d++) {
    headerRow.push(String(d));
  }
  headerRow.push('TỔNG');

  // Hàng 2: Thứ tương ứng với từng ngày (Thu, Fri, Sat, Sun...)
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const row2: string[] = ['', '', '', '', '', 'Thứ'];
  for (let d = 1; d <= 31; d++) {
    const dayOfWeek = new Date(year, month - 1, d).getDay();
    row2.push(dayNames[dayOfWeek]);
  }
  row2.push('');

  const rows: any[][] = [headerRow, row2];

  sampleEmps.forEach((emp, empIdx) => {
    const stt = empIdx + 1;
    const empStartDate = (emp as any).startDate || '2022-03-15';
    const empDept = emp.department || 'Utility Part';

    indicators.forEach((indName, indIdx) => {
      const row: any[] = [
        indIdx === 0 ? stt : '',
        emp.id,
        emp.fullName,
        empStartDate,
        empDept,
        indName,
      ];

      let rowSum = 0;
      let leaveDaysCount = 0;

      // Điền dữ liệu cho 31 ngày (G:AK)
      for (let day = 1; day <= 31; day++) {
        if (day > daysInMonth) {
          row.push('');
          continue;
        }

        const dateObj = new Date(year, month - 1, day);
        const dayOfWeek = dateObj.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        if (isWeekend) {
          // Trường hợp tăng ca đặc biệt thứ 7 của NV001
          if (emp.id === 'NV001' && day === 14) {
            if (indName === 'Bắt đầu / Start') row.push('08:00');
            else if (indName === 'Kết thúc / Stop') row.push('19:30');
            else if (indName === 'Thời gian làm việc') { row.push(9.5); rowSum += 9.5; }
            else if (indName === 'Nghỉ làm') row.push('-');
            else if (indName === 'TC ngày thường (150%)') { row.push(1.5); rowSum += 1.5; }
            else row.push('-');
          } else if (emp.id === 'NV001' && day === 21) {
            if (indName === 'Bắt đầu / Start') row.push('08:00');
            else if (indName === 'Kết thúc / Stop') row.push('20:30');
            else if (indName === 'Thời gian làm việc') { row.push(10.5); rowSum += 10.5; }
            else if (indName === 'Nghỉ làm') row.push('-');
            else if (indName === 'TC ngày thường (150%)') { row.push(2.5); rowSum += 2.5; }
            else row.push('-');
          } else {
            if (indName === 'Nghỉ làm') {
              row.push('-');
            } else {
              row.push('-');
            }
          }
          continue;
        }

        // Ngày nghỉ phép của NV001 ngày 4
        if (emp.id === 'NV001' && day === 4) {
          if (indName === 'Nghỉ làm') {
            row.push('P');
            leaveDaysCount++;
          } else {
            row.push('-');
          }
          continue;
        }

        // Ngày thường đi làm chuẩn
        if (indName === 'Bắt đầu / Start') {
          row.push('08:00');
        } else if (indName === 'Kết thúc / Stop') {
          if (emp.id === 'S0076' && day === 10) row.push('20:00');
          else if (emp.id === 'NV001' && day === 6) row.push('20:00');
          else row.push('17:00');
        } else if (indName === 'Thời gian làm việc') {
          if (emp.id === 'S0076' && day === 10) { row.push(11); rowSum += 11; }
          else if (emp.id === 'NV001' && day === 6) { row.push(10); rowSum += 10; }
          else { row.push(8); rowSum += 8; }
        } else if (indName === 'Nghỉ làm') {
          row.push('-');
        } else if (indName === 'TC ngày thường (150%)') {
          if (emp.id === 'S0076' && day === 10) { row.push(3); rowSum += 3; }
          else if (emp.id === 'NV001' && day === 6) { row.push(2); rowSum += 2; }
          else row.push('-');
        } else if (indName === 'TC đêm ngày thường (210%)') {
          row.push('-');
        } else if (indName === 'Phụ cấp ca đêm (30%)') {
          row.push('-');
        } else if (indName === 'TC ngày Chủ nhật (200%)') {
          row.push('-');
        } else if (indName === 'TC đêm Chủ nhật (270%)') {
          row.push('-');
        } else {
          row.push('-');
        }
      }

      // Cột TỔNG (Cột 38 / AL) - Thống kê chính xác theo hàng chỉ tiêu
      if (indName === 'Bắt đầu / Start' || indName === 'Kết thúc / Stop') {
        row.push('-');
      } else if (indName === 'Nghỉ làm') {
        row.push(leaveDaysCount > 0 ? leaveDaysCount : '-');
      } else {
        row.push(rowSum > 0 ? Math.round(rowSum * 10) / 10 : '-');
      }

      rows.push(row);
    });
  });

  // Sheet 1: Bang_Cham_Cong
  const worksheet = XLSX.utils.aoa_to_sheet(rows);

  // Cấu hình độ rộng các cột A..AL
  worksheet['!cols'] = [
    { wch: 6 },  // A: STT
    { wch: 14 }, // B: Mã NV
    { wch: 22 }, // C: Họ và tên
    { wch: 16 }, // D: Ngày vào làm việc
    { wch: 18 }, // E: Bộ phận
    { wch: 26 }, // F: Nội dung chỉ tiêu
  ];
  // G..AK: 31 ngày (Cột 6..36)
  for (let i = 6; i < 37; i++) {
    worksheet['!cols'].push({ wch: 6.5 });
  }
  // AL: Cột TỔNG (Cột 37)
  worksheet['!cols'].push({ wch: 12 });

  // Sheet 2: Huong_Dan_Su_Dung (Hướng dẫn chi tiết)
  const guideRows = [
    ['HƯỚNG DẪN SỬ DỤNG VÀ QUY CÁCH DỮ LIỆU FILE MẪU CHẤM CÔNG (mẫu.xlsx)'],
    ['Áp dụng cho Hệ thống Quản trị Nhân sự & Chấm công HR Attendance Management'],
    [],
    ['I. CẤU TRÚC MA TRẬN 38 CỘT CHUẨN (A:AL) - KHỚP 100% GIAO DIỆN TRA CỨU'],
    ['1. Cột A - F:', 'Thông tin nhân viên: STT (A), Mã nhân viên (B), Họ và tên (C), Ngày vào làm (D), Bộ phận (E), Nội dung chỉ tiêu (F).'],
    ['2. Cột G - AK:', 'Dữ liệu chấm công theo ngày từ ngày 01 đến ngày 31 của tháng.'],
    ['3. Cột AL (TỔNG):', 'Tổng số giờ làm, tổng ngày nghỉ hoặc tổng giờ tăng ca riêng cho từng dòng chỉ tiêu.'],
    [],
    ['II. QUY ĐỊNH 9 DÒNG CHỈ TIÊU CHI TIẾT THEO NHÂN VIÊN'],
    ['Mỗi nhân viên gồm 9 dòng chỉ tiêu liên tiếp, gom nhóm theo Mã nhân viên:'],
    ['  1. Bắt đầu / Start', 'Giờ vào làm việc thực tế (ví dụ: 08:00).'],
    ['  2. Kết thúc / Stop', 'Giờ ra về thực tế (ví dụ: 17:00, 20:00).'],
    ['  3. Thời gian làm việc', 'Số giờ làm việc thực tế trong ngày (ví dụ: 8, 9.5, 10). Cột TỔNG = Tổng giờ.'],
    ['  4. Nghỉ làm', 'Ký hiệu nghỉ: "P" (phép năm), "HL" (hưởng lương BHXH), "KP" (không lương), "-" (cuối tuần). Cột TỔNG = Tổng ngày.'],
    ['  5. TC ngày thường (150%)', 'Số giờ làm thêm ngày thường. Cột TỔNG = Tổng giờ tăng ca 150%.'],
    ['  6. TC đêm ngày thường (210%)', 'Số giờ làm thêm ban đêm ngày thường. Cột TỔNG = Tổng giờ tăng ca 210%.'],
    ['  7. Phụ cấp ca đêm (30%)', 'Số giờ phụ cấp ca đêm (22:00 - 06:00). Cột TỔNG = Tổng giờ phụ cấp 30%.'],
    ['  8. TC ngày Chủ nhật (200%)', 'Số giờ làm thêm vào ngày Chủ nhật. Cột TỔNG = Tổng giờ tăng ca 200%.'],
    ['  9. TC đêm Chủ nhật (270%)', 'Số giờ làm thêm ban đêm vào ngày Chủ nhật. Cột TỔNG = Tổng giờ tăng ca 270%.'],
    [],
    ['III. QUY TẮC BẢO VỆ DỮ LIỆU & TỰ ĐỘNG TẠO NHÂN VIÊN'],
    ['1. Bảo toàn mã NV:', 'Mã nhân viên luôn được lưu dạng chuỗi và giữ nguyên số 0 ở đầu (ví dụ: S0076, NV001, 00123).'],
    ['2. Tự động tạo hồ sơ:', 'Nếu mã nhân viên chưa có trong hệ thống, hệ thống sẽ tự động tạo mới với đầy đủ Họ tên, Ngày vào làm, Bộ phận.'],
    ['3. Tự động đồng bộ:', 'Nếu mã đã có, hệ thống cập nhật thông tin nếu có sự thay đổi mà không làm mất dữ liệu lịch sử.'],
    ['4. Bắt buộc chọn kỳ công:', 'Admin phải chọn Tháng và Năm kỳ công trước khi tải file Excel lên hệ thống.']
  ];

  const guideWorksheet = XLSX.utils.aoa_to_sheet(guideRows);
  guideWorksheet['!cols'] = [{ wch: 30 }, { wch: 80 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Bang_Cham_Cong');
  XLSX.utils.book_append_sheet(workbook, guideWorksheet, 'Huong_Dan_Su_Dung');

  const fileName = customFileName || `mẫu.xlsx`;
  XLSX.writeFile(workbook, fileName);
};

/**
 * Tải file Excel mẫu chấm công siêu tốc "1 DÒNG / NHÂN VIÊN" (Dành cho công ty đông nhân sự > 700 người):
 * Mỗi nhân viên đúng 1 dòng (700 người = 700 dòng thay vì 20.738 dòng).
 * Nạp 1 phát ăn ngay trong 1 giây, tự động kiến tạo 9 chỉ tiêu và tra cứu đầy đủ.
 */
export const exportCompact1RowTemplateExcel = (
  employees: Employee[] = [],
  month = 11,
  year = 2026,
  customFileName?: string
) => {
  const sampleEmps =
    employees.length > 0
      ? employees.slice(0, 5)
      : [
          { id: 'S0076', fullName: 'Bùi Quang Tùng', department: 'Utility Part', startDate: '2018-12-24' },
          { id: 'S/M0044', fullName: 'Bùi Văn Hưng', department: 'Utility Part', startDate: '2019-05-10' },
          { id: 'S0098', fullName: 'Dương Quang Thắng', department: 'Utility Part', startDate: '2020-03-15' },
          { id: 'S0059', fullName: 'Dương Thành Trung', department: 'Utility Part', startDate: '2021-08-20' },
          { id: 'NV001', fullName: 'Trần Văn An', department: 'Phòng Kỹ thuật', startDate: '2022-03-15' },
        ];

  const daysInMonth = new Date(year, month, 0).getDate();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Hàng 1: Tiêu đề cột
  const headerRow: string[] = [
    'STT',
    'Mã NV',
    'Họ và tên',
    'Ngày vào làm việc',
    'Bộ phận',
  ];
  for (let d = 1; d <= 31; d++) {
    headerRow.push(String(d));
  }
  headerRow.push('Tổng ngày công');
  headerRow.push('Tổng giờ làm');
  headerRow.push('Tăng ca 150% (giờ)');
  headerRow.push('Tăng ca 210% (giờ)');
  headerRow.push('Phụ cấp ca đêm (giờ)');
  headerRow.push('Tăng ca CN 200% (giờ)');
  headerRow.push('Nghỉ phép (ngày)');

  // Hàng 2: Thứ trong tuần
  const row2: string[] = ['', '', '', '', 'Thứ'];
  for (let d = 1; d <= 31; d++) {
    const dayOfWeek = new Date(year, month - 1, d).getDay();
    row2.push(dayNames[dayOfWeek]);
  }
  row2.push('', '', '', '', '', '', '');

  const rows: any[][] = [headerRow, row2];

  sampleEmps.forEach((emp, empIdx) => {
    const stt = empIdx + 1;
    const empStartDate = (emp as any).startDate || '2022-03-15';
    const empDept = emp.department || 'Utility Part';

    const row: any[] = [
      stt,
      emp.id,
      emp.fullName,
      empStartDate,
      empDept,
    ];

    let calcWorkDays = 0;
    let calcWorkHours = 0;
    let calcOt150 = 0;
    let calcLeaveDays = 0;

    for (let day = 1; day <= 31; day++) {
      if (day > daysInMonth) {
        row.push('');
        continue;
      }

      const dateObj = new Date(year, month - 1, day);
      const dayOfWeek = dateObj.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      if (isWeekend) {
        if (emp.id === 'S0076' && day === 14) {
          row.push('8'); // Tăng ca thứ 7
          calcWorkDays++;
          calcWorkHours += 8;
        } else {
          row.push('-'); // Cuối tuần nghỉ
        }
      } else {
        if (emp.id === 'NV001' && day === 4) {
          row.push('P'); // Nghỉ phép
          calcLeaveDays++;
        } else if (emp.id === 'S0076' && day === 10) {
          row.push('8+3'); // 8h làm + 3h tăng ca
          calcWorkDays++;
          calcWorkHours += 8;
          calcOt150 += 3;
        } else {
          row.push('8'); // Ngày thường 8h chuẩn
          calcWorkDays++;
          calcWorkHours += 8;
        }
      }
    }

    // Các cột tổng hợp
    row.push(calcWorkDays);
    row.push(calcWorkHours);
    row.push(calcOt150);
    row.push(0); // 210%
    row.push(0); // ca đêm 30%
    row.push(0); // CN 200%
    row.push(calcLeaveDays);

    rows.push(row);
  });

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 6 },  // STT
    { wch: 14 }, // Mã NV
    { wch: 24 }, // Họ tên
    { wch: 16 }, // Ngày vào
    { wch: 18 }, // Bộ phận
  ];
  for (let d = 1; d <= 31; d++) {
    worksheet['!cols'].push({ wch: 6 });
  }
  worksheet['!cols'].push(
    { wch: 14 }, // Tổng công
    { wch: 14 }, // Tổng giờ
    { wch: 16 }, // TC 150%
    { wch: 16 }, // TC 210%
    { wch: 18 }, // Phụ cấp đêm
    { wch: 16 }, // TC CN
    { wch: 14 }  // Nghỉ phép
  );

  const guideRows = [
    ['HƯỚNG DẪN MẪU BẢNG CHẤM CÔNG 1 DÒNG / NHÂN VIÊN (DÀNH CHO CÔNG TY > 700 NHÂN SỰ)'],
    ['Áp dụng cho giải pháp nạp siêu tốc 1 phát ăn ngay trên hệ thống HR Attendance Management'],
    [],
    ['I. TẠI SAO NÊN DÙNG MẪU 1 DÒNG NÀY?'],
    ['1. Siêu nhẹ & Siêu nhanh:', '700 nhân viên chỉ chiếm đúng 700 dòng trong Excel thay vì 6.300 dòng hay 20.738 dòng!'],
    ['2. Nạp 1 phát ăn ngay:', 'Thời gian nạp chỉ 0.5 - 1 giây, không bao giờ bị đơ trình duyệt hay nghẽn mạng.'],
    ['3. Đầy đủ dữ liệu 100%:', 'Hệ thống tự động kiến tạo ma trận 9 chỉ tiêu và bảng chi tiết từng ngày khớp 100% giao diện tra cứu và quản lý công.'],
    [],
    ['II. QUY CÁCH ĐIỀN Ô NGÀY (CỘT 1 ĐẾN 31) - CỰC KỲ ĐƠN GIẢN:'],
    ['  - Điền số giờ làm:', 'Ví dụ: "8", "8.5", "4" hoặc chữ "X" (tương đương 8 giờ làm việc chuẩn).'],
    ['  - Điền khoảng giờ vào - ra:', 'Ví dụ: "08:00-17:30" (hệ thống tự tính giờ vào, giờ ra và trừ 1h nghỉ trưa).'],
    ['  - Điền tăng ca kết hợp:', 'Ví dụ: "8+2" (nghĩa là 8h chuẩn + 2h tăng ca) hoặc "8+3".'],
    ['  - Điền ký hiệu nghỉ phép:', 'Ví dụ: "P" (nghỉ phép năm), "KP" (nghỉ không lương), "CT" (công tác), "L" (nghỉ lễ).'],
    ['  - Ngày nghỉ cuối tuần:', 'Để trống hoặc điền dấu gạch ngang "-".'],
    [],
    ['III. CỘT TỔNG HỢP Ở CUỐI BẢNG:'],
    ['  - Bạn có thể để công thức Excel tự tính hoặc hệ thống sẽ tự động cộng dồn 31 ngày khi nạp vào.']
  ];

  const guideWorksheet = XLSX.utils.aoa_to_sheet(guideRows);
  guideWorksheet['!cols'] = [{ wch: 32 }, { wch: 85 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Bang_Cham_Cong_1_Dong');
  XLSX.utils.book_append_sheet(workbook, guideWorksheet, 'Huong_Dan_Su_Dung');

  const fileName = customFileName || `Mau_Cham_Cong_1_Dong_Nhanh_${month}_${year}.xlsx`;
  XLSX.writeFile(workbook, fileName);
};


// =========================================================================
// MODULE LƯƠNG: EXCEL PARSER CHO BẢNG LƯƠNG
// =========================================================================

/**
 * Tự động nhận diện các cột bảng lương dựa trên tiêu đề tiếng Việt
 */
export const autoDetectPayrollColumns = (headers: string[]): ExcelPayrollMapping => {
  const mapping: ExcelPayrollMapping = {
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
  };

  headers.forEach((h) => {
    const clean = h.trim().toLowerCase();

    if (!mapping.employeeIdCol && (clean.includes('mã nv') || clean.includes('mã nhân viên') || clean === 'mã' || clean === 'manv' || clean === 'id')) {
      mapping.employeeIdCol = h;
    } else if (!mapping.fullNameCol && (clean.includes('họ và tên') || clean.includes('họ tên') || clean.includes('nhân viên') || clean === 'tên')) {
      mapping.fullNameCol = h;
    } else if (!mapping.standardWorkDaysCol && (clean.includes('công chuẩn') || clean.includes('ngày chuẩn'))) {
      mapping.standardWorkDaysCol = h;
    } else if (!mapping.actualWorkDaysCol && (clean.includes('công thực') || clean.includes('ngày công') || clean.includes('thực tế'))) {
      mapping.actualWorkDaysCol = h;
    } else if (!mapping.baseSalaryCol && (clean.includes('lương cơ bản') || clean.includes('lương cb') || clean.includes('lương chính') || clean === 'lương')) {
      mapping.baseSalaryCol = h;
    } else if (!mapping.allowanceCol && (clean.includes('phụ cấp') || clean.includes('trợ cấp') || clean.includes('ăn trưa'))) {
      mapping.allowanceCol = h;
    } else if (!mapping.bonusCol && (clean.includes('thưởng') || clean.includes('kpi') || clean.includes('hiệu quả'))) {
      mapping.bonusCol = h;
    } else if (!mapping.overtimePayCol && (clean.includes('tăng ca') || clean.includes('làm thêm') || clean.includes('ot'))) {
      mapping.overtimePayCol = h;
    } else if (!mapping.latePenaltyCol && (clean.includes('phạt') || clean.includes('trừ đi muộn') || clean.includes('muộn'))) {
      mapping.latePenaltyCol = h;
    } else if (!mapping.insuranceDeductionCol && (clean.includes('bảo hiểm') || clean.includes('bhxh') || clean.includes('bh') || clean.includes('10.5%'))) {
      mapping.insuranceDeductionCol = h;
    } else if (!mapping.taxDeductionCol && (clean.includes('thuế') || clean.includes('tncn'))) {
      mapping.taxDeductionCol = h;
    } else if (!mapping.netSalaryCol && (clean.includes('thực lĩnh') || clean.includes('thực nhận') || clean.includes('net') || clean.includes('tổng nhận'))) {
      mapping.netSalaryCol = h;
    } else if (!mapping.paymentStatusCol && (clean.includes('trạng thái') || clean.includes('tình trạng'))) {
      mapping.paymentStatusCol = h;
    } else if (!mapping.paymentDateCol && (clean.includes('ngày thanh toán') || clean.includes('ngày chi') || clean.includes('ngày nhận'))) {
      mapping.paymentDateCol = h;
    }
  });

  return mapping;
};

/**
 * Phân tích và kiểm tra các dòng dữ liệu bảng lương
 */
export const parsePayrollRows = (
  rows: any[][],
  mapping: ExcelPayrollMapping,
  headerIndex: number,
  targetMonth: number,
  targetYear: number,
  existingEmployees: Employee[]
): {
  validRows: ParsedPayrollRow[];
  errorRows: ParsedPayrollRow[];
  allRows: ParsedPayrollRow[];
} => {
  const headers = getHeadersFromRow(rows, headerIndex);
  const getColIdx = (colName?: string) => (colName ? headers.indexOf(colName) : -1);

  const empIdIdx = getColIdx(mapping.employeeIdCol);
  const fullNameIdx = getColIdx(mapping.fullNameCol);
  const stdWorkDaysIdx = getColIdx(mapping.standardWorkDaysCol);
  const actWorkDaysIdx = getColIdx(mapping.actualWorkDaysCol);
  const baseSalaryIdx = getColIdx(mapping.baseSalaryCol);
  const allowanceIdx = getColIdx(mapping.allowanceCol);
  const bonusIdx = getColIdx(mapping.bonusCol);
  const overtimeIdx = getColIdx(mapping.overtimePayCol);
  const latePenaltyIdx = getColIdx(mapping.latePenaltyCol);
  const insuranceIdx = getColIdx(mapping.insuranceDeductionCol);
  const taxIdx = getColIdx(mapping.taxDeductionCol);
  const netSalaryIdx = getColIdx(mapping.netSalaryCol);
  const statusIdx = getColIdx(mapping.paymentStatusCol);
  const dateIdx = getColIdx(mapping.paymentDateCol);

  const existingEmpMap = new Map(existingEmployees.map((e) => [e.id.trim().toUpperCase(), e]));

  const parseNumber = (val: any, fallback = 0): number => {
    if (val === null || val === undefined || val === '') return fallback;
    if (typeof val === 'number') return val;
    const clean = String(val).replace(/[^0-9.-]/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? fallback : num;
  };

  const validRows: ParsedPayrollRow[] = [];
  const errorRows: ParsedPayrollRow[] = [];
  const allRows: ParsedPayrollRow[] = [];

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row) || row.every((c) => c === null || c === undefined || String(c).trim() === '')) {
      continue;
    }

    const rawId = empIdIdx >= 0 ? row[empIdIdx] : row[0];
    const employeeId = String(rawId || '').trim();

    // Bỏ qua dòng tổng cộng ở cuối bảng
    if (/tổng\s*cộng|tổng\s*hợp|báo\s*cáo|người\s*lập/i.test(employeeId)) {
      continue;
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    if (!employeeId) {
      errors.push('Thiếu mã nhân viên');
    }

    const normalizedId = employeeId.toUpperCase();
    const existingEmp = existingEmpMap.get(normalizedId);
    if (employeeId && !existingEmp) {
      errors.push(`Mã nhân viên "${employeeId}" không tồn tại trong danh mục nhân sự`);
    }

    const rawName = fullNameIdx >= 0 ? row[fullNameIdx] : '';
    const fullName = String(rawName || existingEmp?.fullName || employeeId).trim();

    const standardWorkDays = parseNumber(stdWorkDaysIdx >= 0 ? row[stdWorkDaysIdx] : 22, 22);
    const actualWorkDays = parseNumber(actWorkDaysIdx >= 0 ? row[actWorkDaysIdx] : 0, 0);

    const baseSalary = parseNumber(baseSalaryIdx >= 0 ? row[baseSalaryIdx] : existingEmp?.baseSalary || 0, 0);
    const allowance = parseNumber(allowanceIdx >= 0 ? row[allowanceIdx] : existingEmp?.allowance || 0, 0);
    const bonus = parseNumber(bonusIdx >= 0 ? row[bonusIdx] : 0, 0);
    const overtimePay = parseNumber(overtimeIdx >= 0 ? row[overtimeIdx] : 0, 0);
    const latePenalty = parseNumber(latePenaltyIdx >= 0 ? row[latePenaltyIdx] : 0, 0);

    // Tính bảo hiểm mặc định 10.5% nếu không có cột
    const defaultInsurance = Math.round(baseSalary * 0.105);
    const insuranceDeduction = parseNumber(insuranceIdx >= 0 ? row[insuranceIdx] : defaultInsurance, defaultInsurance);
    const taxDeduction = parseNumber(taxIdx >= 0 ? row[taxIdx] : 0, 0);

    // Tự động tính Net salary nếu file không có cột thực lĩnh
    let netSalary = parseNumber(netSalaryIdx >= 0 ? row[netSalaryIdx] : 0, 0);
    if (!netSalary || netSalary === 0) {
      const dailyRate = standardWorkDays > 0 ? baseSalary / standardWorkDays : 0;
      const earnedBase = Math.round(dailyRate * Math.min(actualWorkDays, standardWorkDays));
      netSalary = Math.max(0, earnedBase + allowance + bonus + overtimePay - latePenalty - insuranceDeduction - taxDeduction);
    }

    const rawStatus = statusIdx >= 0 ? String(row[statusIdx] || '').toLowerCase() : '';
    let paymentStatus: 'paid' | 'pending' | 'draft' = 'draft';
    if (rawStatus.includes('đã chi') || rawStatus.includes('paid') || rawStatus.includes('đã nhận')) {
      paymentStatus = 'paid';
    } else if (rawStatus.includes('chờ') || rawStatus.includes('pending') || rawStatus.includes('đang duyệt')) {
      paymentStatus = 'pending';
    }

    const rawDate = dateIdx >= 0 ? String(row[dateIdx] || '').trim() : '';

    const parsedRow: ParsedPayrollRow = {
      rowNum: i + 1,
      raw: { rowData: row },
      employeeId,
      fullName,
      standardWorkDays,
      actualWorkDays,
      paidLeaveDays: 0,
      unpaidLeaveDays: Math.max(0, standardWorkDays - actualWorkDays),
      baseSalary,
      allowance,
      bonus,
      overtimePay,
      latePenalty,
      insuranceDeduction,
      taxDeduction,
      netSalary,
      paymentStatus,
      paymentDate: rawDate || undefined,
      isValid: errors.length === 0,
      errors,
      warnings,
    };

    allRows.push(parsedRow);
    if (parsedRow.isValid) {
      validRows.push(parsedRow);
    } else {
      errorRows.push(parsedRow);
    }
  }

  return { validRows, errorRows, allRows };
};

// =========================================================================
// MODULE PHÉP NĂM: EXCEL PARSER CHO SỐ DƯ PHÉP NĂM & KIỂM TRA CÔNG THỨC
// =========================================================================

/**
 * Tự động nhận diện các cột số dư phép năm
 */
export const autoDetectLeaveColumns = (headers: string[]): ExcelLeaveMapping => {
  const mapping: ExcelLeaveMapping = {
    employeeIdCol: '',
    fullNameCol: '',
    carriedOverDaysCol: '',
    allocatedDaysCol: '',
    usedDaysCol: '',
    adjustedDaysCol: '',
    remainingDaysCol: '',
    pendingDaysCol: '',
  };

  headers.forEach((h) => {
    const clean = h.trim().toLowerCase();

    if (!mapping.employeeIdCol && (clean.includes('mã nv') || clean.includes('mã nhân viên') || clean === 'mã' || clean === 'manv' || clean === 'id')) {
      mapping.employeeIdCol = h;
    } else if (!mapping.fullNameCol && (clean.includes('họ và tên') || clean.includes('họ tên') || clean.includes('nhân viên') || clean === 'tên')) {
      mapping.fullNameCol = h;
    } else if (!mapping.carriedOverDaysCol && (clean.includes('tồn') || clean.includes('chuyển sang') || clean.includes('năm trước') || clean.includes('đầu năm'))) {
      mapping.carriedOverDaysCol = h;
    } else if (!mapping.allocatedDaysCol && (clean.includes('được cấp') || clean.includes('hưởng') || clean.includes('tiêu chuẩn') || clean.includes('cấp mới') || clean.includes('hạn mức'))) {
      mapping.allocatedDaysCol = h;
    } else if (!mapping.usedDaysCol && (clean.includes('đã dùng') || clean.includes('sử dụng') || clean.includes('đã nghỉ') || clean.includes('đã lấy'))) {
      mapping.usedDaysCol = h;
    } else if (!mapping.adjustedDaysCol && (clean.includes('điều chỉnh') || clean.includes('bổ sung') || clean.includes('thâm niên'))) {
      mapping.adjustedDaysCol = h;
    } else if (!mapping.remainingDaysCol && (clean.includes('còn lại') || clean.includes('số dư') || clean.includes('phép còn') || clean.includes('còn hưởng'))) {
      mapping.remainingDaysCol = h;
    } else if (!mapping.pendingDaysCol && (clean.includes('chờ') || clean.includes('đang duyệt'))) {
      mapping.pendingDaysCol = h;
    }
  });

  return mapping;
};

/**
 * Phân tích và kiểm tra số dư phép năm, xác thực công thức:
 * Còn lại = Tồn đầu năm + Phép được cấp + Điều chỉnh - Phép sử dụng
 */
export const parseLeaveRows = (
  rows: any[][],
  mapping: ExcelLeaveMapping,
  headerIndex: number,
  targetYear: number,
  existingEmployees: Employee[]
): {
  validRows: ParsedLeaveRow[];
  errorRows: ParsedLeaveRow[];
  allRows: ParsedLeaveRow[];
} => {
  const headers = getHeadersFromRow(rows, headerIndex);
  const getColIdx = (colName?: string) => (colName ? headers.indexOf(colName) : -1);

  const empIdIdx = getColIdx(mapping.employeeIdCol);
  const fullNameIdx = getColIdx(mapping.fullNameCol);
  const carriedIdx = getColIdx(mapping.carriedOverDaysCol);
  const allocatedIdx = getColIdx(mapping.allocatedDaysCol);
  const usedIdx = getColIdx(mapping.usedDaysCol);
  const adjustedIdx = getColIdx(mapping.adjustedDaysCol);
  const remainingIdx = getColIdx(mapping.remainingDaysCol);
  const pendingIdx = getColIdx(mapping.pendingDaysCol);

  const existingEmpMap = new Map(existingEmployees.map((e) => [e.id.trim().toUpperCase(), e]));

  const parseNumber = (val: any, fallback = 0): number => {
    if (val === null || val === undefined || val === '') return fallback;
    if (typeof val === 'number') return val;
    const clean = String(val).replace(/[^0-9.-]/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? fallback : num;
  };

  const validRows: ParsedLeaveRow[] = [];
  const errorRows: ParsedLeaveRow[] = [];
  const allRows: ParsedLeaveRow[] = [];

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row) || row.every((c) => c === null || c === undefined || String(c).trim() === '')) {
      continue;
    }

    const rawId = empIdIdx >= 0 ? row[empIdIdx] : row[0];
    const employeeId = String(rawId || '').trim();

    if (/tổng\s*cộng|tổng\s*hợp|báo\s*cáo/i.test(employeeId)) {
      continue;
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    if (!employeeId) {
      errors.push('Thiếu mã nhân viên');
    }

    const normalizedId = employeeId.toUpperCase();
    const existingEmp = existingEmpMap.get(normalizedId);
    if (employeeId && !existingEmp) {
      errors.push(`Mã nhân viên "${employeeId}" không tồn tại trong hệ thống`);
    }

    const rawName = fullNameIdx >= 0 ? row[fullNameIdx] : '';
    const fullName = String(rawName || existingEmp?.fullName || employeeId).trim();

    const carriedOverDays = parseNumber(carriedIdx >= 0 ? row[carriedIdx] : 0, 0);
    const allocatedDays = parseNumber(allocatedIdx >= 0 ? row[allocatedIdx] : 12, 12);
    const usedDays = parseNumber(usedIdx >= 0 ? row[usedIdx] : 0, 0);
    const adjustedDays = parseNumber(adjustedIdx >= 0 ? row[adjustedIdx] : 0, 0);
    const pendingDays = parseNumber(pendingIdx >= 0 ? row[pendingIdx] : 0, 0);

    // KIỂM TRA CÔNG THỨC SỐ DƯ PHÉP
    const expectedRemainingDays = Math.round((carriedOverDays + allocatedDays + adjustedDays - usedDays) * 100) / 100;
    
    // Đọc số còn lại từ file
    let remainingDays = remainingIdx >= 0 ? parseNumber(row[remainingIdx], expectedRemainingDays) : expectedRemainingDays;
    
    let hasFormulaMismatch = false;
    let formulaNote: string | undefined = undefined;

    if (Math.abs(remainingDays - expectedRemainingDays) > 0.05) {
      hasFormulaMismatch = true;
      formulaNote = `File ghi ${remainingDays} ngày, nhưng tính theo công thức chuẩn (${carriedOverDays} + ${allocatedDays} + ${adjustedDays} - ${usedDays}) là ${expectedRemainingDays} ngày.`;
      warnings.push(`Sai lệch công thức: ${formulaNote}`);
    }

    const parsedRow: ParsedLeaveRow = {
      rowNum: i + 1,
      raw: { rowData: row },
      employeeId,
      fullName,
      carriedOverDays,
      allocatedDays,
      usedDays,
      adjustedDays,
      remainingDays,
      expectedRemainingDays,
      pendingDays,
      hasFormulaMismatch,
      formulaNote,
      isValid: errors.length === 0,
      errors,
      warnings,
    };

    allRows.push(parsedRow);
    if (parsedRow.isValid) {
      validRows.push(parsedRow);
    } else {
      errorRows.push(parsedRow);
    }
  }

  return { validRows, errorRows, allRows };
};

/**
 * Tải file Excel mẫu cho bảng lương (.xlsx)
 */
export const downloadPayrollTemplate = (month: number, year: number, employees?: Employee[]) => {
  const sampleEmps =
    employees && employees.length > 0
      ? employees.slice(0, 5)
      : [
          { id: 'NV001', fullName: 'Trần Văn An', baseSalary: 28000000, allowance: 2500000 },
          { id: 'NV002', fullName: 'Lê Thị Bích', baseSalary: 18000000, allowance: 1500000 },
          { id: 'NV003', fullName: 'Phạm Minh Cường', baseSalary: 22000000, allowance: 1800000 },
        ];

  const sampleRows = sampleEmps.map((emp) => ({
    'Mã nhân viên': emp.id,
    'Họ và tên': emp.fullName,
    'Ngày công chuẩn': 22,
    'Ngày công thực tế': 22,
    'Lương cơ bản': emp.baseSalary || 20000000,
    'Phụ cấp': emp.allowance || 1500000,
    'Thưởng KPI': 2000000,
    'Làm thêm giờ (OT)': 0,
    'Trừ đi muộn': 0,
    'BHXH (10.5%)': Math.round((emp.baseSalary || 20000000) * 0.105),
    'Thuế TNCN': 1000000,
    'Lương thực lĩnh':
      (emp.baseSalary || 20000000) +
      (emp.allowance || 1500000) +
      2000000 -
      Math.round((emp.baseSalary || 20000000) * 0.105) -
      1000000,
    'Trạng thái': 'Đã chi trả',
    'Ngày thanh toán': `${year}-${String(month).padStart(2, '0')}-01`,
  }));

  const worksheet = XLSX.utils.json_to_sheet(sampleRows);
  worksheet['!cols'] = [
    { wch: 14 }, // Mã NV
    { wch: 22 }, // Họ tên
    { wch: 16 }, // Chuẩn
    { wch: 16 }, // Thực tế
    { wch: 16 }, // Lương CB
    { wch: 14 }, // Phụ cấp
    { wch: 14 }, // Thưởng
    { wch: 14 }, // OT
    { wch: 14 }, // Phạt
    { wch: 16 }, // BHXH
    { wch: 14 }, // Thuế
    { wch: 18 }, // Thực lĩnh
    { wch: 14 }, // Trạng thái
    { wch: 16 }, // Ngày thanh toán
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Bang_Luong');
  XLSX.writeFile(workbook, `Mau_File_Bang_Luong_Thang_${month}_${year}.xlsx`);
};

/**
 * Tải file Excel mẫu cho số dư phép năm (.xlsx)
 */
export const downloadLeaveTemplate = (year: number, employees?: Employee[]) => {
  const sampleEmps =
    employees && employees.length > 0
      ? employees.slice(0, 5)
      : [
          { id: 'NV001', fullName: 'Trần Văn An' },
          { id: 'NV002', fullName: 'Lê Thị Bích' },
          { id: 'NV003', fullName: 'Phạm Minh Cường' },
        ];

  const sampleRows = sampleEmps.map((emp, idx) => {
    const carried = idx === 0 ? 2 : idx === 1 ? 3 : 0;
    const allocated = 12;
    const used = idx === 0 ? 3.5 : idx === 1 ? 5 : 2;
    const adjusted = 0;
    const remaining = carried + allocated + adjusted - used;

    return {
      'Mã nhân viên': emp.id,
      'Họ và tên': emp.fullName,
      'Tồn đầu năm': carried,
      'Phép được cấp': allocated,
      'Phép sử dụng': used,
      'Điều chỉnh': adjusted,
      'Còn lại': remaining,
      'Đang chờ duyệt': idx === 0 ? 1 : 0,
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(sampleRows);
  worksheet['!cols'] = [
    { wch: 14 }, // Mã NV
    { wch: 22 }, // Họ tên
    { wch: 14 }, // Tồn đầu năm
    { wch: 16 }, // Được cấp
    { wch: 16 }, // Sử dụng
    { wch: 14 }, // Điều chỉnh
    { wch: 14 }, // Còn lại
    { wch: 16 }, // Chờ duyệt
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, `Phep_Nam_${year}`);
  XLSX.writeFile(workbook, `Mau_File_So_Du_Phep_Nam_${year}.xlsx`);
};

/**
 * Kiểm tra xem chuỗi ngày (hỗ trợ YYYY-MM-DD, YYYY-M-D, DD/MM/YYYY, D/M/YYYY, DD.MM.YYYY...)
 * có thuộc về Tháng và Năm được chỉ định hay không.
 */
export const isDateInPeriod = (dateStr: string | undefined | null, month: number, year: number): boolean => {
  if (!dateStr) return false;
  const d = String(dateStr).trim();
  const numMonth = Number(month);
  const numYear = Number(year);
  if (isNaN(numMonth) || isNaN(numYear)) return false;

  const paddedMonth = String(numMonth).padStart(2, '0');

  // 1. Dạng ISO: YYYY-MM-DD hoặc YYYY-M-D
  if (d.startsWith(`${numYear}-${paddedMonth}`) || d.startsWith(`${numYear}-${numMonth}-`)) {
    return true;
  }

  // 2. Dạng Slash / Dot: DD/MM/YYYY, D/M/YYYY, DD.MM.YYYY, D.M.YYYY
  if (
    d.endsWith(`/${paddedMonth}/${numYear}`) ||
    d.endsWith(`/${numMonth}/${numYear}`) ||
    d.endsWith(`.${paddedMonth}.${numYear}`) ||
    d.endsWith(`.${numMonth}.${numYear}`)
  ) {
    return true;
  }

  // 3. Fallback bóc tách các thành phần
  const parts = d.split(/[-/.]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return parseInt(parts[0], 10) === numYear && parseInt(parts[1], 10) === numMonth;
    }
    if (parts[2].length === 4) {
      return parseInt(parts[2], 10) === numYear && parseInt(parts[1], 10) === numMonth;
    }
  }

  return false;
};

/**
 * Kiểm tra xem chuỗi ngày có thuộc về Năm được chỉ định hay không.
 */
export const isDateInYear = (dateStr: string | undefined | null, year: number): boolean => {
  if (!dateStr) return false;
  const d = String(dateStr).trim();
  const numYear = Number(year);
  if (isNaN(numYear)) return false;

  if (d.startsWith(`${numYear}-`) || d.startsWith(`${numYear}/`)) {
    return true;
  }
  if (d.endsWith(`/${numYear}`) || d.endsWith(`-${numYear}`) || d.endsWith(`.${numYear}`)) {
    return true;
  }
  const parts = d.split(/[-/.]/);
  if (parts.length === 3) {
    if (parts[0].length === 4 && parseInt(parts[0], 10) === numYear) return true;
    if (parts[2].length === 4 && parseInt(parts[2], 10) === numYear) return true;
  }
  return false;
};

/**
 * Tải file Excel mẫu chuyên dụng cho module Phép Tồn chuẩn 6 cột:
 * | Mã nhân viên | Tên | Bộ phận | Phép tồn năm 2025 | Phép phát sinh năm 2026 | Số ngày còn lại |
 */
export const exportLeaveBalanceTemplateExcel = (
  employees?: Employee[],
  month?: number | null,
  year: number = 2026
) => {
  const sampleEmps =
    employees && employees.length > 0
      ? employees.slice(0, 10)
      : [
          { id: 'S0076', fullName: 'Bùi Quang Tùng', department: 'Utility Part' },
          { id: 'S/M0044', fullName: 'Bùi Văn Hưng', department: 'Utility Part' },
          { id: 'S0098', fullName: 'Dương Quang Thắng', department: 'Utility Part' },
          { id: 'S0059', fullName: 'Dương Thành Trung', department: 'Utility Part' },
          { id: 'NV001', fullName: 'Trần Văn An', department: 'Phòng Kỹ thuật' },
        ];

  const sampleRows = sampleEmps.map((emp, idx) => {
    const carried = idx === 0 ? 2 : idx === 1 ? 1.5 : idx === 2 ? 0 : idx === 3 ? 3 : 2.5;
    const generated = 12;
    const remaining = carried + generated;

    return {
      'Mã nhân viên': emp.id,
      'Tên': emp.fullName,
      'Bộ phận': emp.department || 'Phòng Kỹ thuật',
      'Phép tồn năm 2025': carried,
      'Phép phát sinh năm 2026': generated,
      'Số ngày còn lại': remaining,
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(sampleRows);
  worksheet['!cols'] = [
    { wch: 16 }, // Mã nhân viên
    { wch: 26 }, // Tên
    { wch: 22 }, // Bộ phận
    { wch: 22 }, // Phép tồn năm 2025
    { wch: 25 }, // Phép phát sinh năm 2026
    { wch: 20 }, // Số ngày còn lại
  ];

  const workbook = XLSX.utils.book_new();
  const sheetTitle = month ? `Phep_Ton_T${month}_${year}` : `Phep_Ton_${year}`;
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetTitle);
  XLSX.writeFile(workbook, `Mau_Nhap_Phep_Ton_${year}.xlsx`);
};

/**
 * Phân tích và kiểm tra file Excel Phép Tồn với cấu trúc chuẩn 6 cột:
 * Mã nhân viên | Tên | Bộ phận | Phép tồn năm 2025 | Phép phát sinh năm 2026 | Số ngày còn lại
 */
export const parseEmployeeLeaveBalanceExcel = (
  rawRows: any[][],
  headerRowIndex: number = 0,
  defaultYear: number = 2026,
  defaultMonth: number | null = null
): {
  validRows: EmployeeLeaveBalanceRecord[];
  errorRows: Array<{ rowNum: number; error: string; raw: any }>;
  totalRows: number;
} => {
  if (!rawRows || rawRows.length <= headerRowIndex) {
    return { validRows: [], errorRows: [], totalRows: 0 };
  }

  const headerRow = rawRows[headerRowIndex] || [];
  const headers = headerRow.map((c) => String(c || '').trim());

  // Tìm index các cột
  let colEmpCode = -1;
  let colEmpName = -1;
  let colDept = -1;
  let colLeave2025 = -1;
  let colLeave2026 = -1;
  let colRemaining = -1;

  headers.forEach((h, idx) => {
    const clean = h.toLowerCase();
    if (colEmpCode === -1 && /mã\s*nhân\s*viên|mã\s*nv|employee.*code|emp.*code|^mã$|^code$/i.test(clean)) {
      colEmpCode = idx;
    } else if (colEmpName === -1 && /họ\s*và\s*tên|^tên$|họ\s*tên|full.*name|^name$/i.test(clean)) {
      colEmpName = idx;
    } else if (colDept === -1 && /bộ\s*phận|phòng\s*ban|department|bộ\s*phận\s*làm\s*việc/i.test(clean)) {
      colDept = idx;
    } else if (colLeave2025 === -1 && /tồn.*2025|phép\s*tồn.*2025|tồn\s*năm\s*trước|phép\s*tồn|tồn\s*cũ|carried.*over/i.test(clean)) {
      colLeave2025 = idx;
    } else if (colLeave2026 === -1 && /phát\s*sinh.*2026|phát\s*sinh|cấp.*2026|phép.*2026|allocated|cấp\s*mới/i.test(clean)) {
      colLeave2026 = idx;
    } else if (colRemaining === -1 && /số\s*ngày\s*còn\s*lại|còn\s*lại|remaining|số\s*dư/i.test(clean)) {
      colRemaining = idx;
    }
  });

  // Fallback theo vị trí nếu không tìm thấy theo tiêu đề
  if (colEmpCode === -1) colEmpCode = 0;
  if (colEmpName === -1 && headers.length > 1) colEmpName = 1;
  if (colDept === -1 && headers.length > 2) colDept = 2;
  if (colLeave2025 === -1 && headers.length > 3) colLeave2025 = 3;
  if (colLeave2026 === -1 && headers.length > 4) colLeave2026 = 4;
  if (colRemaining === -1 && headers.length > 5) colRemaining = 5;

  const validRows: EmployeeLeaveBalanceRecord[] = [];
  const errorRows: Array<{ rowNum: number; error: string; raw: any }> = [];
  const seenCodes = new Set<string>();

  const parseNum = (val: any): number => {
    if (val === undefined || val === null || val === '' || val === '-') return 0;
    const str = String(val).replace(',', '.').trim();
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
  };

  for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row || row.length === 0) continue;

    // Bỏ qua dòng hoàn toàn trống
    const hasAnyValue = row.some((c) => c !== undefined && c !== null && String(c).trim() !== '');
    if (!hasAnyValue) continue;

    const rawCode = colEmpCode !== -1 ? row[colEmpCode] : undefined;
    const cleanCode = rawCode !== undefined && rawCode !== null ? String(rawCode).trim().toUpperCase() : '';

    if (!cleanCode) {
      errorRows.push({
        rowNum: i + 1,
        error: 'Thiếu mã nhân viên',
        raw: row,
      });
      continue;
    }

    if (seenCodes.has(cleanCode)) {
      // Đã có trong file
      errorRows.push({
        rowNum: i + 1,
        error: `Mã nhân viên "${cleanCode}" bị trùng lặp trong file`,
        raw: row,
      });
      continue;
    }
    seenCodes.add(cleanCode);

    const empName = colEmpName !== -1 && row[colEmpName] ? String(row[colEmpName]).trim() : `Nhân viên ${cleanCode}`;
    const dept = colDept !== -1 && row[colDept] ? String(row[colDept]).trim() : 'Phòng Kỹ thuật';
    const carried2025 = colLeave2025 !== -1 ? parseNum(row[colLeave2025]) : 0;
    const generated2026 = colLeave2026 !== -1 ? parseNum(row[colLeave2026]) : 12;
    let remaining =
      colRemaining !== -1 && row[colRemaining] !== '' && row[colRemaining] !== undefined
        ? parseNum(row[colRemaining])
        : Math.round((carried2025 + generated2026) * 100) / 100;

    validRows.push({
      employeeCode: cleanCode,
      employeeName: empName,
      department: dept,
      leaveBalance2025: carried2025,
      leaveGenerated2026: generated2026,
      remainingDays: remaining,
      month: defaultMonth,
      year: defaultYear,
    });
  }

  return {
    validRows,
    errorRows,
    totalRows: validRows.length + errorRows.length,
  };
};



