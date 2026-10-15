# Mural de aulas

Site colaborativo para a turma registrar o conteúdo visto em cada aula e saber em que ponto cada cadeira parou. Útil para quem faltou.

## Funcionalidades

- **Cadastrar cadeira:** nome e professor (opcional). Limite de 12 cadeiras.
- **Cadastrar conteúdo de aula:** cadeira, data, o que foi visto e o nome de quem registrou (obrigatório).
- **Consultar cadeira:** linha do tempo com a aula mais recente em destaque.
- **Apagar conteúdo:** remove uma aula cadastrada, com confirmação.
- **Tempo real:** o que um colega cadastra ou apaga aparece para os outros sem recarregar a página.

## Tecnologias

- **Front-end:** React 18 + Vite
- **Banco de dados e tempo real:** Supabase (Postgres + Realtime)
- **Hospedagem:** Vercel

## Estrutura do projeto

```
.
├── index.html             # página raiz (carrega as fontes e o main.jsx)
├── schema.sql             # tabelas e políticas de acesso do Supabase
├── vite.config.js         # configuração do Vite
├── package.json
├── .env.example           # modelo das variáveis de ambiente
└── src/
    ├── main.jsx           # ponto de entrada do React
    ├── App.jsx            # telas e lógica do mural
    └── supabaseClient.js  # cliente do Supabase
```

## Modelo de dados

| Tabela     | Colunas                                                                                      |
| ---------- | -------------------------------------------------------------------------------------------- |
| `cadeiras` | `id`, `nome`, `professor` (opcional), `created_at`                                           |
| `aulas`    | `id`, `cadeira_id` (referencia `cadeiras`; apagar a cadeira apaga as aulas), `data`, `conteudo`, `autor` (obrigatório), `created_at` |

As tabelas, as restrições e as políticas de acesso estão em `schema.sql`.

## Como rodar

### Pré-requisitos

- Node.js 18 ou mais recente
- Uma conta gratuita no [Supabase](https://supabase.com)

A versão do `@supabase/supabase-js` está fixada em `2.45.4` por compatibilidade com Node abaixo da versão 22.

### 1. Criar o banco no Supabase

1. Crie um projeto no Supabase.
2. Abra **SQL Editor > New query**, cole o conteúdo de `schema.sql` e rode **uma única vez**.
3. Em **Project Settings > API**, anote a **Project URL** e a chave **anon public**.

### 2. Configurar as variáveis de ambiente

Copie o modelo e preencha com os seus valores:

```bash
# Linux / macOS / PowerShell
cp .env.example .env

# Prompt de Comando (Windows)
copy .env.example .env
```

| Variável                 | Descrição                                    |
| ------------------------ | -------------------------------------------- |
| `VITE_SUPABASE_URL`      | Project URL, somente o endereço base, sem `/rest/v1/` nem barra no final |
| `VITE_SUPABASE_ANON_KEY` | Chave `anon public` do projeto               |

O arquivo `.env` é ignorado pelo Git e não deve ser enviado ao repositório.

### 3. Iniciar

```bash
npm install
npm run dev
```

O site abre em `http://localhost:5173`. Depois de editar o `.env`, reinicie o servidor, porque o Vite só lê o arquivo ao iniciar.

## Publicar no Vercel

1. Envie o projeto para um repositório no GitHub.
2. No [Vercel](https://vercel.com), use **Add New > Project** e importe o repositório. O Vite é detectado automaticamente.
3. Se o `package.json` não estiver na raiz do repositório, defina o **Root Directory** com a pasta do projeto.
4. Em **Environment Variables**, cadastre `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
5. Clique em **Deploy**.

A cada `git push` na branch principal, o Vercel publica uma nova versão automaticamente.

## Regras de negócio

- Uma aula só pode ser cadastrada com o campo "seu nome" preenchido. O banco também recusa autor vazio.
- O limite de cadeiras é controlado pela constante `MAX_SUBJECTS` em `src/App.jsx`. Ele existe só no front-end, e o banco não impõe esse limite.
- Apagar uma aula pede confirmação.

## Segurança

- **Não versione segredos.** O `.env` e variantes como `.env.local` estão no `.gitignore`. Só o `.env.example`, com valores de exemplo, vai para o repositório.
- **A chave `anon` é pública por design.** Ela é embutida no código que o navegador baixa, então não deve ser tratada como segredo. O que protege os dados são as políticas de acesso (RLS) do `schema.sql`.
- **Nunca use a chave `service_role`** neste projeto. Ela ignora as políticas de acesso e não pode aparecer no front-end nem no repositório.
- **Modelo de acesso atual:** sem login. Qualquer pessoa que abra o site pode ler, cadastrar e apagar aulas, e o nome do autor é texto livre, sem verificação. Isso serve para uma turma pequena com dados não sensíveis. Não registre informações pessoais ou confidenciais no mural.
- **Para um público maior,** use o Supabase Auth, restrinja as políticas (por exemplo, só o autor pode apagar o próprio conteúdo) e considere limitar a frequência de cadastros.
- **Se uma chave ou URL foi commitada por engano,** remova-a do histórico do Git, e não só do arquivo atual, e revise as políticas de acesso do projeto.

## Problemas comuns

| Sintoma                                                              | Causa provável e solução                                                                  |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `PGRST205` (tabela não encontrada)                                   | O `schema.sql` não foi rodado, ou foi rodado em outro projeto. Rode no projeto correto.   |
| `PGRST125` (caminho inválido)                                        | `VITE_SUPABASE_URL` com caminho a mais. Use só `https://<projeto>.supabase.co`.           |
| Botão "apagar" mostra erro                                           | Falta a política de exclusão de `aulas` no banco. Veja o `schema.sql`.                    |
| Aviso `EBADENGINE` no `npm install`                                  | Versão do Node abaixo da exigida por uma dependência. Atualize o Node ou use as versões fixadas. |
| Build no Vercel falha em `/src/main.jsx`                             | Root Directory incorreto. Aponte para a pasta que contém o `index.html`.                  |
| Site no ar mas sem dados                                             | Variáveis de ambiente não cadastradas no Vercel. Cadastre e faça um novo deploy.          |