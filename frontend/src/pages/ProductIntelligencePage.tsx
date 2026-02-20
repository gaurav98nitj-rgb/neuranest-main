import React, { useState, useRef, useEffect } from 'react';

// ---------------------------------------------------------------------------
// Types (extended for real data)
// ---------------------------------------------------------------------------
interface TrendingIdea {
  idea: string;
  description: string;
  searchGrowth: number;
  redditBuzz: number;
  tiktokMentions: string;
  stage: 'Emerging' | 'Rising' | 'Peak' | 'Declining';
  category: string;
  competition: 'Low' | 'Medium' | 'High';
  // New fields from real data
  topic_id?: string | null;
  opportunity_score?: number | null;
  ba_best_rank?: number | null;
  google_trends_current?: number | null;
  data_source?: 'real' | 'ai';
}

interface Competitor {
  product: string;
  brand: string;
  price: string;
  rating: number;
  reviews: number;
  monthlySales: string;
  bsr: number;
  mainFeatures: string[];
  weakness: string;
  data_source?: 'real' | 'ai';
}

interface GenNextProduct {
  productName: string;
  tagline: string;
  category: string;
  targetPrice: string;
  estimatedMonthlySales: string;
  salesPotential: number;
  whiteSpace: string;
  keyFeatures: string[];
  ingredients_or_specs: string[];
  targetAudience: string;
  differentiator: string;
  launchDifficulty: 'Easy' | 'Medium' | 'Hard';
  confidenceScore: number;
}

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------
const API_BASE = '/api/v1/product-intelligence';

