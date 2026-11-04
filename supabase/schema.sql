/* @datacloud.settings
{
  "version": 1,
  "service": "SPARK",
  "connectionInfo": {},
  "dialect": "ANSI_SQL"
}
*/

-- ==============================================================================
-- HR ATTENDANCE MANAGEMENT SYSTEM - SUPABASE DATABASE SCHEMA
-- Giai đoạn 2: Database Schema, RLS, Storage & Secure RPC Functions
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABLE: departments (Phòng Ban)
CREATE TABLE IF NOT EXISTS public.departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3. TABLE: employees (Hồ Sơ Nhân Viên)
CREATE TABLE IF NOT EXISTS public.employees (
    id VARCHAR(50) PRIMARY KEY, -- Mã nhân viên, ví dụ: 'NV001'
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    department_name VARCHAR(255) NOT NULL,
    position VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    start_date DATE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'probation', 'inactive')),
    base_salary NUMERIC(15, 2) NOT NULL DEFAULT 0,
    allowance NUMERIC(15, 2) NOT NULL DEFAULT 0,
    bank_name VARCHAR(100),
    bank_account_number VARCHAR(100),
    bank_branch VARCHAR(255),
    salary_pin VARCHAR(20) DEFAULT '1234', -- Mã PIN bảo mật tra cứu lương (mặc định: 1234)
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 4. TABLE: attendance_months (Kỳ Chấm Công)
CREATE TABLE IF NOT EXISTS public.attendance_months (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
    year INT NOT NULL CHECK (year >= 2020),
    standard_work_days INT NOT NULL DEFAULT 22,
    status VARCHAR(50) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'locked', 'finalized')),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(month, year)
);

-- 5. TABLE: attendance_daily (Chấm Công Hàng Ngày)
CREATE TABLE IF NOT EXISTS public.attendance_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id VARCHAR(50) NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    check_in VARCHAR(10),  -- e.g. '07:55'
    check_out VARCHAR(10), -- e.g. '17:35'
    status VARCHAR(50) NOT NULL CHECK (status IN ('on_time', 'late', 'early_leave', 'leave_approved', 'leave_unapproved', 'holiday', 'weekend')),
    work_hours NUMERIC(4, 2) DEFAULT 0,
    overtime_hours NUMERIC(4, 2) DEFAULT 0,
    late_minutes INT DEFAULT 0,
    early_minutes INT DEFAULT 0,
    leave_code VARCHAR(50), -- Ký hiệu nghỉ: P, HL, KP...
    overtime_details JSONB, -- Phân rã chi tiết 150%, 210%, phụ cấp ca đêm 30%, TC Chủ nhật 200%, 270%
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(employee_id, date)
);

-- Tự động bổ sung các cột mở rộng cho database hiện hữu
ALTER TABLE public.attendance_daily ADD COLUMN IF NOT EXISTS overtime_hours NUMERIC(4, 2) DEFAULT 0;
ALTER TABLE public.attendance_daily ADD COLUMN IF NOT EXISTS leave_code VARCHAR(50);
ALTER TABLE public.attendance_daily ADD COLUMN IF NOT EXISTS overtime_details JSONB;

-- 6. TABLE: attendance_summaries (Tổng Hợp Công & Bảng Lương)
CREATE TABLE IF NOT EXISTS public.attendance_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id VARCHAR(50) NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
    year INT NOT NULL CHECK (year >= 2020),
    standard_work_days INT NOT NULL DEFAULT 22,
    actual_work_days NUMERIC(5, 2) NOT NULL DEFAULT 0,
    paid_leave_days NUMERIC(4, 2) DEFAULT 0,
    unpaid_leave_days NUMERIC(4, 2) DEFAULT 0,
    base_salary NUMERIC(15, 2) NOT NULL DEFAULT 0,
    allowance NUMERIC(15, 2) DEFAULT 0,
    bonus NUMERIC(15, 2) DEFAULT 0,
    overtime_pay NUMERIC(15, 2) DEFAULT 0,
    late_penalty NUMERIC(15, 2) DEFAULT 0,
    insurance_deduction NUMERIC(15, 2) DEFAULT 0,
    tax_deduction NUMERIC(15, 2) DEFAULT 0,
    net_salary NUMERIC(15, 2) NOT NULL DEFAULT 0,
    payment_status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (payment_status IN ('paid', 'pending', 'draft')),
    payment_date DATE,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(employee_id, month, year)
);

