import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: 'dist-remote',
    lib: { entry: 'src/remote.jsx', formats: ['es'], fileName: () => 'remote.js', cssFileName: 'remote' },
    cssCodeSplit: false,
    rollupOptions: { output: { codeSplitting: false } },
  },
});
