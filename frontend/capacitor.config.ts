import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.appvotacao.app",
  appName: "Votação Online",
  webDir: "out",
  server: {
    url: "https://appvotacao.com.br",
    cleartext: false,
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