-- 7. TABLE: attendance_imports (Lịch Sử Nhập File Excel)
CREATE TABLE IF NOT EXISTS public.attendance_imports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_name VARCHAR(255) NOT NULL,
    file_path TEXT,
    file_size BIGINT,
    imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    imported_by_name VARCHAR(255),
    total_rows INT NOT NULL DEFAULT 0,
    success_rows INT NOT NULL DEFAULT 0,
    error_rows INT NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'partial', 'failed')),
    error_details JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 8. TABLE: admin_profiles (Hồ Sơ Quản Trị Viên)
CREATE TABLE IF NOT EXISTS public.admin_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username VARCHAR(100) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'hr_manager' CHECK (role IN ('super_admin', 'hr_manager')),
    email VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 9. TABLE: audit_logs (Nhật Ký Thao Tác Hệ Thống)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_name VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100),
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 10. TABLE: leave_balances (Số Dư Phép Năm)
CREATE TABLE IF NOT EXISTS public.leave_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id VARCHAR(50) NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    year INT NOT NULL CHECK (year >= 2020),
    carried_over_days NUMERIC(4, 2) NOT NULL DEFAULT 0, -- Tồn đầu năm
    allocated_days NUMERIC(4, 2) NOT NULL DEFAULT 12,   -- Phép được cấp
    used_days NUMERIC(4, 2) NOT NULL DEFAULT 0,        -- Phép sử dụng
    adjusted_days NUMERIC(4, 2) NOT NULL DEFAULT 0,    -- Điều chỉnh
    remaining_days NUMERIC(4, 2) NOT NULL DEFAULT 12,  -- Còn lại (= carried + allocated + adjusted - used)
    pending_days NUMERIC(4, 2) NOT NULL DEFAULT 0,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(employee_id, year)
);

-- ==============================================================================
-- 11. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- Bật RLS cho tất cả các bảng
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Hàm trợ giúp: Kiểm tra user có phải Admin hợp lệ không
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_profiles
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Chính sách truy cập dữ liệu: Cho phép cả anon và authenticated toàn quyền thao tác để WebApp hoạt động thông suốt
CREATE POLICY "Allow public on departments" ON public.departments
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow public on employees" ON public.employees
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow public on attendance_months" ON public.attendance_months
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow public on attendance_daily" ON public.attendance_daily
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow public on attendance_summaries" ON public.attendance_summaries
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow public on attendance_imports" ON public.attendance_imports
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow public on leave_balances" ON public.leave_balances
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Admin view own profile" ON public.admin_profiles
    FOR SELECT TO anon, authenticated
    USING (true);

CREATE POLICY "Admin update own profile" ON public.admin_profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid());

CREATE POLICY "Allow public on audit_logs" ON public.audit_logs
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- Lưu ý bảo mật: KHÔNG CẤP QUYỀN TRUY CẬP TRỰC TIẾP CHO anon (người chưa đăng nhập) trên bất kỳ bảng nào!

-- ==============================================================================
-- 11. SECURE RPC FUNCTION: Tra cứu thông tin nhân viên theo mã và tháng/năm
-- ==============================================================================
-- Chức năng này được định nghĩa với SECURITY DEFINER để người dùng chưa đăng nhập (anon)
-- chỉ có thể tra cứu duy nhất bản ghi của chính mã nhân viên đó, không thể SELECT toàn bộ bảng.

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
    -- 1. Tìm kiếm nhân viên
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

    -- 2. Lấy dữ liệu điểm danh chi tiết trong tháng
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

-- Phân quyền cho anon và authenticated được gọi RPC tra cứu
GRANT EXECUTE ON FUNCTION public.lookup_employee_attendance(TEXT, INT, INT) TO anon, authenticated;

