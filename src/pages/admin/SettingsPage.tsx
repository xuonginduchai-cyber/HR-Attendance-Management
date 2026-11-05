import React, { useState, useEffect } from 'react';
import { Settings, Building, Clock, DollarSign, Calendar, Save, CheckCircle2 } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { Card } from '../../components/common/Card';

export const SettingsPage: React.FC = () => {
  const { settings, updateSettings } = useData();

  const [formState, setFormState] = useState(settings);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Đồng bộ formState khi settings trong context cập nhật hoặc nạp từ storage
  useEffect(() => {
    setFormState(settings);
  }, [settings]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings(formState);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Cài Đặt Tham Số & Quy Chế</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Cấu hình thời gian làm việc chuẩn, ngày chốt lương, tỷ lệ bảo hiểm và thông tin pháp nhân
          </p>
        </div>

        {saveSuccess && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
            <CheckCircle2 className="w-4 h-4" />
            <span>Đã lưu cài đặt thành công!</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Company Profile Settings */}
        <Card
          title="Thông Tin Pháp Nhân Doanh Nghiệp"
          subtitle="Hiển thị trên tiêu đề bảng lương, báo cáo xuất bản và phiếu công"
        >
          <div className="space-y-3 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Tên Doanh Nghiệp / Công Ty
              </label>
              <input
                type="text"
                value={formState.companyName}
                onChange={(e) => setFormState({ ...formState, companyName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Mã Số Thuế (MST)</label>
                <input
                  type="text"
                  value={formState.companyTaxCode}
                  onChange={(e) => setFormState({ ...formState, companyTaxCode: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Địa Chỉ Trụ Sở</label>
                <input
                  type="text"
                  value={formState.companyAddress}
                  onChange={(e) => setFormState({ ...formState, companyAddress: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Working Hours & Shift Rules */}
        <Card
          title="Quy Định Khung Giờ Làm Việc"
          subtitle="Dùng làm mốc so sánh xác định Đi muộn, Về sớm hoặc Tính công"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Giờ Bắt Đầu Tiêu Chuẩn (Check-in)
              </label>
              <input
                type="time"
                value={formState.standardCheckIn}
                onChange={(e) => setFormState({ ...formState, standardCheckIn: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">Sau giờ này tính là đi muộn</span>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Giờ Kết Thúc Tiêu Chuẩn (Check-out)
              </label>
              <input
                type="time"
                value={formState.standardCheckOut}
                onChange={(e) => setFormState({ ...formState, standardCheckOut: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">Trước giờ này tính là về sớm</span>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Thời Gian Ân Hạn Cho Phép (Phút)
              </label>
              <input
                type="number"
                value={formState.gracePeriodMinutes}
                onChange={(e) =>
                  setFormState({ ...formState, gracePeriodMinutes: Number(e.target.value) })
                }
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Cho phép quẹt thẻ trễ tối đa mà không bị phạt
              </span>
            </div>
          </div>
        </Card>

        {/* Payroll & Insurance Rules */}
        <Card
          title="Chính Sách Lương & Chốt Công"
          subtitle="Cấu hình phục vụ tính toán tự động phiếu lương hàng tháng"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Ngày Chốt Bảng Lương Hàng Tháng
              </label>
              <input
                type="number"
                min="1"
                max="31"
                value={formState.salaryCutoffDay}
                onChange={(e) =>
                  setFormState({ ...formState, salaryCutoffDay: Number(e.target.value) })
                }
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Ví dụ: Ngày 25 hàng tháng
              </span>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Số Ngày Công Tiêu Chuẩn / Tháng
              </label>
              <input
                type="number"
                value={formState.standardMonthlyWorkDays}
                onChange={(e) =>
                  setFormState({ ...formState, standardMonthlyWorkDays: Number(e.target.value) })
                }
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">Mặc định: 22 ngày công</span>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Tỷ Lệ Khấu Trừ Bảo Hiểm (%)
              </label>
              <input
                type="number"
                step="0.5"
                value={formState.insurancePercent}
                onChange={(e) =>
                  setFormState({ ...formState, insurancePercent: Number(e.target.value) })
                }
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                BHXH (8%) + BHYT (1.5%) + BHTN (1%) = 10.5%
              </span>
            </div>
          </div>
        </Card>

        {/* Holiday Schedule Preview */}
        <Card
          title="Lịch Nghỉ Lễ Tết Theo Luật Lao Động 2026"
          subtitle="Tự động tính ngày hưởng nguyên lương trong kỳ công"
        >
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100">
              <span className="font-semibold text-slate-700">Tết Dương Lịch 2026</span>
              <span className="text-slate-500">01/01/2026 (1 ngày)</span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100">
              <span className="font-semibold text-slate-700">Tết Nguyên Đán Bính Ngọ 2026</span>
              <span className="text-slate-500">16/02/2026 - 22/02/2026 (7 ngày)</span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100">
              <span className="font-semibold text-slate-700">Giỗ Tổ Hùng Vương</span>
              <span className="text-slate-500">26/04/2026 (1 ngày)</span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100">
              <span className="font-semibold text-slate-700">Ngày Chiến Thắng & Quốc Tế Lao Động</span>
              <span className="text-slate-500">30/04/2026 - 01/05/2026 (2 ngày)</span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100">
              <span className="font-semibold text-slate-700">Quốc Khánh 02/09</span>
              <span className="text-slate-500">01/09/2026 - 02/09/2026 (2 ngày)</span>
            </div>
          </div>
        </Card>

        {/* Save button */}
        <div className="flex justify-end">
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-indigo-600/20 transition"
          >
            <Save className="w-4 h-4" />
            <span>Lưu Toàn Bộ Cấu Hình</span>
          </button>
        </div>
      </form>
    </div>
  );
};

