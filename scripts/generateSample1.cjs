const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

function generateMau1File(outPath) {
  const month = 10;
  const year = 2026;
  const daysInMonth = 31;

  // Hàng 1: Tiêu đề cột & số thứ tự ngày 1..31 & cột TỔNG
  const row1 = [
    'STT',
    'Mã NV',
    'Họ và tên',
    'Ngày vào làm việc',
    'Bộ phận',
    'Nội dung chỉ tiêu',
  ];
  for (let d = 1; d <= 31; d++) {
    row1.push(String(d));
  }
  row1.push('TỔNG');

  // Hàng 2: Thứ tương ứng với từng ngày (Tháng 10/2026: ngày 1 là Thứ 5 / Thu)
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const row2 = ['', '', '', '', '', 'Thứ'];
  for (let d = 1; d <= 31; d++) {
    const dayOfWeek = new Date(year, month - 1, d).getDay();
    row2.push(dayNames[dayOfWeek]);
  }
  row2.push('');

  const rows = [row1, row2];

  // Nhân viên mẫu S0076 (Bùi Quang Tùng - Utility Part - 24/12/2018)
  const s0076Indicators = [
    { name: 'Bắt đầu / Start', type: 'time' },
    { name: 'Kết thúc / Stop', type: 'time' },
    { name: 'Thời gian làm việc', type: 'hours' },
    { name: 'Nghỉ làm', type: 'leave' },
    { name: 'TC ngày thường (150%)', type: 'hours' },
    { name: 'TC đêm ngày thường (210%)', type: 'hours' },
    { name: 'Phụ cấp ca đêm (30%)', type: 'hours' },
    { name: 'TC ngày Chủ nhật (200%)', type: 'hours' },
    { name: 'TC đêm Chủ nhật (270%)', type: 'hours' },
  ];

  s0076Indicators.forEach((ind, indIdx) => {
    const row = [
      indIdx === 0 ? 1 : '',
      'S0076',
      'Bùi Quang Tùng',
      '24/12/2018',
      'Utility Part',
      ind.name,
    ];

    let rowSum = 0;
    let leaveCount = 0;

    for (let d = 1; d <= 31; d++) {
      const dayOfWeek = new Date(year, month - 1, d).getDay();
      const isSunday = dayOfWeek === 0;
      const isSaturday = dayOfWeek === 6;

      if (ind.name === 'Bắt đầu / Start') {
        if (d === 5) row.push('-'); // Nghỉ phép
        else if (d === 4) row.push('08:00'); // Chủ nhật làm
        else if (isSunday) row.push('-');
        else if (d === 26) row.push('08:30'); // Giờ vào lẻ kiểm tra 8:30
        else row.push('08:00');
      } else if (ind.name === 'Kết thúc / Stop') {
        if (d === 5) row.push('-');
        else if (d === 4) row.push('17:00'); // Chủ nhật về 17:00
        else if (isSunday) row.push('-');
        else if (d === 1 || d === 2 || d === 3 || d === 6 || d === 30 || d === 31) row.push('20:00');
        else if (d === 7 || d === 8 || d === 9) row.push('19:30');
        else row.push('17:30');
      } else if (ind.name === 'Thời gian làm việc') {
        if (d === 5 || isSunday) {
          row.push('-');
        } else {
          row.push(8);
          rowSum += 8;
        }
      } else if (ind.name === 'Nghỉ làm') {
        if (d === 5) {
          row.push('P');
          leaveCount += 1;
        } else {
          row.push('-');
        }
      } else if (ind.name === 'TC ngày thường (150%)') {
        // Giá trị mẫu đúng như Prompt mục 4C: 3 + 3 + 3 + 3 + 2 + 2 + 2 = 18 giờ
        if (d === 1 || d === 2 || d === 3 || d === 6) {
          row.push(3);
          rowSum += 3;
        } else if (d === 7 || d === 8 || d === 9) {
          row.push(2);
          rowSum += 2;
        } else {
          row.push('-');
        }
      } else if (ind.name === 'TC đêm ngày thường (210%)') {
        // Giá trị kiểm tra số thập phân: ngày 25 có 4.5 giờ
        if (d === 25) {
          row.push(4.5);
          rowSum += 4.5;
        } else {
          row.push('-');
        }
      } else if (ind.name === 'Phụ cấp ca đêm (30%)') {
        // Giá trị mẫu đúng như Prompt mục 4C: 12 ngày mỗi ngày 6 giờ = 72 giờ
        if (d >= 11 && d <= 22) {
          row.push(6);
          rowSum += 6;
        } else {
          row.push('-');
        }
      } else if (ind.name === 'TC ngày Chủ nhật (200%)') {
        // Ngày Chủ nhật 04/10 làm thêm 8 tiếng 200%
        if (d === 4) {
          row.push(8);
          rowSum += 8;
        } else {
          row.push('-');
        }
      } else if (ind.name === 'TC đêm Chủ nhật (270%)') {
        row.push('-');
      }
    }

    // Cột TỔNG
    if (ind.type === 'time') {
      row.push('-');
    } else if (ind.type === 'leave') {
      row.push(leaveCount);
    } else {
      row.push(rowSum);
    }

    rows.push(row);
  });

  // Thêm nhân viên mẫu NV001
  const nv001Indicators = [
    'Bắt đầu / Start',
    'Kết thúc / Stop',
    'Thời gian làm việc',
    'Nghỉ làm',
    'TC ngày thường (150%)',
    'TC đêm ngày thường (210%)',
    'Phụ cấp ca đêm (30%)',
    'TC ngày Chủ nhật (200%)',
    'TC đêm Chủ nhật (270%)',
  ];

  nv001Indicators.forEach((indName, indIdx) => {
    const row = [
      indIdx === 0 ? 2 : '',
      'NV001',
      'Trần Văn An',
      '2022-03-15',
      'Phòng Kỹ thuật',
      indName,
    ];

    let rSum = 0;
    let lCount = 0;

    for (let d = 1; d <= 31; d++) {
      const dayOfWeek = new Date(year, month - 1, d).getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      if (indName === 'Bắt đầu / Start') {
        if (d === 4) row.push('-');
        else if (isWeekend) row.push('-');
        else row.push('08:00');
      } else if (indName === 'Kết thúc / Stop') {
        if (d === 4) row.push('-');
        else if (isWeekend) row.push('-');
        else if (d === 6) row.push('20:00');
        else if (d === 14) row.push('19:30');
        else if (d === 21) row.push('20:30');
        else row.push('17:30');
      } else if (indName === 'Thời gian làm việc') {
        if (d === 4 || isWeekend) {
          row.push('-');
        } else if (d === 6) {
          row.push(10);
          rSum += 10;
        } else if (d === 14) {
          row.push(9.5);
          rSum += 9.5;
        } else if (d === 21) {
          row.push(10.5);
          rSum += 10.5;
        } else {
          row.push(8);
          rSum += 8;
        }
      } else if (indName === 'Nghỉ làm') {
        if (d === 4) {
          row.push('P');
          lCount += 1;
        } else {
          row.push('-');
        }
      } else if (indName === 'TC ngày thường (150%)') {
        if (d === 6) { row.push(2); rSum += 2; }
        else if (d === 14) { row.push(1.5); rSum += 1.5; }
        else if (d === 21) { row.push(2.5); rSum += 2.5; }
        else { row.push('-'); }
      } else {
        row.push('-');
      }
    }

    if (indName.includes('Bắt đầu') || indName.includes('Kết thúc')) row.push('-');
    else if (indName.includes('Nghỉ làm')) row.push(lCount);
    else row.push(rSum);

    rows.push(row);
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
  for (let i = 6; i <= 36; i++) {
    worksheet['!cols'].push({ wch: 6.5 });
  }
  worksheet['!cols'].push({ wch: 10 }); // Cột TỔNG

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Bang_Cham_Cong');

  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  XLSX.writeFile(workbook, outPath);
  console.log(`Đã tạo file: ${outPath} (${rows.length} dòng, ${row1.length} cột)`);
}

const targets = [
  path.join(__dirname, '..', 'test-data', 'mẫu(1).xlsx'),
  path.join(__dirname, '..', 'public', 'templates', 'mẫu(1).xlsx'),
  path.join(__dirname, '..', 'test-data', 'mẫu.xlsx'),
  path.join(__dirname, '..', 'public', 'templates', 'mẫu.xlsx'),
];

targets.forEach(t => generateMau1File(t));

