import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.fluxofinancas",
  appName: "Fluxo Finanças",
  webDir: "dist/client",
  // Apenas o build nativo aponta para a URL remota (CAP_SERVER_URL).
  // Assim a configuração mobile nunca interfere no preview/build web.
  ...(process.env["CAP_SERVER_URL"]
    ? { server: { url: process.env["CAP_SERVER_URL"], cleartext: false } }
    : {}),
  ios: {
    contentInset: "never",
    backgroundColor: "#1a1a2e",
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    backgroundColor: "#1a1a2e",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1200,
      backgroundColor: "#1a1a2e",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#1a1a2e",
      overlaysWebView: false,
    },
  },
};

export default config;