async function apiPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(err.detail || `API error ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
const STAGES = ['Search', 'Select Ideas', 'Competitors', 'Gen-Next Products'];
const STAGE_COLORS = ['#E8714A', '#1A8754', '#D4930D', '#7C3AED'];

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, color, background: `${color}18`, letterSpacing: '0.02em' }}>
      {children}
    </span>
  );
}

function DataSourceBadge({ source }: { source?: string }) {
  if (source === 'real') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 10, fontSize: 9, fontWeight: 700, background: '#E8F5EE', color: '#1A8754', border: '1px solid #1A875422', letterSpacing: '0.04em' }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#1A8754' }} />
        REAL DATA
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 10, fontSize: 9, fontWeight: 700, background: '#F3EEFF', color: '#7C3AED', border: '1px solid #7C3AED22', letterSpacing: '0.04em' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#7C3AED' }} />
      AI
    </span>
  );
}

function GrowthBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min((Math.abs(value) / max) * 100, 100);
  const color = value > 70 ? '#1A8754' : value > 40 ? '#D4930D' : value > 0 ? '#E8714A' : '#C0392B';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: '#F0ECE6', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.6s ease' }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color, minWidth: 32 }}>{value > 0 ? '+' : ''}{value}%</span>
    </div>
  );
}

function Spinner({ text = 'Analyzing...' }: { text?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 60 }}>
      <div style={{ width: 24, height: 24, border: '3px solid rgba(232,113,74,0.15)', borderTopColor: '#E8714A', borderRadius: '50%', animation: 'nn-spin 0.8s linear infinite' }} />
      <span style={{ color: '#8B8479', fontSize: 15 }}>{text}</span>
    </div>
  );
}

function ScorePill({ score }: { score?: number | null }) {
  if (!score) return null;
  const color = score >= 70 ? '#1A8754' : score >= 50 ? '#D4930D' : '#8B8479';
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color, background: `${color}12`, border: `1px solid ${color}22` }}>
      {score.toFixed(1)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------
const ProductIntelligencePage: React.FC = () => {
  const [stage, setStage] = useState(0);
  const [seed, setSeed] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [trendingIdeas, setTrendingIdeas] = useState<TrendingIdea[]>([]);
  const [selectedIdeas, setSelectedIdeas] = useState<number[]>([]);
  const [competitors, setCompetitors] = useState<Record<string, Competitor[]>>({});
  const [genNextProducts, setGenNextProducts] = useState<GenNextProduct[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (stage === 0 && inputRef.current) inputRef.current.focus();
  }, [stage]);

  const handleSearch = async () => {
    if (!seed.trim()) return;
    setLoading(true);
    setError('');
    try {
      const ideas = await apiPost<TrendingIdea[]>('/search', { seed: seed.trim(), geo: 'US' });
      setTrendingIdeas(ideas);
      setStage(1);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch trends');
    }
    setLoading(false);
  };

  const toggleIdea = (idx: number) => {
    setSelectedIdeas((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : prev.length < 3 ? [...prev, idx] : prev
    );
  };

  const analyzeCompetitors = async () => {
    const niches = selectedIdeas.map((i) => trendingIdeas[i]?.idea).filter(Boolean);
    if (niches.length === 0) return;
    setLoading(true);
    setError('');
    setStage(2);
    try {
      const data = await apiPost<Record<string, Competitor[]>>('/competitors', { niches, geo: 'US' });
      setCompetitors(data);
    } catch (e: any) {
      setError(e.message || 'Failed to analyze competitors');
    }
    setLoading(false);
  };

  const generateGenNext = async () => {
    setLoading(true);
    setError('');
    setStage(3);
    try {
      const niches = selectedIdeas.map((i) => trendingIdeas[i]?.idea);
      const data = await apiPost<GenNextProduct[]>('/gen-next', { niches, competitors, geo: 'US' });
      setGenNextProducts(data);
    } catch (e: any) {
      setError(e.message || 'Failed to generate products');
    }
    setLoading(false);
  };

  const resetAll = () => {
    setStage(0); setSeed(''); setTrendingIdeas([]); setSelectedIdeas([]);
    setCompetitors({}); setGenNextProducts([]); setError('');
  };

  const stageColorMap: Record<string, string> = { Emerging: '#E8714A', Rising: '#1A8754', Peak: '#D4930D', Declining: '#C0392B' };
  const compColorMap: Record<string, string> = { Low: '#1A8754', Medium: '#D4930D', High: '#C0392B' };
  const difficultyColorMap: Record<string, string> = { Easy: '#1A8754', Medium: '#D4930D', Hard: '#C0392B' };

  // Count real vs AI results
  const realCount = trendingIdeas.filter(i => i.data_source === 'real').length;
  const aiCount = trendingIdeas.filter(i => i.data_source === 'ai').length;

  return (
    <div style={{ minHeight: '100vh', background: '#F9F7F4' }}>
      <style>{`
        @keyframes nn-spin { to { transform: rotate(360deg); } }
        @keyframes nn-fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @keyframes nn-scaleIn { from { opacity:0; transform:scale(0.96); } to { opacity:1; transform:scale(1); } }
      `}</style>

      {/* Progress Bar */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E6E1DA', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {STAGES.map((s, i) => (
            <React.Fragment key={i}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: i <= stage ? STAGE_COLORS[i] : '#F0ECE6', color: i <= stage ? '#fff' : '#B8B2A8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, transition: 'all 0.3s' }}>
                {i < stage ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: 13, fontWeight: i === stage ? 600 : 400, color: i === stage ? '#2A2520' : '#B8B2A8', marginLeft: 4, marginRight: 12 }}>{s}</span>
              {i < STAGES.length - 1 && (
                <div style={{ width: 28, height: 2, background: i < stage ? STAGE_COLORS[i] : '#F0ECE6', borderRadius: 1 }} />
              )}
            </React.Fragment>
          ))}
        </div>
        {stage > 0 && (
          <button onClick={resetAll} style={{ padding: '8px 16px', background: '#F0ECE6', color: '#5C5549', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            Start Over
          </button>
        )}
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
        {error && (
          <div style={{ padding: '12px 16px', background: '#FFF0F0', border: '1px solid #FCC', borderRadius: 10, color: '#C0392B', fontSize: 14, marginBottom: 20 }}>
            {error}
          </div>
        )}

        {/* =========== STAGE 0: Seed Search =========== */}
        {stage === 0 && (
          <div style={{ animation: 'nn-fadeUp 0.5s ease', maxWidth: 640, margin: '80px auto 0' }}>
            <h1 style={{ fontSize: 36, fontWeight: 700, textAlign: 'center', margin: '0 0 12px', letterSpacing: '-0.02em' }}>
              What product space do you want to explore?
            </h1>
            <p style={{ textAlign: 'center', color: '#8B8479', fontSize: 15, margin: '0 0 8px', lineHeight: 1.6 }}>
              Enter a seed keyword. We'll search <strong>real NeuraNest data</strong> first (1,098 tracked topics with scores, Google Trends, Amazon BA, Reddit buzz), then supplement with AI.
            </p>
            <p style={{ textAlign: 'center', color: '#B8B2A8', fontSize: 12, margin: '0 0 40px' }}>
              Results marked <span style={{ color: '#1A8754', fontWeight: 700 }}>REAL DATA</span> come from our database. <span style={{ color: '#7C3AED', fontWeight: 700 }}>AI</span> results are GPT-generated supplements.
            </p>
            <div style={{ display: 'flex', gap: 10, background: '#fff', border: '2px solid #E6E1DA', borderRadius: 14, padding: 6 }}>
              <input
                ref={inputRef} value={seed} onChange={(e) => setSeed(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="e.g. magnesium, mushroom coffee, retinol, air fryer, creatine..."
                style={{ flex: 1, border: 'none', outline: 'none', padding: '14px 16px', fontSize: 16, background: 'transparent', borderRadius: 10 }}
              />
              <button onClick={handleSearch} disabled={loading || !seed.trim()}
                style={{ padding: '14px 28px', background: '#E8714A', color: '#fff', fontSize: 15, fontWeight: 600, border: 'none', borderRadius: 10, cursor: 'pointer', opacity: loading || !seed.trim() ? 0.5 : 1 }}>
                {loading ? 'Searching...' : 'Explore →'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
              {['magnesium', 'mushroom coffee', 'retinol', 'creatine', 'electrolyte', 'air fryer', 'collagen', 'sea moss'].map((s) => (
                <button key={s} onClick={() => setSeed(s)}
                  style={{ padding: '7px 14px', background: '#F0ECE6', color: '#5C5549', fontSize: 13, fontWeight: 500, border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* =========== STAGE 1: Idea Selection =========== */}
        {stage === 1 && (
          <div style={{ animation: 'nn-fadeUp 0.4s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>
                  Trending ideas for "<span style={{ color: '#E8714A' }}>{seed}</span>"
                </h2>
                <p style={{ color: '#8B8479', fontSize: 14, margin: '6px 0 0' }}>
                  Select up to 3 ideas to analyze Amazon competitors
                  {realCount > 0 && (
                    <span style={{ marginLeft: 12 }}>
                      <span style={{ color: '#1A8754', fontWeight: 600 }}>{realCount} from NeuraNest data</span>
                      {aiCount > 0 && <span style={{ color: '#8B8479' }}> · {aiCount} AI-generated</span>}
                    </span>
                  )}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, color: '#8B8479' }}>{selectedIdeas.length}/3 selected</span>
                <button onClick={analyzeCompetitors} disabled={selectedIdeas.length === 0 || loading}
                  style={{ padding: '10px 22px', background: '#1A8754', color: '#fff', fontSize: 14, fontWeight: 600, border: 'none', borderRadius: 10, cursor: 'pointer', opacity: selectedIdeas.length === 0 ? 0.5 : 1 }}>
                  Analyze Competitors →
                </button>
              </div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #E6E1DA', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '44px 2fr 1fr 70px 80px 70px 74px 68px', padding: '12px 16px', background: '#F9F7F4', borderBottom: '1px solid #E6E1DA', fontSize: 11, fontWeight: 600, color: '#8B8479', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <div></div>
                <div>Idea</div>
                <div>Category</div>
                <div>Score</div>
                <div>Growth</div>
                <div>Stage</div>
                <div>Comp.</div>
                <div>Source</div>
              </div>
              {trendingIdeas.map((item, idx) => {
                const sel = selectedIdeas.includes(idx);
                const isReal = item.data_source === 'real';
                return (
                  <div key={idx} onClick={() => toggleIdea(idx)}
                    style={{ display: 'grid', gridTemplateColumns: '44px 2fr 1fr 70px 80px 70px 74px 68px', padding: '14px 16px', borderBottom: '1px solid #F0ECE6', cursor: 'pointer', background: sel ? '#FFF6F3' : isReal ? '#FAFFF8' : 'transparent', transition: 'background 0.15s', alignItems: 'center' }}>
                    <div style={{ width: 22, height: 22, borderRadius: 6, border: sel ? 'none' : '2px solid #D4CEC5', background: sel ? '#E8714A' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 700, transition: 'all 0.2s' }}>
                      {sel ? '✓' : ''}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{item.idea}</span>
                        {item.ba_best_rank && (
                          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 6, background: '#FCEEE8', color: '#E8714A', fontWeight: 700 }}>
                            BA #{item.ba_best_rank}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: '#8B8479', marginTop: 2 }}>{item.description}</div>
                    </div>
                    <div style={{ fontSize: 12, color: '#8B8479' }}>{item.category}</div>
                    <div><ScorePill score={item.opportunity_score} /></div>
                    <GrowthBar value={item.searchGrowth} />
                    <Badge color={stageColorMap[item.stage] || '#8B8479'}>{item.stage}</Badge>
                    <Badge color={compColorMap[item.competition] || '#8B8479'}>{item.competition}</Badge>
                    <DataSourceBadge source={item.data_source} />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* =========== STAGE 2: Competitors =========== */}
        {stage === 2 && (
          <div style={{ animation: 'nn-fadeUp 0.4s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>Amazon Competitor Landscape</h2>
                <p style={{ color: '#8B8479', fontSize: 14, margin: '6px 0 0' }}>
                  {selectedIdeas.map((i) => trendingIdeas[i]?.idea).join(' · ')}
                </p>
              </div>
              {!loading && Object.keys(competitors).length > 0 && (
                <button onClick={generateGenNext}
                  style={{ padding: '10px 22px', background: '#7C3AED', color: '#fff', fontSize: 14, fontWeight: 600, border: 'none', borderRadius: 10, cursor: 'pointer' }}>
                  Generate Next-Gen Products →
                </button>
              )}
            </div>

            {loading ? (
              <Spinner text="Analyzing Amazon marketplace..." />
            ) : (
              Object.entries(competitors).map(([niche, products]) => (
                <div key={niche} style={{ marginBottom: 28 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: '#E8714A', margin: '0 0 12px' }}>{niche}</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
                    {(products || []).map((p: any, i: number) => (
                      <div key={i} style={{ background: '#fff', border: `1px solid ${p.data_source === 'real' ? '#1A875433' : '#E6E1DA'}`, borderRadius: 14, padding: 18, animation: `nn-scaleIn 0.3s ease ${i * 0.08}s both` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>{p.product}</span>
                              <DataSourceBadge source={p.data_source} />
                            </div>
                            <div style={{ fontSize: 12, color: '#8B8479', marginTop: 2 }}>by {p.brand}</div>
                          </div>
                          <div style={{ fontSize: 20, fontWeight: 700, color: '#1A8754' }}>{p.price}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#8B8479', marginBottom: 10 }}>
                          <span>⭐ {p.rating} ({(p.reviews || 0).toLocaleString()})</span>
                          <span>Sales: {p.monthlySales}/mo</span>
                          {p.bsr > 0 && <span>BSR: #{(p.bsr).toLocaleString()}</span>}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                          {(p.mainFeatures || []).map((f: string, fi: number) => (
                            <span key={fi} style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 6, fontSize: 12, background: '#F0ECE6', color: '#5C5549' }}>
                              {f}
                            </span>
                          ))}
                        </div>
                        <div style={{ fontSize: 12, color: '#C0392B', background: '#FFF5F5', padding: '6px 10px', borderRadius: 6, borderLeft: '3px solid #C0392B' }}>
                          ⚠️ {p.weakness}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* =========== STAGE 3: Gen-Next Products =========== */}
        {stage === 3 && (
          <div style={{ animation: 'nn-fadeUp 0.4s ease' }}>
            <div style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>AI-Suggested Next-Gen Products</h2>
              <p style={{ color: '#8B8479', fontSize: 14, margin: '6px 0 0' }}>
                White-space opportunities identified from competitor analysis
                <span style={{ color: '#1A8754', fontWeight: 600, marginLeft: 8 }}>· Enriched with real customer pain points</span>
              </p>
            </div>

            {loading ? (
              <Spinner text="Identifying white spaces using real review data..." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {genNextProducts.map((p, i) => {
                  const accentColor = ['#E8714A', '#1A8754', '#7C3AED', '#D4930D', '#C0392B'][i];
                  return (
                    <div key={i} style={{ background: '#fff', border: '1px solid #E6E1DA', borderRadius: 14, overflow: 'hidden', animation: `nn-scaleIn 0.4s ease ${i * 0.1}s both` }}>
                      <div style={{ background: `${accentColor}08`, padding: '20px 24px', borderBottom: '1px solid #F0ECE6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                            <span style={{ width: 28, height: 28, borderRadius: 8, background: accentColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>{i + 1}</span>
                            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{p.productName}</h3>
                            <Badge color={difficultyColorMap[p.launchDifficulty] || '#8B8479'}>{p.launchDifficulty} Launch</Badge>
                          </div>
                          <div style={{ fontSize: 14, color: '#8B8479', fontStyle: 'italic' }}>{p.tagline}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 28, fontWeight: 700, color: '#1A8754' }}>{p.targetPrice}</div>
                          <div style={{ fontSize: 12, color: '#8B8479' }}>Est. {p.estimatedMonthlySales}/mo</div>
                        </div>
                      </div>

                      <div style={{ padding: '18px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                        <div>
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#8B8479', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>White Space Opportunity</div>
                            <div style={{ fontSize: 13, lineHeight: 1.5, background: '#FFF6F3', padding: '10px 14px', borderRadius: 8, borderLeft: '3px solid #E8714A' }}>{p.whiteSpace}</div>
                          </div>
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#8B8479', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Key Differentiator</div>
                            <div style={{ fontSize: 13, lineHeight: 1.5 }}>{p.differentiator}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#8B8479', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Target Audience</div>
                            <div style={{ fontSize: 13 }}>{p.targetAudience}</div>
                          </div>
                        </div>

                        <div>
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#8B8479', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Key Features</div>
                            {(p.keyFeatures || []).map((f, fi) => (
                              <div key={fi} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 4 }}>
                                <span style={{ color: '#1A8754', fontWeight: 700 }}>✓</span> {f}
                              </div>
                            ))}
                          </div>
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#8B8479', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Ingredients / Specs</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {(p.ingredients_or_specs || []).map((s, si) => (
                                <span key={si} style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 6, fontSize: 12, background: '#F0ECE6', color: '#5C5549' }}>{s}</span>
                              ))}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#8B8479', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Sales Potential</div>
                            <GrowthBar value={p.salesPotential} />
                            <div style={{ fontSize: 11, color: '#8B8479', marginTop: 4 }}>Confidence: {p.confidenceScore}%</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductIntelligencePage;
