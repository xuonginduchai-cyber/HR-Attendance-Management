# Hệ Thống Quản Lý Chấm Công & Nhân Sự (HR Attendance Management)

Hệ thống quản lý nhân sự, theo dõi chấm công và tính lương toàn diện cho doanh nghiệp, được xây dựng bằng React, TypeScript, Tailwind CSS, Vite và Lucide Icons.

---

## 🚀 Công Nghệ Sử Dụng

- **Frontend Core:** React 18 + TypeScript + Vite.
- **Styling & UI:** Tailwind CSS v3 + Lucide Icons + Google Font Inter.
- **Routing:** React Router v6 (Hỗ trợ phân quyền Admin Portal và Cổng Tra cứu công cộng).
- **State & Data Management:** React Context API + LocalStorage + Mock Data chi tiết.

---

## 📁 Cấu Trúc Thư Mục Dự Án

```
HR-Attendance-Management/
├── dist/                      # Bản build tối ưu sẵn sàng production
├── node_modules/              # Thư viện npm
├── public/                    # Tài nguyên tĩnh
├── src/
│   ├── components/
│   │   ├── common/            # Badge, Card, Modal, StatCard,...
│   │   └── layout/            # AdminLayout, Sidebar, Header,...
│   ├── context/
│   │   ├── AuthContext.tsx    # Xác thực & phiên đăng nhập Quản trị viên
│   │   └── DataContext.tsx    # Quản lý kho dữ liệu (Nhân viên, Công, Lương, Phép, Logs)
│   ├── data/
│   │   └── mockData.ts        # Dữ liệu mẫu phong phú: 8+ nhân sự, lịch sử chấm công, bảng lương
│   ├── pages/
│   │   ├── admin/             # Các trang dành cho Ban Nhân sự (HR/Admin)
│   │   │   ├── LoginPage.tsx
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── EmployeeManagementPage.tsx
│   │   │   ├── AttendanceManagementPage.tsx
│   │   │   ├── ExcelImportPage.tsx
│   │   │   ├── PayrollPage.tsx
│   │   │   ├── LeaveManagementPage.tsx
│   │   │   ├── ImportHistoryPage.tsx
│   │   │   └── SettingsPage.tsx
│   │   └── lookup/            # Trang Tra cứu dành cho Nhân viên (Không cần login)
│   │       └── EmployeeLookupPage.tsx
│   ├── types/
│   │   └── index.ts           # Định nghĩa Typescript Interfaces
│   ├── utils/
│   │   └── formatters.ts      # Hàm format tiền tệ (VND), ngày tháng (vi-VN)
│   ├── App.tsx                # Thiết lập router và layout
│   ├── index.css              # Tailwind base + component directives
│   └── main.tsx               # Điểm khởi chạy ứng dụng
├── index.html                 # Trang HTML chính với font chữ Inter & favicon
├── package.json               # Danh sách thư viện và scripts
├── postcss.config.js          # Cấu hình PostCSS & Autoprefixer
├── tailwind.config.js         # Cấu hình màu sắc thương hiệu và Tailwind
├── tsconfig.json              # Cấu hình TypeScript
└── vite.config.ts             # Cấu hình Vite dev server
```

---

## 🛠️ Hướng Dẫn Cài Đặt & Chạy Ứng Dụng

### 1. Khởi chạy môi trường phát triển (Development):
```bash
npm run dev
```
Truy cập ứng dụng tại: `http://localhost:3000` hoặc port được Vite thông báo.

### 2. Kiểm tra & Đóng gói sản phẩm (Production Build):
```bash
npm run build
```

### 3. Xem trước bản đóng gói (Preview):
```bash
npm run preview
```

---

## 🔑 Tài Khoản Đăng Nhập Thử Nghiệm

- **Đường dẫn Admin Portal:** `/admin/dashboard` hoặc `/login`
  - **Tài khoản:** `admin`
  - **Mật khẩu:** `admin123` *(hoặc click nút "Tự điền" trên form đăng nhập)*
- **Đường dẫn Cổng Tra Cứu Nhân Viên:** `/lookup`
  - Không cần mật khẩu.
  - Có các mã nhân viên mẫu để bấm thử: `NV001` (Trần Văn An), `NV002` (Lê Thị Bích), `NV003` (Phạm Minh Cường), `NV004`, `NV005`,...

