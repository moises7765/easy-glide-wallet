export function AuthBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      style={{ backgroundColor: "oklch(0.10 0.01 265)" }}
    >
      {/* Gradientes verde-esmeralda extremamente sutis nos cantos/laterais */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(circle at 0% 0%, oklch(0.8 0.17 157 / 0.10) 0%, transparent 45%),
            radial-gradient(circle at 100% 0%, oklch(0.8 0.17 157 / 0.05) 0%, transparent 35%),
            radial-gradient(circle at 0% 100%, oklch(0.8 0.17 157 / 0.05) 0%, transparent 35%),
            radial-gradient(circle at 100% 100%, oklch(0.8 0.17 157 / 0.03) 0%, transparent 30%)
          `,
        }}
      />

      {/* Brilho verde difuso e discreto no canto superior esquerdo */}
      <div
        className="absolute -left-[15%] -top-[15%] h-[55%] w-[55%] rounded-full"
        style={{
          background: "radial-gradient(circle, oklch(0.8 0.17 157 / 0.10) 0%, transparent 60%)",
          filter: "blur(80px)",
        }}
      />

      {/* Onda abstrata de partículas/pontos verdes com movimento sutil */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
        style={{ opacity: 0.4 }}
      >
        <defs>
          <linearGradient id="edgeFade" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style={{ stopColor: "oklch(0.8 0.17 157 / 0.7)" }} />
            <stop offset="25%" style={{ stopColor: "oklch(0.8 0.17 157 / 0.12)" }} />
            <stop offset="50%" style={{ stopColor: "oklch(0.8 0.17 157 / 0.03)" }} />
            <stop offset="75%" style={{ stopColor: "oklch(0.8 0.17 157 / 0.12)" }} />
            <stop offset="100%" style={{ stopColor: "oklch(0.8 0.17 157 / 0.7)" }} />
          </linearGradient>
        </defs>
        <path
          d="M 0 75 C 25 75, 35 30, 50 50 S 75 30, 100 75"
          fill="none"
          stroke="url(#edgeFade)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="2 10"
          style={{
            animation: "auth-wave-flow 24s linear infinite",
          }}
        />
      </svg>

      {/* Partículas dispersas mais visíveis nas bordas */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(circle at 4% 18%, oklch(0.8 0.17 157 / 0.22) 0px, oklch(0.8 0.17 157 / 0.22) 2px, transparent 3px),
            radial-gradient(circle at 10% 78%, oklch(0.8 0.17 157 / 0.16) 0px, oklch(0.8 0.17 157 / 0.16) 1.5px, transparent 2.5px),
            radial-gradient(circle at 96% 28%, oklch(0.8 0.17 157 / 0.20) 0px, oklch(0.8 0.17 157 / 0.20) 2px, transparent 3px),
            radial-gradient(circle at 92% 82%, oklch(0.8 0.17 157 / 0.14) 0px, oklch(0.8 0.17 157 / 0.14) 1.5px, transparent 2.5px),
            radial-gradient(circle at 2% 55%, oklch(0.8 0.17 157 / 0.10) 0px, oklch(0.8 0.17 157 / 0.10) 1.5px, transparent 2.5px),
            radial-gradient(circle at 98% 60%, oklch(0.8 0.17 157 / 0.10) 0px, oklch(0.8 0.17 157 / 0.10) 1.5px, transparent 2.5px)
          `,
          backgroundSize: "100% 100%",
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
