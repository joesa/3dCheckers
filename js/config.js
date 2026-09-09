// Game configuration - load from environment or use defaults
// This file should be generated from .env.example before production

export const CONFIG = {
  // TURN server for WebRTC
  TURN_HOST: import.meta.env.VITE_TURN_HOST || '172.16.0.107',
  TURN_PORT: parseInt(import.meta.env.VITE_TURN_PORT) || 3478,
  TURN_USER: import.meta.env.VITE_TURN_USER || 'aether',
  TURN_CRED: import.meta.env.VITE_TURN_CRED || 'devturnpass123',

  // Supabase
  SRV_URL: (location.hostname === '127.0.0.1' || location.hostname === 'localhost')
    ? 'http://127.0.0.1:54321'
    : (import.meta.env.VITE_SUPABASE_URL || `http://${location.hostname}:54321`),
  SRV_ANON: import.meta.env.VITE_SUPABASE_ANON || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',

  // Game balance constants
  TURN_TIMEOUT_MS: parseInt(import.meta.env.VITE_TURN_TIMEOUT_MS) || 45000,
  BLIZZING_TURN_MS: parseInt(import.meta.env.VITE_BLIZZING_TURN_MS) || 15000,
  MAX_WAGER: parseInt(import.meta.env.VITE_MAX_WAGER) || 5000,
  MIN_WAGER: parseInt(import.meta.env.VITE_MIN_WAGER) || 10,
  PUZZLE_REWARD: parseInt(import.meta.env.VITE_PUZZLE_REWARD) || 60,
  GAUNTLET_REWARD_BASE: parseInt(import.meta.env.VITE_GAUNTLET_REWARD_BASE) || 100,
};
