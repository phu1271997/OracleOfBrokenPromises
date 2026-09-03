import { useState, useEffect, useCallback } from 'react';
import { connectWallet, getClient, CONTRACT_ADDRESS } from './config';
import './App.css';

/* ───────── types ───────── */
interface PromiseData {
  id: string;
  creator: string;
  promiser_name: string;
  promise_text: string;
  deadline: string;
  source_url: string;
  verification_url: string;
  pool_kept: string;
  pool_broken: string;
  status: string;
  verdict: string;
  reason: string;
}

interface MyBets {
  kept: string;
  broken: string;
}

/* ───────── FAQ data ───────── */
const FAQ_ITEMS = [
  {
    q: 'What is GenLayer?',
    a: 'GenLayer is a Layer-1 blockchain with built-in AI consensus. Intelligent contracts can fetch live web data and use LLMs to make judgments, with multiple validators independently verifying the result.',
  },
  {
    q: 'How do bets work?',
    a: 'While a promise is OPEN, anyone can stake GEN tokens on either KEPT or BROKEN. Your stake goes into the corresponding pool. When the promise is resolved, winners split the losing pool proportionally to their stake.',
  },
  {
    q: 'What are the possible verdicts?',
    a: 'KEPT means the promise was fulfilled. BROKEN means it was not. PARTIAL means partial fulfillment was detected. UNRESOLVABLE means the AI could not determine the outcome from available evidence.',
  },
  {
    q: 'How are winnings calculated?',
    a: 'Winners split the losers’ pool proportionally based on their share of the winning pool. For example, if you staked 30% of the KEPT pool and KEPT wins, you receive 30% of the BROKEN pool as profit.',
  },
  {
    q: 'What happens with PARTIAL or UNRESOLVABLE verdicts?',
    a: 'All bettors receive a full refund of their staked tokens. No one wins or loses when the outcome is uncertain.',
  },
  {
    q: 'How long does resolution take?',
    a: 'Resolution typically takes 30 to 120 seconds. The contract fetches evidence from the web, an LLM evaluates the promise, and multiple validators independently verify the verdict before consensus is reached.',
  },
];

