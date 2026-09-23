import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mailroost.app',
  appName: 'MailRoost',
  webDir: 'dist',
  server: {
    url: 'https://mailroost.ionjk2879.workers.dev',
    cleartext: false,
  },
};

export default config;
