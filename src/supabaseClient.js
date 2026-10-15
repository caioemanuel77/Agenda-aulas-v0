/**
 * Cliente do Supabase, configurado por variáveis de ambiente (veja .env.example).
 *
 * Usa somente a chave "anon", que é pública por design: ela vai embutida no
 * código que o navegador baixa. Por isso, a proteção dos dados vem das políticas
 * de acesso (RLS) definidas em schema.sql, e não do sigilo dessa chave.
 *
 * NUNCA use a chave "service_role" aqui nem em qualquer arquivo do front-end.
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Faltam VITE_SUPABASE_URL e/ou VITE_SUPABASE_ANON_KEY. Configure o arquivo .env (veja .env.example)."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);