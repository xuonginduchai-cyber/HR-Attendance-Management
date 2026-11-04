# HƯỚNG DẪN TRIỂN KHAI VÀ BÁO CÁO KIỂM THỬ HỆ THỐNG
## HR ATTENDANCE & PAYROLL MANAGEMENT (GIAI ĐOẠN 6)

> Tài liệu đầy đủ và chi tiết nhất đã được biên soạn tại file: [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md).

### TÓM TẮT CÁC LỆNH TRIỂN KHAI NHANH:

1. **Cài đặt thư viện:**
   ```bash
   npm install
   ```

2. **Chạy ứng dụng thử nghiệm (Local Dev):**
   ```bash
   npm run dev
   ```
   Truy cập tại: `http://localhost:3000/`

3. **Chạy bộ kiểm thử tự động toàn diện (Test Suite):**
   ```bash
   node tests/suite.test.cjs
   ```
   *(Kết quả: 20/20 test ĐẠT - Passed)*

4. **Kiểm tra TypeScript và đóng gói bản phát hành (Production Build):**
   ```bash
   npm run build
   ```
   Thư mục phát hành nằm tại `dist/`.

5. **Xem trước bản build:**
   ```bash
   npm run preview
   ```

6. **Triển khai bằng Docker:**
   ```bash
   docker build -t hr-attendance-app:1.0 .
   docker run -d -p 80:80 --name hr-app hr-attendance-app:1.0
   ```

7. **Sao lưu Database Supabase:**
   ```bash
   pg_dump "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres" -F c -b -v -f hr_backup.dump
   ```

8. **Phục hồi Database Supabase:**
   ```bash
   pg_restore -d "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres" -v --clean --no-owner hr_backup.dump
   ```

Vui lòng tham khảo tài liệu [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) để xem chi tiết cấu hình Supabase, Edge Functions và Báo cáo kiểm thử 10 hạng mục.

