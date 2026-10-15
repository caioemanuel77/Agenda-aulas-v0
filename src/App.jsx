/**
 * Mural de aulas — componente principal.
 *
 * Telas (estado `view`):
 *   - "consultar":     linha do tempo das aulas da cadeira selecionada
 *   - "nova-cadeira":  formulário de cadastro de cadeira
 *   - "novo-conteudo": formulário de cadastro de conteúdo de aula
 *
 * Dados: tabelas `cadeiras` e `aulas` no Supabase (veja schema.sql), com
 * atualização em tempo real via Supabase Realtime.
 */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabaseClient";

// Paleta das abas. As cores se repetem em ciclo conforme a posição da cadeira.
const TAB_COLORS = [
  { bg: "#E8604C", dark: "#7A2A1D", light: "#FBDCD5" },
  { bg: "#2F9C95", dark: "#134B46", light: "#D3EEEA" },
  { bg: "#E3A72E", dark: "#6B4F0F", light: "#FAECC7" },
  { bg: "#7B5EA7", dark: "#39285A", light: "#E5DDF2" },
  { bg: "#3B6FA0", dark: "#1A3450", light: "#D9E5F0" },
];

// Limite de cadeiras. É aplicado apenas aqui no front-end; o banco não impõe esse limite.
const MAX_SUBJECTS = 12;

