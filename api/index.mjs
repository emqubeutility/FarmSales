// Vercel function entry: every /api/* request is rewritten here (see vercel.json).
// The Nest app is compiled to backend/dist by scripts/vercel-build.mjs.
export { default } from '../backend/dist/vercel.js';
