# HƯỚNG DẪN CẤU HÌNH SUPABASE CHO HR ATTENDANCE MANAGEMENT (GIAI ĐOẠN 2)

Tài liệu này hướng dẫn chi tiết từng bước kết nối cơ sở dữ liệu Supabase thật, chạy migration, thiết lập phân quyền RLS, Supabase Storage và hàm RPC bảo mật cho ứng dụng.

---

## BƯỚC 1: LẤY THÔNG TIN KẾT NỐI (PROJECT URL & ANON KEY)

1. Đăng nhập vào trang quản trị [Supabase Dashboard](https://supabase.com/dashboard).
2. Chọn dự án của bạn (hoặc bấm **New Project** để tạo dự án mới).
3. Vào mục **Project Settings** (biểu tượng bánh răng ở góc dưới thanh điều hướng) -> chọn mục **API**.
4. Sao chép 2 giá trị:
   - **Project URL:** Ví dụ `https://xyzcompany.supabase.co`
   - **anon public key:** Chuỗi token dài `eyJhbGciOiJIUzI1NiIsIn...`
   
   *(⚠️ **LƯU Ý BẢO MẬT:** Tuyệt đối KHÔNG sao chép `service_role secret key` vào mã nguồn Frontend!)*

5. Tạo tệp `.env` trong thư mục gốc của dự án `HR-Attendance-Management/` (hoặc sao chép từ `.env.example`):
   ```env
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   ```

---

## BƯỚC 2: CHẠY SQL MIGRATION TẠO BẢNG & RLS

1. Mở Supabase Dashboard -> vào mục **SQL Editor** ở thanh menu bên trái.
2. Bấm **New Query** (+).
3. Mở file [supabase/schema.sql](file:///c:/Users/HT/HR-Attendance-Management/supabase/schema.sql) trong dự án, sao chép toàn bộ nội dung và dán vào SQL Editor.
4. Bấm **Run** (Ctrl + Enter) để thực thi.

### Các bảng được khởi tạo tự động:
- `departments`: Quản lý danh mục phòng ban.
- `employees`: Quản lý hồ sơ nhân viên và mức lương/ngân hàng.
- `attendance_months`: Kỳ chấm công hàng tháng.
- `attendance_daily`: Nhật ký quẹt thẻ / điểm danh hàng ngày.
- `attendance_summaries`: Bảng tổng hợp công, thưởng phạt, bảo hiểm và lương thực lĩnh (Net).
- `attendance_imports`: Lịch sử nhập tệp tin Excel chấm công.
- `admin_profiles`: Danh sách hồ sơ Quản trị viên được phép đăng nhập.
- `audit_logs`: Nhật ký kiểm toán các thao tác thêm, sửa, xóa, import trong hệ thống.
- **Storage Bucket:** `excel-imports` dùng để lưu file Excel đính kèm.
- **RPC Function:** `public.lookup_employee_attendance(p_employee_code, p_month, p_year)`.

---

## BƯỚC 3: TẠO TÀI KHOẢN ADMIN ĐẦU TIÊN (SUPABASE AUTH)

Theo yêu cầu nghiệp vụ: **Chỉ có Admin được phép đăng nhập hệ thống; nhân viên chỉ tra cứu qua mã NV**.

1. Vào mục **Authentication** -> **Users** trong Supabase Dashboard.
2. Bấm **Add user** -> **Create user**.
3. Nhập email và mật khẩu quản trị:
   - Email: `admin@congtyviet.com`
   - Password: `AdminPassword123!` (hoặc mật khẩu an toàn theo ý bạn)
   - Đánh dấu **Auto Confirm User?** -> Bấm **Create user**.
4. Sau khi tạo user, sao chép mã **User UID** của tài khoản vừa tạo (Ví dụ: `a1b2c3d4-e5f6-7890-abcd-ef1234567890`).
5. Quay lại **SQL Editor** và chạy câu lệnh sau để cấp quyền Admin cho tài khoản:

```sql
INSERT INTO public.admin_profiles (id, username, full_name, role, email, avatar_url)
VALUES (
    'DÁN_USER_UID_VỪA_SAO_CHÉP_VÀO_ĐÂY', -- Thay bằng UID từ auth.users
    'admin',
    'Nguyễn Quản Trị',
    'super_admin',
    'admin@congtyviet.com',
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'
)
ON CONFLICT (id) DO NOTHING;
```

---

## BƯỚC 4: KIỂM TRA PHÂN QUYỀN RLS & RPC

- **Kiểm tra RLS:**
  - Người dùng ẩn danh (`anon`) không thể chạy lệnh `SELECT * FROM employees;` hoặc đọc các bảng nội bộ.
  - Khi Admin đăng nhập thành công qua Supabase Auth, hàm `public.is_admin()` xác nhận quyền và cho phép toàn quyền thao tác.
- **Kiểm tra RPC tra cứu nhân viên:**
  - Người dùng truy cập trang `/lookup`, nhập mã `NV001` và chọn Tháng 10/2026.
  - Hàm RPC `lookup_employee_attendance` bảo mật chỉ trả lời kết quả cho riêng mã `NV001`, ngăn chặn triệt để nguy cơ trích xuất dữ liệu toàn bộ công ty.

---

## BƯỚC 5: KHỞI ĐỘNG VÀ XÁC NHẬN KẾT NỐI

Chạy ứng dụng:
```bash
npm run dev
```

- Nếu file `.env` đã có Project URL và Anon Key hợp lệ:
  - Header sẽ hiển thị biểu tượng: 🟢 **Supabase Connected**
  - Màn hình đăng nhập hiển thị: **Supabase Auth & Database Live**
- Nếu chưa có file `.env`:
  - Hệ thống tự động kích hoạt **Demo Mode** sử dụng kho dữ liệu demo phong phú, đảm bảo giao diện luôn mượt mà và không bị gián đoạn hoạt động.

