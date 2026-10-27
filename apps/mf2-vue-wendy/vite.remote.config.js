import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue()],
  base: './',
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: 'dist-remote',
    emptyOutDir: false,
    lib: { entry: 'src/remote.js', formats: ['es'], fileName: () => 'remote.js', cssFileName: 'remote' },
    cssCodeSplit: false,
    // No externals: each release includes its own Vue runtime.
  },
});
