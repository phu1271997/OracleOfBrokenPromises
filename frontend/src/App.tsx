import { useState, useEffect, useCallback } from 'react';
import { connectWallet, getClient, CONTRACT_ADDRESS } from './config';

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

function App() {
  const [account, setAccount] = useState('');
  const [promises, setPromises] = useState<PromiseData[]>([]);
  const [selected, setSelected] = useState<PromiseData | null>(null);
  const [myBets, setMyBets] = useState<MyBets | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [error, setError] = useState('');

  const [formName, setFormName] = useState('');
  const [formPromise, setFormPromise] = useState('');
  const [formDeadline, setFormDeadline] = useState('');
  const [formSource, setFormSource] = useState('');
  const [formVerify, setFormVerify] = useState('');
  const [formBond, setFormBond] = useState('1000');
  const [betAmount, setBetAmount] = useState('500');

  const handleConnect = async () => {
    try {
      const addr = await connectWallet();
      setAccount(addr);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to connect wallet');
    }
  };

  const loadPromises = useCallback(async () => {
    if (!account) return;
    try {
      const client = getClient(account);
      const countRaw = await client.readContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        functionName: 'get_promise_count',
        args: [],
      });
      const count = parseInt(String(countRaw), 10);
      const items: PromiseData[] = [];
      for (let i = 0; i < count; i++) {
        const raw = await client.readContract({
          address: CONTRACT_ADDRESS as `0x${string}`,
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
        address: CONTRACT_ADDRESS as `0x${string}`,
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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account) return;
    setLoading(true);
    setLoadingMsg('Creating promise on-chain...');
    setError('');
    try {
      const client = getClient(account);
      await client.writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        functionName: 'create_promise',
        args: [formName, formPromise, formDeadline, formSource, formVerify || ''],
        value: BigInt(formBond),
      });
      setFormName(''); setFormPromise(''); setFormDeadline('');
      setFormSource(''); setFormVerify(''); setFormBond('1000');
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
        address: CONTRACT_ADDRESS as `0x${string}`,
        functionName: side === 'kept' ? 'bet_kept' : 'bet_broken',
        args: [selected.id],
        value: BigInt(betAmount),
      });
      await loadPromises();
      await loadMyBets(selected.id);
      const updated = promises.find(p => p.id === selected.id);
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
        address: CONTRACT_ADDRESS as `0x${string}`,
        functionName: 'resolve',
        args: [selected.id],
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
        address: CONTRACT_ADDRESS as `0x${string}`,
        functionName: 'claim_winnings',
        args: [selected.id],
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
          {(100 - kPct) > 15 && `BROKEN ${100 - kPct}%`}
        </div>
      </div>
    );
  };

  const verdictClass = (v: string) => {
    if (v === 'KEPT') return 'verdict-kept';
    if (v === 'BROKEN') return 'verdict-broken';
    if (v === 'PARTIAL') return 'verdict-partial';
    return 'verdict-unknown';
  };

  return (
    <div className="app">
      <header>
        <div className="header-left">
          <h1>Oracle of Broken Promises</h1>
          <p className="subtitle">Bet on accountability. Get paid for being right.</p>
        </div>
        <div className="header-right">
          {account ? (
            <div className="wallet-info">
              <span className="network-badge">GEN Studionet</span>
              <span className="address">{account.slice(0, 6)}...{account.slice(-4)}</span>
            </div>
          ) : (
            <button onClick={handleConnect} className="btn-connect">Connect Wallet</button>
          )}
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      {loading && (
        <div className="loading-overlay">
          <div className="spinner" />
          <p>{loadingMsg}</p>
        </div>
      )}

      <main>
        <section className="create-section">
          <h2>Create a Promise</h2>
          <form onSubmit={handleCreate}>
            <div className="form-row">
              <input placeholder="Who promised? (e.g. Mayor Johnson)" value={formName} onChange={e => setFormName(e.target.value)} required />
              <input placeholder="Deadline (YYYY-MM-DD)" type="date" value={formDeadline} onChange={e => setFormDeadline(e.target.value)} required />
            </div>
            <textarea placeholder="What did they promise? Quote their words." value={formPromise} onChange={e => setFormPromise(e.target.value)} required rows={3} />
            <div className="form-row">
              <input placeholder="Source URL (where promise was made)" value={formSource} onChange={e => setFormSource(e.target.value)} required />
              <input placeholder="Verification URL (optional)" value={formVerify} onChange={e => setFormVerify(e.target.value)} />
            </div>
            <div className="form-row">
              <input type="number" placeholder="Initial bet (GEN)" value={formBond} onChange={e => setFormBond(e.target.value)} min="100" required />
              <button type="submit" className="btn-primary" disabled={!account || loading}>Post Promise</button>
            </div>
          </form>
        </section>

        <div className="content-grid">
          <section className="promises-list">
            <h2>Active Promises ({promises.length})</h2>
            {promises.length === 0 && account && <p className="empty">No promises yet. Be the first oracle.</p>}
            {!account && <p className="empty">Connect wallet to view promises.</p>}
            {promises.map(p => (
              <div key={p.id} className={`promise-card ${selected?.id === p.id ? 'selected' : ''}`} onClick={() => selectPromise(p)}>
                <div className="card-header">
                  <span className="promiser">{p.promiser_name}</span>
                  <span className={`status-badge status-${p.status.toLowerCase()}`}>{p.status}</span>
                </div>
                <p className="promise-text">"{p.promise_text}"</p>
                <div className="card-meta">
                  <span>Deadline: {p.deadline}</span>
                  <span>Pool: {(parseInt(p.pool_kept) + parseInt(p.pool_broken)).toLocaleString()} GEN</span>
                </div>
                {poolBar(p.pool_kept, p.pool_broken)}
                {p.status === 'RESOLVED' && (
                  <div className={`verdict-badge ${verdictClass(p.verdict)}`}>{p.verdict}</div>
                )}
              </div>
            ))}
          </section>

          <section className="promise-detail">
            {selected ? (
              <>
                <h2>Promise #{selected.id}</h2>
                <div className="detail-card">
                  <div className="detail-row">
                    <label>Promiser</label>
                    <span>{selected.promiser_name}</span>
                  </div>
                  <div className="detail-row">
                    <label>Promise</label>
                    <span>"{selected.promise_text}"</span>
                  </div>
                  <div className="detail-row">
                    <label>Deadline</label>
                    <span>{selected.deadline}</span>
                  </div>
                  <div className="detail-row">
                    <label>Source</label>
                    <a href={selected.source_url} target="_blank" rel="noreferrer">{selected.source_url}</a>
                  </div>
                  {selected.verification_url && (
                    <div className="detail-row">
                      <label>Verification</label>
                      <a href={selected.verification_url} target="_blank" rel="noreferrer">{selected.verification_url}</a>
                    </div>
                  )}
                  <div className="detail-row">
                    <label>Pool KEPT</label>
                    <span className="amount-kept">{parseInt(selected.pool_kept).toLocaleString()} GEN</span>
                  </div>
                  <div className="detail-row">
                    <label>Pool BROKEN</label>
                    <span className="amount-broken">{parseInt(selected.pool_broken).toLocaleString()} GEN</span>
                  </div>

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
                      <span>KEPT: {parseInt(myBets.kept).toLocaleString()} GEN | BROKEN: {parseInt(myBets.broken).toLocaleString()} GEN</span>
                    </div>
                  )}

                  {selected.status === 'OPEN' && (
                    <div className="actions">
                      <div className="bet-row">
                        <input type="number" value={betAmount} onChange={e => setBetAmount(e.target.value)} min="100" placeholder="Bet amount" />
                        <button onClick={() => handleBet('kept')} className="btn-kept" disabled={loading}>Bet KEPT</button>
                        <button onClick={() => handleBet('broken')} className="btn-broken" disabled={loading}>Bet BROKEN</button>
                      </div>
                      <button onClick={handleResolve} className="btn-resolve" disabled={loading}>Resolve Promise</button>
                    </div>
                  )}

                  {selected.status === 'RESOLVED' && (
                    <button onClick={handleClaim} className="btn-claim" disabled={loading}>Claim Winnings</button>
                  )}

                  <a className="explorer-link" href={`https://genlayer-explorer.vercel.app`} target="_blank" rel="noreferrer">
                    View on Explorer
                  </a>
                </div>
              </>
            ) : (
              <div className="no-selection">
                <p>Select a promise to view details and place bets.</p>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

export default App;
