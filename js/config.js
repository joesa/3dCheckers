// Game configuration - load from environment or use defaults
// This file should be generated from .env.example before production

const getEnv = (key, fallback) => {
  const envKey = 'VITE_' + key;
  if (typeof process !== 'undefined' && process.env && process.env[envKey]) {
    return process.env[envKey];
  }
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[envKey]) {
    return import.meta.env[envKey];
  }
  return fallback;
};

// Runtime override for static deploys where no bundler inlines import.meta.env:
// set window.__AD_CONFIG__ = {SRV_URL:'https://xyz.supabase.co',SRV_ANON:'...'} before this module loads.
const runtime = (typeof window !== 'undefined' && window.__AD_CONFIG__) || {};

const getSupabaseUrl = () => {
  const env = getEnv('SUPABASE_URL', null);
  if (env) return String(env).replace(/\/+$/, '');
  // 54321 is the local `supabase start` API port — it only exists on the dev machine
  if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') {
    return 'http://127.0.0.1:54321';
  }
  // No project configured (e.g. deployed to a static host) -> backend stays offline
  return null;
};

export const CONFIG = {
  // TURN server for WebRTC
  TURN_HOST: runtime.TURN_HOST || getEnv('TURN_HOST', '172.16.0.107'),
  TURN_PORT: parseInt(runtime.TURN_PORT || getEnv('TURN_PORT', '3478')) || 3478,
  TURN_USER: runtime.TURN_USER || getEnv('TURN_USER', 'aether'),
  TURN_CRED: runtime.TURN_CRED || getEnv('TURN_CRED', 'devturnpass123'),

  // Supabase
  SRV_URL: runtime.SRV_URL != null ? String(runtime.SRV_URL).replace(/\/+$/, '') : getSupabaseUrl(),
  SRV_ANON: runtime.SRV_ANON || getEnv('SUPABASE_ANON', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'),

  // Game balance constants
  TURN_TIMEOUT_MS: parseInt(getEnv('TURN_TIMEOUT_MS', '45000')) || 45000,
  BLIZZING_TURN_MS: parseInt(getEnv('BLIZZING_TURN_MS', '15000')) || 15000,
  MAX_WAGER: parseInt(getEnv('MAX_WAGER', '5000')) || 5000,
  MIN_WAGER: parseInt(getEnv('MIN_WAGER', '10')) || 10,
  PUZZLE_REWARD: parseInt(getEnv('PUZZLE_REWARD', '60')) || 60,
  GAUNTLET_REWARD_BASE: parseInt(getEnv('GAUNTLET_REWARD_BASE', '100')) || 100,
};
