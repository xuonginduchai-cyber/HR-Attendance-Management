import React, { useState, useMemo } from 'react';
import { History, FileSpreadsheet, AlertTriangle, Eye, CheckCircle2, Clock, Trash2, X } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { ImportLog } from '../../types';
import { Card } from '../../components/common/Card';
import { ImportStatusBadge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';
import { formatDateTime } from '../../utils/formatters';

export const ImportHistoryPage: React.FC = () => {
  const { importLogs, deleteImportLogs, deleteAllImportLogs } = useData();
  const [selectedLog, setSelectedLog] = useState<ImportLog | null>(null);

  // Checkbox selection state
  const [selectedLogIds, setSelectedLogIds] = useState<Set<string>>(new Set());

  // Modal Xóa Dữ Liệu
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState<'selected' | 'all' | 'single'>('selected');
  const [singleLogToDelete, setSingleLogToDelete] = useState<ImportLog | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState('');

  // Chọn / Bỏ chọn tất cả
  const isAllSelected = useMemo(() => {
    if (importLogs.length === 0) return false;
    return importLogs.every((l) => selectedLogIds.has(l.id));
  }, [importLogs, selectedLogIds]);

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedLogIds(new Set());
    } else {
      setSelectedLogIds(new Set(importLogs.map((l) => l.id)));
    }
  };

  const handleToggleSelectRow = (id: string) => {
    setSelectedLogIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      if (deleteMode === 'all') {
        await deleteAllImportLogs();
        setActionSuccessMessage('Đã xóa toàn bộ lịch sử nhập liệu thành công!');
        setSelectedLogIds(new Set());
      } else if (deleteMode === 'selected') {
        const ids = Array.from(selectedLogIds);
        await deleteImportLogs(ids);
        setActionSuccessMessage(`Đã xóa ${ids.length} bản ghi lịch sử nhập liệu đã chọn!`);
        setSelectedLogIds(new Set());
      } else if (deleteMode === 'single' && singleLogToDelete) {
        await deleteImportLogs([singleLogToDelete.id]);
        setActionSuccessMessage(`Đã xóa bản ghi lịch sử "${singleLogToDelete.fileName}" thành công!`);
        setSelectedLogIds((prev) => {
          const next = new Set(prev);
          next.delete(singleLogToDelete.id);
          return next;
        });
        setSingleLogToDelete(null);
      }
      setIsDeleteModalOpen(false);
    } catch (err: any) {
      alert(`Lỗi khi xóa lịch sử import: ${err?.message || 'Vui lòng thử lại'}`);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Lịch Sử Nhập Dữ Liệu Chấm Công</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Nhật ký kiểm toán toàn bộ các tệp tin Excel / CSV đã được đẩy lên hệ thống
          </p>
        </div>

        {importLogs.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setDeleteMode('all');
                setIsDeleteModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
              title="Xóa toàn bộ các bản ghi trong nhật ký lịch sử nhập"
            >
              <Trash2 className="w-4 h-4 text-rose-600" />
              <span>Xóa Toàn Bộ Lịch Sử</span>
            </button>
          </div>
        )}
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
      {selectedLogIds.size > 0 && (
        <div className="bg-indigo-50/90 border border-indigo-200 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2 text-xs font-semibold text-indigo-900">
            <CheckCircle2 className="w-4 h-4 text-indigo-600" />
            <span>
              Đã chọn <strong className="text-indigo-700 underline">{selectedLogIds.size}</strong> bản ghi lịch sử nhập liệu
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedLogIds(new Set())}
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
              <span>Xóa {selectedLogIds.size} bản ghi đã chọn</span>
            </button>
          </div>
        </div>
      )}

      {/* Desktop Table */}
      <div className="hidden lg:block bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={handleToggleSelectAll}
                    disabled={importLogs.length === 0}
                    className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:opacity-30"
                    title="Chọn / Bỏ chọn tất cả"
                  />
                </th>
                <th className="py-3 px-4">Mã Đợt</th>
                <th className="py-3 px-4">Tên File</th>
                <th className="py-3 px-4">Người Thực Hiện</th>
                <th className="py-3 px-4">Thời Gian Nhập</th>
                <th className="py-3 px-4 text-center">Tổng Dòng</th>
                <th className="py-3 px-4 text-center">Thành Công</th>
                <th className="py-3 px-4 text-center">Lỗi</th>
                <th className="py-3 px-4">Trạng Thái</th>
                <th className="py-3 px-4 text-center w-36">Chi Tiết / Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {importLogs.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-10 text-slate-400">
                    Chưa có lịch sử nhập liệu nào được ghi nhận.
                  </td>
                </tr>
              ) : (
                importLogs.map((log) => {
                  const isChecked = selectedLogIds.has(log.id);
                  return (
                    <tr
                      key={log.id}
                      className={`hover:bg-slate-50/80 transition ${
                        isChecked ? 'bg-indigo-50/40' : ''
                      }`}
                    >
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSelectRow(log.id)}
                          className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>
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
                        <div className="flex items-center justify-center gap-1.5">
                          {log.errors && log.errors.length > 0 ? (
                            <button
                              onClick={() => setSelectedLog(log)}
                              className="px-2.5 py-1 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition cursor-pointer"
                            >
                              Xem lỗi ({log.errors.length})
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400">Không có lỗi</span>
                          )}
                          <button
                            onClick={() => {
                              setSingleLogToDelete(log);
                              setDeleteMode('single');
                              setIsDeleteModalOpen(true);
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            title="Xóa bản ghi lịch sử này"
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
        {importLogs.length === 0 ? (
          <div className="col-span-full bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-xs">
            Chưa có lịch sử nhập liệu nào được ghi nhận.
          </div>
        ) : (
          importLogs.map((log) => {
            const isChecked = selectedLogIds.has(log.id);
            return (
              <div
                key={log.id}
                className={`bg-white rounded-xl border p-4 shadow-sm space-y-3 transition ${
                  isChecked ? 'border-indigo-400 bg-indigo-50/20' : 'border-slate-200/80'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleSelectRow(log.id)}
                      className="mt-1 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <div>
                      <h4 className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="truncate max-w-[180px]">{log.fileName}</span>
                      </h4>
                      <span className="text-xs font-mono text-slate-400">{log.id}</span>
                    </div>
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

                <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                  <div>
                    {log.errors && log.errors.length > 0 && (
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="px-3 py-1.5 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition"
                      >
                        Xem chi tiết lỗi ({log.errors.length})
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setSingleLogToDelete(log);
                      setDeleteMode('single');
                      setIsDeleteModalOpen(true);
                    }}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                    title="Xóa bản ghi lịch sử này"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* MODAL XÁC NHẬN XÓA LỊCH SỬ NHẬP LIỆU */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => !isDeleting && setIsDeleteModalOpen(false)}
        title={
          deleteMode === 'all'
            ? 'Xác Nhận Xóa Toàn Bộ Lịch Sử Nhập Liệu'
            : deleteMode === 'selected'
            ? `Xác Nhận Xóa ${selectedLogIds.size} Bản Ghi Lịch Sử Đã Chọn`
            : `Xác Nhận Xóa Bản Ghi Lịch Sử: ${singleLogToDelete?.fileName}`
        }
        subtitle="Cảnh báo: Thao tác này sẽ xóa các bản ghi nhật ký kiểm toán import"
        size="md"
      >
        <div className="space-y-4 text-xs text-slate-700">
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-rose-950 text-sm mb-1">
                {deleteMode === 'all'
                  ? 'Xóa toàn bộ lịch sử các đợt nhập liệu khỏi hệ thống'
                  : deleteMode === 'selected'
                  ? `Xóa ${selectedLogIds.size} bản ghi lịch sử đã tick chọn`
                  : `Xóa đợt nhập "${singleLogToDelete?.fileName}" (${singleLogToDelete?.id})`}
              </div>
              <p className="text-rose-800 leading-relaxed">
                {deleteMode === 'all'
                  ? 'CẢNH BÁO: Thao tác này sẽ XÓA TOÀN BỘ nhật ký các đợt import Excel trong danh sách. Lưu ý: Dữ liệu nhân viên, chấm công và bảng lương đã nạp vào cơ sở dữ liệu sẽ KHÔNG bị ảnh hưởng.'
                  : deleteMode === 'selected'
                  ? `CẢNH BÁO: Thao tác này sẽ XÓA ${selectedLogIds.size} bản ghi nhật ký import đã chọn. Lưu ý: Dữ liệu chấm công đã nạp trước đó sẽ KHÔNG bị ảnh hưởng.`
                  : `CẢNH BÁO: Thao tác này sẽ xóa nhật ký import của tệp "${singleLogToDelete?.fileName}". Dữ liệu chấm công thực tế đã nạp sẽ được giữ nguyên.`}
              </p>
            </div>
          </div>

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

