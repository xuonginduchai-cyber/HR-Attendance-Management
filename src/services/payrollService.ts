import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { PayrollRecord, Employee } from '../types';

export const payrollService = {
  /**
   * Lấy danh sách bảng lương tổng hợp theo tháng/năm từ Supabase
   */
  async getPayrollSummaries(month?: number, year?: number): Promise<PayrollRecord[]> {
    if (!isSupabaseConfigured) return [];

    let query = supabase.from('attendance_summaries').select('*').limit(10000);

    if (month) query = query.eq('month', month);
    if (year) query = query.eq('year', year);

    const { data, error } = await query;
    if (error) {
      console.error('Lỗi khi tải bảng lương từ Supabase:', error);
      throw error;
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      employeeId: row.employee_id,
      month: row.month,
      year: row.year,
      standardWorkDays: row.standard_work_days,
      actualWorkDays: Number(row.actual_work_days) || 0,
      paidLeaveDays: Number(row.paid_leave_days) || 0,
      unpaidLeaveDays: Number(row.unpaid_leave_days) || 0,
      baseSalary: Number(row.base_salary) || 0,
      allowance: Number(row.allowance) || 0,
      bonus: Number(row.bonus) || 0,
      overtimePay: Number(row.overtime_pay) || 0,
      latePenalty: Number(row.late_penalty) || 0,
      insuranceDeduction: Number(row.insurance_deduction) || 0,
      taxDeduction: Number(row.tax_deduction) || 0,
      netSalary: Number(row.net_salary) || 0,
      paymentStatus: row.payment_status || 'draft',
      paymentDate: row.payment_date,
    }));
  },

  /**
   * Kiểm tra xem kỳ lương tháng/năm đã có dữ liệu trong Supabase chưa
   */
  async checkExistingPayroll(
    month: number,
    year: number
  ): Promise<{ hasData: boolean; count: number }> {
    if (!isSupabaseConfigured) return { hasData: false, count: 0 };

    try {
      const { count, error } = await supabase
        .from('attendance_summaries')
        .select('*', { count: 'exact', head: true })
        .eq('month', month)
        .eq('year', year);

      if (error) {
        console.warn('Lỗi kiểm tra kỳ lương cũ:', error);
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
   * Lưu hoặc cập nhật danh sách bảng lương vào Supabase
   * Hỗ trợ 2 chế độ:
   * - overwrite: Xóa dữ liệu cũ của kỳ đó rồi ghi đè
   * - upsert: Cập nhật hoặc thêm mới theo (employee_id, month, year)
   */
  async savePayrollRecords(params: {
    month: number;
    year: number;
    records: PayrollRecord[];
    mode: 'overwrite' | 'upsert';
    importedByName: string;
  }): Promise<{ success: boolean; count: number; error?: string }> {
    const { month, year, records, mode, importedByName } = params;
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
              start_date: `${year}-${String(month).padStart(2, '0')}-01`,
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

      // Đảm bảo kỳ lương attendance_months được khởi tạo
      await supabase
        .from('attendance_months')
        .upsert(
          {
            month,
            year,
            standard_work_days: 22,
            status: 'open',
          },
          { onConflict: 'month,year' }
        );

      // 1. Nếu chọn ghi đè (overwrite), xóa các bản ghi cũ của kỳ đó
      if (mode === 'overwrite') {
        const { error: delError } = await supabase
          .from('attendance_summaries')
          .delete()
          .eq('month', month)
          .eq('year', year);

        if (delError) {
          console.error('Lỗi khi xóa bảng lương cũ để ghi đè:', delError);
          throw new Error(`Lỗi khi xóa kỳ lương cũ: ${delError.message}`);
        }
      }

      // 2. Chuẩn hóa payload lưu vào database
      const payload = records.map((r) => ({
        employee_id: r.employeeId.trim().toUpperCase(),
        month: r.month || month,
        year: r.year || year,
        standard_work_days: r.standardWorkDays || 22,
        actual_work_days: r.actualWorkDays || 0,
        paid_leave_days: r.paidLeaveDays || 0,
        unpaid_leave_days: r.unpaidLeaveDays || 0,
        base_salary: r.baseSalary || 0,
        allowance: r.allowance || 0,
        bonus: r.bonus || 0,
        overtime_pay: r.overtimePay || 0,
        late_penalty: r.latePenalty || 0,
        insurance_deduction: r.insuranceDeduction || 0,
        tax_deduction: r.taxDeduction || 0,
        net_salary: r.netSalary || 0,
        payment_status: r.paymentStatus || 'draft',
        payment_date: r.paymentDate || null,
        updated_at: new Date().toISOString(),
      }));

      // 3. Thực hiện ghi theo lô (batch upsert)
      const batchSize = 100;
      for (let i = 0; i < payload.length; i += batchSize) {
        const chunk = payload.slice(i, i + batchSize);
        const { error: upsertErr } = await supabase
          .from('attendance_summaries')
          .upsert(chunk, { onConflict: 'employee_id,month,year' });

        if (upsertErr) {
          console.error(`Lỗi ghi lô bảng lương ${i}-${i + chunk.length}:`, upsertErr);
          throw new Error(`Lỗi khi lưu bảng lương: ${upsertErr.message}`);
        }
      }

      // 4. Ghi nhận audit log
      try {
        const { data: session } = await supabase.auth.getSession();
        await supabase.from('audit_logs').insert({
          user_id: session.session?.user?.id || null,
          action: 'IMPORT_PAYROLL_EXCEL',
          entity_name: 'attendance_summaries',
          entity_id: `${month}_${year}`,
          details: {
            mode,
            month,
            year,
            totalRecords: records.length,
            importedByName,
          },
        });
      } catch (logErr) {
        console.warn('Lỗi ghi audit log bảng lương:', logErr);
      }

      return { success: true, count: records.length };
    } catch (err: any) {
      console.error('Lỗi khi lưu bảng lương vào Supabase:', err);
      return { success: false, count: 0, error: err.message || 'Lỗi lưu bảng lương' };
    }
  },

  /**
   * Xác thực mã PIN tra cứu lương của nhân viên
   * Mặc định là '1234' hoặc 4 số cuối số điện thoại nếu nhân viên chưa đổi PIN
   */
  verifySalaryPin(
    employee: Employee,
    inputPin: string
  ): { valid: boolean; message?: string } {
    const trimmedInput = inputPin.trim();
    if (!trimmedInput) {
      return { valid: false, message: 'Vui lòng nhập mã PIN bảo mật.' };
    }

    // Mã PIN được cấu hình hoặc mặc định '1234'
    const configuredPin = employee.salaryPin || '1234';
    
    // Tùy chọn cho phép 4 số cuối số điện thoại làm PIN phụ trợ
    const phoneDigits = (employee.phone || '').replace(/\D/g, '');
    const last4Digits = phoneDigits.length >= 4 ? phoneDigits.slice(-4) : '';

    if (trimmedInput === configuredPin || (last4Digits && trimmedInput === last4Digits)) {
      return { valid: true };
    }

    return {
      valid: false,
      message: 'Mã PIN bảo mật không chính xác. Vui lòng kiểm tra lại hoặc liên hệ Phòng Nhân sự.',
    };
  },
};
