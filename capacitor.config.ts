import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.fluxofinancas",
  appName: "Fluxo Finanças",
  webDir: "dist/client",
  // O app depende de internet e roda o mesmo build web (SSR + Supabase).
  server: {
    url: "https://project--fcec170c-02fc-4a96-9829-b74eced227f5.lovable.app",
    cleartext: false,
  },
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
