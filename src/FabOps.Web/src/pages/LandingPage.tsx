import { useEffect, useRef, useState } from 'react';
import { AuthConfig, fetchAuthConfig, useAuth } from '../auth/AuthProvider';
import HexLogo from '../components/HexLogo';

export default function LandingPage() {
  const { login, error, clearError } = useAuth();
  const [stage, setStage] = useState<'hero' | 'config' | 'signing-in'>('hero');
  const [cfg, setCfg] = useState<AuthConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const configRef = useRef<HTMLDivElement>(null);

  // Fetch credentials from the backend as soon as the auth card appears.
  useEffect(() => {
    if (stage !== 'config') return;
    setCfg(null);
    setLoadError(null);
    fetchAuthConfig()
      .then(setCfg)
      .catch((e: Error) => setLoadError(e.message));
  }, [stage]);

  useEffect(() => {
    if (stage === 'config')
      setTimeout(() => configRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);
  }, [stage]);

  const handleGetStarted = () => { clearError(); setStage('config'); };

  const handleSignIn = async () => {
    if (!cfg) return;
    clearError();
    setLoadError(null);
    setStage('signing-in');
    await login(cfg);
    setStage('config');
  };

  const authError = error || loadError;
  const ready = !!cfg && stage !== 'signing-in';

  return (
    <div className="landing">
      <div className="landing-grid" aria-hidden />

      {/* ── Hero ──────────────────────────────────── */}
      <section className="landing-hero">
        <div className="hero-glow hero-glow-l" aria-hidden />
        <div className="hero-glow hero-glow-r" aria-hidden />

        <div className="hero-inner">
          <div className="hero-copy">
            <div className="brand">
              <HexLogo id="hero-logo" size={40} />
              <span className="brand-name">Malta Beaches</span>
            </div>

            <h1 className="hero-headline">
              Malta's beaches,<br />
              matched to{' '}
              <span className="hero-hl-accent">today.</span>
            </h1>

            <p className="hero-sub">
              Tell our guide what you're after. It reads today's weather, wind and sea
              conditions across the Maltese coast — and points you to the best beach for
              quality, calm water, and accessibility, right now.
            </p>

            <div className="hero-pills">
              <span className="hero-pill">Live weather &amp; wind</span>
              <span className="hero-pill">Sea state &amp; quality</span>
              <span className="hero-pill">Step-free access</span>
            </div>

            {stage === 'hero' && (
              <button className="btn-cta" onClick={handleGetStarted}>
                Get started
                <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                  <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>

          {/* Right: Malta beach gallery */}
          <div className="hero-demo">
            <figure className="beach-hero">
              <img src="/beaches/golden-bay.jpg" alt="Golden Bay beach, Mellieħa, Malta" loading="lazy" />
              <figcaption>Golden Bay</figcaption>
            </figure>
            <div className="beach-thumbs">
              <figure className="beach-thumb">
                <img src="/beaches/blue-water.jpg" alt="Clear blue water at a Maltese beach" loading="lazy" />
                <figcaption>Crystal water</figcaption>
              </figure>
              <figure className="beach-thumb">
                <img src="/beaches/armier-bay.jpg" alt="Armier Bay, Malta" loading="lazy" />
                <figcaption>Armier Bay</figcaption>
              </figure>
            </div>
          </div>
        </div>
      </section>

      {/* ── Sign in ───────────────────────────────── */}
      {(stage === 'config' || stage === 'signing-in') && (
        <section className="auth-section" ref={configRef}>
          <div className="auth-card">
            <h2 className="auth-card-title">Sign in to Malta Beaches</h2>
            <p className="auth-card-sub">
              {!cfg && !loadError ? 'Loading configuration…' : 'Authenticate with your Microsoft account'}
            </p>

            {authError && <p className="msg-error">{authError}</p>}

            <button className="btn-msft" disabled={!ready} onClick={handleSignIn}>
              <svg viewBox="0 0 21 21" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
                <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
              </svg>
              {stage === 'signing-in' ? 'Signing in…' : 'Sign in with Microsoft'}
            </button>
          </div>
        </section>
      )}

      {/* ── How it works ─────────────────────────── */}
      <section className="features">
        <div className="features-inner">
          <div className="features-hdr">
            <h2>How it works</h2>
            <p>Your perfect Malta beach, picked for today's weather.</p>
          </div>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-num">01</div>
              <div className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="22" height="22">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                </svg>
              </div>
              <h3>Ask in plain language</h3>
              <p>Tell the guide what you want — calm water, family-friendly, quiet, accessible, or a hidden gem off the beaten track.</p>
            </div>
            <div className="feature-card">
              <div className="feature-num">02</div>
              <div className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="22" height="22">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
                </svg>
              </div>
              <h3>Reads today's conditions</h3>
              <p>It checks live weather, wind direction and sea state along the coast to see which beaches are at their best right now.</p>
            </div>
            <div className="feature-card">
              <div className="feature-num">03</div>
              <div className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="22" height="22">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                </svg>
              </div>
              <h3>Recommends the best spot</h3>
              <p>You get today's top beaches for your needs, with notes on water quality, crowds and step-free access.</p>
            </div>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-brand">
          <HexLogo id="footer-logo" size={24} />
          <span>Malta Beaches</span>
        </div>
        <span className="landing-footer-tagline">Find your perfect beach.</span>
      </footer>
    </div>
  );
}
