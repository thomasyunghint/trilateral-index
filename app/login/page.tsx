"use client";

import { useState, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Login failed");
        setSubmitting(false);
        return;
      }
      const next = searchParams.get("next") || "/";
      router.replace(next);
      router.refresh();
    } catch {
      setError("Network error");
      setSubmitting(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <h1 className="login-title">TGFI</h1>
          <p className="login-subtitle">
            Trilateral Geoeconomic Fragmentation Index
          </p>
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          <label htmlFor="password" className="login-label">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            autoComplete="current-password"
            className="login-input"
            placeholder="Enter access password"
          />
          {error && <div className="login-error">{error}</div>}
          <button
            type="submit"
            disabled={submitting || !password}
            className="login-button"
          >
            {submitting ? "Verifying…" : "Continue"}
          </button>
        </form>
        <p className="login-note">
          Private research preview &middot; By invitation only
        </p>
      </div>
      <style>{`
        body { margin: 0; background: #FAF8F2; color: #1F2328;
          font-family: var(--font-inter), -apple-system, BlinkMacSystemFont, sans-serif; }
        .login-shell {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: linear-gradient(180deg, #FAF8F2 0%, #F4F0E6 100%);
        }
        .login-card {
          width: 100%;
          max-width: 420px;
          background: #FFFFFF;
          border: 1px solid #E5DFD0;
          border-radius: 4px;
          padding: 48px 40px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 12px 40px rgba(0,0,0,0.06);
        }
        .login-brand { margin-bottom: 32px; text-align: center; }
        .login-title {
          font-family: var(--font-playfair-display), Georgia, serif;
          font-size: 48px;
          font-weight: 700;
          letter-spacing: -0.02em;
          margin: 0 0 8px 0;
          color: #1F2328;
        }
        .login-subtitle {
          font-size: 13px;
          color: #656D76;
          margin: 0;
          letter-spacing: 0.02em;
        }
        .login-form { display: flex; flex-direction: column; gap: 12px; }
        .login-label {
          font-size: 11px;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #656D76;
        }
        .login-input {
          padding: 12px 14px;
          border: 1px solid #D0D7DE;
          border-radius: 4px;
          font-size: 15px;
          background: #FFFFFF;
          font-family: var(--font-jetbrains-mono), ui-monospace, monospace;
          letter-spacing: 0.04em;
          color: #1F2328;
          transition: border-color 0.15s ease;
        }
        .login-input:focus {
          outline: none;
          border-color: #1A7F37;
          box-shadow: 0 0 0 3px rgba(26, 127, 55, 0.1);
        }
        .login-error {
          font-size: 13px;
          color: #CF222E;
          padding: 8px 12px;
          background: rgba(207, 34, 46, 0.06);
          border: 1px solid rgba(207, 34, 46, 0.2);
          border-radius: 4px;
        }
        .login-button {
          padding: 12px;
          margin-top: 4px;
          background: #1F2328;
          color: #FFFFFF;
          border: none;
          border-radius: 4px;
          font-size: 14px;
          font-weight: 500;
          letter-spacing: 0.03em;
          cursor: pointer;
          transition: background 0.15s ease;
        }
        .login-button:hover:not(:disabled) { background: #000000; }
        .login-button:disabled { background: #8B949E; cursor: not-allowed; }
        .login-note {
          margin-top: 24px;
          font-size: 11px;
          text-align: center;
          color: #8B949E;
          letter-spacing: 0.02em;
        }
      `}</style>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#FAF8F2" }} />}>
      <LoginForm />
    </Suspense>
  );
}
