import {aircraftMaterialsPlugin} from './scripts/aircraft-materials-plugin.ts';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ base: '/watch/', plugins: [react(), aircraftMaterialsPlugin()], server: { proxy: { '/api': 'http://localhost:8000' } } });
