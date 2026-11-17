// The site is already static. GitHub Pages' workflow runs `npm run build` and publishes dist/, so this copies the site there.
import { cpSync, readdirSync, rmSync } from 'node:fs';
const skip = new Set(['.git', '.github', 'node_modules', 'dist', 'tools', 'package.json', 'package-lock.json']);
rmSync('dist', { recursive: true, force: true });
for (const name of readdirSync('.')) if (!skip.has(name)) cpSync(name, `dist/${name}`, { recursive: true });
console.log('copied the static site to dist/');