/** Converte "AAAA-MM-DD" em "DD/MM/AAAA" sem usar Date (evita deslocamento de fuso horário). */
function formatDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function App() {
  const [subjects, setSubjects] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState("consultar"); // consultar | nova-cadeira | novo-conteudo
  // Nome de quem está registrando. Obrigatório para cadastrar aula; não fica salvo entre visitas.
  const [author, setAuthor] = useState("");

  const [subjectForm, setSubjectForm] = useState({ name: "", professor: "" });
  const [entryForm, setEntryForm] = useState({
    subjectId: "",
    date: new Date().toISOString().slice(0, 10),
    content: "",
  });
  const [formError, setFormError] = useState("");

  /** Busca cadeiras e aulas e converte as colunas do banco (pt) para o formato usado na interface. */
  const load = useCallback(async () => {
    setError("");
    const [{ data: cadeiras, error: errC }, { data: aulas, error: errA }] =
      await Promise.all([
        supabase.from("cadeiras").select("*").order("created_at", { ascending: true }),
        supabase.from("aulas").select("*"),
      ]);

    if (errC || errA) {
      setError("Não deu pra carregar os dados. Confere se as chaves do Supabase estão certas.");
      setLoading(false);
      return;
    }

    const mappedSubjects = (cadeiras || []).map((c) => ({
      id: c.id,
      name: c.nome,
      professor: c.professor || "",
    }));
    const mappedEntries = (aulas || []).map((a) => ({
      id: a.id,
      subjectId: a.cadeira_id,
      date: a.data,
      content: a.conteudo,
      author: a.autor || "Anônimo",
    }));

    setSubjects(mappedSubjects);
    setEntries(mappedEntries);
    setSelectedId((current) => current || (mappedSubjects[0] && mappedSubjects[0].id) || null);
    setLoading(false);
  }, []);

  // Carrega os dados ao abrir e recarrega sempre que alguém altera cadeiras ou aulas (Realtime).
  useEffect(() => {
    load();

    const channel = supabase
      .channel("mural-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "cadeiras" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "aulas" }, load)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  /** Valida e cadastra uma cadeira (nome obrigatório, respeitando MAX_SUBJECTS). */
  async function handleAddSubject(e) {
    e.preventDefault();
    if (!subjectForm.name.trim()) {
      setFormError("Dá um nome pra cadeira antes de cadastrar.");
      return;
    }
    if (subjects.length >= MAX_SUBJECTS) {
      setFormError(`Já tem ${MAX_SUBJECTS} cadeiras cadastradas, que era o combinado pra essa turma.`);
      return;
    }
    setFormError("");
    setSaving(true);
    const { data, error: err } = await supabase
      .from("cadeiras")
      .insert({ nome: subjectForm.name.trim(), professor: subjectForm.professor.trim() || null })
      .select()
      .single();
    setSaving(false);
    if (err) {
      setError("Não deu pra cadastrar a cadeira. Tenta de novo.");
      return;
    }
    setSelectedId(data.id);
    setSubjectForm({ name: "", professor: "" });
    setView("consultar");
    load();
  }

  /** Valida e cadastra o conteúdo de uma aula (cadeira, nome do autor e conteúdo obrigatórios). */
  async function handleAddEntry(e) {
    e.preventDefault();
    if (!entryForm.subjectId) {
      setFormError("Escolhe a cadeira antes de cadastrar o conteúdo.");
      return;
    }
    if (!author.trim()) {
      setFormError('Preenche o campo "seu nome" (no topo da página) antes de cadastrar a aula.');
      return;
    }
    if (!entryForm.content.trim()) {
      setFormError("Escreve o que foi visto na aula.");
      return;
    }
    setFormError("");
    setSaving(true);
    const { error: err } = await supabase.from("aulas").insert({
      cadeira_id: entryForm.subjectId,
      data: entryForm.date,
      conteudo: entryForm.content.trim(),
      autor: author.trim(),
    });
    setSaving(false);
    if (err) {
      setError("Não deu pra cadastrar o conteúdo. Tenta de novo.");
      return;
    }
    setSelectedId(entryForm.subjectId);
    setEntryForm({ ...entryForm, content: "" });
    setView("consultar");
    load();
  }

  /**
   * Apaga uma aula após confirmação. O `.select()` devolve as linhas removidas:
   * se vier vazio, a exclusão foi bloqueada (por exemplo, por falta de política no banco).
   */
  async function handleDeleteEntry(entry) {
    const ok = window.confirm(
      `Apagar o conteúdo de ${formatDate(entry.date)}?\n\n"${entry.content}"`
    );
    if (!ok) return;

    setSaving(true);
    const { data, error: err } = await supabase
      .from("aulas")
      .delete()
      .eq("id", entry.id)
      .select();
    setSaving(false);

    if (err || !data || data.length === 0) {
      setError("Não deu pra apagar. Confere se a política de exclusão foi criada no Supabase.");
      return;
    }
    setEntries((prev) => prev.filter((x) => x.id !== entry.id));
  }

  // Aulas da cadeira selecionada, da mais recente para a mais antiga.
  const selectedSubject = subjects.find((s) => s.id === selectedId) || null;
  const selectedEntries = entries
    .filter((e) => e.subjectId === selectedId)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  // Cor da cadeira, definida pela posição dela na lista.
  const colorFor = (subjectId) => {
    const idx = subjects.findIndex((s) => s.id === subjectId);
    return TAB_COLORS[idx % TAB_COLORS.length];
  };

  return (
    <div
      style={{
        fontFamily: "'Inter', -apple-system, sans-serif",
        background: "#F5F6F0",
        minHeight: "100vh",
        padding: "0 0 3rem",
        color: "#1F2A24",
      }}
    >
      <style>{`
        * { box-sizing: border-box; }
        .agenda-btn {
          font-family: inherit;
          cursor: pointer;
          border: none;
          border-radius: 6px;
          padding: 10px 16px;
          font-size: 14px;
          font-weight: 600;
          transition: transform 0.08s ease, opacity 0.15s ease;
        }
        .agenda-btn:active { transform: scale(0.97); }
        .agenda-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .agenda-input {
          font-family: inherit;
          font-size: 14px;
          padding: 10px 12px;
          border-radius: 6px;
          border: 1.5px solid #D8D5C8;
          background: #FFFFFF;
          width: 100%;
          color: #1F2A24;
        }
        .agenda-input:focus { outline: none; border-color: #1F3A5F; }
        .tab-shape { clip-path: polygon(6% 0%, 94% 0%, 100% 100%, 0% 100%); }
      `}</style>

      <header style={{ padding: "2.5rem 2rem 1.5rem", maxWidth: 920, margin: "0 auto" }}>
        <div
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 12,
            letterSpacing: "0.08em",
            color: "#6B6A5E",
            textTransform: "uppercase",
            marginBottom: 6,
          }}
        >
          Onde a turma parou
        </div>
        <h1
          style={{
            fontFamily: "'Bricolage Grotesque', sans-serif",
            fontWeight: 800,
            fontSize: 34,
            margin: 0,
            color: "#1F3A5F",
          }}
        >
          Mural de aulas
        </h1>
        <p style={{ margin: "0.5rem 0 0", fontSize: 14, color: "#5C5A4E", maxWidth: 520 }}>
          Cadastre o conteúdo da última aula de cada cadeira pra quem faltou saber por onde continuar.
        </p>
      </header>

      <div style={{ maxWidth: 920, margin: "0 auto", padding: "0 2rem" }}>
        <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
          <label
            style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "#6B6A5E", whiteSpace: "nowrap" }}
          >
            seu nome:
          </label>
          <input
            className="agenda-input"
            style={{ maxWidth: 220 }}
            placeholder="ex.: Maria"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
          />
          {saving && <span style={{ fontSize: 12, color: "#8A8876" }}>salvando…</span>}
        </div>

        {error && (
          <div
            style={{
              background: "#FBDCD5",
              color: "#7A2A1D",
              padding: "10px 14px",
              borderRadius: 6,
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end", marginBottom: -1 }}>
          {subjects.map((s) => {
            const c = colorFor(s.id);
            const active = s.id === selectedId && view === "consultar";
            return (
              <button
                key={s.id}
                onClick={() => {
                  setSelectedId(s.id);
                  setView("consultar");
                }}
                className="tab-shape"
                style={{
                  background: active ? c.bg : c.light,
                  color: active ? "#FFFFFF" : c.dark,
                  border: "none",
                  padding: "10px 20px 8px",
                  fontFamily: "'Bricolage Grotesque', sans-serif",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: "pointer",
                  minWidth: 100,
                }}
              >
                {s.name}
              </button>
            );
          })}
          <button
            onClick={() => setView("nova-cadeira")}
            className="tab-shape"
            disabled={subjects.length >= MAX_SUBJECTS}
            style={{
              background: view === "nova-cadeira" ? "#1F3A5F" : "#E7E5D9",
              color: view === "nova-cadeira" ? "#FFFFFF" : "#5C5A4E",
              border: "none",
              padding: "10px 18px 8px",
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 13,
            }}
          >
            + cadeira
          </button>
        </div>

        <div
          style={{
            background: "#FFFFFF",
            border: "1.5px solid #E7E5D9",
            borderRadius: "2px 12px 12px 12px",
            padding: "1.75rem",
            minHeight: 260,
          }}
        >
          {loading && <p style={{ color: "#8A8876", fontSize: 14 }}>Carregando o mural…</p>}

          {!loading && view === "nova-cadeira" && (
            <form onSubmit={handleAddSubject} style={{ maxWidth: 420 }}>
              <h2 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 19, margin: "0 0 1rem" }}>
                Cadastrar cadeira
              </h2>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 13, color: "#5C5A4E", display: "block", marginBottom: 4 }}>
                  Nome da cadeira
                </label>
                <input
                  className="agenda-input"
                  placeholder="ex.: Computação Gráfica"
                  value={subjectForm.name}
                  onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, color: "#5C5A4E", display: "block", marginBottom: 4 }}>
                  Professor (opcional)
                </label>
                <input
                  className="agenda-input"
                  placeholder="ex.: Prof. Almeida"
                  value={subjectForm.professor}
                  onChange={(e) => setSubjectForm({ ...subjectForm, professor: e.target.value })}
                />
              </div>
              {formError && <p style={{ color: "#993556", fontSize: 13, marginBottom: 12 }}>{formError}</p>}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" className="agenda-btn" style={{ background: "#1F3A5F", color: "#fff" }} disabled={saving}>
                  Cadastrar
                </button>
                <button
                  type="button"
                  className="agenda-btn"
                  style={{ background: "#EFEDE2", color: "#5C5A4E" }}
                  onClick={() => {
                    setFormError("");
                    setView("consultar");
                  }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {!loading && view === "novo-conteudo" && (
            <form onSubmit={handleAddEntry} style={{ maxWidth: 460 }}>
              <h2 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 19, margin: "0 0 1rem" }}>
                Cadastrar conteúdo de aula
              </h2>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 13, color: "#5C5A4E", display: "block", marginBottom: 4 }}>Cadeira</label>
                <select
                  className="agenda-input"
                  value={entryForm.subjectId}
                  onChange={(e) => setEntryForm({ ...entryForm, subjectId: e.target.value })}
                >
                  <option value="">Selecione…</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 13, color: "#5C5A4E", display: "block", marginBottom: 4 }}>Data da aula</label>
                <input
                  type="date"
                  className="agenda-input"
                  value={entryForm.date}
                  onChange={(e) => setEntryForm({ ...entryForm, date: e.target.value })}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, color: "#5C5A4E", display: "block", marginBottom: 4 }}>O que foi visto</label>
                <textarea
                  className="agenda-input"
                  rows={4}
                  placeholder="ex.: Introdução a ray tracing, algoritmo de interseção raio-esfera"
                  value={entryForm.content}
                  onChange={(e) => setEntryForm({ ...entryForm, content: e.target.value })}
                />
              </div>
              {formError && <p style={{ color: "#993556", fontSize: 13, marginBottom: 12 }}>{formError}</p>}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" className="agenda-btn" style={{ background: "#1F3A5F", color: "#fff" }} disabled={saving}>
                  Cadastrar
                </button>
                <button
                  type="button"
                  className="agenda-btn"
                  style={{ background: "#EFEDE2", color: "#5C5A4E" }}
                  onClick={() => {
                    setFormError("");
                    setView("consultar");
                  }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {!loading && view === "consultar" && (
            <>
              {subjects.length === 0 && (
                <div style={{ textAlign: "center", padding: "2rem 0" }}>
                  <p style={{ color: "#5C5A4E", fontSize: 14, margin: "0 0 12px" }}>
                    Nenhuma cadeira cadastrada ainda.
                  </p>
                  <button className="agenda-btn" style={{ background: "#1F3A5F", color: "#fff" }} onClick={() => setView("nova-cadeira")}>
                    Cadastrar primeira cadeira
                  </button>
                </div>
              )}

              {subjects.length > 0 && selectedSubject && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
                    <div>
                      <h2 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 22, margin: 0 }}>
                        {selectedSubject.name}
                      </h2>
                      {selectedSubject.professor && (
                        <p style={{ fontSize: 13, color: "#8A8876", margin: "2px 0 0" }}>{selectedSubject.professor}</p>
                      )}
                    </div>
                    <button
                      className="agenda-btn"
                      style={{ background: colorFor(selectedSubject.id).bg, color: "#fff" }}
                      onClick={() => {
                        setEntryForm({ ...entryForm, subjectId: selectedSubject.id });
                        setView("novo-conteudo");
                      }}
                    >
                      + registrar aula
                    </button>
                  </div>

                  {selectedEntries.length === 0 && (
                    <p style={{ color: "#8A8876", fontSize: 14 }}>Nenhum conteúdo registrado ainda pra essa cadeira.</p>
                  )}

                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {selectedEntries.map((e, idx) => {
                      const c = colorFor(selectedSubject.id);
                      return (
                        <div
                          key={e.id}
                          style={{
                            border: "1.5px solid #E7E5D9",
                            borderLeft: `4px solid ${c.bg}`,
                            borderRadius: "2px 8px 8px 2px",
                            padding: "12px 16px",
                            background: idx === 0 ? c.light : "#FCFBF7",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              fontFamily: "'IBM Plex Mono', monospace",
                              fontSize: 12,
                              color: c.dark,
                              marginBottom: 6,
                            }}
                          >
                            <span>
                              {formatDate(e.date)}
                              {idx === 0 ? " · última aula" : ""}
                            </span>
                            <span style={{ color: "#8A8876" }}>
                              por {e.author}
                              <button
                                onClick={() => handleDeleteEntry(e)}
                                aria-label="Apagar conteúdo"
                                style={{
                                  marginLeft: 12,
                                  background: "none",
                                  border: "none",
                                  padding: 0,
                                  cursor: "pointer",
                                  fontFamily: "'IBM Plex Mono', monospace",
                                  fontSize: 12,
                                  color: "#993556",
                                  textDecoration: "underline",
                                }}
                              >
                                apagar
                              </button>
                            </span>
                          </div>
                          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "#1F2A24" }}>{e.content}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <p style={{ fontSize: 12, color: "#A6A392", marginTop: 14, textAlign: "center" }}>
          Dados visíveis para todos que acessam esse mural.
        </p>
      </div>
    </div>
  );
}
