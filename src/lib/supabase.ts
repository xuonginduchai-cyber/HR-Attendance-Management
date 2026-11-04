import { createClient } from '@supabase/supabase-js';

const rawUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
// Tự động chuẩn hóa URL nếu người dùng dán kèm đuôi /rest/v1/
const supabaseUrl = rawUrl ? rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '') : undefined;
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl.startsWith('https://') &&
  !supabaseUrl.includes('your-project-id') &&
  supabaseAnonKey.length > 20 &&
  !supabaseAnonKey.includes('your-anon-key')
);

// Khởi tạo Supabase client an toàn
// Nếu chưa có biến môi trường, dùng fallback client để không gây crash ứng dụng
export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl! : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? supabaseAnonKey! : 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

/**
 * Kiểm tra kết nối Supabase và trạng thái phản hồi từ Database
 */
export const checkSupabaseConnection = async (): Promise<{
  connected: boolean;
  message: string;
  tablesFound?: boolean;
}> => {
  if (!isSupabaseConfigured) {
    return {
      connected: false,
      message: 'Chưa cấu hình VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY trong file .env',
      tablesFound: false,
    };
  }

  try {
    const { data, error } = await supabase.from('departments').select('count', { count: 'exact', head: true });
    if (error) {
      return {
        connected: false,
        message: `Lỗi kết nối Supabase: ${error.message}`,
        tablesFound: false,
      };
    }
    return {
      connected: true,
      message: 'Kết nối Supabase PostgreSQL thành công qua RLS!',
      tablesFound: true,
    };
  } catch (err: any) {
    return {
      connected: false,
      message: `Không thể kết nối đến Supabase: ${err.message || err}`,
      tablesFound: false,
    };
  }
};

