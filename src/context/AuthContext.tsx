import React, { createContext, useContext, useState, useEffect } from 'react';
import { AdminUser } from '../types';
import { mockAdmin } from '../data/mockData';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

interface AuthContextType {
  currentUser: AdminUser | null;
  isAuthenticated: boolean;
  isUsingSupabase: boolean;
  login: (usernameOrEmail: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(() => {
    const saved = localStorage.getItem('hr_admin_user');
    return saved ? JSON.parse(saved) : (isSupabaseConfigured ? null : mockAdmin);
  });
  const [loading, setLoading] = useState(true);

  // Khởi tạo phiên đăng nhập từ Supabase nếu đã cấu hình
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          // Lấy hồ sơ admin từ bảng admin_profiles
          const { data: profile, error } = await supabase
            .from('admin_profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

          if (profile && !error) {
            const adminUser: AdminUser = {
              id: profile.id,
              username: profile.username,
              fullName: profile.full_name,
              role: profile.role,
              email: profile.email,
              avatarUrl: profile.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
            };
            setCurrentUser(adminUser);
            localStorage.setItem('hr_admin_user', JSON.stringify(adminUser));
          } else {
            // Người dùng đăng nhập không thuộc danh sách Admin
            await supabase.auth.signOut();
            setCurrentUser(null);
            localStorage.removeItem('hr_admin_user');
          }
        }
      } catch (err) {
        console.error('Lỗi khi kiểm tra phiên Supabase Auth:', err);
      } finally {
        setLoading(false);
      }
    };

    checkSession();

    // Lắng nghe thay đổi trạng thái đăng nhập
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session) {
        setCurrentUser(null);
        localStorage.removeItem('hr_admin_user');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const login = async (usernameOrEmail: string, password: string): Promise<{ success: boolean; message?: string }> => {
    // 1. Nếu đã kết nối Supabase, đăng nhập qua Supabase Auth
    if (isSupabaseConfigured) {
      try {
        let email = usernameOrEmail.trim();

        // Nếu người dùng nhập username thay vì email, tra cứu email trong bảng admin_profiles
        if (!email.includes('@')) {
          const cleanUser = email.toLowerCase();
          const { data: profile } = await supabase
            .from('admin_profiles')
            .select('email')
            .or(`username.ilike.${cleanUser},username.ilike.${cleanUser}_vina,email.ilike.${cleanUser}@%`)
            .limit(1)
            .maybeSingle();

          if (profile?.email) {
            email = profile.email;
          } else {
            return { success: false, message: 'Tên đăng nhập quản trị không tồn tại trong hệ thống.' };
          }
        }

        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          return { success: false, message: `Đăng nhập thất bại: ${error.message}` };
        }

        if (data.user) {
          // Kiểm tra quyền Admin trong bảng admin_profiles
          const { data: profile, error: profileErr } = await supabase
            .from('admin_profiles')
            .select('*')
            .eq('id', data.user.id)
            .single();

          if (profileErr || !profile) {
            await supabase.auth.signOut();
            return {
              success: false,
              message: 'Tài khoản này không có quyền Quản trị viên (Admin) để truy cập hệ thống.',
            };
          }

          const adminUser: AdminUser = {
            id: profile.id,
            username: profile.username,
            fullName: profile.full_name,
            role: profile.role,
            email: profile.email,
            avatarUrl: profile.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
          };

          setCurrentUser(adminUser);
          localStorage.setItem('hr_admin_user', JSON.stringify(adminUser));
          return { success: true };
        }

        return { success: false, message: 'Không thể xác thực thông tin tài khoản.' };
      } catch (err: any) {
        return { success: false, message: err.message || 'Lỗi hệ thống khi đăng nhập Supabase' };
      }
    }

    // 2. Chế độ dự phòng Demo Auth (khi chưa cấu hình Supabase)
    if (usernameOrEmail.trim() === 'admin' && (password === 'admin123' || password === '123456')) {
      setCurrentUser(mockAdmin);
      localStorage.setItem('hr_admin_user', JSON.stringify(mockAdmin));
      return { success: true };
    }

    return { success: false, message: 'Tên đăng nhập hoặc mật khẩu không chính xác! (Mặc định: admin / admin123)' };
  };

  const logout = async () => {
    if (isSupabaseConfigured) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.error('Lỗi khi đăng xuất Supabase:', err);
      }
    }
    setCurrentUser(null);
    localStorage.removeItem('hr_admin_user');
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAuthenticated: !!currentUser,
        isUsingSupabase: isSupabaseConfigured,
        login,
        logout,
      }}
    >
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
