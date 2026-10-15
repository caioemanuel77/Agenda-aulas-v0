-- Estrutura do banco do Mural de aulas.
-- Rode UMA vez no SQL Editor do Supabase (SQL Editor > New query).
-- Rodar de novo gera erro nas políticas, que já existem.

-- Cadeiras (disciplinas) da turma.
create table if not exists cadeiras (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  professor text,
  created_at timestamptz default now()
);

-- Conteúdo visto em cada aula. Apagar uma cadeira apaga suas aulas (on delete cascade).
-- O autor é obrigatório e não pode ser vazio.
create table if not exists aulas (
  id uuid primary key default gen_random_uuid(),
  cadeira_id uuid references cadeiras(id) on delete cascade,
  data date not null,
  conteudo text not null,
  autor text not null check (length(trim(autor)) > 0),
  created_at timestamptz default now()
);

-- Row Level Security (RLS) ativado nas duas tabelas.
-- As políticas abaixo permitem acesso sem login: modelo pensado para uma turma
-- pequena e para dados não sensíveis. A chave "anon" é pública por design (fica no
-- código do site), então a proteção real está nestas políticas, não no sigilo da chave.
-- Para restringir o acesso, substitua por políticas baseadas em autenticação (Supabase Auth).
alter table cadeiras enable row level security;
alter table aulas enable row level security;

create policy "leitura publica cadeiras" on cadeiras
  for select using (true);
create policy "insercao publica cadeiras" on cadeiras
  for insert with check (true);

create policy "leitura publica aulas" on aulas
  for select using (true);
create policy "insercao publica aulas" on aulas
  for insert with check (true);
create policy "exclusao publica aulas" on aulas
  for delete using (true);

-- Habilita o Realtime (alterações aparecem para todos sem recarregar a página).
alter publication supabase_realtime add table cadeiras;
alter publication supabase_realtime add table aulas;