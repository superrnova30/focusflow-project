const authRouter = require('../src/routes/auth');

const methods = new Set();
for (const layer of authRouter.stack || []) {
  if (layer && layer.route && layer.route.path) {
    const path = layer.route.path;
    const verbs = Object.keys(layer.route.methods || {});
    if (path === '/forgot-password' || path === '/reset-password' || path === '/verify-reset-code') {
      methods.add(`${verbs.join(',')} ${path}`);
    }
  }
}

if (
  !methods.has('post /forgot-password') ||
  !methods.has('post /verify-reset-code') ||
  !methods.has('post /reset-password')
) {
  console.error('Missing password-reset routes:', Array.from(methods));
  process.exit(1);
}

console.log('Verified password-reset routes:', Array.from(methods).join(' | '));
