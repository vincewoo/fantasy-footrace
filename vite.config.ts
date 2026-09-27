import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import { LEAGUE_ID } from './src/espn/client';
import { espnProxy, PROXY_PREFIX } from './src/espn/proxy';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    test: {
      environment: 'node',
      include: ['src/**/*.test.{ts,tsx}'],
    },
    server: {
      proxy: {
        [PROXY_PREFIX]: espnProxy(env, LEAGUE_ID),
      },
    },
  };
});
