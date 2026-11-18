"use client";

/**
 * Last resort when the root layout itself fails: it replaces the whole document, so it carries its own
 * html and body and plain styles (the site stylesheet may be what failed). No internal detail is shown.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en-IN">
      <body
        style={{ fontFamily: "system-ui, sans-serif", background: "#fbf8f2", color: "#1c1a17", margin: 0 }}
      >
        <main style={{ maxWidth: "40rem", margin: "0 auto", padding: "4rem 1.5rem" }}>
          <p style={{ textTransform: "uppercase", letterSpacing: "0.1em", fontSize: "0.75rem" }}>Peti</p>
          <h1 style={{ fontSize: "2rem", fontWeight: 400 }}>Something went wrong.</h1>
          <p>Peti could not load. Try again in a moment.</p>
          <p style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
            <button type="button" onClick={() => reset()} style={{ padding: "0.6rem 1.2rem" }}>
              Try again
            </button>
            {/* A full page load on purpose: the app itself failed, so client navigation may too. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/">Home page</a>
          </p>
          {error.digest ? (
            <p style={{ fontSize: "0.8rem", color: "#6b655c" }}>Reference {error.digest}</p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
