-- ==============================================================================
-- THÊM TÀI KHOẢN ADMIN: NGÔ THỊ NGỌC MAI
-- Chạy script này trong mục SQL Editor trên Supabase Dashboard (supabase.com/dashboard)
-- ==============================================================================

-- 1. Thêm hoặc cập nhật hồ sơ Admin trong bảng public.admin_profiles
INSERT INTO public.admin_profiles (id, username, full_name, role, email, avatar_url)
VALUES (
    '45d45f1f-9ba2-493a-aa15-a4bc1f5b8d49',
    'ngocmai_vina',
    'Ngô Thị Ngọc Mai',
    'super_admin',
    'ngocmai_vina@coasia.com',
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'
)
ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    email = EXCLUDED.email;

-- 2. Đảm bảo chính sách RLS cho phép WebApp tra cứu và xác thực quyền admin
DROP POLICY IF EXISTS "Allow public on admin_profiles" ON public.admin_profiles;
CREATE POLICY "Allow public on admin_profiles" ON public.admin_profiles
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 3. Kiểm tra kết quả
SELECT * FROM public.admin_profiles WHERE id = '45d45f1f-9ba2-493a-aa15-a4bc1f5b8d49';
