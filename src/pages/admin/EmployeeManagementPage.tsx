import React, { useState, useMemo } from 'react';
import {
  Users,
  Search,
  Filter,
  Plus,
  Edit2,
  Trash2,
  Eye,
  Mail,
  Phone,
  Building,
  Calendar,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  MoreVertical,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { Employee, Department, EmployeeStatus } from '../../types';
import { EmployeeStatusBadge } from '../../components/common/Badge';
import { Card } from '../../components/common/Card';
import { Modal } from '../../components/common/Modal';
import { formatCurrency, formatDate } from '../../utils/formatters';

const departments: Department[] = [
  'Phòng Kỹ thuật',
  'Phòng Kinh doanh',
  'Phòng Nhân sự',
  'Phòng Kế toán',
  'Phòng Marketing',
];

export const EmployeeManagementPage: React.FC = () => {
  const { employees, addEmployee, updateEmployee, deleteEmployee } = useData();

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  // Form state
  const [formData, setFormData] = useState<Omit<Employee, 'id'>>({
    fullName: '',
    email: '',
    phone: '',
    department: 'Phòng Kỹ thuật',
    position: '',
    startDate: new Date().toISOString().split('T')[0],
    status: 'active',
    baseSalary: 15000000,
    allowance: 1500000,
    bankAccount: {
      bankName: 'Vietcombank',
      accountNumber: '',
      branch: '',
    },
    salaryPin: '1234',
  });

  const [formError, setFormError] = useState('');

  // Filtered employees
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const matchSearch =
        emp.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.phone.includes(searchTerm);

      const matchDept = selectedDept === 'all' || emp.department === selectedDept;
      const matchStatus = selectedStatus === 'all' || emp.status === selectedStatus;

      return matchSearch && matchDept && matchStatus;
    });
  }, [employees, searchTerm, selectedDept, selectedStatus]);

  const handleOpenAdd = () => {
    setFormData({
      fullName: '',
      email: '',
      phone: '',
      department: 'Phòng Kỹ thuật',
      position: '',
      startDate: new Date().toISOString().split('T')[0],
      status: 'active',
      baseSalary: 15000000,
      allowance: 1500000,
      bankAccount: {
        bankName: 'Vietcombank',
        accountNumber: '',
        branch: '',
      },
      salaryPin: '1234',
    });
    setFormError('');
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (emp: Employee) => {
    setSelectedEmployee(emp);
    setFormData({
      fullName: emp.fullName,
      email: emp.email,
      phone: emp.phone,
      department: emp.department,
      position: emp.position,
      startDate: emp.startDate,
      status: emp.status,
      baseSalary: emp.baseSalary,
      allowance: emp.allowance,
      bankAccount: emp.bankAccount || { bankName: '', accountNumber: '', branch: '' },
      salaryPin: emp.salaryPin || '1234',
    });
    setFormError('');
    setIsEditModalOpen(true);
  };

  const handleOpenDetail = (emp: Employee) => {
    setSelectedEmployee(emp);
    setIsDetailModalOpen(true);
  };

  const handleSaveAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName.trim() || !formData.email.trim() || !formData.position.trim()) {
      setFormError('Vui lòng điền đầy đủ các trường bắt buộc (*)');
      return;
    }
    addEmployee(formData);
    setIsAddModalOpen(false);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) return;
    if (!formData.fullName.trim() || !formData.email.trim() || !formData.position.trim()) {
      setFormError('Vui lòng điền đầy đủ các trường bắt buộc (*)');
      return;
    }
    updateEmployee({
      ...formData,
      id: selectedEmployee.id,
    });
    setIsEditModalOpen(false);
  };

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`Bạn có chắc chắn muốn xóa nhân viên "${name} (${id})"?`)) {
      deleteEmployee(id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Quản Lý Hồ Sơ Nhân Viên</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Tổng cộng: <strong className="text-indigo-600">{employees.length}</strong> nhân viên trong công ty
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          <span>Thêm Nhân Viên Mới</span>
        </button>
      </div>

      {/* Search and Filters Bar */}
      <Card>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm kiếm mã NV, tên, email, SĐT..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Department Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="w-full py-2 px-3 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="all">Tất cả phòng ban</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full py-2 px-3 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="active">Chính thức</option>
              <option value="probation">Thử việc</option>
              <option value="inactive">Đã nghỉ việc</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Desktop Table View */}
      <div className="hidden lg:block bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Mã NV</th>
                <th className="py-3 px-4">Họ và Tên</th>
                <th className="py-3 px-4">Phòng Ban / Vị Trí</th>
                <th className="py-3 px-4">Liên Hệ</th>
                <th className="py-3 px-4">Ngày Vào Làm</th>
                <th className="py-3 px-4">Trạng Thái</th>
                <th className="py-3 px-4 text-right">Lương Cơ Bản</th>
                <th className="py-3 px-4 text-center">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-400">
                    Không tìm thấy nhân viên nào phù hợp.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-4 font-mono font-bold text-indigo-700">{emp.id}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={
                            emp.avatarUrl ||
                            `https://ui-avatars.com/api/?name=${encodeURIComponent(
                              emp.fullName
                            )}&background=e0e7ff&color=4338ca`
                          }
                          alt={emp.fullName}
                          className="w-8 h-8 rounded-full object-cover border border-slate-200"
                        />
                        <span className="font-semibold text-slate-800">{emp.fullName}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-700">{emp.department}</div>
                      <div className="text-[11px] text-slate-400">{emp.position}</div>
                    </td>
                    <td className="py-3 px-4 space-y-0.5 text-[11px]">
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <Mail className="w-3 h-3 text-slate-400" />
                        <span>{emp.email}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{emp.phone}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{formatDate(emp.startDate)}</td>
                    <td className="py-3 px-4">
                      <EmployeeStatusBadge status={emp.status} />
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-slate-800">
                      {formatCurrency(emp.baseSalary)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleOpenDetail(emp)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition"
                          title="Xem chi tiết"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(emp)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-amber-50 transition"
                          title="Chỉnh sửa"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(emp.id, emp.fullName)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition"
                          title="Xóa"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile & Tablet Card View (Responsive: Không tràn màn hình, dạng Card 1 cột) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:hidden gap-3">
        {filteredEmployees.length === 0 ? (
          <div className="p-8 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
            Không tìm thấy nhân viên nào phù hợp.
          </div>
        ) : (
          filteredEmployees.map((emp) => (
            <div
              key={emp.id}
              className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm space-y-3"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <img
                    src={
                      emp.avatarUrl ||
                      `https://ui-avatars.com/api/?name=${encodeURIComponent(
                        emp.fullName
                      )}&background=e0e7ff&color=4338ca`
                    }
                    alt={emp.fullName}
                    className="w-10 h-10 rounded-full object-cover border border-slate-200"
                  />
                  <div>
                    <h4 className="font-bold text-sm text-slate-800">{emp.fullName}</h4>
                    <span className="text-xs font-mono font-semibold text-indigo-600">
                      {emp.id}
                    </span>
                  </div>
                </div>
                <EmployeeStatusBadge status={emp.status} />
              </div>

              <div className="space-y-1.5 text-xs text-slate-600 pt-1 border-t border-slate-100">
                <div className="flex justify-between">
                  <span className="text-slate-400">Phòng ban:</span>
                  <span className="font-medium text-slate-700">{emp.department}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Chức vụ:</span>
                  <span className="font-medium text-slate-700">{emp.position}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Lương cơ bản:</span>
                  <span className="font-bold text-slate-900">
                    {formatCurrency(emp.baseSalary)}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => handleOpenDetail(emp)}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-medium hover:bg-slate-200 transition flex items-center gap-1"
                >
                  <Eye className="w-3.5 h-3.5" /> Chi tiết
                </button>
                <button
                  onClick={() => handleOpenEdit(emp)}
                  className="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-xs font-medium hover:bg-amber-100 transition flex items-center gap-1"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Sửa
                </button>
                <button
                  onClick={() => handleDelete(emp.id, emp.fullName)}
                  className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition"
                  title="Xóa"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add / Edit Employee Modal */}
      <Modal
        isOpen={isAddModalOpen || isEditModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setIsEditModalOpen(false);
        }}
        title={isAddModalOpen ? 'Thêm Nhân Viên Mới' : `Chỉnh Sửa Hồ Sơ: ${selectedEmployee?.id}`}
        subtitle="Điền thông tin hợp đồng và chế độ đãi ngộ"
        size="lg"
      >
        {formError && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={isAddModalOpen ? handleSaveAdd : handleSaveEdit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Họ và Tên *
              </label>
              <input
                type="text"
                required
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                placeholder="Ví dụ: Nguyễn Văn A"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email Công Ty *
              </label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="a.nguyen@congtyviet.com"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Số Điện Thoại
              </label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="0912 345 678"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Phòng Ban *
              </label>
              <select
                value={formData.department}
                onChange={(e) =>
                  setFormData({ ...formData, department: e.target.value as Department })
                }
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
              >
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Chức Vụ / Vị Trí *
              </label>
              <input
                type="text"
                required
                value={formData.position}
                onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                placeholder="Ví dụ: Chuyên viên Frontend"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ngày Bắt Đầu Làm Việc
              </label>
              <input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Lương Cơ Bản (VND)
              </label>
              <input
                type="number"
                step="500000"
                value={formData.baseSalary}
                onChange={(e) => setFormData({ ...formData, baseSalary: Number(e.target.value) })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Phụ Cấp Hàng Tháng (VND)
              </label>
              <input
                type="number"
                step="100000"
                value={formData.allowance}
                onChange={(e) => setFormData({ ...formData, allowance: Number(e.target.value) })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Trạng Thái Làm Việc
              </label>
              <select
                value={formData.status}
                onChange={(e) =>
                  setFormData({ ...formData, status: e.target.value as EmployeeStatus })
                }
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
              >
                <option value="active">Chính thức</option>
                <option value="probation">Thử việc</option>
                <option value="inactive">Đã nghỉ việc</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Số Tài Khoản Ngân Hàng
              </label>
              <input
                type="text"
                value={formData.bankAccount?.accountNumber || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    bankAccount: {
                      ...formData.bankAccount!,
                      accountNumber: e.target.value,
                    },
                  })
                }
                placeholder="1012398745"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mã PIN Tra Cứu Lương (4-6 ký tự)
              </label>
              <input
                type="text"
                maxLength={6}
                value={formData.salaryPin || ''}
                onChange={(e) => setFormData({ ...formData, salaryPin: e.target.value })}
                placeholder="1234"
                className="w-full px-3 py-2 text-xs font-mono font-bold tracking-wider border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                Dùng để bảo mật phiếu lương khi nhân viên tra cứu online. Mặc định là 1234.
              </span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                setIsAddModalOpen(false);
                setIsEditModalOpen(false);
              }}
              className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition"
            >
              {isAddModalOpen ? 'Lưu Nhân Viên' : 'Cập Nhật Hồ Sơ'}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Detail Modal */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title="Hồ Sơ Chi Tiết Nhân Viên"
        subtitle={selectedEmployee ? `${selectedEmployee.fullName} (${selectedEmployee.id})` : ''}
        size="md"
      >
        {selectedEmployee && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100">
              <img
                src={
                  selectedEmployee.avatarUrl ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(
                    selectedEmployee.fullName
                  )}&background=e0e7ff&color=4338ca`
                }
                alt={selectedEmployee.fullName}
                className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-sm"
              />
              <div>
                <h3 className="text-base font-bold text-slate-800">
                  {selectedEmployee.fullName}
                </h3>
                <p className="text-xs text-indigo-600 font-semibold">{selectedEmployee.id}</p>
                <div className="mt-1">
                  <EmployeeStatusBadge status={selectedEmployee.status} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-white border border-slate-100">
                <span className="text-slate-400 block mb-0.5">Phòng ban</span>
                <span className="font-semibold text-slate-700">{selectedEmployee.department}</span>
              </div>
              <div className="p-3 rounded-lg bg-white border border-slate-100">
                <span className="text-slate-400 block mb-0.5">Vị trí</span>
                <span className="font-semibold text-slate-700">{selectedEmployee.position}</span>
              </div>
              <div className="p-3 rounded-lg bg-white border border-slate-100">
                <span className="text-slate-400 block mb-0.5">Email</span>
                <span className="font-semibold text-slate-700">{selectedEmployee.email}</span>
              </div>
              <div className="p-3 rounded-lg bg-white border border-slate-100">
                <span className="text-slate-400 block mb-0.5">Số điện thoại</span>
                <span className="font-semibold text-slate-700">{selectedEmployee.phone}</span>
              </div>
              <div className="p-3 rounded-lg bg-white border border-slate-100">
                <span className="text-slate-400 block mb-0.5">Lương cơ bản</span>
                <span className="font-bold text-emerald-600">
                  {formatCurrency(selectedEmployee.baseSalary)}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-white border border-slate-100">
                <span className="text-slate-400 block mb-0.5">Phụ cấp</span>
                <span className="font-semibold text-slate-700">
                  {formatCurrency(selectedEmployee.allowance)}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-white border border-slate-100 col-span-2">
                <span className="text-slate-400 block mb-0.5">Mã PIN bảo mật tra cứu lương</span>
                <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded text-xs inline-block">
                  {selectedEmployee.salaryPin || '1234'}
                </span>
                <span className="text-[11px] text-slate-400 ml-2">
                  (Nhân viên dùng mã này để mở khóa xem phiếu lương cá nhân)
                </span>
              </div>
            </div>

            {selectedEmployee.bankAccount && (
              <div className="p-3 rounded-lg bg-indigo-50/50 border border-indigo-100 text-xs">
                <span className="font-semibold text-indigo-900 block mb-1">
                  Tài khoản nhận lương:
                </span>
                <p className="text-slate-700">
                  {selectedEmployee.bankAccount.bankName} -{' '}
                  <strong className="font-mono">{selectedEmployee.bankAccount.accountNumber}</strong>{' '}
                  ({selectedEmployee.bankAccount.branch || 'Hội sở'})
                </p>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200 transition"
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

