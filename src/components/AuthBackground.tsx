export function AuthBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      style={{ backgroundColor: "oklch(0.115 0.01 265)" }}
    >
      {/* Gradientes verde-esmeralda extremamente sutis nos cantos/laterais */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(circle at 0% 0%, oklch(0.8 0.17 157 / 0.07) 0%, transparent 45%),
            radial-gradient(circle at 100% 0%, oklch(0.8 0.17 157 / 0.04) 0%, transparent 35%),
            radial-gradient(circle at 0% 100%, oklch(0.8 0.17 157 / 0.04) 0%, transparent 35%),
            radial-gradient(circle at 100% 100%, oklch(0.8 0.17 157 / 0.025) 0%, transparent 30%)
          `,
        }}
      />

      {/* Brilho verde difuso e discreto no canto superior esquerdo */}
      <div
        className="absolute -left-[18%] -top-[18%] h-[60%] w-[60%] rounded-full"
        style={{
          background: "radial-gradient(circle, oklch(0.8 0.17 157 / 0.07) 0%, transparent 60%)",
          filter: "blur(100px)",
        }}
      />

      {/* Onda abstrata de pequenas partículas/pontos verdes (evita o centro da tela) */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
        style={{ opacity: 0.28 }}
      >
        <defs>
          <linearGradient id="edgeFade" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style={{ stopColor: "oklch(0.8 0.17 157 / 0.55)" }} />
            <stop offset="25%" style={{ stopColor: "oklch(0.8 0.17 157 / 0.10)" }} />
            <stop offset="50%" style={{ stopColor: "oklch(0.8 0.17 157 / 0.02)" }} />
            <stop offset="75%" style={{ stopColor: "oklch(0.8 0.17 157 / 0.10)" }} />
            <stop offset="100%" style={{ stopColor: "oklch(0.8 0.17 157 / 0.55)" }} />
          </linearGradient>
        </defs>
        <path
          d="M 0 18 C 25 18, 40 82, 50 82 S 75 18, 100 18"
          fill="none"
          stroke="url(#edgeFade)"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeDasharray="1.5 9"
          style={{
            animation: "auth-wave-flow 28s linear infinite",
          }}
        />
      </svg>

      {/* Partículas dispersas mais visíveis nas bordas */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(circle at 5% 16%, oklch(0.8 0.17 157 / 0.14) 0px, oklch(0.8 0.17 157 / 0.14) 1.5px, transparent 2.5px),
            radial-gradient(circle at 11% 76%, oklch(0.8 0.17 157 / 0.10) 0px, oklch(0.8 0.17 157 / 0.10) 1px, transparent 2px),
            radial-gradient(circle at 95% 26%, oklch(0.8 0.17 157 / 0.13) 0px, oklch(0.8 0.17 157 / 0.13) 1.5px, transparent 2.5px),
            radial-gradient(circle at 91% 80%, oklch(0.8 0.17 157 / 0.09) 0px, oklch(0.8 0.17 157 / 0.09) 1px, transparent 2px),
            radial-gradient(circle at 2% 52%, oklch(0.8 0.17 157 / 0.07) 0px, oklch(0.8 0.17 157 / 0.07) 1px, transparent 2px),
            radial-gradient(circle at 98% 58%, oklch(0.8 0.17 157 / 0.07) 0px, oklch(0.8 0.17 157 / 0.07) 1px, transparent 2px)
          `,
          backgroundSize: "100% 100%",
        }}
      />

      {/* Máscara sutil para garantir que o centro da tela permaneça limpo e escuro */}
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(circle at 50% 52%, oklch(0.115 0.01 265 / 0.45) 0%, transparent 65%)",
        }}
      />

      <style>{`
        @keyframes auth-wave-flow {
          to {
            stroke-dashoffset: -180;
          }
        }
      `}</style>
    </div>
  );
}
