/**
 * Response headers for every page and file the web build serves (web readiness gap 4). Applied as a Nitro route rule
 * in `vite.config.ts`, so the Vercel output carries them for static files too. The native build has no server and
 * does not use them.
 *
 * The content policy allows only Lock'd's own origin. `'unsafe-inline'` stays on scripts and styles: the text-size
 * pre-paint script and the framework's hydration scripts are inline, and toasts and dialogs set inline styles. It
 * still blocks every third-party script, connection, font, frame and form target. Adding a service (crash reporting,
 * for one) means adding its origin here.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  // Two years, subdomains included. Not submitted to the browsers' preload list: that is a separate, slow-to-undo step.
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  // A history link page also sets no-referrer in its own head.
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
};
