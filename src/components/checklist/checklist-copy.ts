// V2-L9-T10 — Textos fixos do checklist (UX-SPEC.md §9.8, fonte única).
export const CHECKLIST_TITULO = "Checklist de bagagem e documentos";
export const CHECKLIST_AVISO_CLIMA =
  "Montei esta lista pelo clima típico da época; confira a previsão perto da viagem.";
export const CHECKLIST_AVISO_SEM_DATAS =
  "Sem as datas, não consigo ajustar a lista à época.";
export const CHECKLIST_AVISO_FORA_CATALOGO =
  "Confira as regras de entrada do destino em fonte oficial.";
export const CHECKLIST_ERRO_LEITURA = "Não consegui carregar o checklist agora.";
export const CHECKLIST_ERRO_GRAVACAO =
  "Não consegui guardar esta marcação agora. Tente de novo.";
export const checklistProgresso = (n: number, total: number) =>
  `${n} de ${total} itens separados`;