/* ───────── component ───────── */
export default function App() {
  /* ---- wallet & data state ---- */
  const [account, setAccount] = useState('');
  const [promises, setPromises] = useState<PromiseData[]>([]);
  const [selected, setSelected] = useState<PromiseData | null>(null);
  const [myBets, setMyBets] = useState<MyBets | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [error, setError] = useState('');

  /* ---- form state ---- */
  const [formName, setFormName] = useState('');
  const [formPromise, setFormPromise] = useState('');
  const [formDeadline, setFormDeadline] = useState('');
  const [formSource, setFormSource] = useState('');
  const [formVerify, setFormVerify] = useState('');
  const [formBond, setFormBond] = useState('1000');
  const [betAmount, setBetAmount] = useState('500');

  /* ---- UI state ---- */
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  /* ──────── wallet ──────── */
  const handleConnect = async () => {
    try {
      const addr = await connectWallet();
      setAccount(addr);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to connect wallet');
    }
  };

  /* ──────── data loading ──────── */
  const loadPromises = useCallback(async () => {
    if (!account) return;
    try {
      const client = getClient(account);
      const countRaw = await client.readContract({
        address: CONTRACT_ADDRESS as any,
        functionName: 'get_promise_count',
        args: [],
      });
      const count = parseInt(String(countRaw), 10);
      const items: PromiseData[] = [];
      for (let i = 0; i < count; i++) {
        const raw = await client.readContract({
          address: CONTRACT_ADDRESS as any,
          functionName: 'get_promise',
          args: [String(i)],
        });
        items.push(JSON.parse(String(raw)));
      }
      setPromises(items);
    } catch (err: any) {
      console.error('Load error:', err);
    }
  }, [account]);

  useEffect(() => {
    if (account) loadPromises();
  }, [account, loadPromises]);

  const loadMyBets = async (promiseId: string) => {
    if (!account) return;
    try {
      const client = getClient(account);
      const raw = await client.readContract({
        address: CONTRACT_ADDRESS as any,
        functionName: 'get_my_bets',
        args: [promiseId, account],
      });
      setMyBets(JSON.parse(String(raw)));
    } catch {
      setMyBets(null);
    }
  };

  const selectPromise = (p: PromiseData) => {
    setSelected(p);
    loadMyBets(p.id);
  };

  /* ──────── transactions ──────── */
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account) return;
    setLoading(true);
    setLoadingMsg('Creating promise on-chain...');
    setError('');
    try {
      const client = getClient(account);
      await client.writeContract({
        address: CONTRACT_ADDRESS as any,
        functionName: 'create_promise',
        args: [formName, formPromise, formDeadline, formSource, formVerify || ''],
        value: BigInt(formBond),
      });
      setFormName('');
      setFormPromise('');
      setFormDeadline('');
      setFormSource('');
      setFormVerify('');
      setFormBond('1000');
      await loadPromises();
    } catch (err: any) {
      setError(err.message || 'Transaction failed');
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  };

  const handleBet = async (side: 'kept' | 'broken') => {
    if (!account || !selected) return;
    setLoading(true);
    setLoadingMsg(`Placing bet on ${side.toUpperCase()}...`);
    setError('');
    try {
      const client = getClient(account);
      await client.writeContract({
        address: CONTRACT_ADDRESS as any,
        functionName: side === 'kept' ? 'bet_kept' : 'bet_broken',
        args: [selected.id],
        value: BigInt(betAmount),
      });
      await loadPromises();
      await loadMyBets(selected.id);
      const updated = promises.find((p) => p.id === selected.id);
      if (updated) setSelected(updated);
    } catch (err: any) {
      setError(err.message || 'Bet failed');
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  };

  const handleResolve = async () => {
    if (!account || !selected) return;
    setLoading(true);
    setLoadingMsg('The oracle is consulting its sources...');
    setError('');
    try {
      const client = getClient(account);
      await client.writeContract({
        address: CONTRACT_ADDRESS as any,
        functionName: 'resolve',
        args: [selected.id],
        value: BigInt(0),
      });
      await loadPromises();
      await loadMyBets(selected.id);
    } catch (err: any) {
      setError(err.message || 'Resolve failed');
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  };

  const handleClaim = async () => {
    if (!account || !selected) return;
    setLoading(true);
    setLoadingMsg('Claiming winnings...');
    setError('');
    try {
      const client = getClient(account);
      await client.writeContract({
        address: CONTRACT_ADDRESS as any,
        functionName: 'claim_winnings',
        args: [selected.id],
        value: BigInt(0),
      });
      await loadPromises();
      await loadMyBets(selected.id);
    } catch (err: any) {
      setError(err.message || 'Claim failed');
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  };

  /* ──────── helpers ──────── */
  const verdictClass = (v: string) => {
    if (v === 'KEPT') return 'verdict-kept';
    if (v === 'BROKEN') return 'verdict-broken';
    if (v === 'PARTIAL') return 'verdict-partial';
    return 'verdict-unknown';
  };

  const poolBar = (kept: string, broken: string) => {
    const k = parseInt(kept, 10) || 0;
    const b = parseInt(broken, 10) || 0;
    const total = k + b;
    if (total === 0) return null;
    const kPct = Math.round((k / total) * 100);
    return (
      <div className="pool-bar">
        <div className="pool-kept" style={{ width: `${kPct}%` }}>
          {kPct > 15 && `KEPT ${kPct}%`}
        </div>
        <div className="pool-broken" style={{ width: `${100 - kPct}%` }}>
          {100 - kPct > 15 && `BROKEN ${100 - kPct}%`}
        </div>
      </div>
    );
  };

  /* derived stats */
  const totalPool = promises.reduce(
    (sum, p) => sum + (parseInt(p.pool_kept, 10) || 0) + (parseInt(p.pool_broken, 10) || 0),
    0,
  );
  const resolvedCount = promises.filter((p) => p.status === 'RESOLVED').length;
  const resolvedPromises = promises.filter((p) => p.status === 'RESOLVED');

  /* smooth-scroll helper for CTA buttons */
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  /* ──────── RENDER ──────── */
  return (
    <div className="app-root">
      {/* ===== NAVBAR ===== */}
      <nav className="navbar">
        <div className="navbar-inner">
          <a href="#" className="navbar-brand" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
            <img src="/logo.svg" alt="Logo" />
            <span>Oracle of Broken Promises</span>
          </a>

          <ul className={`navbar-links${mobileMenuOpen ? ' mobile-open' : ''}`}>
            <li><a href="#problem" onClick={() => setMobileMenuOpen(false)}>Problem</a></li>
            <li><a href="#how-it-works" onClick={() => setMobileMenuOpen(false)}>How it Works</a></li>
            <li><a href="#market" onClick={() => setMobileMenuOpen(false)}>Market</a></li>
            <li><a href="#architecture" onClick={() => setMobileMenuOpen(false)}>Architecture</a></li>
            <li><a href="#faq" onClick={() => setMobileMenuOpen(false)}>FAQ</a></li>
          </ul>

          <div className="navbar-right">
            {account ? (
              <div className="wallet-info">
                <span className="network-badge">GEN Studionet</span>
                <span className="address">
                  {account.slice(0, 6)}...{account.slice(-4)}
                </span>
              </div>
            ) : (
              <button onClick={handleConnect} className="btn-connect">
                Connect Wallet
              </button>
            )}
            <button
              className="mobile-menu-btn"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Menu"
            >
              {mobileMenuOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>
      </nav>

      {/* ===== ERROR BANNER ===== */}
      {error && <div className="error-banner">{error}</div>}

      {/* ===== LOADING OVERLAY ===== */}
      {loading && (
        <div className="loading-overlay">
          <div className="spinner" />
          <p>{loadingMsg}</p>
        </div>
      )}

      {/* ===== HERO ===== */}
      <section className="hero">
        <div className="hero-inner">
          <p className="section-label">On-Chain Prediction Market</p>
          <h1 className="hero-title">
            <span className="gradient-text">Promise Prediction Market</span>
          </h1>
          <p className="hero-subtitle">
            Bet on accountability. AI reads the evidence. Winners take the pool.
          </p>

          <div className="hero-actions">
            <button className="btn-hero-primary" onClick={() => scrollTo('market')}>
              Post a Promise
            </button>
            <a href="#how-it-works" className="btn-hero-secondary">
              Learn More
            </a>
          </div>

          <div className="hero-stats">
            <div className="stat-card">
              <span className="stat-value">{promises.length}</span>
              <span className="stat-label">Total Promises</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{resolvedCount}</span>
              <span className="stat-label">Resolved</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">
                {totalPool.toLocaleString()}
              </span>
              <span className="stat-label">Total Pool (GEN)</span>
            </div>
          </div>
        </div>
      </section>

      {/* ===== PROBLEM ===== */}
      <section id="problem" className="section">
        <div className="section-inner text-center">
          <p className="section-label">The Problem</p>
          <h2 className="section-title">
            <span className="gradient-text">Why Promises Go Unchecked</span>
          </h2>
          <p className="section-subtitle centered">
            Public figures make bold claims. Most are never tracked, verified, or enforced.
          </p>

          <div className="problem-grid">
            <div className="problem-card">
              <div className="problem-icon">W</div>
              <h3>Empty Words</h3>
              <p>
                Politicians, executives, and public figures make promises every day. Most vanish from the news
                cycle within a week, never to be tracked or remembered.
              </p>
            </div>
            <div className="problem-card">
              <div className="problem-icon">0</div>
              <h3>No Consequences</h3>
              <p>
                Broken promises cost nothing. Without financial stakes, there is no incentive
                to follow through and no penalty for failure.
              </p>
            </div>
            <div className="problem-card">
              <div className="problem-icon">?</div>
              <h3>No Verification</h3>
              <p>
                Who checks if a promise was kept? Subjective opinions dominate. There is no
                systematic, trustless method to verify outcomes.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section id="how-it-works" className="section">
        <div className="section-inner text-center">
          <p className="section-label">Process</p>
          <h2 className="section-title">
            <span className="gradient-text">How It Works</span>
          </h2>
          <p className="section-subtitle centered">
            Five steps from promise to payout, powered by AI consensus on GenLayer.
          </p>

          <div className="steps-row">
            <div className="step-card">
              <div className="step-number">1</div>
              <h3>Post</h3>
              <p>Record a public figure's promise with the source URL and a deadline.</p>
            </div>
            <div className="step-card">
              <div className="step-number">2</div>
              <h3>Bet</h3>
              <p>Stake GEN tokens on whether the promise will be KEPT or BROKEN.</p>
            </div>
            <div className="step-card">
              <div className="step-number">3</div>
              <h3>Resolve</h3>
              <p>AI fetches live evidence from the web. Validators reach independent consensus.</p>
            </div>
            <div className="step-card">
              <div className="step-number">4</div>
              <h3>Verdict</h3>
              <p>The oracle delivers: KEPT, BROKEN, PARTIAL, or UNRESOLVABLE.</p>
            </div>
            <div className="step-card">
              <div className="step-number">5</div>
              <h3>Claim</h3>
              <p>Winners split the losing pool proportionally to their stake.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== MARKET ===== */}
      <section id="market" className="section market-section">
        <div className="section-inner">
          <div className="text-center" style={{ marginBottom: 48 }}>
            <p className="section-label">Prediction Market</p>
            <h2 className="section-title">
              <span className="gradient-text">Promise Market</span>
            </h2>
            <p className="section-subtitle centered">
              {promises.length} promise{promises.length !== 1 ? 's' : ''} tracked on-chain.
              {!account && ' Connect your wallet to participate.'}
            </p>
          </div>

          {/* -- Create Form -- */}
          <div className="create-form-wrapper">
            <h3>Create a Promise</h3>
            <form onSubmit={handleCreate}>
              <div className="form-row">
                <input
                  placeholder="Who promised? (e.g. Mayor Johnson)"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                />
                <input
                  placeholder="Deadline (YYYY-MM-DD)"
                  type="date"
                  value={formDeadline}
                  onChange={(e) => setFormDeadline(e.target.value)}
                  required
                />
              </div>
              <textarea
                placeholder="What did they promise? Quote their exact words."
                value={formPromise}
                onChange={(e) => setFormPromise(e.target.value)}
                required
                rows={3}
              />
              <div className="form-row">
                <input
                  placeholder="Source URL (where the promise was made)"
                  value={formSource}
                  onChange={(e) => setFormSource(e.target.value)}
                  required
                />
                <input
                  placeholder="Verification URL (optional)"
                  value={formVerify}
                  onChange={(e) => setFormVerify(e.target.value)}
                />
              </div>
              <div className="form-footer">
                <input
                  type="number"
                  placeholder="Initial bet (GEN)"
                  value={formBond}
                  onChange={(e) => setFormBond(e.target.value)}
                  min="100"
                  required
                />
                <button type="submit" className="btn-primary" disabled={!account || loading}>
                  Post Promise
                </button>
              </div>
            </form>
          </div>

          {/* -- Two-column market -- */}
          <div className="market-layout">
            {/* Left: promise list */}
            <div>
              <div className="promises-list-header">
                <h3>Active Promises</h3>
                <span className="promise-count">{promises.length}</span>
              </div>

              {promises.length === 0 && account && (
                <p className="empty">No promises yet. Be the first oracle.</p>
              )}
              {!account && (
                <p className="empty">Connect wallet to view promises.</p>
              )}

              <div className="promises-scroll">
                {promises.map((p) => (
                  <div
                    key={p.id}
                    className={`promise-card${selected?.id === p.id ? ' selected' : ''}`}
                    onClick={() => selectPromise(p)}
                  >
                    <div className="card-header">
                      <span className="promiser">{p.promiser_name}</span>
                      <span className={`status-badge status-${p.status.toLowerCase()}`}>
                        {p.status}
                      </span>
                    </div>
                    <p className="promise-text">&ldquo;{p.promise_text}&rdquo;</p>
                    <div className="card-meta">
                      <span>Deadline: {p.deadline}</span>
                      <span>
                        Pool:{' '}
                        {(
                          (parseInt(p.pool_kept, 10) || 0) +
                          (parseInt(p.pool_broken, 10) || 0)
                        ).toLocaleString()}{' '}
                        GEN
                      </span>
                    </div>
                    {poolBar(p.pool_kept, p.pool_broken)}
                    {p.status === 'RESOLVED' && (
                      <div className={`verdict-badge ${verdictClass(p.verdict)}`}>
                        {p.verdict}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Right: detail panel */}
            <div className="detail-panel">
              {selected ? (
                <div className="detail-card">
                  <h3>Promise #{selected.id}</h3>

                  <div className="detail-row">
                    <label>Promiser</label>
                    <span>{selected.promiser_name}</span>
                  </div>
                  <div className="detail-row">
                    <label>Promise</label>
                    <span>&ldquo;{selected.promise_text}&rdquo;</span>
                  </div>
                  <div className="detail-row">
                    <label>Deadline</label>
                    <span>{selected.deadline}</span>
                  </div>
                  <div className="detail-row">
                    <label>Source</label>
                    <a href={selected.source_url} target="_blank" rel="noreferrer">
                      {selected.source_url}
                    </a>
                  </div>
                  {selected.verification_url && (
                    <div className="detail-row">
                      <label>Verification</label>
                      <a href={selected.verification_url} target="_blank" rel="noreferrer">
                        {selected.verification_url}
                      </a>
                    </div>
                  )}
                  <div className="detail-row">
                    <label>Pool KEPT</label>
                    <span className="amount-kept">
                      {(parseInt(selected.pool_kept, 10) || 0).toLocaleString()} GEN
                    </span>
                  </div>
                  <div className="detail-row">
                    <label>Pool BROKEN</label>
                    <span className="amount-broken">
                      {(parseInt(selected.pool_broken, 10) || 0).toLocaleString()} GEN
                    </span>
                  </div>

                  {poolBar(selected.pool_kept, selected.pool_broken)}

                  {selected.status === 'RESOLVED' && (
                    <>
                      <div className={`verdict-banner ${verdictClass(selected.verdict)}`}>
                        Verdict: {selected.verdict}
                      </div>
                      <div className="reason-box">
                        <label>AI Reasoning</label>
                        <p>{selected.reason}</p>
                      </div>
                    </>
                  )}

                  {myBets && (
                    <div className="my-bets">
                      <label>Your Bets</label>
                      <span>
                        KEPT: {(parseInt(myBets.kept, 10) || 0).toLocaleString()} GEN | BROKEN:{' '}
                        {(parseInt(myBets.broken, 10) || 0).toLocaleString()} GEN
                      </span>
                    </div>
                  )}

                  {selected.status === 'OPEN' && (
                    <div className="actions">
                      <div className="bet-row">
                        <input
                          type="number"
                          value={betAmount}
                          onChange={(e) => setBetAmount(e.target.value)}
                          min="100"
                          placeholder="Bet amount"
                        />
                        <button
                          onClick={() => handleBet('kept')}
                          className="btn-kept"
                          disabled={loading}
                        >
                          Bet KEPT
                        </button>
                        <button
                          onClick={() => handleBet('broken')}
                          className="btn-broken"
                          disabled={loading}
                        >
                          Bet BROKEN
                        </button>
                      </div>
                      <button
                        onClick={handleResolve}
                        className="btn-resolve"
                        disabled={loading}
                      >
                        Resolve Promise
                      </button>
                    </div>
                  )}

                  {selected.status === 'RESOLVED' && (
                    <button onClick={handleClaim} className="btn-claim" disabled={loading}>
                      Claim Winnings
                    </button>
                  )}

                  <a
                    className="explorer-link"
                    href={`https://explorer-studio.genlayer.com/address/${CONTRACT_ADDRESS}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View on Explorer
                  </a>
                </div>
              ) : (
                <div className="no-selection">
                  <div className="no-selection-icon">&larr;</div>
                  <p>Select a promise to view details and place bets.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ===== VERDICTS SHOWCASE ===== */}
      <section id="verdicts" className="section">
        <div className="section-inner text-center">
          <p className="section-label">Results</p>
          <h2 className="section-title">
            <span className="gradient-text">Oracle Verdicts</span>
          </h2>
          <p className="section-subtitle centered">
            Promises resolved by on-chain AI consensus. Each verdict is backed by evidence and multi-validator verification.
          </p>

          {resolvedPromises.length > 0 ? (
            <div className="verdicts-grid">
              {resolvedPromises.map((p) => {
                const k = parseInt(p.pool_kept, 10) || 0;
                const b = parseInt(p.pool_broken, 10) || 0;
                return (
                  <div key={p.id} className="verdict-showcase-card">
                    <div className="verdict-showcase-header">
                      <span className="promiser">{p.promiser_name}</span>
                      <span className={`verdict-badge ${verdictClass(p.verdict)}`}>
                        {p.verdict}
                      </span>
                    </div>
                    <p className="verdict-showcase-text">
                      &ldquo;{p.promise_text}&rdquo;
                    </p>
                    {poolBar(p.pool_kept, p.pool_broken)}
                    <div style={{ marginTop: 12, marginBottom: 12, fontSize: '0.8rem', color: '#888' }}>
                      Pool: {(k + b).toLocaleString()} GEN
                    </div>
                    {p.reason && (
                      <div className="verdict-reasoning">{p.reason}</div>
                    )}
                    <p className="verdict-footer">
                      Verdict delivered by on-chain AI consensus
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="verdicts-empty">
              No verdicts yet. Promises will appear here once resolved by the oracle.
            </p>
          )}
        </div>
      </section>

      {/* ===== ARCHITECTURE ===== */}
      <section id="architecture" className="section">
        <div className="section-inner text-center">
          <p className="section-label">Under the Hood</p>
          <h2 className="section-title">
            <span className="gradient-text">Architecture</span>
          </h2>
          <p className="section-subtitle centered">
            How the oracle resolves promises using GenLayer's intelligent contract primitives.
          </p>

          <div className="arch-pipeline">
            <div className="arch-pipeline-step">Promise posted</div>
            <span className="arch-pipeline-arrow">&rarr;</span>
            <div className="arch-pipeline-step">Deadline passes</div>
            <span className="arch-pipeline-arrow">&rarr;</span>
            <div className="arch-pipeline-step">Contract fetches URLs</div>
            <span className="arch-pipeline-arrow">&rarr;</span>
            <div className="arch-pipeline-step">LLM judges</div>
            <span className="arch-pipeline-arrow">&rarr;</span>
            <div className="arch-pipeline-step">Validators verify</div>
            <span className="arch-pipeline-arrow">&rarr;</span>
            <div className="arch-pipeline-step">Consensus verdict</div>
            <span className="arch-pipeline-arrow">&rarr;</span>
            <div className="arch-pipeline-step">Payout</div>
          </div>

          <div className="tech-cards">
            <div className="tech-card">
              <span className="tech-card-label">gl.nondet.web.render</span>
              <h3>Live Web Data</h3>
              <p>
                The contract reads live news articles and web pages on-chain. No off-chain oracle
                needed -- the blockchain fetches the evidence directly.
              </p>
            </div>
            <div className="tech-card">
              <span className="tech-card-label">gl.nondet.exec_prompt</span>
              <h3>LLM Judgment</h3>
              <p>
                An LLM evaluates the promise text against fetched evidence. It determines whether
                the promise was kept, broken, partially fulfilled, or unresolvable.
              </p>
            </div>
            <div className="tech-card">
              <span className="tech-card-label">gl.vm.run_nondet</span>
              <h3>Validator Consensus</h3>
              <p>
                Multiple validators independently run the same evaluation. The final verdict
                requires consensus, preventing any single point of manipulation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== USE CASES ===== */}
      <section id="use-cases" className="section">
        <div className="section-inner text-center">
          <p className="section-label">Applications</p>
          <h2 className="section-title">
            <span className="gradient-text">Use Cases</span>
          </h2>
          <p className="section-subtitle centered">
            Any public promise with verifiable evidence can become a prediction market.
          </p>

          <div className="use-cases-grid">
            <div className="use-case-card">
              <div className="use-case-icon">P</div>
              <h3>Political Promises</h3>
              <p>
                Track election pledges, legislative commitments, and policy promises with
                real financial stakes.
              </p>
            </div>
            <div className="use-case-card">
              <div className="use-case-icon">C</div>
              <h3>Corporate Commitments</h3>
              <p>
                Hold companies accountable for sustainability goals, product launches,
                and shareholder commitments.
              </p>
            </div>
            <div className="use-case-card">
              <div className="use-case-icon">T</div>
              <h3>Tech Industry</h3>
              <p>
                Bet on product release dates, feature rollouts, and technology roadmap
                milestones from major tech companies.
              </p>
            </div>
            <div className="use-case-card">
              <div className="use-case-icon">S</div>
              <h3>Social Pledges</h3>
              <p>
                Verify public commitments from influencers, organizations, and community leaders
                with transparent outcomes.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section id="faq" className="section">
        <div className="section-inner text-center">
          <p className="section-label">Questions</p>
          <h2 className="section-title">
            <span className="gradient-text">FAQ</span>
          </h2>
          <p className="section-subtitle centered">
            Common questions about the Oracle of Broken Promises.
          </p>

          <div className="faq-list">
            {FAQ_ITEMS.map((item, idx) => (
              <div key={idx} className={`faq-item${openFaq === idx ? ' open' : ''}`}>
                <button
                  className="faq-question"
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                >
                  <span>{item.q}</span>
                  <span className="faq-toggle">+</span>
                </button>
                {openFaq === idx && <div className="faq-answer">{item.a}</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== HOW TO USE ===== */}
      <section id="how-to-use" className="section how-to-use-section">
        <div className="section-inner">
          <div className="text-center" style={{ marginBottom: 48 }}>
            <p className="section-label">Getting Started</p>
            <h2 className="section-title">
              <span className="gradient-text">How to Use</span>
            </h2>
            <p className="section-subtitle centered">
              Follow these steps to start tracking and betting on public promises.
            </p>
          </div>

          <div className="how-to-grid">
            <div className="how-to-steps">
              <div className="how-to-step">
                <div className="how-to-number">1</div>
                <div>
                  <h4>Install MetaMask</h4>
                  <p>
                    Install the MetaMask browser extension from{' '}
                    <a href="https://metamask.io" target="_blank" rel="noreferrer">
                      metamask.io
                    </a>
                    . Create or import a wallet.
                  </p>
                </div>
              </div>
              <div className="how-to-step">
                <div className="how-to-number">2</div>
                <div>
                  <h4>Connect to Studionet</h4>
                  <p>
                    Click "Connect Wallet" above. The app will automatically add GenLayer
                    Studionet to your MetaMask networks.
                  </p>
                </div>
              </div>
              <div className="how-to-step">
                <div className="how-to-number">3</div>
                <div>
                  <h4>Get GEN Tokens</h4>
                  <p>
                    Visit GenLayer Studio to get test GEN tokens for Studionet. You need GEN
                    to create promises and place bets.
                  </p>
                </div>
              </div>
              <div className="how-to-step">
                <div className="how-to-number">4</div>
                <div>
                  <h4>Post or Bet</h4>
                  <p>
                    Create a new promise with a source URL, or browse existing promises and
                    place your bets on KEPT or BROKEN.
                  </p>
                </div>
              </div>
              <div className="how-to-step">
                <div className="how-to-number">5</div>
                <div>
                  <h4>Resolve and Claim</h4>
                  <p>
                    Once the deadline passes, trigger resolution. The AI oracle evaluates
                    the evidence. If you bet correctly, claim your winnings.
                  </p>
                </div>
              </div>
            </div>

            <div className="how-to-prereqs">
              <h3>Prerequisites</h3>
              <div className="prereq-item">
                <span className="prereq-check">*</span>
                <div>
                  <h4>MetaMask Wallet</h4>
                  <p>Browser extension for managing your wallet and signing transactions.</p>
                  <a href="https://metamask.io" target="_blank" rel="noreferrer">
                    metamask.io
                  </a>
                </div>
              </div>
              <div className="prereq-item">
                <span className="prereq-check">*</span>
                <div>
                  <h4>GEN Tokens on Studionet</h4>
                  <p>Test tokens for creating promises and placing bets on the studio network.</p>
                  <a href="https://studio.genlayer.com" target="_blank" rel="noreferrer">
                    GenLayer Studio
                  </a>
                </div>
              </div>
              <div className="prereq-item">
                <span className="prereq-check">*</span>
                <div>
                  <h4>GenLayer Studio</h4>
                  <p>Dashboard for managing contracts, validators, and test tokens.</p>
                  <a href="https://studio.genlayer.com" target="_blank" rel="noreferrer">
                    studio.genlayer.com
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-grid">
            <div className="footer-brand">
              <div className="footer-brand-name">
                <img src="/logo.svg" alt="Logo" />
                <span>Oracle of Broken Promises</span>
              </div>
              <p className="footer-tagline">
                A promise prediction market powered by GenLayer's AI consensus.
                Bet on accountability. Get paid for being right.
              </p>
            </div>

            <div className="footer-col">
              <h4>Product</h4>
              <ul>
                <li><a href="#market">Post Promise</a></li>
                <li><a href="#market">Place Bets</a></li>
                <li><a href="#how-it-works">How It Works</a></li>
              </ul>
            </div>

            <div className="footer-col">
              <h4>Resources</h4>
              <ul>
                <li>
                  <a href="https://github.com/phu1271997" target="_blank" rel="noreferrer">
                    GitHub
                  </a>
                </li>
                <li>
                  <a href="https://docs.genlayer.com" target="_blank" rel="noreferrer">
                    GenLayer Docs
                  </a>
                </li>
                <li>
                  <a href="https://explorer-studio.genlayer.com" target="_blank" rel="noreferrer">
                    Explorer
                  </a>
                </li>
              </ul>
            </div>

            <div className="footer-col">
              <h4>Network</h4>
              <ul>
                <li>
                  <a href="https://studio.genlayer.com" target="_blank" rel="noreferrer">
                    Studionet
                  </a>
                </li>
                <li>
                  <a
                    href={`https://explorer-studio.genlayer.com/address/${CONTRACT_ADDRESS}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Contract: {CONTRACT_ADDRESS ? `${CONTRACT_ADDRESS.slice(0, 6)}...${CONTRACT_ADDRESS.slice(-4)}` : 'Not set'}
                  </a>
                </li>
                <li>
                  <a href="https://genlayer.com" target="_blank" rel="noreferrer">
                    GenLayer.com
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="footer-bottom">
            <span>
              Powered by{' '}
              <a href="https://genlayer.com" target="_blank" rel="noreferrer">
                GenLayer
              </a>
            </span>
            <span>{new Date().getFullYear()} Oracle of Broken Promises</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
