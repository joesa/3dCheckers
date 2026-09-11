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

// Private/loopback hosts are assumed to be running `supabase start` on this machine,
// so a LAN IP reaches the same stack as 127.0.0.1 does. Public hosts stay offline
// unless SUPABASE_URL or window.__AD_CONFIG__ says otherwise.
const PRIVATE_HOST=/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|localhost$|.*\.local$|^\[?::1\]?$)/i;

const getSupabaseUrl = () => {
  const env = getEnv('SUPABASE_URL', null);
  if (env) return String(env).replace(/\/+$/, '');
  // 54321 is the local `supabase start` API port — it only exists on the dev machine
  const host = (typeof location !== 'undefined' && location.hostname) || '';
  if (PRIVATE_HOST.test(host)) return 'http://' + host + ':54321';
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

  // Web push (VAPID application server public key). Empty until provisioned with
  // `npx web-push generate-vapid-keys`; the private key lives only in the sender.
  PUSH_PUBLIC_KEY: runtime.PUSH_PUBLIC_KEY || getEnv('PUSH_PUBLIC_KEY', ''),

  // Game balance constants
  TURN_TIMEOUT_MS: parseInt(getEnv('TURN_TIMEOUT_MS', '45000')) || 45000,
  BLIZZING_TURN_MS: parseInt(getEnv('BLIZZING_TURN_MS', '15000')) || 15000,
  MAX_WAGER: parseInt(getEnv('MAX_WAGER', '5000')) || 5000,
  MIN_WAGER: parseInt(getEnv('MIN_WAGER', '10')) || 10,
  PUZZLE_REWARD: parseInt(getEnv('PUZZLE_REWARD', '60')) || 60,
  GAUNTLET_REWARD_BASE: parseInt(getEnv('GAUNTLET_REWARD_BASE', '100')) || 100,
};
