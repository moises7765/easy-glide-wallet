import { createFileRoute, Link } from "@tanstack/react-router";

const URL = "https://easy-glide-wallet.lovable.app/guia/como-organizar-financas";
const TITLE = "Como organizar as finanças: guia prático em 6 passos";
const DESCRIPTION =
  "Guia passo a passo para organizar as finanças pessoais: mapear gastos, controlar cartões de crédito, montar reserva de emergência e definir metas.";

export const Route = createFileRoute("/guia/como-organizar-financas")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { property: "og:url", content: URL },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: TITLE,
          description: DESCRIPTION,
          inLanguage: "pt-BR",
          url: URL,
        }),
      },
    ],
  }),
  component: GuidePage,
});

const steps = [
  {
    title: "1. Descubra para onde vai o seu dinheiro",
    text: "Antes de cortar qualquer gasto, registre tudo por 30 dias: contas fixas, mercado, transporte, lazer e assinaturas. Sem esse retrato, qualquer plano vira chute. O ideal é anotar no momento da compra, em poucos toques, para não depender da memória no fim do mês.",
  },
  {
    title: "2. Separe gastos fixos, variáveis e sazonais",
    text: "Fixos são aluguel, internet e mensalidades. Variáveis mudam todo mês, como mercado e transporte. Sazonais aparecem em datas específicas: IPVA, seguro, matrícula. Reservar um valor mensal para os sazonais evita que eles virem dívida no cartão.",
  },
  {
    title: "3. Coloque o cartão de crédito debaixo do olho",
    text: "O cartão adianta consumo e esconde o tamanho real do compromisso. Some as parcelas já contratadas e distribua cada uma no mês em que ela vai cair. Assim você enxerga a fatura futura antes de comprar mais parcelado.",
  },
  {
    title: "4. Defina um teto por categoria",
    text: "Depois de um mês de registros, escolha três a cinco categorias que mais pesam e defina um limite realista para cada uma. Um teto que você consegue cumprir vale mais do que um orçamento perfeito no papel e abandonado na segunda semana.",
  },
  {
    title: "5. Monte a reserva de emergência",
    text: "A reserva é o que impede um imprevisto de virar dívida. A referência comum é de 3 a 6 meses do seu custo de vida mensal — mais perto de 6 para quem tem renda variável. Comece com um aporte fixo pequeno e automático logo depois de receber.",
  },
  {
    title: "6. Transforme desejos em metas com prazo",
    text: "Viagem, entrada do carro, curso: cada objetivo precisa de valor, prazo e aporte mensal. Acompanhar o percentual concluído mantém a motivação e mostra rapidamente quando o prazo precisa ser ajustado.",
  },
];

const mistakes = [
  "Contar com o limite do cartão como se fosse renda.",
  "Investir antes de ter reserva de emergência.",
  "Registrar só os gastos grandes e ignorar os pequenos recorrentes.",
  "Fazer um orçamento tão apertado que não sobra nada para lazer.",
];

function GuidePage() {
  return (
    <main className="min-h-screen bg-background px-6 py-14">
      <article className="mx-auto w-full max-w-md">
        <p className="text-xs font-medium tracking-wide text-primary uppercase">Guia</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
          Como organizar as finanças em 6 passos
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Organizar as finanças não começa com planilha nem com investimento: começa com clareza.
          Este guia mostra a sequência que funciona na prática — enxergar os gastos, controlar o
          cartão, criar reserva e só então mirar objetivos maiores.
        </p>

        <section className="mt-10" aria-labelledby="passos">
          <h2 id="passos" className="text-lg font-semibold text-foreground">
            Os 6 passos
          </h2>
          <ol className="mt-4 space-y-6">
            {steps.map((s) => (
              <li key={s.title}>
                <h3 className="text-sm font-medium text-foreground">{s.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-10" aria-labelledby="erros">
          <h2 id="erros" className="text-lg font-semibold text-foreground">
            Erros que atrasam a organização
          </h2>
          <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
            {mistakes.map((m) => (
              <li key={m} className="flex gap-2">
                <span aria-hidden="true" className="text-primary">
                  •
                </span>
                <span>{m}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10" aria-labelledby="colocar-em-pratica">
          <h2 id="colocar-em-pratica" className="text-lg font-semibold text-foreground">
            Colocando em prática
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            O Fluxo Finanças foi feito exatamente para essa sequência: registrar receitas e despesas
            em segundos, ver as parcelas dos cartões caindo nos meses certos, acompanhar a reserva de
            emergência e medir o progresso das metas — tudo na mesma tela.
          </p>
          <Link
            to="/auth"
            className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Começar a organizar agora
          </Link>
          <Link
            to="/"
            className="mt-3 inline-flex h-12 w-full items-center justify-center rounded-full border border-input px-6 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Conhecer o Fluxo Finanças
          </Link>
        </section>
      </article>
    </main>
  );
}