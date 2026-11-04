import { supabase, isSupabaseConfigured } from '../lib/supabase';

export const auditService = {
  /**
   * Ghi log thao tác hệ thống vào bảng audit_logs
   */
  async logAction(action: string, entityName: string, entityId?: string, details?: any): Promise<void> {
    if (!isSupabaseConfigured) return;

    try {
      const { data: userSession } = await supabase.auth.getSession();
      const userId = userSession.session?.user?.id;

      await supabase.from('audit_logs').insert({
        user_id: userId || null,
        action,
        entity_name: entityName,
        entity_id: entityId || null,
        details: details || null,
      });
    } catch (err) {
      console.warn('Không thể ghi audit log:', err);
    }
  },
};

