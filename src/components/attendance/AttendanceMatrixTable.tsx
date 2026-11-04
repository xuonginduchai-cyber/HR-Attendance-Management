import React, { useState } from 'react';
import {
  Clock,
  Coffee,
  Briefcase,
  Moon,
  Sun,
  AlertCircle,
  Calendar,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { EmployeeAttendanceMatrix } from '../../types';

interface AttendanceMatrixTableProps {
  matrix: EmployeeAttendanceMatrix;
  employeeInfo?: {
    stt?: number;
    id: string;
    fullName: string;
    department: string;
    startDate: string;
    position?: string;
    status?: string;
  };
  title?: string;
  hideHeaderCard?: boolean;
  hideSummaryCards?: boolean;
}

export const AttendanceMatrixTable: React.FC<AttendanceMatrixTableProps> = ({
  matrix,
  employeeInfo,
  title,
  hideHeaderCard = false,
  hideSummaryCards = false,
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(100);

  const daysInMonth = matrix.daysInMonth || 31;
  const dayNumbers = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Zoom controls
  const handleZoomIn = () => setZoomLevel((prev) => Math.min(130, prev + 10));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(80, prev - 10));
  const handleZoomReset = () => setZoomLevel(100);

  const isWeekendDay = (day: number) => {
    const dow = matrix.daysOfWeek[day]?.toLowerCase();
    return dow === 'sun' || dow === 'sat' || dow === 'cn' || dow === 't7';
  };

  return (
    <div className="space-y-4">
      {/* A. THÔNG TIN NHÂN VIÊN PHÍA TRÊN BẢNG (Theo đúng mục 4A) */}
      {!hideHeaderCard && (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-700 text-white flex items-center justify-center font-black text-lg shadow-sm shadow-indigo-500/20">
              {matrix.employeeId.slice(0, 2)}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-black text-slate-900">
                  {matrix.fullName || employeeInfo?.fullName}
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Mã NV: {matrix.employeeId}
                </span>
                {employeeInfo?.status && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                      employeeInfo.status === 'probation'
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : employeeInfo.status === 'active'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}
                  >
                    {employeeInfo.status === 'probation' ? 'Thử việc' : 'Chính thức'}
                  </span>
                )}
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  Tháng {matrix.month}/{matrix.year}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs text-slate-600 mt-1.5">
                {employeeInfo?.stt && (
                  <div>
                    <span className="text-slate-400">STT:</span>{' '}
                    <strong className="text-slate-800">{employeeInfo.stt}</strong>
                  </div>
                )}
                <div>
                  <span className="text-slate-400">Bộ phận:</span>{' '}
                  <strong className="text-indigo-900 font-bold">
                    {matrix.department || employeeInfo?.department || 'Utility Part'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400">Ngày vào làm:</span>{' '}
                  <strong className="text-slate-800">
                    {matrix.startDate || employeeInfo?.startDate || '--'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400">Chức vụ:</span>{' '}
                  <strong className="text-slate-800">
                    {employeeInfo?.position || 'Nhân viên'}
                  </strong>
                </div>
              </div>
            </div>
          </div>

          {/* Controls: Zoom Table */}
          <div className="flex items-center gap-1.5 self-end md:self-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            <button
              type="button"
              onClick={handleZoomOut}
              className="p-1.5 rounded-lg hover:bg-white text-slate-600 transition"
              title="Thu nhỏ bảng"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 text-[11px] font-mono font-bold text-slate-600 min-w-[40px] text-center">
              {zoomLevel}%
            </span>
            <button
              type="button"
              onClick={handleZoomIn}
              className="p-1.5 rounded-lg hover:bg-white text-slate-600 transition"
              title="Phóng to bảng"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            {zoomLevel !== 100 && (
              <button
                type="button"
                onClick={handleZoomReset}
                className="p-1.5 rounded-lg hover:bg-white text-slate-600 transition"
                title="Khôi phục kích thước"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* B. BẢNG CÔNG CHI TIẾT GIỮ NGUYÊN CẤU TRÚC HÀNG NGANG GIỐNG EXCEL MẪU (Mục 4B & 4C) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Table Title Bar */}
        <div className="p-3 sm:p-4 bg-slate-50/80 border-b border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-600" />
            <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 uppercase tracking-wide">
              {title || `BẢNG CÔNG CHI TIẾT – THÁNG ${matrix.month}/${matrix.year}`}
            </h4>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800">
              {matrix.rows.length} chỉ tiêu
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            {hideHeaderCard && (
              <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-200 text-xs shadow-2xs">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-600 transition cursor-pointer"
                  title="Thu nhỏ bảng"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="px-1 text-[11px] font-mono font-bold text-slate-600 min-w-[36px] text-center">
                  {zoomLevel}%
                </span>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-600 transition cursor-pointer"
                  title="Phóng to bảng"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                {zoomLevel !== 100 && (
                  <button
                    type="button"
                    onClick={handleZoomReset}
                    className="p-1 rounded-lg hover:bg-slate-100 text-slate-600 transition cursor-pointer"
                    title="Khôi phục kích thước"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
            <span className="text-[11px] text-slate-500 italic hidden md:inline">
              * Cố định cột Nội dung &amp; cột TỔNG khi cuộn ngang &bull; Số liệu căn giữa
            </span>
          </div>
        </div>

        {/* Khung cuộn ngang mượt mà, giữ nguyên hàng ngang giống 100% Excel */}
        <div className="overflow-x-auto max-w-full" style={{ fontSize: `${(zoomLevel / 100) * 12}px` }}>
          <table className="w-full border-collapse text-slate-800 select-text">
            {/* HÀNG 1: SỐ THỨ TỰ NGÀY TRONG THÁNG (1..31) VÀ CỘT TỔNG */}
            <thead>
              <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                {/* Cột cố định góc trái: Nội dung chỉ tiêu */}
                <th
                  className="sticky left-0 bg-slate-100/95 backdrop-blur-xs py-2.5 px-3.5 text-left font-black tracking-wide border-r border-slate-300 z-30 shadow-xs whitespace-nowrap min-w-[210px]"
                  style={{ width: '220px' }}
                >
                  Nội dung chỉ tiêu
                </th>

                {/* Các ngày trong tháng (1..31) */}
                {dayNumbers.map((d) => {
                  const isWk = isWeekendDay(d);
                  return (
                    <th
                      key={`day-header-${d}`}
                      className={`py-2 px-1 text-center font-mono font-bold border-r border-slate-200 min-w-[38px] max-w-[46px] ${
                        isWk ? 'bg-slate-200/80 text-slate-700' : 'bg-slate-100 text-slate-900'
                      }`}
                    >
                      {d}
                    </th>
                  );
                })}

                {/* Cột TỔNG cố định góc phải */}
                <th
                  className="sticky right-0 bg-indigo-100/95 backdrop-blur-xs py-2.5 px-3 text-center font-black text-indigo-950 border-l-2 border-indigo-300 z-30 shadow-xs min-w-[85px] max-w-[95px] whitespace-nowrap"
                  title="Tổng thống kê riêng cho từng hàng chỉ tiêu"
                >
                  TỔNG
                </th>
              </tr>

              {/* HÀNG 2: THỨ TƯƠNG ỨNG VỚI TỪNG NGÀY (Thu, Fri, Sat, Sun...) */}
              <tr className="bg-slate-50 text-slate-600 font-semibold text-[11px] border-b border-slate-300">
                <th className="sticky left-0 bg-slate-50/95 backdrop-blur-xs py-1 px-3.5 text-left font-bold text-slate-500 border-r border-slate-300 z-30 italic">
                  Thứ
                </th>

                {dayNumbers.map((d) => {
                  const dayName = matrix.daysOfWeek[d] || '';
                  const isWk = isWeekendDay(d);
                  return (
                    <th
                      key={`dow-header-${d}`}
                      className={`py-1 px-1 text-center border-r border-slate-200 font-sans ${
                        isWk
                          ? 'bg-slate-100 text-amber-700 font-bold'
                          : 'bg-slate-50 text-slate-500'
                      }`}
                    >
                      {dayName}
                    </th>
                  );
                })}

                <th className="sticky right-0 bg-indigo-50/95 backdrop-blur-xs py-1 px-3 text-center text-indigo-800 font-bold border-l-2 border-indigo-200 z-30 text-[10px]">
                  --
                </th>
              </tr>
            </thead>

            {/* CÁC DÒNG NỘI DUNG CHỈ TIÊU (Mỗi dòng là một hàng ngang đúng như Excel mẫu) */}
            <tbody className="divide-y divide-slate-100 font-mono">
              {matrix.rows.map((row, rIdx) => {
                const isWorkHoursRow = /thời\s*gian\s*làm\s*việc|giờ\s*làm/i.test(row.indicatorName);
                const isLeaveRow = /nghỉ\s*làm|nghỉ$/i.test(row.indicatorName);
                const isOtRow = /TC|tăng\s*ca|phụ\s*cấp/i.test(row.indicatorName);
                const isTimeRow = row.dataType === 'time';

                let rowBgClass = 'hover:bg-slate-50/80 transition';
                if (isWorkHoursRow) rowBgClass = 'bg-blue-50/20 hover:bg-blue-50/40 font-semibold';
                else if (isLeaveRow) rowBgClass = 'bg-amber-50/20 hover:bg-amber-50/40';
                else if (isOtRow) rowBgClass = 'bg-purple-50/15 hover:bg-purple-50/30';

                return (
                  <tr key={`matrix-row-${rIdx}`} className={rowBgClass}>
                    {/* Cột Tên chỉ tiêu: Cố định bên trái khi cuộn */}
                    <td
                      className="sticky left-0 bg-white py-2 px-3.5 text-left font-sans font-bold text-slate-800 border-r border-slate-200/90 z-20 shadow-2xs whitespace-nowrap"
                      style={{ maxWidth: '220px' }}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="text-[10px] text-slate-400 font-mono w-4">
                          {rIdx + 1}.
                        </span>
                        <span className="truncate" title={row.indicatorName}>
                          {row.indicatorName}
                        </span>
                      </div>
                    </td>

                    {/* Dữ liệu ngày 1 đến ngày 31 */}
                    {dayNumbers.map((d) => {
                      const val = row.values[d];
                      const isWk = isWeekendDay(d);

                      let cellDisplay: React.ReactNode = val !== undefined && val !== null ? String(val) : '-';
                      let cellClass = 'text-center py-2 px-1 border-r border-slate-100 text-slate-700';

                      if (isWk) {
                        cellClass += ' bg-slate-50/40 text-slate-400';
                      }

                      if (isTimeRow) {
                        cellClass += ' text-[11px] font-mono';
                        if (val === '-' || !val) {
                          cellDisplay = <span className="text-slate-300">-</span>;
                        }
                      } else if (isLeaveRow) {
                        if (val === 'P') {
                          cellDisplay = (
                            <span className="inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-[11px] border border-amber-200 shadow-2xs">
                              P
                            </span>
                          );
                        } else if (val === 'HL') {
                          cellDisplay = (
                            <span className="inline-block px-1.5 py-0.5 rounded bg-blue-100 text-blue-900 font-bold text-[11px] border border-blue-200 shadow-2xs">
                              HL
                            </span>
                          );
                        } else if (val === 'KP') {
                          cellDisplay = (
                            <span className="inline-block px-1.5 py-0.5 rounded bg-rose-100 text-rose-900 font-bold text-[11px] border border-rose-200 shadow-2xs">
                              KP
                            </span>
                          );
                        } else if (val === '-' || !val) {
                          cellDisplay = <span className="text-slate-300">-</span>;
                        }
                      } else if (isOtRow) {
                        if (typeof val === 'number' && val > 0) {
                          cellDisplay = (
                            <span className="inline-block px-1 py-0.5 rounded bg-purple-100 text-purple-900 font-black text-[11px] border border-purple-200/90 shadow-2xs">
                              {val}
                            </span>
                          );
                        } else if (val === '-' || !val) {
                          cellDisplay = <span className="text-slate-300">-</span>;
                        }
                      } else if (isWorkHoursRow) {
                        if (typeof val === 'number' && val > 0) {
                          cellDisplay = <span className="font-bold text-slate-900">{val}</span>;
                        } else if (val === '-' || !val) {
                          cellDisplay = <span className="text-slate-300">-</span>;
                        }
                      }

                      return (
                        <td key={`cell-${rIdx}-${d}`} className={cellClass}>
                          {cellDisplay}
                        </td>
                      );
                    })}

                    {/* Cột TỔNG: Thống kê riêng từng hàng chỉ tiêu (Mục 4C) */}
                    <td className="sticky right-0 bg-indigo-50/90 backdrop-blur-xs py-2 px-2.5 text-center font-bold border-l-2 border-indigo-200 z-20 shadow-2xs whitespace-nowrap">
                      {row.total === '-' || row.total === undefined ? (
                        <span className="text-slate-400 font-medium">-</span>
                      ) : (
                        <div className="inline-flex items-baseline justify-center gap-0.5">
                          <span className="text-xs sm:text-sm font-black font-mono text-indigo-700">
                            {row.total}
                          </span>
                          {row.unit && (
                            <span className="text-[10px] text-slate-500 font-sans">
                              {row.unit}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* C. THẺ TỔNG HỢP THEO TỪNG CHỈ TIÊU (Mục 4D) */}
      {!hideSummaryCards && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
          {/* 1. Tổng thời gian làm việc */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-3 shadow-xs">
            <div className="flex items-center gap-1.5 text-blue-600 mb-1">
              <Briefcase className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Tổng giờ làm</span>
            </div>
            <div className="text-base sm:text-lg font-black font-mono text-slate-900">
              {matrix.summary.totalWorkHours} <span className="text-xs font-normal text-slate-500">giờ</span>
            </div>
          </div>

          {/* 2. Tổng TC ngày thường (150%) */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-3 shadow-xs">
            <div className="flex items-center gap-1.5 text-purple-600 mb-1">
              <Clock className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold uppercase tracking-wider truncate" title="TC ngày thường (150%)">
                TC thường (150%)
              </span>
            </div>
            <div className="text-base sm:text-lg font-black font-mono text-purple-700">
              {matrix.summary.overtime150} <span className="text-xs font-normal text-slate-500">giờ</span>
            </div>
          </div>

          {/* 3. Tổng TC đêm ngày thường (210%) */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-3 shadow-xs">
            <div className="flex items-center gap-1.5 text-indigo-600 mb-1">
              <Moon className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold uppercase tracking-wider truncate" title="TC đêm ngày thường (210%)">
                TC đêm (210%)
              </span>
            </div>
            <div className="text-base sm:text-lg font-black font-mono text-indigo-700">
              {matrix.summary.overtime210} <span className="text-xs font-normal text-slate-500">giờ</span>
            </div>
          </div>

          {/* 4. Tổng phụ cấp ca đêm (30%) */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-3 shadow-xs">
            <div className="flex items-center gap-1.5 text-amber-600 mb-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold uppercase tracking-wider truncate" title="Phụ cấp ca đêm (30%)">
                PC ca đêm (30%)
              </span>
            </div>
            <div className="text-base sm:text-lg font-black font-mono text-amber-700">
              {matrix.summary.nightAllowance30} <span className="text-xs font-normal text-slate-500">giờ</span>
            </div>
          </div>

          {/* 5. Tổng TC ngày Chủ nhật (200%) */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-3 shadow-xs">
            <div className="flex items-center gap-1.5 text-emerald-600 mb-1">
              <Sun className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold uppercase tracking-wider truncate" title="TC ngày Chủ nhật (200%)">
                TC CN (200%)
              </span>
            </div>
            <div className="text-base sm:text-lg font-black font-mono text-emerald-700">
              {matrix.summary.overtimeSunday200} <span className="text-xs font-normal text-slate-500">giờ</span>
            </div>
          </div>

          {/* 6. Tổng TC đêm Chủ nhật (270%) */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-3 shadow-xs">
            <div className="flex items-center gap-1.5 text-rose-600 mb-1">
              <Moon className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold uppercase tracking-wider truncate" title="TC đêm Chủ nhật (270%)">
                TC đêm CN (270%)
              </span>
            </div>
            <div className="text-base sm:text-lg font-black font-mono text-rose-700">
              {matrix.summary.overtimeSunday270} <span className="text-xs font-normal text-slate-500">giờ</span>
            </div>
          </div>

          {/* 7. Tổng số ngày nghỉ */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-3 shadow-xs col-span-2 sm:col-span-1">
            <div className="flex items-center gap-1.5 text-slate-600 mb-1">
              <Coffee className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold uppercase tracking-wider truncate">
                Tổng ngày nghỉ
              </span>
            </div>
            <div className="text-base sm:text-lg font-black font-mono text-slate-800">
              {matrix.summary.totalLeaveDays} <span className="text-xs font-normal text-slate-500">ngày</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

