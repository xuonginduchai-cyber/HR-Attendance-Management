// Supabase Edge Function: lookup-employee
// Dùng cho tra cứu nhân viên công khai với bảo mật cao và CORS
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { employeeCode, month, year } = await req.json();

    if (!employeeCode || !month || !year) {
      return new Response(
        JSON.stringify({ success: false, message: 'Thiếu tham số tra cứu bắt buộc' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Khởi tạo Supabase client với service role key bên trong Edge Function (bảo mật tuyệt đối, không lộ ra client)
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Gọi hàm RPC đã tạo
    const { data, error } = await supabase.rpc('lookup_employee_attendance', {
      p_employee_code: employeeCode.trim().toUpperCase(),
      p_month: Number(month),
      p_year: Number(year),
    });

    if (error) {
      return new Response(
        JSON.stringify({ success: false, message: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify(data),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, message: err.message || 'Lỗi xử lý Edge Function' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

