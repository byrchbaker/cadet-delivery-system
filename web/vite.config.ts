import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * lucide-react's entry re-exports all ~1,900 icons, so importing three icons
 * makes the bundler read every one of them. That multiplies build time and
 * memory, which matters on small servers (e.g. a 512 MB container). This
 * rewrites `import { Bell } from 'lucide-react'` in our own source to a direct
 * import of that icon's file. Types are unaffected; the output is identical.
 */
function lucideDirectImports(): Plugin {
  const require = createRequire(import.meta.url);
  const entry = path.join(path.dirname(require.resolve('lucide-react/package.json')), 'dist/esm/lucide-react.mjs');
  const files = new Map<string, string>();
  for (const m of fs.readFileSync(entry, 'utf8').matchAll(/export \{([^}]+)\} from '\.\/icons\/([^']+)'/g)) {
    for (const spec of m[1].split(',')) {
      const name = spec.trim().replace(/^default as /, '');
      if (name) files.set(name, `lucide-react/dist/esm/icons/${m[2]}`);
    }
  }
  return {
    name: 'lucide-direct-imports',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      if (id.includes('node_modules') || !/\.[jt]sx?$/.test(id) || !code.includes("'lucide-react'")) return null;
      return code.replace(/import\s*\{([^}]+)\}\s*from\s*'lucide-react';?/g, (whole, specs: string) => {
        const direct: string[] = [];
        const rest: string[] = [];
        for (const raw of specs.split(',').map((s) => s.trim()).filter(Boolean)) {
          const [imported, local = imported] = raw.split(/\s+as\s+/);
          const file = !imported.startsWith('type ') && files.get(imported);
          if (file) direct.push(`import ${local} from '${file}';`);
          else rest.push(raw);
        }
        if (!direct.length) return whole;
        const allTypes = rest.every((r) => r.startsWith('type '));
        const remaining = rest.length ? `import ${allTypes ? 'type ' : ''}{ ${rest.map((r) => (allTypes ? r.replace(/^type /, '') : r)).join(', ')} } from 'lucide-react';` : '';
        return [...direct, remaining].join('\n');
      });
    },
  };
}

export default defineConfig({
  plugins: [lucideDirectImports(), react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:8080', changeOrigin: false } },
  },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 900 },
});
