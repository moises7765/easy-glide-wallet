import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { CreditCard, LineChart, PiggyBank, Target, Wallet } from "lucide-react";

const DESCRIPTION =
  "Gerenciador financeiro pessoal para organizar despesas, receitas, cartões, patrimônio e metas em segundos, direto do celular.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Gerenciador Financeiro Pessoal — Fluxo Finanças" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "Gerenciador Financeiro Pessoal — Fluxo Finanças" },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://easy-glide-wallet.lovable.app/" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://easy-glide-wallet.lovable.app/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Fluxo Finanças",
          applicationCategory: "FinanceApplication",
          operatingSystem: "iOS, Android, Web",
          description: DESCRIPTION,
          url: "https://easy-glide-wallet.lovable.app/",
        }),
      },
    ],
  }),
  component: LandingPage,
});

const features = [
  {
    icon: LineChart,
    title: "Receitas e despesas",
    text: "Registre um lançamento em segundos e veja o saldo do mês atualizado na hora.",
  },
  {
    icon: CreditCard,
    title: "Cartões e parcelamentos",
    text: "Faturas por cartão e parcelas lançadas automaticamente nos meses seguintes.",
  },
  {
    icon: Wallet,
    title: "Patrimônio",
    text: "Acompanhe contas, investimentos e bens para saber quanto você realmente tem.",
  },
  {
    icon: PiggyBank,
    title: "Reserva de emergência",
    text: "Defina a meta de reserva e acompanhe o progresso mês a mês.",
  },
  {
    icon: Target,
    title: "Metas financeiras",
    text: "Crie objetivos, faça aportes e veja quanto falta para conquistar cada um.",
  },
];

function LandingPage() {
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    void import("@/integrations/supabase/client").then(async ({ supabase }) => {
      const { data } = await supabase.auth.getSession();
      if (active && data.session) {
        await navigate({ to: "/inicio", replace: true });
      }
    });

    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <main className="min-h-screen bg-background px-6 py-14">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-5 h-11 w-11 rounded-2xl bg-primary" />
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Gerenciador financeiro pessoal, simples e rápido
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          O Fluxo Finanças reúne despesas, receitas, cartões de crédito, patrimônio, reserva de
          emergência e metas em um só lugar. Tudo pensado para você registrar um gasto em poucos
          toques e entender, na hora, para onde vai o seu dinheiro.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <Link
            to="/auth"
            className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Criar minha conta grátis
          </Link>
          <Link
            to="/auth"
            className="inline-flex h-12 items-center justify-center rounded-full border border-input px-6 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Já tenho conta
          </Link>
        </div>

        <section className="mt-12" aria-labelledby="recursos">
          <h2 id="recursos" className="text-lg font-semibold text-foreground">
            O que você controla no Fluxo
          </h2>
          <ul className="mt-4 space-y-4">
            {features.map((f) => (
              <li key={f.title} className="flex gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary">
                  <f.icon className="h-4 w-4 text-primary" />
                </span>
                <div>
                  <h3 className="text-sm font-medium text-foreground">{f.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12" aria-labelledby="como-funciona">
          <h2 id="como-funciona" className="text-lg font-semibold text-foreground">
            Como funciona
          </h2>
          <ol className="mt-4 space-y-3 text-sm text-muted-foreground">
            <li>1. Crie sua conta com e-mail ou Google.</li>
            <li>2. Cadastre seus cartões, contas e categorias.</li>
            <li>3. Lance receitas e despesas em segundos, direto do celular.</li>
            <li>4. Acompanhe saldo, patrimônio, reserva e metas em tempo real.</li>
          </ol>
          <Link
            to="/auth"
            className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Começar agora
          </Link>
        </section>
      </div>
    </main>
  );
}
