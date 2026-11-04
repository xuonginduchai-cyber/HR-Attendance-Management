import * as XLSX from 'xlsx';
import { Employee, AttendanceRecord, PayrollRecord } from '../types';
import { CalculatedAttendanceSummary } from '../services/lookupService';
import { formatDate, getDayOfWeek, getAttendanceStatusLabel } from './formatters';

interface ExportAttendanceParams {
  employee: Employee;
  attendanceDaily: AttendanceRecord[];
  summary: CalculatedAttendanceSummary;
  payrollSummary?: PayrollRecord;
  month: number;
  year: number;
}

/**
 * Xuất dữ liệu tra cứu chấm công của nhân viên ra file Excel (.xlsx) chuẩn nghiệp vụ
 */
export const exportAttendanceToExcel = ({
  employee,
  attendanceDaily,
  summary,
  payrollSummary,
  month,
  year,
}: ExportAttendanceParams): void => {
  const wb = XLSX.utils.book_new();

  const rows: any[][] = [];

  // 1. Tiêu đề chính
  rows.push(['CÔNG TY CỔ PHẦN CÔNG NGHỆ VÀ TRUYỀN THÔNG VIỆT NAM']);
  rows.push([`BẢNG TỔNG HỢP CHẤM CÔNG VÀ LÀM VIỆC - THÁNG ${month}/${year}`]);
  rows.push([`Thời gian trích xuất: ${new Date().toLocaleString('vi-VN')}`]);
  rows.push([]);

  // 2. Thông tin nhân sự
  const contractStatusText = employee.status === 'probation' ? 'Thử việc' : 'Chính thức';
  rows.push(['I. THÔNG TIN NHÂN SỰ']);
  rows.push(['Mã nhân viên:', employee.id, '', 'Họ và tên:', employee.fullName, '', 'Trạng thái:', contractStatusText]);
  rows.push(['Phòng ban / Bộ phận:', employee.department, '', 'Ngày vào làm việc:', formatDate(employee.startDate), '', 'Kỳ tính công:', `Tháng ${month}/${year}`]);
  if (employee.bankAccount && employee.bankAccount.accountNumber) {
    rows.push(['Tài khoản nhận lương:', `${employee.bankAccount.bankName} - Số TK: ${employee.bankAccount.accountNumber} (${employee.bankAccount.branch || 'Hội sở'})`]);
  }
  rows.push([]);

  // 3. Các chỉ tiêu tổng hợp (KPI công)
  rows.push(['II. CÁC CHỈ TIÊU TỔNG HỢP THÁNG']);
  rows.push([
    'Ngày công chuẩn:',
    summary.standardWorkDays,
    'Ngày công thực tế:',
    summary.actualWorkDays,
    'Tổng giờ làm việc:',
    `${summary.totalWorkHours} giờ`,
  ]);
  rows.push([
    'Đúng giờ:',
    `${summary.onTimeDays} ngày`,
    'Đi muộn:',
    `${summary.lateDays} buổi (${summary.totalLateMinutes} phút)`,
    'Về sớm:',
    `${summary.earlyLeaveDays} buổi (${summary.totalEarlyMinutes} phút)`,
  ]);
  rows.push([
    'Nghỉ phép hưởng lương:',
    `${summary.paidLeaveDays} ngày`,
    'Nghỉ không lương:',
    `${summary.unpaidLeaveDays} ngày`,
    'Tăng ca / OT:',
    `${summary.overtimeHours} giờ`,
  ]);

  if (payrollSummary && payrollSummary.netSalary > 0) {
    rows.push([
      'Lương cơ bản:',
      payrollSummary.baseSalary.toLocaleString('vi-VN') + ' đ',
      'Lương thực lĩnh (NET):',
      payrollSummary.netSalary.toLocaleString('vi-VN') + ' đ',
      'Trạng thái thanh toán:',
      payrollSummary.paymentStatus === 'paid' ? 'Đã chi trả' : 'Đang duyệt',
    ]);
  }
  rows.push([]);

  // 4. Bảng chấm công chi tiết theo ngày (Đầy đủ ngày trong tháng theo mẫu.xlsx)
  rows.push(['III. BẢNG CHẤM CÔNG CHI TIẾT THEO NGÀY']);
  rows.push([
    'Ngày',
    'Thứ',
    'Bắt đầu',
    'Kết thúc',
    'Thời gian làm việc',
    'Nghỉ làm',
  ]);

  const daysInMonth = new Date(year, month, 0).getDate();
  const dayNameShortList = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const recMap = new Map<string, AttendanceRecord>();
  attendanceDaily.forEach((r) => {
    recMap.set(r.date, r);
  });

  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = String(day).padStart(2, '0');
    const monthStr = String(month).padStart(2, '0');
    const dateStr = `${year}-${monthStr}-${dayStr}`;
    const dateObj = new Date(year, month - 1, day);
    const dayShort = dayNameShortList[dateObj.getDay()];

    const rec = recMap.get(dateStr);
    let start = '-';
    let stop = '-';
    let workHoursDisplay = '-';
    let leaveDisplay = '-';

    if (rec) {
      if (rec.checkIn) start = rec.checkIn;
      if (rec.checkOut) stop = rec.checkOut;
      if (rec.workHours && rec.workHours > 0) workHoursDisplay = String(rec.workHours);

      if (rec.leaveCode && rec.leaveCode !== '-' && rec.leaveCode !== '0') {
        leaveDisplay = rec.leaveCode;
      } else if (rec.status === 'leave_approved' || rec.status === 'leave_unapproved') {
        leaveDisplay = rec.note && /HL/i.test(rec.note) ? 'HL' : 'P';
      }
    }

    rows.push([
      dayStr,
      dayShort,
      start,
      stop,
      workHoursDisplay,
      leaveDisplay,
    ]);
  }
  rows.push([]);

  // 5. Bảng tổng hợp công tăng ca và phụ cấp (Nhóm 2)
  rows.push(['IV. CÁC LOẠI CÔNG TĂNG CA VÀ PHỤ CẤP (NHÓM 2)']);
  rows.push(['STT', 'Nội dung chỉ tiêu', 'Tỷ lệ', 'Tổng cộng', 'Đơn vị tính']);
  const otIndicators = summary.overtimeIndicators || [
    { name: 'TC ngày thường (150%)', rate: '150%', total: summary.overtimeHours, unit: 'giờ' },
    { name: 'TC đêm ngày thường (210%)', rate: '210%', total: 0, unit: 'giờ' },
    { name: 'Phụ cấp ca đêm (30%)', rate: '30%', total: 0, unit: 'giờ' },
    { name: 'TC ngày Chủ nhật (200%)', rate: '200%', total: 0, unit: 'giờ' },
    { name: 'TC đêm Chủ nhật (270%)', rate: '270%', total: 0, unit: 'giờ' },
    { name: 'TC ngày lễ (300%)', rate: '300%', total: 0, unit: 'giờ' },
    { name: 'TC đêm ngày lễ (390%)', rate: '390%', total: 0, unit: 'giờ' },
    { name: 'Nghỉ có lương + ngày lễ', rate: '100%', total: summary.paidLeaveDays, unit: 'ngày' },
    { name: 'Nghỉ HL', rate: '100%', total: 0, unit: 'ngày' },
    { name: 'Nghỉ phép', rate: '100%', total: summary.paidLeaveDays, unit: 'ngày' },
  ];

  otIndicators.forEach((ind, i) => {
    rows.push([
      i + 5,
      ind.name,
      ind.rate || '',
      ind.total > 0 ? ind.total : '-',
      ind.unit || 'giờ',
    ]);
  });

  // 6. Phần chữ ký xác nhận
  rows.push([]);
  rows.push([]);
  rows.push(['', 'NGƯỜI LAO ĐỘNG', '', '', 'TRƯỞNG BỘ PHẬN', '', '', 'PHÒNG NHÂN SỰ']);
  rows.push(['', '(Ký và ghi rõ họ tên)', '', '', '(Ký và ghi rõ họ tên)', '', '', '(Ký và đóng dấu)']);

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Đặt độ rộng các cột
  ws['!cols'] = [
    { wch: 8 },  // STT / Label
    { wch: 15 }, // Ngày / Value
    { wch: 12 }, // Thứ
    { wch: 12 }, // Giờ vào / Label
    { wch: 18 }, // Giờ ra / Value
    { wch: 14 }, // Số giờ làm
    { wch: 18 }, // Trạng thái
    { wch: 16 }, // Đi muộn
    { wch: 16 }, // Về sớm
    { wch: 32 }, // Ghi chú
  ];

  XLSX.utils.book_append_sheet(wb, ws, `ChamCong_T${month}_${year}`);

  const fileName = `Bang_Cham_Cong_${employee.id}_T${month}_${year}.xlsx`;
  XLSX.writeFile(wb, fileName);
};

