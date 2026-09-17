// V2-L4-T07 — `FaqSection` (UX-SPEC.md §8.2 T-HOME item 7, RNF-11).
//
// Server Component puro: 5 perguntas/respostas fixas do UX-SPEC, `<details>`
// nativo (acessível por padrão, sem JS) e todos fechados por padrão (nenhum
// `open`). A primeira pergunta/resposta é a identificação como IA exigida
// por RNF-11 ("Honestidade": a identificação aparece em texto visível na
// home, não só em `aria-label`) — texto reproduzido literalmente do
// UX-SPEC, não parafraseado.
import { SectionBand } from "@/components/home/section-band";

interface FaqItem {
  pergunta: string;
  resposta: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    pergunta: "Quem monta o roteiro?",
    resposta:
      "Eu, um assistente de inteligência artificial. Não há uma pessoa do outro lado, e eu posso errar: confira os detalhes antes de reservar.",
  },
  {
    pergunta: "Vocês fazem reservas?",
    resposta: "Não. Eu sugiro e organizo; a reserva você faz onde preferir.",
  },
  {
    pergunta: "Os preços são reais?",
    resposta: "São faixas aproximadas para você comparar, não cotações.",
  },
  {
    pergunta: "Preciso criar conta?",
    resposta:
      "Para escolher o destino, não. Para seguir com hospedagem, passeios e roteiro, sim: é assim que eu guardo a sua viagem para você continuar depois.",
  },
  {
    pergunta: "O que vocês fazem com o meu e-mail?",
    resposta:
      "Uso só para salvar e recuperar seus roteiros. Não envio marketing. Você pode excluir sua conta quando quiser em 'Meus roteiros'.",
  },
];

/**
 * Seção de perguntas frequentes da home (UX-SPEC.md §8.2 T-HOME item 7):
 * `<details>`/`<summary>` nativos, todos fechados por padrão, dentro de um
 * `SectionBand` de tom `default` (§8.3, largura máxima de 720 px para o FAQ,
 * §8.7).
 */
export function FaqSection() {
  return (
    <SectionBand id="faq" title="Perguntas frequentes">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-3">
        {FAQ_ITEMS.map((item) => (
          <details
            key={item.pergunta}
            className="group rounded-lg border border-border bg-surface p-4 open:pb-4"
          >
            <summary className="cursor-pointer list-none text-base font-medium text-foreground marker:content-none">
              {item.pergunta}
            </summary>
            <p className="pt-2 text-sm text-muted-foreground">{item.resposta}</p>
          </details>
        ))}
      </div>
    </SectionBand>
  );
}
