export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount);
};

export const formatDate = (dateString: string): string => {
  try {
    const [year, month, day] = dateString.split('-');
    if (day && month && year) {
      return `${day}/${month}/${year}`;
    }
    const d = new Date(dateString);
    return d.toLocaleDateString('vi-VN');
  } catch {
    return dateString;
  }
};

export const formatDateTime = (dateTimeString: string): string => {
  try {
    const d = new Date(dateTimeString);
    return d.toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return dateTimeString;
  }
};

export const getDayOfWeek = (dateString: string): string => {
  try {
    const [year, month, day] = dateString.split('-').map(Number);
    if (!year || !month || !day) {
      const d = new Date(dateString);
      const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
      return days[d.getDay()] || '';
    }
    const date = new Date(year, month - 1, day);
    const dayIndex = date.getDay();
    const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    return days[dayIndex] || '';
  } catch {
    return '';
  }
};

export const getAttendanceStatusLabel = (status: string): string => {
  switch (status) {
    case 'on_time':
      return 'Đúng giờ';
    case 'late':
      return 'Đi muộn';
    case 'early_leave':
      return 'Về sớm';
    case 'leave_approved':
      return 'Nghỉ phép';
    case 'leave_unapproved':
      return 'Nghỉ không phép';
    case 'holiday':
      return 'Nghỉ lễ';
    case 'weekend':
      return 'Cuối tuần';
    default:
      return status || 'Bình thường';
  }
};

/**
 * Danh sách các năm khả dụng cho dữ liệu chấm công:
 * Bắt đầu từ 2026 (đã loại bỏ 2024 và 2025 theo yêu cầu).
 * Tự động sinh năm tiếp theo khi hết năm (ví dụ: trong năm 2026 có 2026, 2027; khi sang 2027 tự có thêm 2028...).
 */
export const getAvailableAttendanceYears = (): number[] => {
  const START_YEAR = 2026;
  const currentYear = new Date().getFullYear();
  const maxYear = Math.max(START_YEAR + 1, currentYear + 1);
  const years: number[] = [];
  for (let y = START_YEAR; y <= maxYear; y++) {
    years.push(y);
  }
  return years;
};