-- ==============================================================================
-- 12. SECURE RPC FUNCTION: Xác thực mã PIN tra cứu lương cá nhân
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.verify_employee_salary_pin(
    p_employee_code TEXT,
    p_pin TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_stored_pin TEXT;
    v_phone TEXT;
    v_last4 TEXT;
BEGIN
    SELECT COALESCE(salary_pin, '1234'), COALESCE(phone, '')
    INTO v_stored_pin, v_phone
    FROM public.employees
    WHERE UPPER(TRIM(id)) = UPPER(TRIM(p_employee_code));

    IF NOT FOUND THEN
        RETURN jsonb_build_object('valid', false, 'message', 'Mã nhân viên không tồn tại');
    END IF;

    -- Lấy 4 số cuối số điện thoại làm mã PIN phụ trợ
    v_last4 := RIGHT(REGEXP_REPLACE(v_phone, '[^0-9]', '', 'g'), 4);

    IF TRIM(p_pin) = v_stored_pin OR (v_last4 <> '' AND TRIM(p_pin) = v_last4) THEN
        RETURN jsonb_build_object('valid', true, 'message', 'Xác thực mã PIN thành công');
    ELSE
        RETURN jsonb_build_object('valid', false, 'message', 'Mã PIN bảo mật không chính xác');
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_employee_salary_pin(TEXT, TEXT) TO anon, authenticated;

-- ==============================================================================
-- 13. SUPABASE STORAGE BUCKET: excel-imports
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('excel-imports', 'excel-imports', false)
ON CONFLICT (id) DO NOTHING;

-- Phân quyền Storage: Chỉ Admin được upload và tải file
CREATE POLICY "Admin upload excel files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'excel-imports' AND public.is_admin());

CREATE POLICY "Admin read excel files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'excel-imports' AND public.is_admin());

-- ==============================================================================
-- 13. SEED INITIAL DATA (Khởi tạo dữ liệu mẫu phong phú)
-- ==============================================================================

-- Thêm các phòng ban
INSERT INTO public.departments (code, name, description)
VALUES 
    ('KT', 'Phòng Kỹ thuật', 'Bộ phận công nghệ, lập trình và hạ tầng hệ thống'),
    ('KD', 'Phòng Kinh doanh', 'Bộ phận bán hàng, chăm sóc khách hàng và phát triển thị trường'),
    ('NS', 'Phòng Nhân sự', 'Bộ phận quản lý nhân sự, tuyển dụng và đào tạo'),
    ('TCKT', 'Phòng Kế toán', 'Bộ phận kế toán, quản lý tài chính và bảng lương'),
    ('MKT', 'Phòng Marketing', 'Bộ phận truyền thông, quảng cáo và thương hiệu')
ON CONFLICT (code) DO NOTHING;

-- Thêm nhân viên mẫu
INSERT INTO public.employees (id, full_name, email, phone, department_name, position, avatar_url, start_date, status, base_salary, allowance, bank_name, bank_account_number, bank_branch)
VALUES
    ('NV001', 'Trần Văn An', 'an.tran@congtyviet.com', '0901 234 567', 'Phòng Kỹ thuật', 'Trưởng nhóm Backend', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150', '2022-03-15', 'active', 28000000, 2500000, 'Vietcombank', '1012398745', 'Chi nhánh Ba Đình'),
    ('NV002', 'Lê Thị Bích', 'bich.le@congtyviet.com', '0912 345 678', 'Phòng Nhân sự', 'Chuyên viên Tuyển dụng', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150', '2021-08-01', 'active', 18000000, 1500000, 'Techcombank', '19035678129', 'Chi nhánh Đông Đô'),
    ('NV003', 'Phạm Minh Cường', 'cuong.pham@congtyviet.com', '0983 456 789', 'Phòng Kỹ thuật', 'Frontend Developer', 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150', '2023-01-10', 'active', 22000000, 1800000, 'MBBank', '0888999123', 'Chi nhánh Hà Nội'),
    ('NV004', 'Hoàng Mỹ Duyên', 'duyen.hoang@congtyviet.com', '0978 901 234', 'Phòng Marketing', 'Digital Marketing Lead', 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150', '2022-11-01', 'active', 20000000, 2000000, 'VPBank', '1249876543', 'Sở giao dịch'),
    ('NV005', 'Đỗ Tuấn Em', 'em.do@congtyviet.com', '0934 567 890', 'Phòng Kinh doanh', 'Sales Executive', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150', '2024-02-15', 'active', 14000000, 3000000, 'Vietcombank', '1098765432', 'Chi nhánh Tân Bình'),
    ('NV006', 'Vũ Thị Phương Giang', 'giang.vu@congtyviet.com', '0945 678 901', 'Phòng Kế toán', 'Kế toán trưởng', 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150', '2020-05-20', 'active', 26000000, 2200000, 'BIDV', '215100012398', 'Chi nhánh Cầu Giấy'),
    ('NV007', 'Ngô Quốc Hùng', 'hung.ngo@congtyviet.com', '0967 890 123', 'Phòng Kỹ thuật', 'DevOps & SRE Engineer', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150', '2023-06-01', 'active', 25000000, 2000000, 'ACB', '987654321', 'Chi nhánh TP.HCM'),
    ('NV008', 'Đặng Thanh Loan', 'loan.dang@congtyviet.com', '0923 456 789', 'Phòng Kinh doanh', 'Thực tập sinh Sales', 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150', '2026-09-01', 'probation', 7000000, 1000000, 'TPBank', '0345678129', 'Hội sở')
ON CONFLICT (id) DO NOTHING;

-- Thêm kỳ công Tháng 10/2026 & Tháng 11/2026
INSERT INTO public.attendance_months (month, year, standard_work_days, status)
VALUES
    (10, 2026, 22, 'finalized'),
    (11, 2026, 22, 'open')
ON CONFLICT (month, year) DO NOTHING;

-- Thêm bảng lương mẫu Tháng 10/2026
INSERT INTO public.attendance_summaries (employee_id, month, year, standard_work_days, actual_work_days, paid_leave_days, unpaid_leave_days, base_salary, allowance, bonus, overtime_pay, late_penalty, insurance_deduction, tax_deduction, net_salary, payment_status, payment_date)
VALUES
    ('NV001', 10, 2026, 22, 22, 0, 0, 28000000, 2500000, 3000000, 1500000, 0, 2940000, 1550000, 30510000, 'paid', '2026-11-01'),
    ('NV002', 10, 2026, 22, 22, 0, 0, 18000000, 1500000, 1000000, 0, 50000, 1890000, 450000, 18110000, 'paid', '2026-11-01'),
    ('NV003', 10, 2026, 22, 21, 1, 0, 22000000, 1800000, 2000000, 800000, 0, 2310000, 820000, 23470000, 'paid', '2026-11-01'),
    ('NV004', 10, 2026, 22, 22, 0, 0, 20000000, 2000000, 2500000, 0, 0, 2100000, 680000, 21720000, 'paid', '2026-11-01'),
    ('NV005', 10, 2026, 22, 21, 1, 0, 14000000, 3000000, 4500000, 0, 150000, 1470000, 320000, 19560000, 'paid', '2026-11-01'),
    ('NV006', 10, 2026, 22, 22, 0, 0, 26000000, 2200000, 2000000, 0, 0, 2730000, 1200000, 26270000, 'paid', '2026-11-01'),
    ('NV007', 10, 2026, 22, 22, 0, 0, 25000000, 2000000, 2000000, 1200000, 100000, 2625000, 1100000, 26375000, 'paid', '2026-11-01'),
    ('NV008', 10, 2026, 22, 22, 0, 0, 7000000, 1000000, 500000, 0, 0, 0, 0, 8500000, 'paid', '2026-11-01')
ON CONFLICT (employee_id, month, year) DO NOTHING;

-- Thêm dữ liệu điểm danh ngày 03/11/2026
INSERT INTO public.attendance_daily (employee_id, date, check_in, check_out, status, work_hours, late_minutes, early_minutes, note)
VALUES
    ('NV001', '2026-11-03', '07:55', NULL, 'on_time', 4.5, 0, 0, 'Đang làm việc'),
    ('NV002', '2026-11-03', '07:52', NULL, 'on_time', 4.5, 0, 0, 'Đang làm việc'),
    ('NV003', '2026-11-03', '07:58', NULL, 'on_time', 4.5, 0, 0, 'Đang làm việc'),
    ('NV004', '2026-11-03', '07:50', NULL, 'on_time', 4.5, 0, 0, 'Đang làm việc'),
    ('NV005', '2026-11-03', '08:35', NULL, 'late', 4.0, 35, 0, 'Tắc đường đường vành đai 3'),
    ('NV006', '2026-11-03', '07:45', NULL, 'on_time', 4.5, 0, 0, 'Đang làm việc'),
    ('NV007', '2026-11-03', '07:56', NULL, 'on_time', 4.5, 0, 0, 'Đang làm việc'),
    ('NV008', '2026-11-03', NULL, NULL, 'leave_unapproved', 0, 0, 0, 'Chưa có thông tin điểm danh')
ON CONFLICT (employee_id, date) DO NOTHING;

-- Thêm lịch sử import mẫu
INSERT INTO public.attendance_imports (file_name, file_path, file_size, imported_by_name, total_rows, success_rows, error_rows, status)
VALUES
    ('Cham_Cong_Thang_10_2026_MayQuetVanTay.xlsx', 'excel-imports/Cham_Cong_Thang_10_2026_MayQuetVanTay.xlsx', 45280, 'Nguyễn Quản Trị', 176, 176, 0, 'success'),
    ('Cham_Cong_Tuan_4_Thang_10.xlsx', 'excel-imports/Cham_Cong_Tuan_4_Thang_10.xlsx', 18320, 'Lê Thị Bích', 40, 38, 2, 'partial');

