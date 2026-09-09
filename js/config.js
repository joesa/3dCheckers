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

const getSupabaseUrl = () => {
  if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') {
    return 'http://127.0.0.1:54321';
  }
  // For HTTPS sites, use relative URL for supabase to avoid mixed content
  if (location.protocol === 'https:') {
    return window.location.origin + ':54321';
  }
  return getEnv('SUPABASE_URL', `http://${location.hostname}:54321`);
};

export const CONFIG = {
  // TURN server for WebRTC
  TURN_HOST: getEnv('TURN_HOST', '172.16.0.107'),
  TURN_PORT: parseInt(getEnv('TURN_PORT', '3478')) || 3478,
  TURN_USER: getEnv('TURN_USER', 'aether'),
  TURN_CRED: getEnv('TURN_CRED', 'devturnpass123'),

  // Supabase
  SRV_URL: getSupabaseUrl(),
  SRV_ANON: getEnv('SUPABASE_ANON', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'),

  // Game balance constants
  TURN_TIMEOUT_MS: parseInt(getEnv('TURN_TIMEOUT_MS', '45000')) || 45000,
  BLIZZING_TURN_MS: parseInt(getEnv('BLIZZING_TURN_MS', '15000')) || 15000,
  MAX_WAGER: parseInt(getEnv('MAX_WAGER', '5000')) || 5000,
  MIN_WAGER: parseInt(getEnv('MIN_WAGER', '10')) || 10,
  PUZZLE_REWARD: parseInt(getEnv('PUZZLE_REWARD', '60')) || 60,
  GAUNTLET_REWARD_BASE: parseInt(getEnv('GAUNTLET_REWARD_BASE', '100')) || 100,
};
