import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { AttendanceRecord } from '../types';

export interface AttendanceMetaInfo {
  leaveCode?: string;
  overtimeHours?: number;
  overtimeDetails?: Record<string, number | string>;
}

/**
 * Đóng gói metadata (leaveCode, overtimeHours, overtimeDetails) vào trường note
 * để lưu an toàn vào PostgreSQL Supabase mà không làm vỡ các trường dữ liệu
 */
export function encodeAttendanceNote(
  userNote?: string | null,
  meta?: AttendanceMetaInfo
): string | null {
  const cleanNote = (userNote || '').replace(/\s*__META__\{.*\}$/s, '').trim();
  const hasMeta =
    meta &&
    (meta.leaveCode ||
      meta.overtimeHours !== undefined ||
      (meta.overtimeDetails && Object.keys(meta.overtimeDetails).length > 0));

  if (!hasMeta) return cleanNote || null;

  const payload: Record<string, any> = {};
  if (meta.leaveCode) payload.leaveCode = meta.leaveCode;
  if (meta.overtimeHours !== undefined) payload.otHours = meta.overtimeHours;
  if (meta.overtimeDetails) payload.otDetails = meta.overtimeDetails;

  const metaString = `__META__${JSON.stringify(payload)}`;
  return cleanNote ? `${cleanNote} ${metaString}` : metaString;
}

/**
 * Giải mã trường note từ Supabase để lấy lại metadata chi tiết các loại tăng ca và phép nghỉ
 */
export function decodeAttendanceNote(rawNote?: string | null): {
  note: string;
  leaveCode?: string;
  overtimeHours?: number;
  overtimeDetails?: Record<string, number | string>;
} {
  if (!rawNote) return { note: '' };
  const metaMatch = rawNote.match(/__META__(\{.*\})$/s);
  if (metaMatch) {
    try {
      const meta = JSON.parse(metaMatch[1]);
      const cleanNote = rawNote.replace(metaMatch[0], '').trim();
      return {
        note: cleanNote,
        leaveCode: meta.leaveCode,
        overtimeHours: typeof meta.otHours === 'number' ? meta.otHours : undefined,
        overtimeDetails: meta.otDetails,
      };
    } catch {
      // bỏ qua lỗi nếu chuỗi json không hợp lệ
    }
  }
  return { note: rawNote };
}

function mapRowToAttendanceRecord(row: any): AttendanceRecord {
  const decoded = decodeAttendanceNote(row.note);
  const otHours =
    decoded.overtimeHours !== undefined
      ? decoded.overtimeHours
      : (row.overtime_hours !== undefined && row.overtime_hours !== null
          ? Number(row.overtime_hours)
          : (Number(row.work_hours) > 8 ? Number(row.work_hours) - 8 : 0));

  return {
    id: row.id,
    employeeId: row.employee_id,
    date: row.date,
    checkIn: row.check_in,
    checkOut: row.check_out,
    status: row.status,
    workHours: Number(row.work_hours) || 0,
    overtimeHours: otHours,
    lateMinutes: Number(row.late_minutes) || 0,
    earlyMinutes: Number(row.early_minutes) || 0,
    note: decoded.note || '',
    leaveCode: decoded.leaveCode || row.leave_code || undefined,
    overtimeDetails: decoded.overtimeDetails || row.overtime_details || undefined,
  };
}

