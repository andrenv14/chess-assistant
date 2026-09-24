/// <reference types="vite/client" />

declare global {
  interface Window {
    chessAssistant?: {
      platform: string;
      versions: Record<string, string>;
    };
  }
}

export {};
