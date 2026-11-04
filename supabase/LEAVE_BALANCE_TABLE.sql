-- ==============================================================================
-- BẢNG EMPLOYEE_LEAVE_BALANCES (DANH MỤC QUẢN LÝ PHÉP TỒN)
-- Dùng chung Supabase Database hiện tại, mở quyền RLS cho Anon & Authenticated
-- Chạy script này trong mục SQL Editor của Supabase Dashboard (supabase.com/dashboard)
-- ==============================================================================

-- 1. Khởi tạo bảng employee_leave_balances nếu chưa có
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

-- 2. Đặt Index cho employee_code, month, year để tăng tốc độ tra cứu tức thì
CREATE INDEX IF NOT EXISTS idx_elb_emp_code ON public.employee_leave_balances (employee_code);
CREATE INDEX IF NOT EXISTS idx_elb_period ON public.employee_leave_balances (year, month);
CREATE INDEX IF NOT EXISTS idx_elb_emp_period ON public.employee_leave_balances (employee_code, year, month);

-- 3. Bật RLS và cấp quyền truy cập
ALTER TABLE public.employee_leave_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public select employee_leave_balances" ON public.employee_leave_balances;
CREATE POLICY "Allow public select employee_leave_balances" ON public.employee_leave_balances
    FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow public all employee_leave_balances" ON public.employee_leave_balances;
CREATE POLICY "Allow public all employee_leave_balances" ON public.employee_leave_balances
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

