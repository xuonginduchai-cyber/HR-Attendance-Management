-- ==============================================================================
-- FIX RLS & TABLES FOR HR ATTENDANCE MANAGEMENT
-- Mở quyền truy cập cho Anon Key & Authenticated để WebApp lưu dữ liệu trực tiếp lên Supabase
-- Chạy script này trong mục SQL Editor của Supabase Dashboard (supabase.com/dashboard)
-- ==============================================================================

-- 1. Bổ sung các cột mở rộng cho bảng attendance_daily (nếu chưa có)
ALTER TABLE public.attendance_daily ADD COLUMN IF NOT EXISTS overtime_hours NUMERIC(4, 2) DEFAULT 0;
ALTER TABLE public.attendance_daily ADD COLUMN IF NOT EXISTS leave_code VARCHAR(50);
ALTER TABLE public.attendance_daily ADD COLUMN IF NOT EXISTS overtime_details JSONB;

-- 2. Khởi tạo bảng leave_balances (Số Dư Phép Năm) nếu chưa có
CREATE TABLE IF NOT EXISTS public.leave_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id VARCHAR(50) NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    year INT NOT NULL CHECK (year >= 2020),
    carried_over_days NUMERIC(4, 2) NOT NULL DEFAULT 0,
    allocated_days NUMERIC(4, 2) NOT NULL DEFAULT 12,
    used_days NUMERIC(4, 2) NOT NULL DEFAULT 0,
    adjusted_days NUMERIC(4, 2) NOT NULL DEFAULT 0,
    remaining_days NUMERIC(4, 2) NOT NULL DEFAULT 12,
    pending_days NUMERIC(4, 2) NOT NULL DEFAULT 0,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(employee_id, year)
);

-- 3. Xóa các chính sách RLS cũ bị chặn quyền Anon Key
DROP POLICY IF EXISTS "Admin full access on departments" ON public.departments;
DROP POLICY IF EXISTS "Admin full access on employees" ON public.employees;
DROP POLICY IF EXISTS "Admin full access on attendance_months" ON public.attendance_months;
DROP POLICY IF EXISTS "Admin full access on attendance_daily" ON public.attendance_daily;
DROP POLICY IF EXISTS "Admin full access on attendance_summaries" ON public.attendance_summaries;
DROP POLICY IF EXISTS "Admin full access on attendance_imports" ON public.attendance_imports;
DROP POLICY IF EXISTS "Admin full access on leave_balances" ON public.leave_balances;
DROP POLICY IF EXISTS "Admin read audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Admin insert audit logs" ON public.audit_logs;

DROP POLICY IF EXISTS "Allow public on departments" ON public.departments;
DROP POLICY IF EXISTS "Allow public on employees" ON public.employees;
DROP POLICY IF EXISTS "Allow public on attendance_months" ON public.attendance_months;
DROP POLICY IF EXISTS "Allow public on attendance_daily" ON public.attendance_daily;
DROP POLICY IF EXISTS "Allow public on attendance_summaries" ON public.attendance_summaries;
DROP POLICY IF EXISTS "Allow public on leave_balances" ON public.leave_balances;
DROP POLICY IF EXISTS "Allow public on attendance_imports" ON public.attendance_imports;
DROP POLICY IF EXISTS "Allow public on audit_logs" ON public.audit_logs;

