import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { LeaveBalance, EmployeeLeaveBalanceRecord } from '../types';

export const leaveService = {
  /**
   * Kiểm tra công thức tính số dư phép:
   * Công thức chuẩn: Còn lại = Tồn đầu năm + Phép được cấp + Điều chỉnh - Phép đã sử dụng
   */
  validateFormula(fields: {
    carriedOverDays: number;
    allocatedDays: number;
    usedDays: number;
    adjustedDays: number;
    remainingDays: number;
  }): { isValid: boolean; expectedRemaining: number; diff: number } {
    const { carriedOverDays, allocatedDays, usedDays, adjustedDays, remainingDays } = fields;
    const expectedRemaining = Math.round((carriedOverDays + allocatedDays + adjustedDays - usedDays) * 100) / 100;
    const diff = Math.round(Math.abs(remainingDays - expectedRemaining) * 100) / 100;
    return {
      isValid: diff < 0.05,
      expectedRemaining,
      diff,
    };
  },

  /**
   * Lấy danh sách số dư phép năm từ Supabase
   */
  async getLeaveBalances(year?: number): Promise<LeaveBalance[]> {
    if (!isSupabaseConfigured) return [];

    try {
      let query = supabase.from('leave_balances').select('*').limit(10000);
      if (year) query = query.eq('year', year);

      const { data, error } = await query;
      if (error) {
        console.warn('Bảng leave_balances chưa khả dụng trên Supabase:', error.message);
        return [];
      }

      return (data || []).map((row: any) => ({
        employeeId: row.employee_id,
        year: row.year,
        carriedOverDays: Number(row.carried_over_days) || 0,
        allocatedDays: Number(row.allocated_days) || 12,
        usedDays: Number(row.used_days) || 0,
        adjustedDays: Number(row.adjusted_days) || 0,
        remainingDays: Number(row.remaining_days) || 0,
        pendingDays: Number(row.pending_days) || 0,
        totalDays:
          (Number(row.carried_over_days) || 0) +
          (Number(row.allocated_days) || 12) +
          (Number(row.adjusted_days) || 0),
        note: row.note || '',
      }));
    } catch (err) {
      console.warn('Lỗi đọc bảng leave_balances:', err);
      return [];
    }
  },

  /**
   * Kiểm tra xem năm đã chọn đã có dữ liệu số dư phép chưa
   */
  async checkExistingLeaveBalances(
    year: number
  ): Promise<{ hasData: boolean; count: number }> {
    if (!isSupabaseConfigured) return { hasData: false, count: 0 };

    try {
      const { count, error } = await supabase
        .from('leave_balances')
        .select('*', { count: 'exact', head: true })
        .eq('year', year);

      if (error) {
        return { hasData: false, count: 0 };
      }

      return {
        hasData: (count || 0) > 0,
        count: count || 0,
      };
    } catch {
      return { hasData: false, count: 0 };
    }
  },

  /**
   * Lưu số dư phép năm vào Supabase
   * Đảm bảo tính toán đúng và KHÔNG CỘNG TRÙNG khi nhập lại:
   * - overwrite: xóa bản ghi cũ của năm đó rồi ghi mới
   * - upsert: cập nhật đè giá trị chính xác theo (employee_id, year)
   */
  async saveLeaveBalances(params: {
    year: number;
    records: LeaveBalance[];
    mode: 'overwrite' | 'upsert';
    importedByName: string;
  }): Promise<{ success: boolean; count: number; error?: string }> {
    const { year, records, mode, importedByName } = params;
    if (!isSupabaseConfigured) {
      return { success: true, count: records.length };
    }

    try {
      // 0. Đảm bảo nhân viên đã tồn tại trong bảng employees (tránh lỗi Foreign Key)
      const distinctEmpIds = Array.from(new Set(records.map((r) => r.employeeId.trim().toUpperCase())));
      if (distinctEmpIds.length > 0) {
        const { data: existingEmps } = await supabase
          .from('employees')
          .select('id')
          .in('id', distinctEmpIds);

        const existingSet = new Set((existingEmps || []).map((e: any) => e.id.trim().toUpperCase()));
        const missingIds = distinctEmpIds.filter((id) => !existingSet.has(id));

        if (missingIds.length > 0) {
          const newEmps = missingIds.map((id) => {
            const safeEmpId = id.toLowerCase().replace(/[^a-z0-9]/g, '');
            return {
              id,
              full_name: `Nhân viên ${id}`,
              email: `${safeEmpId}@congtyviet.com`,
              department_name: 'Phòng Kỹ thuật',
              position: 'Nhân viên',
              start_date: `${year}-01-01`,
              status: 'active',
              base_salary: 12000000,
              allowance: 1500000,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
          });

          await supabase.from('employees').upsert(newEmps, { onConflict: 'id' });
        }
      }

      // 1. Nếu chọn ghi đè (overwrite), xóa các bản ghi cũ của năm đó
      if (mode === 'overwrite') {
        const { error: delError } = await supabase
          .from('leave_balances')
          .delete()
          .eq('year', year);

        if (delError) {
          console.warn('Lỗi xóa số dư phép cũ để ghi đè:', delError.message);
        }
      }

      // 2. Chuẩn hóa payload
      const payload = records.map((r) => ({
        employee_id: r.employeeId.trim().toUpperCase(),
        year: r.year || year,
        carried_over_days: r.carriedOverDays || 0,
        allocated_days: r.allocatedDays || 12,
        used_days: r.usedDays || 0,
        adjusted_days: r.adjustedDays || 0,
        remaining_days: r.remainingDays,
        pending_days: r.pendingDays || 0,
        note: r.note || null,
        updated_at: new Date().toISOString(),
      }));

      // 3. Batch ghi vào Supabase
      const { error: upsertErr } = await supabase
        .from('leave_balances')
        .upsert(payload, { onConflict: 'employee_id,year' });

      if (upsertErr) {
        console.warn('Lưu vào Supabase bảng leave_balances không thành công:', upsertErr.message);
        // Trả về false nhưng không làm crash ứng dụng
        return { success: false, count: 0, error: upsertErr.message };
      }

      // 4. Ghi audit log
      try {
        const { data: session } = await supabase.auth.getSession();
        await supabase.from('audit_logs').insert({
          user_id: session.session?.user?.id || null,
          action: 'IMPORT_LEAVE_BALANCES_EXCEL',
          entity_name: 'leave_balances',
          entity_id: String(year),
          details: {
            year,
            mode,
            totalRecords: records.length,
            importedByName,
          },
        });
      } catch (logErr) {
        console.warn('Lỗi ghi audit log phép năm:', logErr);
      }

      return { success: true, count: records.length };
    } catch (err: any) {
      console.error('Lỗi khi lưu số dư phép:', err);
      return { success: false, count: 0, error: err.message };
    }
  },

  /**
   * Lấy danh sách phép tồn từ bảng employee_leave_balances trên Supabase
   */
  async getEmployeeLeaveBalances(filters?: {
    month?: number | null;
    year?: number;
    employeeCode?: string;
  }): Promise<EmployeeLeaveBalanceRecord[]> {
    if (!isSupabaseConfigured) return [];

    try {
      let query = supabase
        .from('employee_leave_balances')
        .select('*')
        .order('employee_code', { ascending: true })
        .limit(10000);

      if (filters?.year) {
        query = query.eq('year', filters.year);
      }
      if (filters?.month !== undefined && filters?.month !== null) {
        query = query.eq('month', filters.month);
      }
      if (filters?.employeeCode) {
        query = query.ilike('employee_code', filters.employeeCode.trim());
      }

      const { data, error } = await query;
      if (error) {
        console.warn('Truy vấn employee_leave_balances:', error.message);
        return [];
      }

      return (data || []).map((row: any) => ({
        id: row.id,
        employeeCode: row.employee_code,
        employeeName: row.employee_name || '',
        department: row.department || '',
        leaveBalance2025: Number(row.leave_balance_2025) || 0,
        leaveGenerated2026: Number(row.leave_generated_2026) || 0,
        remainingDays: Number(row.remaining_days) || 0,
        month: row.month !== null && row.month !== undefined ? Number(row.month) : null,
        year: Number(row.year) || 2026,
        importBatchId: row.import_batch_id || '',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (err) {
      console.warn('Lỗi getEmployeeLeaveBalances:', err);
      return [];
    }
  },

  /**
   * Lưu danh mục phép tồn vào bảng employee_leave_balances và dual-sync vào leave_balances
   */
  async saveEmployeeLeaveBalances(params: {
    records: EmployeeLeaveBalanceRecord[];
    month?: number | null;
    year: number;
    mode: 'upsert' | 'overwrite';
    importedByName?: string;
    batchId?: string;
  }): Promise<{ success: boolean; count: number; error?: string }> {
    const { records, month, year, mode, importedByName, batchId } = params;
    if (!records || records.length === 0) {
      return { success: true, count: 0 };
    }

    if (!isSupabaseConfigured) {
      return { success: true, count: records.length };
    }

    try {
      // 1. Đảm bảo nhân viên đã có hồ sơ trong bảng employees
      const distinctCodes = Array.from(new Set(records.map((r) => r.employeeCode.trim().toUpperCase())));
      if (distinctCodes.length > 0) {
        const { data: existingEmps } = await supabase
          .from('employees')
          .select('id')
          .in('id', distinctCodes);

        const existingSet = new Set((existingEmps || []).map((e: any) => e.id.trim().toUpperCase()));
        const missingCodes = distinctCodes.filter((code) => !existingSet.has(code));

        if (missingCodes.length > 0) {
          const newEmps = missingCodes.map((code) => {
            const r = records.find((rec) => rec.employeeCode.trim().toUpperCase() === code);
            const safeEmpId = code.toLowerCase().replace(/[^a-z0-9]/g, '');
            return {
              id: code,
              full_name: r?.employeeName || `Nhân viên ${code}`,
              email: `${safeEmpId}@congtyviet.com`,
              department_name: r?.department || 'Phòng Kỹ thuật',
              position: 'Nhân viên',
              start_date: `${year}-01-01`,
              status: 'active',
              base_salary: 12000000,
              allowance: 1500000,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
          });

          await supabase.from('employees').upsert(newEmps, { onConflict: 'id' });
        }
      }

      // 2. Nếu chọn overwrite: xóa dữ liệu cũ của kỳ này
      if (mode === 'overwrite') {
        let delQuery = supabase.from('employee_leave_balances').delete().eq('year', year);
        if (month !== undefined && month !== null) {
          delQuery = delQuery.eq('month', month);
        }
        await delQuery;
      }

      // 3. Chuẩn bị payload ghi bảng employee_leave_balances
      const generatedBatchId = batchId || `BATCH_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const payload = records.map((r) => ({
        employee_code: r.employeeCode.trim().toUpperCase(),
        employee_name: r.employeeName || '',
        department: r.department || '',
        leave_balance_2025: Number(r.leaveBalance2025) || 0,
        leave_generated_2026: Number(r.leaveGenerated2026) || 0,
        remaining_days: Number(r.remainingDays) || 0,
        month: month !== undefined && month !== null ? month : (r.month || null),
        year: year || r.year || 2026,
        import_batch_id: generatedBatchId,
        updated_at: new Date().toISOString(),
      }));

      // Nếu mode là upsert: xóa trùng trong cùng kỳ (employee_code, year, month) trước khi insert
      if (mode === 'upsert') {
        for (const p of payload) {
          let delQ = supabase
            .from('employee_leave_balances')
            .delete()
            .eq('employee_code', p.employee_code)
            .eq('year', p.year);
          if (p.month !== null) {
            delQ = delQ.eq('month', p.month);
          }
          await delQ;
        }
      }

      // Chia nhỏ batch 200 dòng để insert an toàn tuyệt đối
      const CHUNK_SIZE = 200;
      for (let i = 0; i < payload.length; i += CHUNK_SIZE) {
        const chunk = payload.slice(i, i + CHUNK_SIZE);
        const { error: insErr } = await supabase.from('employee_leave_balances').insert(chunk);
        if (insErr) {
          console.warn('Lỗi ghi chunk employee_leave_balances:', insErr.message);
        }
      }

      // 4. Dual-sync vào bảng leave_balances cũ để đảm bảo các RPC và view cũ hoạt động bình thường
      try {
        const legacyBalances: LeaveBalance[] = records.map((r) => ({
          employeeId: r.employeeCode.trim().toUpperCase(),
          year: year || r.year || 2026,
          carriedOverDays: Number(r.leaveBalance2025) || 0,
          allocatedDays: Number(r.leaveGenerated2026) || 0,
          usedDays: 0,
          adjustedDays: 0,
          remainingDays: Number(r.remainingDays) || 0,
          pendingDays: 0,
          totalDays: (Number(r.leaveBalance2025) || 0) + (Number(r.leaveGenerated2026) || 0),
          note: `Đồng bộ từ Excel Phép Tồn Đợt ${generatedBatchId}`,
        }));
        await this.saveLeaveBalances({
          year,
          records: legacyBalances,
          mode: 'upsert',
          importedByName: importedByName || 'Admin',
        });
      } catch (syncErr) {
        console.warn('Dual-sync sang leave_balances warning:', syncErr);
      }

      // 5. Audit Log
      try {
        const { data: session } = await supabase.auth.getSession();
        await supabase.from('audit_logs').insert({
          user_id: session.session?.user?.id || null,
          action: 'IMPORT_EMPLOYEE_LEAVE_BALANCES_EXCEL',
          entity_name: 'employee_leave_balances',
          entity_id: `${year}_${month || 'ALL'}`,
          details: {
            year,
            month: month || null,
            totalRecords: records.length,
            mode,
            batchId: generatedBatchId,
            importedByName,
          },
        });
      } catch {}

      return { success: true, count: records.length };
    } catch (err: any) {
      console.error('Lỗi lưu employee_leave_balances:', err);
      return { success: false, count: 0, error: err?.message || 'Lỗi lưu dữ liệu' };
    }
  },

  /**
   * Xóa danh sách phép tồn theo ID
   */
  async deleteEmployeeLeaveBalances(ids: string[]): Promise<boolean> {
    if (!isSupabaseConfigured || ids.length === 0) return true;
    try {
      const { error } = await supabase.from('employee_leave_balances').delete().in('id', ids);
      if (error) {
        console.warn('Lỗi deleteEmployeeLeaveBalances:', error.message);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Xóa danh mục phép tồn theo kỳ (Tháng, Năm)
   */
  async deleteEmployeeLeaveBalancesByPeriod(month: number | null, year: number): Promise<boolean> {
    if (!isSupabaseConfigured) return true;
    try {
      let query = supabase.from('employee_leave_balances').delete().eq('year', year);
      if (month !== null && month !== undefined) {
        query = query.eq('month', month);
      }
      const { error } = await query;
      if (error) {
        console.warn('Lỗi deleteEmployeeLeaveBalancesByPeriod:', error.message);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Xóa danh mục phép tồn cả năm
   */
  async deleteEmployeeLeaveBalancesByYear(year: number): Promise<boolean> {
    if (!isSupabaseConfigured) return true;
    try {
      const { error } = await supabase.from('employee_leave_balances').delete().eq('year', year);
      if (error) {
        console.warn('Lỗi deleteEmployeeLeaveBalancesByYear:', error.message);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  },
};

