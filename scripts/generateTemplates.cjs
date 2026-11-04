const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

function generateSampleAttendanceFile(outPath) {
  const month = 11;
  const year = 2026;
  const daysInMonth = new Date(year, month, 0).getDate(); // 30

  const sampleEmps = [
    { id: 'NV001', fullName: 'Trần Văn An', department: 'Phòng Kỹ thuật', startDate: '2022-03-15' },
    { id: 'NV002', fullName: 'Lê Thị Bích', department: 'Phòng Nhân sự', startDate: '2021-08-01' },
    { id: 'NV003', fullName: 'Phạm Minh Cường', department: 'Phòng Kỹ thuật', startDate: '2023-01-10' },
    { id: 'NV007', fullName: 'Ngô Quốc Hùng', department: 'Phòng Kỹ thuật', startDate: '2023-06-01' },
    { id: 'NV008', fullName: 'Đặng Thanh Loan', department: 'Phòng Kinh doanh', startDate: '2026-09-01' },
  ];

  const indicators = [
    'Bắt đầu',
    'Kết thúc',
    'Thời gian làm việc',
    'Nghỉ làm',
    'TC ngày thường (150%)',
    'TC đêm ngày thường (210%)',
    'Phụ cấp ca đêm (30%)',
    'TC ngày Chủ nhật (200%)',
    'TC đêm Chủ nhật (270%)',
    'TC ngày lễ (300%)',
    'TC đêm ngày lễ (390%)',
    'Nghỉ có lương + ngày lễ',
    'Nghỉ HL',
    'Nghỉ phép',
  ];

  // Tiêu đề 60 cột: A..F, G..AK (1..31), AL..BH (23 cột tổng hợp và phụ cấp)
  const headerRow = [
    'STT',                 // Col A (0)
    'Mã nhân viên',        // Col B (1)
    'Họ và tên',           // Col C (2)
    'Ngày vào làm việc',   // Col D (3)
    'Bộ phận',             // Col E (4)
    'Nội dung chỉ tiêu',   // Col F (5)
  ];

  for (let d = 1; d <= 31; d++) {
    headerRow.push(String(d));
  }

  const summaryHeaders = [
    'Tổng giờ làm',              // Col AL (37)
    'Tổng công',                 // Col AM (38)
    'TC ngày thường (150%)',     // Col AN (39)
    'TC đêm ngày thường (210%)', // Col AO (40)
    'Phụ cấp ca đêm (30%)',      // Col AP (41)
    'TC ngày Chủ nhật (200%)',   // Col AQ (42)
    'TC đêm Chủ nhật (270%)',    // Col AR (43)
    'TC ngày lễ (300%)',         // Col AS (44)
    'TC đêm ngày lễ (390%)',     // Col AT (45)
    'Nghỉ có lương + ngày lễ',   // Col AU (46)
    'Nghỉ HL',                   // Col AV (47)
    'Nghỉ phép',                 // Col AW (48)
    'Nghỉ không lương (KP)',     // Col AX (49)
    'Đi muộn (phút)',            // Col AY (50)
    'Về sớm (phút)',             // Col AZ (51)
    'Vi phạm quy định',          // Col BA (52)
    'Phụ cấp chuyên cần',        // Col BB (53)
    'Phụ cấp độc hại',           // Col BC (54)
    'Phụ cấp khác',              // Col BD (55)
    'Tổng giờ OT',               // Col BE (56)
    'Tổng giờ ca đêm',           // Col BF (57)
    'Tổng công tính lương',      // Col BG (58)
    'Ghi chú',                   // Col BH (59)
  ];
  headerRow.push(...summaryHeaders);

  const rows = [headerRow];

  sampleEmps.forEach((emp, empIdx) => {
    const stt = empIdx + 1;

    indicators.forEach((indName, indIdx) => {
      const row = [
        indIdx === 0 ? stt : '',
        emp.id,
        emp.fullName,
        emp.startDate,
        emp.department,
        indName,
      ];

      for (let day = 1; day <= 31; day++) {
        if (day > daysInMonth) {
          row.push('');
          continue;
        }

        const dateObj = new Date(year, month - 1, day);
        const dayOfWeek = dateObj.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        if (isWeekend) {
          if (emp.id === 'NV001' && day === 14) {
            if (indName === 'Bắt đầu') row.push('08:00');
            else if (indName === 'Kết thúc') row.push('19:30');
            else if (indName === 'Thời gian làm việc') row.push(9.5);
            else if (indName === 'Nghỉ làm') row.push('-');
            else if (indName === 'TC ngày thường (150%)') row.push(1.5);
            else row.push('');
          } else if (emp.id === 'NV001' && day === 21) {
            if (indName === 'Bắt đầu') row.push('08:00');
            else if (indName === 'Kết thúc') row.push('20:30');
            else if (indName === 'Thời gian làm việc') row.push(10.5);
            else if (indName === 'Nghỉ làm') row.push('-');
            else if (indName === 'TC ngày thường (150%)') row.push(2.5);
            else row.push('');
          } else {
            if (indName === 'Nghỉ làm') row.push('-');
            else row.push('');
          }
          continue;
        }

        if (emp.id === 'NV001' && day === 4) {
          if (indName === 'Nghỉ làm') row.push('P');
          else if (indName === 'Nghỉ có lương + ngày lễ') row.push(1);
          else if (indName === 'Nghỉ phép') row.push(1);
          else row.push('');
          continue;
        }

        if (emp.id === 'NV003' && day === 24) {
          if (indName === 'Nghỉ làm') row.push('HL');
          else if (indName === 'Nghỉ HL') row.push(1);
          else row.push('');
          continue;
        }

        if (indName === 'Bắt đầu') {
          row.push('08:00');
        } else if (indName === 'Kết thúc') {
          if (emp.id === 'NV001' && day === 6) row.push('20:00');
          else if (emp.id === 'NV003' && day === 6) row.push('20:00');
          else if (emp.id === 'NV007' && day === 14) row.push('19:30');
          else if (emp.id === 'NV007' && day === 18) row.push('22:00');
          else row.push('17:30');
        } else if (indName === 'Thời gian làm việc') {
          if (emp.id === 'NV001' && day === 6) row.push(10);
          else if (emp.id === 'NV003' && day === 6) row.push(10);
          else if (emp.id === 'NV007' && day === 14) row.push(9.5);
          else if (emp.id === 'NV007' && day === 18) row.push(12);
          else row.push(8);
        } else if (indName === 'Nghỉ làm') {
          row.push('-');
        } else if (indName === 'TC ngày thường (150%)') {
          if (emp.id === 'NV001' && day === 6) row.push(2);
          else if (emp.id === 'NV003' && day === 6) row.push(2);
          else if (emp.id === 'NV007' && day === 14) row.push(1.5);
          else row.push('');
        } else if (indName === 'TC đêm ngày thường (210%)') {
          if (emp.id === 'NV007' && day === 18) row.push(2);
          else row.push('');
        } else if (indName === 'Phụ cấp ca đêm (30%)') {
          if (emp.id === 'NV007' && day === 18) row.push(4);
          else row.push('');
        } else {
          row.push('');
        }
      }

      // 23 cột tổng hợp AL..BH
      const summaryVals = new Array(23).fill('');
      const S_AL = 0, S_AM = 1, S_AN = 2, S_AO = 3, S_AP = 4, S_AQ = 5, S_AR = 6;
      const S_AS = 7, S_AT = 8, S_AU = 9, S_AV = 10, S_AW = 11, S_AX = 12, S_AY = 13;
      const S_AZ = 14, S_BA = 15, S_BB = 16, S_BC = 17, S_BD = 18, S_BE = 19, S_BF = 20, S_BG = 21, S_BH = 22;

      if (emp.id === 'NV001') {
        if (indName === 'Thời gian làm việc') {
          summaryVals[S_AL] = 182;
          summaryVals[S_AM] = 22;
          summaryVals[S_BE] = 6.0;
          summaryVals[S_BG] = 22;
          summaryVals[S_BH] = 'Đầy đủ công - Tăng ca tiến độ';
        } else if (indName === 'TC ngày thường (150%)') {
          summaryVals[S_AN] = 6.0;
          summaryVals[S_BE] = 6.0;
          summaryVals[S_BH] = 'Tăng ca ngày 6 (+2h), ngày 14 (+1.5h), ngày 21 (+2.5h)';
        } else if (indName === 'Nghỉ làm') {
          summaryVals[S_AU] = 1;
          summaryVals[S_AW] = 1;
          summaryVals[S_BH] = 'Nghỉ phép 1 ngày có đơn (ngày 04)';
        } else if (indName === 'Nghỉ có lương + ngày lễ') {
          summaryVals[S_AU] = 1;
        } else if (indName === 'Nghỉ phép') {
          summaryVals[S_AW] = 1;
        }
      } else if (emp.id === 'NV002') {
        if (indName === 'Thời gian làm việc') {
          summaryVals[S_AL] = 176;
          summaryVals[S_AM] = 22;
          summaryVals[S_BB] = 500000;
          summaryVals[S_BG] = 22;
          summaryVals[S_BH] = 'Chuyên cần xuất sắc';
        }
      } else if (emp.id === 'NV003') {
        if (indName === 'Thời gian làm việc') {
          summaryVals[S_AL] = 170;
          summaryVals[S_AM] = 22;
          summaryVals[S_BE] = 2.0;
          summaryVals[S_BG] = 22;
          summaryVals[S_BH] = 'Có 1 ngày nghỉ HL có giấy khám bệnh';
        } else if (indName === 'TC ngày thường (150%)') {
          summaryVals[S_AN] = 2.0;
          summaryVals[S_BE] = 2.0;
          summaryVals[S_BH] = 'Tăng ca ngày 6 (+2h)';
        } else if (indName === 'Nghỉ làm') {
          summaryVals[S_AV] = 1;
        } else if (indName === 'Nghỉ HL') {
          summaryVals[S_AV] = 1;
        }
      } else if (emp.id === 'NV007') {
        if (indName === 'Thời gian làm việc') {
          summaryVals[S_AL] = 177.5;
          summaryVals[S_AM] = 22;
          summaryVals[S_BE] = 3.5;
          summaryVals[S_BF] = 6.0;
          summaryVals[S_BG] = 22;
          summaryVals[S_BH] = 'Trực hệ thống ca đêm';
        } else if (indName === 'TC ngày thường (150%)') {
          summaryVals[S_AN] = 1.5;
          summaryVals[S_BE] = 1.5;
        } else if (indName === 'TC đêm ngày thường (210%)') {
          summaryVals[S_AO] = 2.0;
        } else if (indName === 'Phụ cấp ca đêm (30%)') {
          summaryVals[S_AP] = 4.0;
          summaryVals[S_BF] = 4.0;
        }
      } else if (emp.id === 'NV008') {
        if (indName === 'Thời gian làm việc') {
          summaryVals[S_AL] = 176;
          summaryVals[S_AM] = 22;
          summaryVals[S_BG] = 22;
          summaryVals[S_BH] = 'Nhân viên thử việc - Đầy đủ công';
        }
      }

      row.push(...summaryVals);
      rows.push(row);
    });
  });

  const worksheet = XLSX.utils.aoa_to_sheet(rows);

  worksheet['!cols'] = [
    { wch: 6 },
    { wch: 14 },
    { wch: 22 },
    { wch: 16 },
    { wch: 18 },
    { wch: 26 },
  ];
  for (let i = 6; i < 37; i++) {
    worksheet['!cols'].push({ wch: 6.5 });
  }
  const summaryWidths = [14, 12, 14, 15, 15, 15, 15, 14, 15, 16, 12, 12, 14, 13, 13, 14, 15, 14, 14, 14, 15, 16, 28];
  summaryWidths.forEach(w => worksheet['!cols'].push({ wch: w }));

  // Sheet 2: Huong_Dan_Su_Dung
  const guideRows = [
    ['HƯỚNG DẪN SỬ DỤNG VÀ QUY CÁCH DỮ LIỆU FILE MẪU CHẤM CÔNG (mẫu.xlsx)'],
    ['Áp dụng cho Hệ thống Quản trị Nhân sự & Chấm công HR Attendance Management'],
    [],
    ['I. CẤU TRÚC MA TRẬN 60 CỘT CHUẨN (A:BH)'],
    ['1. Cột A - F:', 'Thông tin nhân viên: STT (A), Mã nhân viên (B), Họ và tên (C), Ngày vào làm (D), Bộ phận (E), Nội dung chỉ tiêu (F).'],
    ['2. Cột G - AK:', 'Dữ liệu chấm công theo ngày từ ngày 01 đến ngày 31 của tháng.'],
    ['3. Cột AL - AM:', 'Tổng giờ làm việc (AL) và Tổng số ngày công thực tế (AM).'],
    ['4. Cột AN - BH:', 'Các cột tổng hợp chi tiết theo từng loại tăng ca OT (150%, 210%, 200%...), phụ cấp và chế độ nghỉ.'],
    [],
    ['II. QUY ĐỊNH 14 DÒNG CHỈ TIÊU CHI TIẾT THEO NHÂN VIÊN'],
    ['Mỗi nhân viên gồm đúng 14 dòng chỉ tiêu liên tiếp, gom nhóm theo Mã nhân viên (không xem mỗi dòng là một nhân viên riêng):'],
    ['Nhóm 1 – Thời gian làm việc theo ngày:'],
    ['  1. Bắt đầu', 'Giờ quẹt thẻ vào làm (định dạng HH:mm, ví dụ: 08:00).'],
    ['  2. Kết thúc', 'Giờ quẹt thẻ ra về (định dạng HH:mm, ví dụ: 17:30, 20:00).'],
    ['  3. Thời gian làm việc', 'Số giờ làm việc thực tế trong ngày (ví dụ: 8, 9.5, 10).'],
    ['  4. Nghỉ làm', 'Ký hiệu loại nghỉ: "P" (nghỉ phép), "HL" (nghỉ hưởng lương BHXH), "KP" (nghỉ không phép/không lương), "-" (ngày nghỉ cuối tuần).'],
    ['Nhóm 2 – Các loại công tăng ca và phụ cấp:'],
    ['  5. TC ngày thường (150%)', 'Số giờ làm thêm vào ngày làm việc thông thường.'],
    ['  6. TC đêm ngày thường (210%)', 'Số giờ làm thêm vào ban đêm của ngày thường.'],
    ['  7. Phụ cấp ca đêm (30%)', 'Số giờ hưởng phụ cấp làm việc ca đêm (22:00 - 06:00).'],
    ['  8. TC ngày Chủ nhật (200%)', 'Số giờ làm thêm vào ngày nghỉ hàng tuần (Chủ nhật).'],
    ['  9. TC đêm Chủ nhật (270%)', 'Số giờ làm thêm ban đêm vào ngày Chủ nhật.'],
    ['  10. TC ngày lễ (300%)', 'Số giờ làm thêm vào ngày lễ, tết được nghỉ theo luật.'],
    ['  11. TC đêm ngày lễ (390%)', 'Số giờ làm thêm ban đêm vào ngày lễ, tết.'],
    ['  12. Nghỉ có lương + ngày lễ', 'Ghi nhận số ngày nghỉ hưởng nguyên lương theo luật hoặc chế độ công ty.'],
    ['  13. Nghỉ HL', 'Số ngày nghỉ hưởng trợ cấp BHXH (ốm đau, thai sản, khám bệnh).'],
    ['  14. Nghỉ phép', 'Số ngày nghỉ trừ vào quỹ phép năm của nhân viên.'],
    [],
    ['III. QUY TẮC BẢO VỆ DỮ LIỆU & TỰ ĐỘNG TẠO NHÂN VIÊN'],
    ['1. Bảo toàn mã NV:', 'Mã nhân viên luôn được lưu dạng chuỗi và giữ nguyên số 0 ở đầu (ví dụ: NV001, 00123).'],
    ['2. Tự động tạo hồ sơ:', 'Nếu mã nhân viên chưa có trong hệ thống, hệ thống sẽ tự động tạo mới với đầy đủ Họ tên, Ngày vào làm, Bộ phận.'],
    ['3. Tự động đồng bộ:', 'Nếu mã đã có, hệ thống cập nhật thông tin nếu có sự thay đổi mà không làm mất dữ liệu lịch sử.'],
    ['4. Kiểm soát lỗi:', 'Các dòng thiếu mã NV hoặc sai định dạng sẽ được chuyển vào Báo cáo lỗi chi tiết để Admin kiểm tra.']
  ];
  const guideWorksheet = XLSX.utils.aoa_to_sheet(guideRows);
  guideWorksheet['!cols'] = [{ wch: 30 }, { wch: 80 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Bang_Cham_Cong');
  XLSX.utils.book_append_sheet(workbook, guideWorksheet, 'Huong_Dan_Su_Dung');

  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  XLSX.writeFile(workbook, outPath);
  console.log(`Đã xuất file thành công: ${outPath} (${rows.length} dòng, ${headerRow.length} cột)`);
}

// Xuất ra các vị trí tiêu chuẩn trong dự án
const targets = [
  path.join(__dirname, '..', 'test-data', 'mẫu.xlsx'),
  path.join(__dirname, '..', 'public', 'templates', 'mẫu.xlsx'),
  path.join(__dirname, '..', 'public', 'templates', 'Mau_File_Import_Cham_Cong_Thang_11_2026.xlsx'),
];

const distDir = path.join(__dirname, '..', 'dist', 'templates');
if (fs.existsSync(distDir)) {
  targets.push(path.join(distDir, 'mẫu.xlsx'));
}

targets.forEach(t => generateSampleAttendanceFile(t));

