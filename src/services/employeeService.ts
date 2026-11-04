import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Employee } from '../types';

export const employeeService = {
  /**
   * Lấy danh sách toàn bộ nhân viên từ Supabase
   */
  async getEmployees(): Promise<Employee[]> {
    if (!isSupabaseConfigured) return [];

    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .order('id', { ascending: true })
      .limit(10000);

    if (error) {
      console.error('Lỗi khi tải danh sách nhân viên từ Supabase:', error);
      throw error;
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone || '',
      department: row.department_name,
      position: row.position,
      avatarUrl: row.avatar_url,
      startDate: row.start_date,
      status: row.status,
      baseSalary: Number(row.base_salary) || 0,
      allowance: Number(row.allowance) || 0,
      bankAccount: {
        bankName: row.bank_name || '',
        accountNumber: row.bank_account_number || '',
        branch: row.bank_branch || '',
      },
    }));
  },

  /**
   * Tạo mới một nhân viên vào Supabase
   */
  async createEmployee(emp: Employee): Promise<Employee> {
    if (!isSupabaseConfigured) return emp;

    const cleanId = emp.id.trim().toUpperCase();
    const cleanEmail =
      emp.email?.trim() || `${cleanId.toLowerCase().replace(/[^a-z0-9]/g, '') || `nv${Date.now()}`}@congtyviet.com`;

    const { error } = await supabase.from('employees').upsert(
      {
        id: cleanId,
        full_name: emp.fullName.trim(),
        email: cleanEmail,
        phone: emp.phone || '',
        department_name: emp.department || 'Phòng Kỹ thuật',
        position: emp.position || 'Nhân viên',
        avatar_url: emp.avatarUrl || null,
        start_date: emp.startDate || new Date().toISOString().substring(0, 10),
        status: emp.status || 'active',
        base_salary: emp.baseSalary || 12000000,
        allowance: emp.allowance || 1500000,
        bank_name: emp.bankAccount?.bankName || null,
        bank_account_number: emp.bankAccount?.accountNumber || null,
        bank_branch: emp.bankAccount?.branch || null,
        salary_pin: '1234',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    if (error) {
      console.error('Lỗi tạo nhân viên trong Supabase:', error);
      throw error;
    }

    return { ...emp, id: cleanId, email: cleanEmail };
  },

  /**
   * Cập nhật thông tin nhân viên
   */
  async updateEmployee(emp: Employee): Promise<void> {
    if (!isSupabaseConfigured) return;

    const cleanId = emp.id.trim().toUpperCase();
    const { error } = await supabase
      .from('employees')
      .update({
        full_name: emp.fullName.trim(),
        email: emp.email?.trim(),
        phone: emp.phone || '',
        department_name: emp.department || 'Phòng Kỹ thuật',
        position: emp.position || 'Nhân viên',
        avatar_url: emp.avatarUrl || null,
        start_date: emp.startDate,
        status: emp.status || 'active',
        base_salary: emp.baseSalary,
        allowance: emp.allowance,
        bank_name: emp.bankAccount?.bankName || null,
        bank_account_number: emp.bankAccount?.accountNumber || null,
        bank_branch: emp.bankAccount?.branch || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', cleanId);

    if (error) {
      console.error('Lỗi cập nhật nhân viên trong Supabase:', error);
      throw error;
    }
  },

  /**
   * Xóa nhân viên
   */
  async deleteEmployee(id: string): Promise<void> {
    if (!isSupabaseConfigured) return;

    const { error } = await supabase.from('employees').delete().eq('id', id);

    if (error) {
      console.error('Lỗi xóa nhân viên trong Supabase:', error);
      throw error;
    }
  },

  /**
   * Xóa danh sách nhiều nhân viên (Cascade xóa các bảng liên quan)
   */
  async deleteEmployees(ids: string[]): Promise<void> {
    if (!isSupabaseConfigured || ids.length === 0) return;

    const cleanIds = ids.map((id) => id.trim().toUpperCase());

    // 1. Dọn dẹp tường minh các bảng liên quan để tránh lỗi khóa ngoại nếu cascade chưa bật trên DB
    try {
      await supabase.from('attendance_daily').delete().in('employee_id', cleanIds);
    } catch (e) {
      console.warn('Lỗi dọn dẹp attendance_daily khi xóa NV:', e);
    }
    try {
      await supabase.from('attendance_summaries').delete().in('employee_id', cleanIds);
    } catch (e) {
      console.warn('Lỗi dọn dẹp attendance_summaries khi xóa NV:', e);
    }
    try {
      await supabase.from('leave_balances').delete().in('employee_id', cleanIds);
    } catch (e) {
      console.warn('Lỗi dọn dẹp leave_balances khi xóa NV:', e);
    }

    // 2. Xóa hồ sơ nhân viên trong bảng employees
    const { error } = await supabase.from('employees').delete().in('id', cleanIds);

    if (error) {
      console.error('Lỗi xóa danh sách nhân viên trong Supabase:', error);
      throw error;
    }
  },

  /**
   * Lấy danh sách các phòng ban
   */
  async getDepartments(): Promise<{ id: string; code: string; name: string }[]> {
    if (!isSupabaseConfigured) {
      return [
        { id: '1', code: 'KT', name: 'Phòng Kỹ thuật' },
        { id: '2', code: 'KD', name: 'Phòng Kinh doanh' },
        { id: '3', code: 'NS', name: 'Phòng Nhân sự' },
        { id: '4', code: 'TCKT', name: 'Phòng Kế toán' },
        { id: '5', code: 'MKT', name: 'Phòng Marketing' },
      ];
    }
    try {
      const { data, error } = await supabase.from('departments').select('id, code, name');
      if (error) {
        console.warn('Lỗi lấy danh sách phòng ban từ Supabase:', error);
        return [];
      }
      return data || [];
    } catch {
      return [];
    }
  },

  /**
   * Đảm bảo tất cả nhân viên trong danh sách tồn tại trên Supabase trước khi ghi nhận công.
   * Ngăn chặn triệt để lỗi foreign key constraint violation.
   */
  async ensureEmployeesExist(
    employees: { id: string; fullName?: string; department?: string; startDate?: string; position?: string }[]
  ): Promise<{ created: string[]; existing: string[]; errors: string[] }> {
    const created: string[] = [];
    const existing: string[] = [];
    const errors: string[] = [];

    if (!employees || employees.length === 0) {
      return { created, existing, errors };
    }

    // Chuẩn hóa và loại bỏ trùng lặp ID
    const empMap = new Map<string, { id: string; fullName?: string; department?: string; startDate?: string; position?: string }>();
    employees.forEach((emp) => {
      const cleanId = emp.id?.trim().toUpperCase();
      if (cleanId) {
        if (!empMap.has(cleanId)) {
          empMap.set(cleanId, {
            id: cleanId,
            fullName: emp.fullName?.trim() || cleanId,
            department: emp.department?.trim() || 'Phòng Kỹ thuật',
            startDate: emp.startDate || new Date().toISOString().substring(0, 10),
            position: emp.position?.trim() || 'Nhân viên',
          });
        }
      }
    });

    const uniqueEmps = Array.from(empMap.values());

    if (!isSupabaseConfigured) {
      return {
        created: uniqueEmps.map((e) => e.id),
        existing: [],
        errors: [],
      };
    }

    try {
      const allIds = uniqueEmps.map((e) => e.id);

      // 1. Kiểm tra danh sách nhân viên đã có sẵn trên Supabase
      const { data: dbEmps, error: checkErr } = await supabase
        .from('employees')
        .select('id')
        .in('id', allIds);

      if (checkErr) {
        console.warn('Lỗi kiểm tra nhân viên tồn tại trên Supabase:', checkErr);
      }

      const existingIdSet = new Set((dbEmps || []).map((e: any) => e.id.trim().toUpperCase()));
      const toInsert = uniqueEmps.filter((e) => !existingIdSet.has(e.id));

      uniqueEmps.forEach((e) => {
        if (existingIdSet.has(e.id)) {
          existing.push(e.id);
        }
      });

      if (toInsert.length === 0) {
        return { created, existing, errors };
      }

      // Lấy danh sách departments hợp lệ để ánh xạ UUID
      const depts = await this.getDepartments();
      const isValidUuid = (id: string | null | undefined): boolean => {
        if (!id) return false;
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      };

      const findDeptId = (deptName?: string): string | null => {
        if (!deptName) {
          const first = depts[0]?.id;
          return isValidUuid(first) ? first : null;
        }
        const clean = deptName.toLowerCase().replace(/^phòng\s*/, '').trim();
        const match = depts.find(
          (d) =>
            d.name.toLowerCase() === deptName.toLowerCase() ||
            d.name.toLowerCase().includes(clean) ||
            clean.includes(d.name.toLowerCase().replace(/^phòng\s*/, ''))
        );
        const matchId = match ? match.id : depts[0]?.id || null;
        return isValidUuid(matchId) ? matchId : null;
      };

      // 2. Chèn các nhân viên chưa tồn tại theo lô 50
      for (let i = 0; i < toInsert.length; i += 50) {
        const chunk = toInsert.slice(i, i + 50);
        const nowIso = new Date().toISOString();
        const payload = chunk.map((emp) => {
          const deptId = findDeptId(emp.department);
          const safeEmpId = emp.id.toLowerCase().replace(/[^a-z0-9]/g, '') || `nv${Date.now()}`;
          const email = `${safeEmpId}@congtyviet.com`;

          return {
            id: emp.id,
            full_name: emp.fullName || emp.id,
            email,
            department_id: deptId,
            department_name: emp.department || 'Phòng Kỹ thuật',
            position: emp.position || 'Nhân viên',
            start_date: emp.startDate || nowIso.substring(0, 10),
            status: 'active',
            base_salary: 12000000,
            allowance: 1500000,
            salary_pin: '1234',
            created_at: nowIso,
            updated_at: nowIso,
          };
        });

        const { error: insertErr } = await supabase
          .from('employees')
          .upsert(payload, { onConflict: 'id' });

        if (insertErr) {
          console.error('Lỗi khi chèn nhân viên tự động vào Supabase:', insertErr);
          errors.push(`Lỗi chèn nhân viên lô ${i}: ${insertErr.message}`);

          // Thử lại từng nhân viên một để không bỏ lỡ ai
          for (const singleEmp of payload) {
            const { error: singleErr } = await supabase
              .from('employees')
              .upsert(singleEmp, { onConflict: 'id' });
            if (singleErr) {
              console.error(`Không thể tạo nhân viên ${singleEmp.id}:`, singleErr);
            } else {
              created.push(singleEmp.id);
            }
          }
        } else {
          chunk.forEach((e) => created.push(e.id));
        }
      }
    } catch (err: any) {
      console.error('Lỗi ngoại lệ trong ensureEmployeesExist:', err);
      errors.push(err.message || 'Lỗi không xác định khi đảm bảo nhân viên tồn tại');
    }

    return { created, existing, errors };
  },

  /**
   * Đồng bộ hàng loạt nhân viên (tự động tạo mới hoặc cập nhật hồ sơ)
   */
  async batchSyncEmployees(params: {
    toCreate: { id: string; fullName: string; department: string; startDate: string; position?: string }[];
    toUpdate: { id: string; fullName: string; department: string; startDate: string; position?: string }[];
  }): Promise<{ created: string[]; updated: string[]; errors: string[] }> {
    const created: string[] = [];
    const updated: string[] = [];
    const errors: string[] = [];

    if (!isSupabaseConfigured) {
      return {
        created: params.toCreate.map((e) => e.id),
        updated: params.toUpdate.map((e) => e.id),
        errors: [],
      };
    }

    const depts = await this.getDepartments();
    const isValidUuid = (id: string | null | undefined): boolean => {
      if (!id) return false;
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    };

    const findDeptId = (deptName: string): string | null => {
      if (!deptName) {
        const first = depts[0]?.id;
        return isValidUuid(first) ? first : null;
      }
      const clean = deptName.toLowerCase().replace(/^phòng\s*/, '').trim();
      const match = depts.find(
        (d) =>
          d.name.toLowerCase() === deptName.toLowerCase() ||
          d.name.toLowerCase().includes(clean) ||
          clean.includes(d.name.toLowerCase().replace(/^phòng\s*/, ''))
      );
      const matchId = match ? match.id : depts[0]?.id || null;
      return isValidUuid(matchId) ? matchId : null;
    };

    // 1. Tạo mới nhân viên
    if (params.toCreate.length > 0) {
      for (let i = 0; i < params.toCreate.length; i += 50) {
        const chunk = params.toCreate.slice(i, i + 50);
        const nowIso = new Date().toISOString();
        const payload = chunk.map((emp) => {
          const deptId = findDeptId(emp.department);
          const safeEmpId = emp.id.trim().toLowerCase().replace(/[^a-z0-9]/g, '') || `nv${Date.now()}`;
          const email = `${safeEmpId}@congtyviet.com`;

          return {
            id: emp.id.trim().toUpperCase(),
            full_name: emp.fullName.trim(),
            email,
            department_id: deptId,
            department_name: emp.department?.trim() || 'Phòng Kỹ thuật',
            position: emp.position?.trim() || 'Nhân viên',
            start_date: emp.startDate || nowIso.substring(0, 10),
            status: 'active',
            base_salary: 12000000,
            allowance: 1500000,
            salary_pin: '1234',
            created_at: nowIso,
            updated_at: nowIso,
          };
        });

        const { error } = await supabase
          .from('employees')
          .upsert(payload, { onConflict: 'id' });

        if (error) {
          console.error('Lỗi khi tạo nhân viên mới hàng loạt:', error);
          errors.push(`Lỗi tạo nhân viên lô ${i}: ${error.message}`);
          
          for (const singleEmp of payload) {
            const { error: singleErr } = await supabase
              .from('employees')
              .upsert(singleEmp, { onConflict: 'id' });
            if (!singleErr) {
              created.push(singleEmp.id);
            }
          }
        } else {
          chunk.forEach((e) => created.push(e.id));
        }
      }
    }

    // 2. Cập nhật nhân viên đã có
    if (params.toUpdate.length > 0) {
      for (const emp of params.toUpdate) {
        const deptId = findDeptId(emp.department);
        const updateData: any = {
          updated_at: new Date().toISOString(),
        };
        if (emp.fullName) updateData.full_name = emp.fullName.trim();
        if (emp.department) {
          updateData.department_name = emp.department.trim();
          if (deptId) updateData.department_id = deptId;
        }
        if (emp.startDate) updateData.start_date = emp.startDate;

        const { error } = await supabase
          .from('employees')
          .update(updateData)
          .eq('id', emp.id.trim().toUpperCase());

        if (error) {
          console.error(`Lỗi cập nhật nhân viên ${emp.id}:`, error);
          errors.push(`Lỗi cập nhật ${emp.id}: ${error.message}`);
        } else {
          updated.push(emp.id);
        }
      }
    }

    return { created, updated, errors };
  },
};