export const attendanceService = {
  /**
   * Lấy danh sách chấm công hàng ngày từ Supabase (Hỗ trợ phân trang range để tải đủ > 20.000 bản ghi)
   */
  async getDailyAttendance(date?: string): Promise<AttendanceRecord[]> {
    if (!isSupabaseConfigured) return [];

    if (date) {
      const { data, error } = await supabase
        .from('attendance_daily')
        .select('*')
        .eq('date', date)
        .order('date', { ascending: false });
      if (error) {
        console.error('Lỗi khi tải chấm công từ Supabase:', error);
        throw error;
      }
      return (data || []).map(mapRowToAttendanceRecord);
    }

    // Tải theo từng lô 1000 bản ghi để vượt qua giới hạn PostgREST max_rows = 1000
    const allRows: any[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('attendance_daily')
        .select('*')
        .range(from, from + pageSize - 1)
        .order('date', { ascending: false });

      if (error) {
        console.error('Lỗi khi tải chấm công từ Supabase:', error);
        throw error;
      }
      if (!data || data.length === 0) break;
      allRows.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
      if (allRows.length >= 35000) break; // Giới hạn an toàn
    }

    return allRows.map(mapRowToAttendanceRecord);
  },

  /**
   * Lấy danh sách chấm công theo tháng và năm từ Supabase (phân trang đầy đủ)
   */
  async getAttendanceByMonth(month: number, year: number): Promise<AttendanceRecord[]> {
    if (!isSupabaseConfigured) return [];

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const allRows: any[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('attendance_daily')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate)
        .range(from, from + pageSize - 1)
        .order('date', { ascending: true });

      if (error) {
        console.error('Lỗi khi tải chấm công theo tháng từ Supabase:', error);
        throw error;
      }
      if (!data || data.length === 0) break;
      allRows.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
      if (allRows.length >= 35000) break;
    }

    return allRows.map(mapRowToAttendanceRecord);
  },

  /**
   * Lấy danh sách chấm công chi tiết của 1 nhân viên trong 1 tháng cụ thể (rất nhanh, không bị limit)
   */
  async getAttendanceByEmployeeMonth(
    employeeId: string,
    month: number,
    year: number
  ): Promise<AttendanceRecord[]> {
    if (!isSupabaseConfigured) return [];
    const cleanId = employeeId.trim().toUpperCase();
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const { data, error } = await supabase
      .from('attendance_daily')
      .select('*')
      .eq('employee_id', cleanId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true });

    if (error) {
      console.warn('Lỗi tải chi tiết chấm công nhân viên:', error);
      return [];
    }
    return (data || []).map(mapRowToAttendanceRecord);
  },

  /**
   * Thêm bản ghi điểm danh
   */
  async addAttendanceRecord(record: Omit<AttendanceRecord, 'id'>): Promise<AttendanceRecord> {
    if (!isSupabaseConfigured) {
      return { ...record, id: `ATT-${Date.now()}` };
    }

    const encodedNote = encodeAttendanceNote(record.note, {
      leaveCode: record.leaveCode,
      overtimeHours: record.overtimeHours,
      overtimeDetails: record.overtimeDetails,
    });

    const { data, error } = await supabase
      .from('attendance_daily')
      .insert({
        employee_id: record.employeeId,
        date: record.date,
        check_in: record.checkIn,
        check_out: record.checkOut,
        status: record.status,
        work_hours: record.workHours,
        late_minutes: record.lateMinutes,
        early_minutes: record.earlyMinutes,
        note: encodedNote,
      })
      .select()
      .single();

    if (error) {
      console.error('Lỗi thêm bản ghi chấm công vào Supabase:', error);
      throw error;
    }

    return mapRowToAttendanceRecord(data);
  },

  /**
   * Cập nhật điều chỉnh giờ điểm danh
   */
  async updateAttendanceRecord(id: string, updates: Partial<AttendanceRecord>): Promise<void> {
    if (!isSupabaseConfigured) return;

    const payload: any = {
      updated_at: new Date().toISOString(),
    };
    if (updates.checkIn !== undefined) payload.check_in = updates.checkIn;
    if (updates.checkOut !== undefined) payload.check_out = updates.checkOut;
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.workHours !== undefined) payload.work_hours = updates.workHours;
    if (updates.lateMinutes !== undefined) payload.late_minutes = updates.lateMinutes;
    if (
      updates.note !== undefined ||
      updates.leaveCode !== undefined ||
      updates.overtimeHours !== undefined ||
      updates.overtimeDetails !== undefined
    ) {
      payload.note = encodeAttendanceNote(updates.note, {
        leaveCode: updates.leaveCode,
        overtimeHours: updates.overtimeHours,
        overtimeDetails: updates.overtimeDetails,
      });
    }

    const { error } = await supabase
      .from('attendance_daily')
      .update(payload)
      .eq('id', id);

    if (error) {
      console.error('Lỗi cập nhật chấm công trong Supabase:', error);
      throw error;
    }
  },

  /**
   * Xóa danh sách bản ghi chấm công theo ID
   */
  async deleteAttendanceRecordsByIds(ids: string[]): Promise<void> {
    if (!isSupabaseConfigured || ids.length === 0) return;

    const { error } = await supabase
      .from('attendance_daily')
      .delete()
      .in('id', ids);

    if (error) {
      console.error('Lỗi khi xóa bản ghi chấm công từ Supabase:', error);
      throw error;
    }
  },

  /**
   * Xóa dữ liệu chấm công của danh sách nhân viên trong một kỳ (Tháng, Năm)
   * Đồng thời xóa bảng tổng hợp công/lương attendance_summaries để tra cứu đồng nhất
   */
  async deleteAttendanceByEmployeeMonth(employeeIds: string[], month: number, year: number): Promise<void> {
    if (!isSupabaseConfigured || employeeIds.length === 0) return;

    const numMonth = Number(month);
    const numYear = Number(year);
    const cleanIds = employeeIds.map((id) => id.trim().toUpperCase());
    const startDate = `${numYear}-${String(numMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(numYear, numMonth, 0).getDate();
    const endDate = `${numYear}-${String(numMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // 1. Xóa chi tiết điểm danh theo ngày
    const { error: dailyErr } = await supabase
      .from('attendance_daily')
      .delete()
      .in('employee_id', cleanIds)
      .gte('date', startDate)
      .lte('date', endDate);

    if (dailyErr) {
      console.error('Lỗi khi xóa chấm công nhân viên theo kỳ từ Supabase:', dailyErr);
      throw dailyErr;
    }

    // 2. Xóa dữ liệu tổng hợp / bảng lương kỳ này của các nhân viên đó
    try {
      await supabase
        .from('attendance_summaries')
        .delete()
        .in('employee_id', cleanIds)
        .eq('month', numMonth)
        .eq('year', numYear);
    } catch (sumErr) {
      console.warn('Lỗi khi xóa attendance_summaries:', sumErr);
    }
  },

  /**
   * Xóa toàn bộ dữ liệu chấm công của cả kỳ (Tháng, Năm)
   * Đồng thời xóa attendance_summaries và attendance_months để dọn dẹp sạch sẽ
   */
  async deleteAttendanceByPeriod(month: number, year: number): Promise<void> {
    if (!isSupabaseConfigured) return;

    const numMonth = Number(month);
    const numYear = Number(year);
    const startDate = `${numYear}-${String(numMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(numYear, numMonth, 0).getDate();
    const endDate = `${numYear}-${String(numMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // 1. Xóa toàn bộ bản ghi theo ngày trong tháng
    const { error: dailyErr } = await supabase
      .from('attendance_daily')
      .delete()
      .gte('date', startDate)
      .lte('date', endDate);

    if (dailyErr) {
      console.error('Lỗi khi xóa dữ liệu kỳ chấm công từ Supabase:', dailyErr);
      throw dailyErr;
    }

    // 2. Xóa toàn bộ tổng hợp công & bảng lương của kỳ này
    try {
      await supabase
        .from('attendance_summaries')
        .delete()
        .eq('month', numMonth)
        .eq('year', numYear);
    } catch (sumErr) {
      console.warn('Lỗi khi xóa attendance_summaries:', sumErr);
    }

    // 3. Xóa kỳ chấm công trong attendance_months
    try {
      await supabase
        .from('attendance_months')
        .delete()
        .eq('month', numMonth)
        .eq('year', numYear);
    } catch (monthErr) {
      console.warn('Lỗi khi xóa attendance_months:', monthErr);
    }
  },

  /**
   * Xóa toàn bộ dữ liệu chấm công của cả Năm
   */
  async deleteAttendanceByYear(year: number): Promise<void> {
    if (!isSupabaseConfigured) return;

    const numYear = Number(year);
    const startDate = `${numYear}-01-01`;
    const endDate = `${numYear}-12-31`;

    // 1. Xóa toàn bộ attendance_daily của năm
    const { error: dailyErr } = await supabase
      .from('attendance_daily')
      .delete()
      .gte('date', startDate)
      .lte('date', endDate);

    if (dailyErr) {
      console.error('Lỗi khi xóa dữ liệu chấm công cả năm từ Supabase:', dailyErr);
      throw dailyErr;
    }

    // 2. Xóa toàn bộ attendance_summaries của năm
    try {
      await supabase
        .from('attendance_summaries')
        .delete()
        .eq('year', numYear);
    } catch (sumErr) {
      console.warn('Lỗi khi xóa attendance_summaries cả năm:', sumErr);
    }

    // 3. Xóa các kỳ công của năm trong attendance_months
    try {
      await supabase
        .from('attendance_months')
        .delete()
        .eq('year', numYear);
    } catch (monthErr) {
      console.warn('Lỗi khi xóa attendance_months cả năm:', monthErr);
    }
  },
};