-- 4. Tạo các chính sách RLS mới cho phép anon & authenticated toàn quyền thao tác dữ liệu
CREATE POLICY "Allow public on departments" ON public.departments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow public on employees" ON public.employees FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow public on attendance_months" ON public.attendance_months FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow public on attendance_daily" ON public.attendance_daily FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow public on attendance_summaries" ON public.attendance_summaries FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow public on leave_balances" ON public.leave_balances FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow public on attendance_imports" ON public.attendance_imports FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow public on audit_logs" ON public.audit_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 5. Cập nhật hàm RPC bảo mật tra cứu nhân viên (lookup_employee_attendance)
CREATE OR REPLACE FUNCTION public.lookup_employee_attendance(
    p_employee_code TEXT,
    p_month INT,
    p_year INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_employee RECORD;
    v_summary RECORD;
    v_leave RECORD;
    v_daily_records JSONB;
    v_result JSONB;
BEGIN
    -- 1. Tìm kiếm thông tin nhân viên theo mã
    SELECT id, full_name, email, phone, department_name, position, avatar_url, start_date, status,
           bank_name, bank_account_number, bank_branch
    INTO v_employee
    FROM public.employees
    WHERE UPPER(TRIM(id)) = UPPER(TRIM(p_employee_code));

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Không tìm thấy nhân viên với mã: ' || p_employee_code
        );
    END IF;

    -- 2. Lấy dữ liệu điểm danh chi tiết trong tháng (sắp xếp tăng dần theo ngày 01 đến 31)
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', id,
            'date', date,
            'check_in', check_in,
            'check_out', check_out,
            'status', status,
            'work_hours', work_hours,
            'overtime_hours', overtime_hours,
            'late_minutes', late_minutes,
            'early_minutes', early_minutes,
            'leave_code', leave_code,
            'overtime_details', overtime_details,
            'note', note
        ) ORDER BY date ASC
    ), '[]'::jsonb)
    INTO v_daily_records
    FROM public.attendance_daily
    WHERE employee_id = v_employee.id
      AND EXTRACT(MONTH FROM date) = p_month
      AND EXTRACT(YEAR FROM date) = p_year;

    -- 3. Lấy dữ liệu tổng hợp / bảng lương trong tháng
    SELECT *
    INTO v_summary
    FROM public.attendance_summaries
    WHERE employee_id = v_employee.id
      AND month = p_month
      AND year = p_year;

    -- 3.5. Lấy dữ liệu số dư phép năm
    SELECT *
    INTO v_leave
    FROM public.leave_balances
    WHERE employee_id = v_employee.id
      AND year = p_year;

    -- 4. Tổng hợp JSON trả về
    v_result := jsonb_build_object(
        'success', true,
        'employee', jsonb_build_object(
            'id', v_employee.id,
            'full_name', v_employee.full_name,
            'email', v_employee.email,
            'phone', v_employee.phone,
            'department_name', v_employee.department_name,
            'position', v_employee.position,
            'avatar_url', v_employee.avatar_url,
            'start_date', v_employee.start_date,
            'status', v_employee.status,
            'bank_account', jsonb_build_object(
                'bank_name', v_employee.bank_name,
                'account_number', v_employee.bank_account_number,
                'branch', v_employee.bank_branch
            )
        ),
        'attendance_daily', v_daily_records,
        'attendance_summary', CASE WHEN v_summary.id IS NOT NULL THEN
            jsonb_build_object(
                'id', v_summary.id,
                'month', v_summary.month,
                'year', v_summary.year,
                'standard_work_days', v_summary.standard_work_days,
                'actual_work_days', v_summary.actual_work_days,
                'paid_leave_days', v_summary.paid_leave_days,
                'unpaid_leave_days', v_summary.unpaid_leave_days,
                'base_salary', v_summary.base_salary,
                'allowance', v_summary.allowance,
                'bonus', v_summary.bonus,
                'overtime_pay', v_summary.overtime_pay,
                'late_penalty', v_summary.late_penalty,
                'insurance_deduction', v_summary.insurance_deduction,
                'tax_deduction', v_summary.tax_deduction,
                'net_salary', v_summary.net_salary,
                'payment_status', v_summary.payment_status,
                'payment_date', v_summary.payment_date
            )
        ELSE NULL END,
        'leave_balance', CASE WHEN v_leave.id IS NOT NULL THEN
            jsonb_build_object(
                'id', v_leave.id,
                'year', v_leave.year,
                'carried_over_days', v_leave.carried_over_days,
                'allocated_days', v_leave.allocated_days,
                'used_days', v_leave.used_days,
                'adjusted_days', v_leave.adjusted_days,
                'remaining_days', v_leave.remaining_days,
                'pending_days', v_leave.pending_days,
                'note', v_leave.note
            )
        ELSE NULL END
    );

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_employee_attendance(TEXT, INT, INT) TO anon, authenticated;

-- 6. Khởi tạo bảng employee_leave_balances (Danh Mục Quản Lý & Tra Cứu Phép Tồn)
CREATE TABLE IF NOT EXISTS public.employee_leave_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_code VARCHAR(50) NOT NULL,
    employee_name VARCHAR(150),
    department VARCHAR(100),
    leave_balance_2025 NUMERIC(6, 2) DEFAULT 0,
    leave_generated_2026 NUMERIC(6, 2) DEFAULT 0,
    remaining_days NUMERIC(6, 2) DEFAULT 0,
    month INT,
    year INT NOT NULL DEFAULT 2026,
    import_batch_id TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_elb_emp_code ON public.employee_leave_balances (employee_code);
CREATE INDEX IF NOT EXISTS idx_elb_period ON public.employee_leave_balances (year, month);
CREATE INDEX IF NOT EXISTS idx_elb_emp_period ON public.employee_leave_balances (employee_code, year, month);

ALTER TABLE public.employee_leave_balances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public on employee_leave_balances" ON public.employee_leave_balances;
CREATE POLICY "Allow public on employee_leave_balances" ON public.employee_leave_balances
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);


