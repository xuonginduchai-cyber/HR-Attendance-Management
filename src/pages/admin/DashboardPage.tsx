import React from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  CalendarCheck,
  Clock,
  CalendarDays,
  Banknote,
  ArrowUpRight,
  UserPlus,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { StatCard } from '../../components/common/StatCard';
import { Card } from '../../components/common/Card';
import { AttendanceBadge, LeaveRequestBadge } from '../../components/common/Badge';
import { formatCurrency, formatDate } from '../../utils/formatters';

export const DashboardPage: React.FC = () => {
  const {
    employees,
    attendanceRecords,
    payrollRecords,
    leaveRequests,
    approveLeaveRequest,
    rejectLeaveRequest,
  } = useData();

  // Compute live stats for today (2026-11-03)
  const todayDate = '2026-11-03';
  const todayRecords = attendanceRecords.filter((r) => r.date === todayDate);

  const totalEmployees = employees.length;
  const onTimeToday = todayRecords.filter((r) => r.status === 'on_time').length;
  const lateToday = todayRecords.filter((r) => r.status === 'late').length;
  const leaveToday = todayRecords.filter((r) => r.status === 'leave_approved' || r.status === 'leave_unapproved').length;
  const presentToday = onTimeToday + lateToday;
  const attendanceRate = totalEmployees > 0 ? Math.round((presentToday / totalEmployees) * 100) : 0;

  // Monthly payroll calculation (Tháng 10/2026)
  const latestMonthPayrolls = payrollRecords.filter((p) => p.month === 10 && p.year === 2026);
  const totalPayrollAmount = latestMonthPayrolls.reduce((sum, p) => sum + p.netSalary, 0);

  // Pending Leave Requests
  const pendingLeaves = leaveRequests.filter((r) => r.status === 'pending');

  // Department distribution
  const departmentCounts = employees.reduce((acc, emp) => {
    acc[emp.department] = (acc[emp.department] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      {/* Top Banner with Quick Actions */}
      <div className="bg-gradient-to-r from-indigo-700 via-indigo-600 to-indigo-800 rounded-2xl p-6 text-white shadow-lg shadow-indigo-600/15 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/20 text-white mb-2">
            Hôm nay: 03/11/2026
          </span>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            Chào mừng trở lại, Ban Nhân Sự!
          </h2>
          <p className="text-xs sm:text-sm text-indigo-100 mt-1 max-w-xl">
            Tỷ lệ điểm danh hôm nay đạt <strong>{attendanceRate}%</strong>. Có{' '}
            <strong>{pendingLeaves.length} đơn xin nghỉ phép</strong> đang chờ bạn phê duyệt.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to="/admin/attendance"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white text-indigo-700 text-xs font-semibold shadow-sm hover:bg-indigo-50 transition"
          >
            <CalendarCheck className="w-4 h-4 text-indigo-600" />
            <span>Quản Lý Chấm Công</span>
          </Link>
          <Link
            to="/admin/payroll"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-500/40 hover:bg-indigo-500/60 border border-white/20 text-white text-xs font-semibold transition"
          >
            <Banknote className="w-4 h-4" />
            <span>Quản Lý Lương</span>
          </Link>
        </div>
      </div>

      {/* Metric Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Tổng nhân sự"
          value={totalEmployees}
          subValue="nhân viên"
          icon={Users}
          colorScheme="indigo"
          trend={{ value: '+1', isPositive: true, label: 'tháng này' }}
        />
        <StatCard
          title="Có mặt hôm nay"
          value={presentToday}
          subValue={`/${totalEmployees} người`}
          icon={CalendarCheck}
          colorScheme="emerald"
          trend={{ value: `${attendanceRate}%`, isPositive: true, label: 'tỷ lệ tham gia' }}
        />
        <StatCard
          title="Đi muộn hôm nay"
          value={lateToday}
          subValue="trường hợp"
          icon={Clock}
          colorScheme="amber"
          trend={{ value: '-2', isPositive: true, label: 'ít hơn hôm qua' }}
        />
        <StatCard
          title="Quỹ lương T10/2026"
          value={formatCurrency(totalPayrollAmount)}
          icon={Banknote}
          colorScheme="sky"
          trend={{ value: 'Đã quyết toán', isPositive: true, label: '8/8 nhân viên' }}
        />
      </div>

      {/* Main Grid: Attendance Rate & Department Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Attendance Breakdown Card */}
        <div className="lg:col-span-2 space-y-6">
          <Card
            title="Tình Hình Điểm Danh Hôm Nay"
            subtitle="Cập nhật tự động từ máy quét thẻ và dữ liệu hệ thống"
            action={
              <Link
                to="/admin/attendance"
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
              >
                Chi tiết <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            }
          >
            <div className="space-y-4">
              {/* Visual Progress Bar */}
              <div>
                <div className="flex justify-between text-xs font-medium text-slate-600 mb-1.5">
                  <span>Tiến độ có mặt: {presentToday}/{totalEmployees} nhân viên</span>
                  <span className="font-bold text-indigo-600">{attendanceRate}%</span>
                </div>
                <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex">
                  <div
                    style={{ width: `${(onTimeToday / totalEmployees) * 100}%` }}
                    className="bg-emerald-500 h-full"
                    title={`Đúng giờ: ${onTimeToday}`}
                  />
                  <div
                    style={{ width: `${(lateToday / totalEmployees) * 100}%` }}
                    className="bg-amber-500 h-full"
                    title={`Đi muộn: ${lateToday}`}
                  />
                  <div
                    style={{ width: `${(leaveToday / totalEmployees) * 100}%` }}
                    className="bg-rose-400 h-full"
                    title={`Nghỉ: ${leaveToday}`}
                  />
                </div>
              </div>

              {/* Legend Badges */}
              <div className="grid grid-cols-3 gap-3 pt-2">
                <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-100 flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <div>
                    <span className="block text-xs text-slate-500">Đúng giờ</span>
                    <span className="text-base font-bold text-emerald-700">{onTimeToday}</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-100 flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <div>
                    <span className="block text-xs text-slate-500">Đi muộn</span>
                    <span className="text-base font-bold text-amber-700">{lateToday}</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-rose-50/70 border border-rose-100 flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                  <div>
                    <span className="block text-xs text-slate-500">Vắng/Nghỉ</span>
                    <span className="text-base font-bold text-rose-700">{leaveToday}</span>
                  </div>
                </div>
              </div>

              {/* Quick Today's Attendance Table Preview */}
              <div className="mt-4 pt-4 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                  Nhật Ký Quẹt Thẻ Hôm Nay
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 font-semibold">
                        <th className="pb-2">Nhân viên</th>
                        <th className="pb-2">Phòng ban</th>
                        <th className="pb-2">Check-in</th>
                        <th className="pb-2">Trạng thái</th>
                        <th className="pb-2 text-right">Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {todayRecords.slice(0, 5).map((rec) => {
                        const emp = employees.find((e) => e.id === rec.employeeId);
                        return (
                          <tr key={rec.id} className="hover:bg-slate-50/80 transition">
                            <td className="py-2.5 font-medium text-slate-800">
                              {emp?.fullName} ({emp?.id})
                            </td>
                            <td className="py-2.5 text-slate-500">{emp?.department}</td>
                            <td className="py-2.5 font-mono font-medium text-slate-700">
                              {rec.checkIn || '--:--'}
                            </td>
                            <td className="py-2.5">
                              <AttendanceBadge status={rec.status} />
                            </td>
                            <td className="py-2.5 text-right text-slate-500 italic">
                              {rec.note || '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column: Pending Approvals & Department stats */}
        <div className="space-y-6">
          {/* Pending Leave Requests Card */}
          <Card
            title={`Đơn Nghỉ Phép Chờ Duyệt (${pendingLeaves.length})`}
            subtitle="Phê duyệt nhanh các yêu cầu xin nghỉ"
            action={
              <Link
                to="/admin/leave"
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
              >
                Xem tất cả
              </Link>
            }
          >
            {pendingLeaves.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs">
                <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-400 mb-2" />
                <p>Không có đơn xin phép nào đang chờ duyệt.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingLeaves.map((req) => {
                  const emp = employees.find((e) => e.id === req.employeeId);
                  return (
                    <div
                      key={req.id}
                      className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-50 transition"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-xs text-slate-800">
                            {emp?.fullName} ({emp?.id})
                          </p>
                          <p className="text-[11px] text-slate-500">{emp?.department}</p>
                        </div>
                        <span className="text-[11px] font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                          {req.daysCount} ngày
                        </span>
                      </div>

                      <div className="mt-2 text-xs text-slate-600 bg-white p-2 rounded-lg border border-slate-100">
                        <p className="font-medium">
                          Nghỉ: {formatDate(req.startDate)}{' '}
                          {req.startDate !== req.endDate ? `đến ${formatDate(req.endDate)}` : ''}
                        </p>
                        <p className="text-slate-500 mt-0.5 italic">"{req.reason}"</p>
                      </div>

                      <div className="mt-3 flex items-center justify-end gap-2">
                        <button
                          onClick={() => rejectLeaveRequest(req.id)}
                          className="px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 rounded-lg border border-rose-200 transition"
                        >
                          Từ chối
                        </button>
                        <button
                          onClick={() => approveLeaveRequest(req.id)}
                          className="px-3 py-1 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition"
                        >
                          Duyệt ngay
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Department Distribution */}
          <Card title="Phân Bổ Nhân Sự" subtitle="Số lượng nhân viên theo từng phòng ban">
            <div className="space-y-3">
              {Object.entries(departmentCounts).map(([dept, count]) => {
                const percentage = Math.round((count / totalEmployees) * 100);
                return (
                  <div key={dept} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-slate-700">{dept}</span>
                      <span className="text-slate-500 font-semibold">
                        {count} người ({percentage}%)
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

