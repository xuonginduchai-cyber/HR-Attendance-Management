import React, { useState } from 'react';
import { History, FileSpreadsheet, AlertTriangle, Eye, CheckCircle2, Clock } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { ImportLog } from '../../types';
import { Card } from '../../components/common/Card';
import { ImportStatusBadge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';
import { formatDateTime } from '../../utils/formatters';

export const ImportHistoryPage: React.FC = () => {
  const { importLogs } = useData();
  const [selectedLog, setSelectedLog] = useState<ImportLog | null>(null);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-800">Lịch Sử Nhập Dữ Liệu Chấm Công</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Nhật ký kiểm toán toàn bộ các tệp tin Excel / CSV đã được đẩy lên hệ thống
        </p>
      </div>

      {/* Desktop Table */}
      <div className="hidden lg:block bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Mã Đợt</th>
                <th className="py-3 px-4">Tên File</th>
                <th className="py-3 px-4">Người Thực Hiện</th>
                <th className="py-3 px-4">Thời Gian Nhập</th>
                <th className="py-3 px-4 text-center">Tổng Dòng</th>
                <th className="py-3 px-4 text-center">Thành Công</th>
                <th className="py-3 px-4 text-center">Lỗi</th>
                <th className="py-3 px-4">Trạng Thái</th>
                <th className="py-3 px-4 text-center">Chi Tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {importLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/80 transition">
                  <td className="py-3 px-4 font-mono font-bold text-slate-700">{log.id}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <span className="font-medium text-slate-800">{log.fileName}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-slate-700">{log.importedBy}</td>
                  <td className="py-3 px-4 text-slate-600">{formatDateTime(log.importedAt)}</td>
                  <td className="py-3 px-4 text-center font-bold text-slate-800">{log.totalRows}</td>
                  <td className="py-3 px-4 text-center font-bold text-emerald-600">
                    {log.successRows}
                  </td>
                  <td className="py-3 px-4 text-center font-bold text-rose-600">
                    {log.errorRows}
                  </td>
                  <td className="py-3 px-4">
                    <ImportStatusBadge status={log.status} />
                  </td>
                  <td className="py-3 px-4 text-center">
                    {log.errors && log.errors.length > 0 ? (
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="px-2.5 py-1 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition"
                      >
                        Xem lỗi ({log.errors.length})
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-400">Không có lỗi</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:hidden gap-3">
        {importLogs.map((log) => (
          <div
            key={log.id}
            className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm space-y-3"
          >
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span className="truncate max-w-[200px]">{log.fileName}</span>
                </h4>
                <span className="text-xs font-mono text-slate-400">{log.id}</span>
              </div>
              <ImportStatusBadge status={log.status} />
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-100">
              <div>
                <span className="text-slate-400 block">Tổng</span>
                <span className="font-bold text-slate-800">{log.totalRows}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Thành công</span>
                <span className="font-bold text-emerald-600">{log.successRows}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Lỗi</span>
                <span className="font-bold text-rose-600">{log.errorRows}</span>
              </div>
            </div>

            <div className="text-[11px] text-slate-500">
              Thực hiện bởi: <strong>{log.importedBy}</strong> lúc {formatDateTime(log.importedAt)}
            </div>

            {log.errors && log.errors.length > 0 && (
              <div className="flex justify-end pt-1">
                <button
                  onClick={() => setSelectedLog(log)}
                  className="px-3 py-1.5 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition"
                >
                  Xem chi tiết lỗi ({log.errors.length})
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Error Details Modal */}
      <Modal
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title="Nhật Ký Chi Tiết Lỗi Import"
        subtitle={selectedLog ? `Tệp tin: ${selectedLog.fileName} (${selectedLog.id})` : ''}
        size="md"
      >
        {selectedLog && (
          <div className="space-y-4">
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
              Có tổng cộng <strong>{selectedLog.errorRows} dòng dữ liệu</strong> không hợp lệ và đã bị bỏ qua khi ghi nhận vào hệ thống.
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">Dòng Excel</th>
                    <th className="py-2.5 px-3">Chi tiết lỗi phát hiện</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedLog.errors?.map((err, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-3 font-mono font-bold text-rose-700">
                        Dòng #{err.row}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">{err.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition"
              >
                Đóng
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

