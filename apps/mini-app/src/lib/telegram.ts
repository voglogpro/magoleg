type TelegramTheme = 'light' | 'dark';

type TelegramWebApp = {
  colorScheme?: TelegramTheme;
  ready?: () => void;
  expand?: () => void;
  HapticFeedback?: {
    impactOccurred?: (style: 'light' | 'medium') => void;
  };
  onEvent?: (name: string, handler: () => void) => void;
  offEvent?: (name: string, handler: () => void) => void;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export const telegram = () => window.Telegram?.WebApp;

export const prepareTelegram = () => {
  const app = telegram();
  app?.ready?.();
  app?.expand?.();
  return app;
};

export const hapticTap = () => telegram()?.HapticFeedback?.impactOccurred?.('light');

