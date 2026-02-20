import React, { useState, useRef, useEffect } from 'react';

// ---------------------------------------------------------------------------
// Types
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
// Product Brief Types
// ---------------------------------------------------------------------------
interface ProductBrief {
  product_name: string;
  tagline: string;
  executive_summary: string;
  opportunity_statement: string;
  market_sizing: { tam: string; sam: string; som: string; assumptions: string[]; growth_rate: string; };
  margin_stack: { cogs: string; amazon_fees: string; ppc_ads: string; gross_margin: string; net_margin: string; break_even_units: string; notes: string[]; };
  gtm_plan: { phase: string; duration: string; tactics: string[]; kpis: string[]; }[];
  supply_chain: { moq: string; lead_time: string; sourcing_notes: string; certifications: string[]; packaging_format: string; supplier_regions: string[]; };
  brand_identity: { brand_name_suggestions: string[]; tone_of_voice: string; key_claims: string[]; packaging_format: string; brand_archetype: string; color_palette_keywords: string[]; };
  risks: { risk: string; probability: string; impact: string; mitigation: string; }[];
  launch_checklist: { task: string; owner: string; priority: string; notes?: string | null; }[];
}

// ---------------------------------------------------------------------------
// API Client — calls your FastAPI backend (not Claude directly)
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
    <span
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 600,
        color,
        background: `${color}18`,
        letterSpacing: '0.02em',
      }}
    >
      {children}
    </span>
  );
}

function GrowthBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min((value / max) * 100, 100);
  const color = value > 70 ? '#1A8754' : value > 40 ? '#D4930D' : '#C0392B';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div
        style={{
          flex: 1,
          height: 6,
          background: '#F0ECE6',
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: color,
            borderRadius: 3,
            transition: 'width 0.6s ease',
          }}
        />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color, minWidth: 32 }}>{value}%</span>
    </div>
  );
}

function Spinner({ text = 'Analyzing...' }: { text?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 60 }}>
      <div
        style={{
          width: 24,
          height: 24,
          border: '3px solid rgba(232,113,74,0.15)',
          borderTopColor: '#E8714A',
          borderRadius: '50%',
          animation: 'nn-spin 0.8s linear infinite',
        }}
      />
      <span style={{ color: '#8B8479', fontSize: 15 }}>{text}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Brief Drawer Component (inline, shown in Stage 3)
// ---------------------------------------------------------------------------
const BRIEF_TABS = [
  { id: 'overview', label: 'Overview', emoji: '🎯' },
  { id: 'market', label: 'Market', emoji: '📊' },
  { id: 'margin', label: 'Margin', emoji: '💰' },
  { id: 'gtm', label: 'GTM Plan', emoji: '🚀' },
  { id: 'supply', label: 'Supply', emoji: '🏭' },
  { id: 'brand', label: 'Brand', emoji: '🎨' },
  { id: 'risks', label: 'Risks', emoji: '⚠️' },
  { id: 'checklist', label: 'Checklist', emoji: '✅' },
];

const riskColor = (v: string) => v === 'High' ? '#C0392B' : v === 'Medium' ? '#D4930D' : '#1A8754';

function BriefSkeleton() {
  return (
    <div style={{ padding: 28 }}>
      <style>{`@keyframes bskimmer { from { background-position: 200% center; } to { background-position: -200% center; } }`}</style>
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{ background: '#fff', border: '1px solid #E6E1DA', borderRadius: 12, padding: 20, marginBottom: 14 }}>
          <div style={{ height: 10, width: 80, borderRadius: 4, marginBottom: 12, background: 'linear-gradient(90deg,#EDE9E3 25%,#F5F2ED 50%,#EDE9E3 75%)', backgroundSize: '200%', animation: 'bskimmer 1.4s infinite' }} />
          <div style={{ height: 14, width: '100%', borderRadius: 4, marginBottom: 8, background: 'linear-gradient(90deg,#EDE9E3 25%,#F5F2ED 50%,#EDE9E3 75%)', backgroundSize: '200%', animation: 'bskimmer 1.4s infinite' }} />
          <div style={{ height: 14, width: '75%', borderRadius: 4, background: 'linear-gradient(90deg,#EDE9E3 25%,#F5F2ED 50%,#EDE9E3 75%)', backgroundSize: '200%', animation: 'bskimmer 1.4s infinite' }} />
        </div>
      ))}
    </div>
  );
}

function BriefDrawerContent({ brief, activeTab, product }: { brief: ProductBrief; activeTab: string; product: GenNextProduct }) {
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());
  const toggleCheck = (i: number) => setCheckedItems(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
  const phaseColors = ['#E8714A', '#1A8754', '#7C3AED'];

  if (activeTab === 'overview') return (
    <div>
      <div style={{ background: '#fff', border: '1px solid #E6E1DA', borderRadius: 12, padding: 20, marginBottom: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#8B8479', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Executive Summary</div>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: '#2D3E50', margin: 0 }}>{brief.executive_summary}</p>
      </div>
      <div style={{ background: '#FFF6F3', border: '1px solid #F0C9BB', borderRadius: 12, padding: 20, marginBottom: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#E8714A', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Opportunity</div>
        <p style={{ fontSize: 14, fontWeight: 600, color: '#E8714A', margin: 0, lineHeight: 1.5 }}>{brief.opportunity_statement}</p>
      </div>
      <div style={{ background: '#fff', border: '1px solid #E6E1DA', borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#8B8479', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Key Features</div>
        {(product.keyFeatures || []).map((f, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 7, fontSize: 13, color: '#2D3E50' }}>
            <span style={{ color: '#1A8754', fontWeight: 700, flexShrink: 0 }}>✓</span>{f}
          </div>
        ))}
      </div>
    </div>
  );

  if (activeTab === 'market') {
    const ms = brief.market_sizing;
    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
          {[['TAM', ms.tam, '#7C3AED'], ['SAM', ms.sam, '#E8714A'], ['SOM', ms.som, '#1A8754']].map(([l, v, c]) => (
            <div key={l as string} style={{ background: '#fff', border: `1px solid ${c}30`, borderTop: `3px solid ${c}`, borderRadius: 10, padding: 14, textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: c as string }}>{v}</div>
              <div style={{ fontSize: 10, color: '#8B8479', marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ background: '#fff', border: '1px solid #E6E1DA', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#8B8479', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Assumptions</div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#1A8754', background: '#1A875418', padding: '2px 8px', borderRadius: 8 }}>{ms.growth_rate}</span>
          </div>
          {ms.assumptions.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 7, fontSize: 13, color: '#2D3E50', alignItems: 'flex-start' }}>
              <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#7C3AED18', color: '#7C3AED', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>{a}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (activeTab === 'margin') {
    const mg = brief.margin_stack;
    const rows = [['COGS', mg.cogs, '#C0392B'], ['Amazon Fees', mg.amazon_fees, '#D4930D'], ['PPC / Ads', mg.ppc_ads, '#D4930D'], ['Gross Margin', mg.gross_margin, '#1A8754'], ['Net Margin', mg.net_margin, '#7C3AED'], ['Break-Even Units', mg.break_even_units, '#2D3E50']];
    return (
      <div>
        <div style={{ background: '#fff', border: '1px solid #E6E1DA', borderRadius: 12, overflow: 'hidden', marginBottom: 14 }}>
          {rows.map(([l, v, c], i) => (
            <div key={l as string} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 18px', borderBottom: i < rows.length - 1 ? '1px solid #F0ECE6' : 'none', background: i >= 3 ? '#F9F7F4' : '#fff' }}>
              <span style={{ fontSize: 13, color: '#2D3E50', fontWeight: i >= 3 ? 600 : 400 }}>{l}</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: c as string }}>{v}</span>
            </div>
          ))}
        </div>
        {mg.notes.map((n, i) => <div key={i} style={{ fontSize: 12, color: '#5C5549', background: '#FFFBF0', border: '1px solid #F0DDA0', borderRadius: 8, padding: '8px 12px', marginBottom: 8 }}>💡 {n}</div>)}
      </div>
    );
  }

  if (activeTab === 'gtm') return (
    <div>
      {brief.gtm_plan.map((phase, i) => (
        <div key={i} style={{ background: '#fff', border: '1px solid #E6E1DA', borderRadius: 12, overflow: 'hidden', marginBottom: 14 }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #F0ECE6', display: 'flex', alignItems: 'center', gap: 10, background: `${phaseColors[i]}08` }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: phaseColors[i], color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
            <div><div style={{ fontSize: 14, fontWeight: 700, color: '#2D3E50' }}>{phase.phase}</div><div style={{ fontSize: 11, color: '#8B8479' }}>{phase.duration}</div></div>
          </div>
          <div style={{ padding: '14px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div><div style={{ fontSize: 10, fontWeight: 700, color: '#8B8479', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Tactics</div>{phase.tactics.map((t, ti) => <div key={ti} style={{ fontSize: 12, color: '#2D3E50', marginBottom: 5 }}>→ {t}</div>)}</div>
            <div><div style={{ fontSize: 10, fontWeight: 700, color: '#8B8479', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>KPIs</div>{phase.kpis.map((k, ki) => <div key={ki} style={{ fontSize: 12, color: '#2D3E50', background: `${phaseColors[i]}10`, padding: '5px 8px', borderRadius: 6, marginBottom: 5 }}>📈 {k}</div>)}</div>
          </div>
        </div>
      ))}
    </div>
  );

  if (activeTab === 'supply') {
    const sc = brief.supply_chain;
    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
          {[['📦', 'MOQ', sc.moq], ['⏱', 'Lead Time', sc.lead_time], ['🎁', 'Packaging', sc.packaging_format]].map(([e, l, v]) => (
            <div key={l as string} style={{ background: '#fff', border: '1px solid #E6E1DA', borderRadius: 10, padding: 14, textAlign: 'center' }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>{e}</div>
              <div style={{ fontSize: 10, color: '#8B8479', marginBottom: 4 }}>{l}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#2D3E50' }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ background: '#fff', border: '1px solid #E6E1DA', borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#8B8479', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Sourcing Notes</div>
          <p style={{ fontSize: 13, color: '#2D3E50', margin: '0 0 14px', lineHeight: 1.6 }}>{sc.sourcing_notes}</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><div style={{ fontSize: 10, fontWeight: 700, color: '#8B8479', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Supplier Regions</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{sc.supplier_regions.map((r, i) => <span key={i} style={{ fontSize: 11, padding: '3px 8px', background: '#F0ECE6', borderRadius: 6, color: '#5C5549' }}>{r}</span>)}</div></div>
            <div><div style={{ fontSize: 10, fontWeight: 700, color: '#8B8479', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Certifications</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{sc.certifications.map((c, i) => <span key={i} style={{ fontSize: 11, padding: '3px 8px', background: '#FFF6F0', border: '1px solid #F0C9BB', borderRadius: 6, color: '#E8714A' }}>{c}</span>)}</div></div>
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === 'brand') {
    const bi = brief.brand_identity;
    return (
      <div>
        <div style={{ background: '#fff', border: '1px solid #E6E1DA', borderRadius: 12, padding: 18, marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#8B8479', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Name Ideas</div>
          {bi.brand_name_suggestions.map((name, i) => (
            <div key={i} style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 6, background: i === 0 ? '#FFF6F3' : '#F9F7F4', border: `1px solid ${i === 0 ? '#F0C9BB' : '#E6E1DA'}`, fontSize: 15, fontWeight: 700, color: i === 0 ? '#E8714A' : '#2D3E50' }}>
              {i === 0 && <span style={{ fontSize: 9, marginRight: 6, color: '#E8714A', fontWeight: 700 }}>★ TOP</span>}{name}
            </div>
          ))}
        </div>
        <div style={{ background: '#fff', border: '1px solid #E6E1DA', borderRadius: 12, padding: 18, marginBottom: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div><div style={{ fontSize: 10, fontWeight: 700, color: '#8B8479', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Archetype</div><div style={{ fontSize: 14, fontWeight: 700, color: '#7C3AED' }}>{bi.brand_archetype}</div></div>
            <div><div style={{ fontSize: 10, fontWeight: 700, color: '#8B8479', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Tone of Voice</div><div style={{ fontSize: 13, color: '#2D3E50' }}>{bi.tone_of_voice}</div></div>
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#8B8479', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Key Claims</div>
          {bi.key_claims.map((c, i) => <div key={i} style={{ fontSize: 13, color: '#2D3E50', background: '#F0FAF5', border: '1px solid #1A875430', borderLeft: '3px solid #1A8754', borderRadius: 6, padding: '7px 10px', marginBottom: 6 }}>✓ {c}</div>)}
        </div>
      </div>
    );
  }

  if (activeTab === 'risks') return (
    <div>
      {brief.risks.map((r, i) => (
        <div key={i} style={{ background: '#fff', border: '1px solid #E6E1DA', borderRadius: 12, padding: 16, marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#2D3E50', flex: 1, paddingRight: 10 }}>{r.risk}</div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: `${riskColor(r.probability)}15`, color: riskColor(r.probability) }}>P: {r.probability}</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: `${riskColor(r.impact)}15`, color: riskColor(r.impact) }}>I: {r.impact}</span>
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#5C5549', background: '#F9F7F4', borderRadius: 6, padding: '6px 10px' }}>🛡 {r.mitigation}</div>
        </div>
      ))}
    </div>
  );

  if (activeTab === 'checklist') {
    const done = checkedItems.size;
    const total = brief.launch_checklist.length;
    const pct = Math.round((done / total) * 100);
    const priorityColor = (p: string) => p === 'P0' ? '#C0392B' : p === 'P1' ? '#D4930D' : '#8B8479';
    const ownerColor = (o: string) => o === 'Founder' ? '#E8714A' : o === 'Agency' ? '#7C3AED' : o === 'Supplier' ? '#D4930D' : '#2D3E50';
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '10px 14px', background: '#fff', border: '1px solid #E6E1DA', borderRadius: 10 }}>
          <span style={{ fontSize: 12, color: '#8B8479' }}>Progress</span>
          <div style={{ flex: 1, height: 6, background: '#F0ECE6', borderRadius: 3, overflow: 'hidden' }}><div style={{ height: '100%', width: `${pct}%`, background: '#1A8754', borderRadius: 3, transition: 'width 0.3s ease' }} /></div>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#1A8754' }}>{done}/{total}</span>
        </div>
        {brief.launch_checklist.map((item, i) => (
          <div key={i} onClick={() => toggleCheck(i)} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 8, marginBottom: 4, cursor: 'pointer', background: checkedItems.has(i) ? '#F0FAF5' : '#fff', border: `1px solid ${checkedItems.has(i) ? '#1A875440' : '#E6E1DA'}`, transition: 'all 0.15s' }}>
            <div style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 1, background: checkedItems.has(i) ? '#1A8754' : '#fff', border: checkedItems.has(i) ? 'none' : '2px solid #D4CEC5', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>{checkedItems.has(i) && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: checkedItems.has(i) ? '#8B8479' : '#2D3E50', textDecoration: checkedItems.has(i) ? 'line-through' : 'none', fontWeight: 500 }}>{item.task}</div>
              {item.notes && <div style={{ fontSize: 10, color: '#8B8479', marginTop: 2 }}>{item.notes}</div>}
            </div>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: `${priorityColor(item.priority)}15`, color: priorityColor(item.priority), fontWeight: 700 }}>{item.priority}</span>
              <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: `${ownerColor(item.owner)}15`, color: ownerColor(item.owner), fontWeight: 600 }}>{item.owner}</span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return null;
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

  // Brief drawer state
  const [selectedProduct, setSelectedProduct] = useState<GenNextProduct | null>(null);
  const [brief, setBrief] = useState<ProductBrief | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState('');
  const [briefTab, setBriefTab] = useState('overview');

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (stage === 0 && inputRef.current) inputRef.current.focus();
  }, [stage]);

  // Stage 1: Search
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

  // Stage 2: Toggle selection
  const toggleIdea = (idx: number) => {
    setSelectedIdeas((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : prev.length < 3 ? [...prev, idx] : prev
    );
  };

  // Stage 3: Analyze competitors
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

  // Stage 4: Generate next-gen products
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

  // Stage 4: Click a product card → generate brief inline
  const openBrief = async (product: GenNextProduct) => {
    setSelectedProduct(product);
    setBrief(null);
    setBriefError('');
    setBriefTab('overview');
    setBriefLoading(true);
    try {
      const niches = selectedIdeas.map((i) => trendingIdeas[i]?.idea).filter(Boolean);
      const res = await fetch(`${API_BASE}/brief`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product, niches, competitors, geo: 'US' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Request failed' }));
        throw new Error(err.detail || `API error ${res.status}`);
      }
      const data = await res.json();
      setBrief({ ...data, keyFeatures: product.keyFeatures, targetAudience: product.targetAudience } as any);
    } catch (e: any) {
      setBriefError(e.message || 'Failed to generate brief');
    }
    setBriefLoading(false);
  };

  const handleDownloadBrief = async () => {
    if (!selectedProduct) return;
    try {
      const niches = selectedIdeas.map((i) => trendingIdeas[i]?.idea).filter(Boolean);
      const res = await fetch(`${API_BASE}/brief/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product: selectedProduct, niches, competitors, geo: 'US' }),
      });
      const data = await res.json();
      const blob = new Blob([data.markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = data.filename; a.click(); URL.revokeObjectURL(url);
    } catch { setBriefError('Export failed'); }
  };

  const resetAll = () => {
    setStage(0);
    setSeed('');
    setTrendingIdeas([]);
    setSelectedIdeas([]);
    setCompetitors({});
    setGenNextProducts([]);
    setError('');
    setSelectedProduct(null);
    setBrief(null);
    setBriefLoading(false);
    setBriefError('');
  };

  const stageColorMap: Record<string, string> = {
    Emerging: '#E8714A',
    Rising: '#1A8754',
    Peak: '#D4930D',
    Declining: '#C0392B',
  };
  const compColorMap: Record<string, string> = {
    Low: '#1A8754',
    Medium: '#D4930D',
    High: '#C0392B',
  };
  const difficultyColorMap: Record<string, string> = {
    Easy: '#1A8754',
    Medium: '#D4930D',
    Hard: '#C0392B',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#F9F7F4' }}>
      <style>{`
        @keyframes nn-spin { to { transform: rotate(360deg); } }
        @keyframes nn-fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @keyframes nn-scaleIn { from { opacity:0; transform:scale(0.96); } to { opacity:1; transform:scale(1); } }
      `}</style>

      {/* Progress Bar */}
      <div
        style={{
          background: '#fff',
          borderBottom: '1px solid #E6E1DA',
          padding: '14px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {STAGES.map((s, i) => (
            <React.Fragment key={i}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: i <= stage ? STAGE_COLORS[i] : '#E6E1DA',
                  color: i <= stage ? '#fff' : '#B8B2A8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                  transition: 'all 0.3s ease',
                }}
              >
                {i + 1}
              </div>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: i === stage ? 600 : 400,
                  color: i === stage ? STAGE_COLORS[i] : '#8B8479',
                  display: i === stage ? 'block' : 'none',
                }}
              >
                {s}
              </span>
              {i < 3 && (
                <div
                  style={{
                    width: 20,
                    height: 2,
                    background: i < stage ? STAGE_COLORS[i] : '#E6E1DA',
                    borderRadius: 1,
                  }}
                />
              )}
            </React.Fragment>
          ))}
        </div>
        {stage > 0 && (
          <button
            onClick={resetAll}
            style={{
              padding: '8px 16px',
              background: '#F0ECE6',
              color: '#5C5549',
              fontSize: 13,
              fontWeight: 600,
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            Start Over
          </button>
        )}
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
        {error && (
          <div
            style={{
              padding: '12px 16px',
              background: '#FFF0F0',
              border: '1px solid #FCC',
              borderRadius: 10,
              color: '#C0392B',
              fontSize: 14,
              marginBottom: 20,
            }}
          >
            {error}
          </div>
        )}

        {/* =========== STAGE 0: Seed Search =========== */}
        {stage === 0 && (
          <div style={{ animation: 'nn-fadeUp 0.5s ease', maxWidth: 640, margin: '80px auto 0' }}>
            <h1 style={{ fontSize: 36, fontWeight: 700, textAlign: 'center', margin: '0 0 12px', letterSpacing: '-0.02em' }}>
              What product space do you want to explore?
            </h1>
            <p style={{ textAlign: 'center', color: '#8B8479', fontSize: 15, margin: '0 0 40px', lineHeight: 1.6 }}>
              Enter a seed keyword and we'll find trending niches, analyze Amazon competitors, and suggest
              next-generation products with white-space opportunities.
            </p>
            <div
              style={{
                display: 'flex',
                gap: 10,
                background: '#fff',
                border: '2px solid #E6E1DA',
                borderRadius: 14,
                padding: 6,
              }}
            >
              <input
                ref={inputRef}
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="e.g. mushroom supplements, portable blender, dog anxiety..."
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  padding: '14px 16px',
                  fontSize: 16,
                  background: 'transparent',
                  borderRadius: 10,
                }}
              />
              <button
                onClick={handleSearch}
                disabled={loading || !seed.trim()}
                style={{
                  padding: '14px 28px',
                  background: '#E8714A',
                  color: '#fff',
                  fontSize: 15,
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: 10,
                  cursor: 'pointer',
                  opacity: loading || !seed.trim() ? 0.5 : 1,
                }}
              >
                {loading ? 'Searching...' : 'Explore →'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
              {['mushroom coffee', 'portable blender', 'dog anxiety', 'pickleball', 'scalp care', 'air purifier'].map(
                (s) => (
                  <button
                    key={s}
                    onClick={() => setSeed(s)}
                    style={{
                      padding: '7px 14px',
                      background: '#F0ECE6',
                      color: '#5C5549',
                      fontSize: 13,
                      fontWeight: 500,
                      border: 'none',
                      borderRadius: 8,
                      cursor: 'pointer',
                    }}
                  >
                    {s}
                  </button>
                )
              )}
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
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, color: '#8B8479' }}>{selectedIdeas.length}/3 selected</span>
                <button
                  onClick={analyzeCompetitors}
                  disabled={selectedIdeas.length === 0 || loading}
                  style={{
                    padding: '10px 22px',
                    background: '#1A8754',
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 600,
                    border: 'none',
                    borderRadius: 10,
                    cursor: 'pointer',
                    opacity: selectedIdeas.length === 0 ? 0.5 : 1,
                  }}
                >
                  Analyze Competitors →
                </button>
              </div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #E6E1DA', borderRadius: 14, overflow: 'hidden' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '44px 2fr 1fr 80px 90px 80px 80px',
                  padding: '12px 16px',
                  background: '#F9F7F4',
                  borderBottom: '1px solid #E6E1DA',
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#8B8479',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                <div></div>
                <div>Idea</div>
                <div>Category</div>
                <div>Growth</div>
                <div>TikTok</div>
                <div>Stage</div>
                <div>Competition</div>
              </div>
              {trendingIdeas.map((item, idx) => {
                const sel = selectedIdeas.includes(idx);
                return (
                  <div
                    key={idx}
                    onClick={() => toggleIdea(idx)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '44px 2fr 1fr 80px 90px 80px 80px',
                      padding: '14px 16px',
                      borderBottom: '1px solid #F0ECE6',
                      cursor: 'pointer',
                      background: sel ? '#FFF6F3' : 'transparent',
                      transition: 'background 0.15s',
                      alignItems: 'center',
                    }}
                  >
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        border: sel ? 'none' : '2px solid #D4CEC5',
                        background: sel ? '#E8714A' : '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontSize: 13,
                        fontWeight: 700,
                        transition: 'all 0.2s',
                      }}
                    >
                      {sel ? '✓' : ''}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{item.idea}</div>
                      <div style={{ fontSize: 12, color: '#8B8479', marginTop: 2 }}>{item.description}</div>
                    </div>
                    <div style={{ fontSize: 12, color: '#8B8479' }}>{item.category}</div>
                    <GrowthBar value={item.searchGrowth} />
                    <div style={{ fontSize: 12, color: '#8B8479' }}>{item.tiktokMentions}</div>
                    <Badge color={stageColorMap[item.stage] || '#8B8479'}>{item.stage}</Badge>
                    <Badge color={compColorMap[item.competition] || '#8B8479'}>{item.competition}</Badge>
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
                <button
                  onClick={generateGenNext}
                  style={{
                    padding: '10px 22px',
                    background: '#7C3AED',
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 600,
                    border: 'none',
                    borderRadius: 10,
                    cursor: 'pointer',
                  }}
                >
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
                    {(products || []).map((p, i) => (
                      <div
                        key={i}
                        style={{
                          background: '#fff',
                          border: '1px solid #E6E1DA',
                          borderRadius: 14,
                          padding: 18,
                          animation: `nn-scaleIn 0.3s ease ${i * 0.08}s both`,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>{p.product}</div>
                            <div style={{ fontSize: 12, color: '#8B8479', marginTop: 2 }}>by {p.brand}</div>
                          </div>
                          <div style={{ fontSize: 20, fontWeight: 700, color: '#1A8754' }}>{p.price}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#8B8479', marginBottom: 10 }}>
                          <span>⭐ {p.rating} ({(p.reviews || 0).toLocaleString()})</span>
                          <span>Sales: {p.monthlySales}/mo</span>
                          <span>BSR: #{(p.bsr || 0).toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                          {(p.mainFeatures || []).map((f, fi) => (
                            <span
                              key={fi}
                              style={{
                                display: 'inline-block',
                                padding: '4px 10px',
                                borderRadius: 6,
                                fontSize: 12,
                                background: '#F0ECE6',
                                color: '#5C5549',
                              }}
                            >
                              {f}
                            </span>
                          ))}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: '#C0392B',
                            background: '#FFF5F5',
                            padding: '6px 10px',
                            borderRadius: 6,
                            borderLeft: '3px solid #C0392B',
                          }}
                        >
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

        {/* =========== STAGE 3: Gen-Next Products + Brief Drawer =========== */}
        {stage === 3 && (
          <div style={{ animation: 'nn-fadeUp 0.4s ease' }}>
            <div style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>AI-Suggested Next-Gen Products</h2>
              <p style={{ color: '#8B8479', fontSize: 14, margin: '6px 0 0' }}>
                Click any product to generate a full investor-grade brief
              </p>
            </div>

            {/* Two-panel: product list + brief drawer */}
            <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

              {/* LEFT — product cards list */}
              <div style={{ flex: selectedProduct ? '0 0 380px' : '1', transition: 'flex 0.35s ease', display: 'flex', flexDirection: 'column', gap: 14 }}>

                {loading ? (
                  <Spinner text="Identifying white spaces and generating product concepts..." />
                ) : (
                  genNextProducts.map((p, i) => {
                    const accentColor = ['#E8714A', '#1A8754', '#7C3AED', '#D4930D', '#C0392B'][i];
                    const isSelected = selectedProduct?.productName === p.productName;
                    return (
                      <div
                        key={i}
                        onClick={() => openBrief(p)}
                        style={{
                          background: isSelected ? '#fff' : '#fff',
                          border: isSelected ? `2px solid ${accentColor}` : '1px solid #E6E1DA',
                          borderRadius: 14,
                          overflow: 'hidden',
                          animation: `nn-scaleIn 0.4s ease ${i * 0.1}s both`,
                          cursor: 'pointer',
                          transition: 'border-color 0.2s, box-shadow 0.2s',
                          boxShadow: isSelected ? `0 4px 20px ${accentColor}20` : 'none',
                        }}
                      >
                        {/* Card Header */}
                        <div style={{
                          background: `${accentColor}${isSelected ? '14' : '08'}`,
                          padding: '16px 20px',
                          borderBottom: '1px solid #F0ECE6',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                              <span style={{ width: 24, height: 24, borderRadius: 6, background: accentColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                              <span style={{ fontSize: selectedProduct ? 14 : 16, fontWeight: 700, color: '#2D3E50', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.productName}</span>
                              <Badge color={difficultyColorMap[p.launchDifficulty] || '#8B8479'}>{p.launchDifficulty}</Badge>
                            </div>
                            <div style={{ fontSize: 12, color: '#8B8479', fontStyle: 'italic', paddingLeft: 32 }}>{p.tagline}</div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                            <div style={{ fontSize: 20, fontWeight: 700, color: '#1A8754' }}>{p.targetPrice}</div>
                            <div style={{ fontSize: 11, color: '#8B8479' }}>{p.estimatedMonthlySales}/mo</div>
                          </div>
                        </div>

                        {/* Card Body — collapsed when a product is selected to save space */}
                        {!selectedProduct && (
                          <div style={{ padding: '14px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 700, color: '#8B8479', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>White Space</div>
                              <div style={{ fontSize: 12, lineHeight: 1.5, background: '#FFF6F3', padding: '8px 10px', borderRadius: 6, borderLeft: `3px solid ${accentColor}` }}>{p.whiteSpace}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 700, color: '#8B8479', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>Key Features</div>
                              {(p.keyFeatures || []).slice(0, 3).map((f, fi) => (
                                <div key={fi} style={{ display: 'flex', gap: 6, fontSize: 12, marginBottom: 3 }}><span style={{ color: '#1A8754', fontWeight: 700 }}>✓</span>{f}</div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Collapsed footer when selected */}
                        {isSelected && (
                          <div style={{ padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 11, color: accentColor, fontWeight: 700 }}>● Generating brief…</span>
                            <span style={{ fontSize: 11, color: '#8B8479' }}>Confidence: {p.confidenceScore}%</span>
                          </div>
                        )}

                        {/* Click hint when nothing selected */}
                        {!selectedProduct && (
                          <div style={{ padding: '8px 20px', borderTop: '1px solid #F0ECE6', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 11, color: accentColor, fontWeight: 600 }}>📄 Click to generate full brief</span>
                            <span style={{ fontSize: 11, color: '#B8B2A8' }}>· Confidence: {p.confidenceScore}%</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* RIGHT — Brief Drawer (appears when a product is selected) */}
              {selectedProduct && (
                <div style={{
                  flex: 1,
                  background: '#fff',
                  border: '1px solid #E6E1DA',
                  borderRadius: 16,
                  overflow: 'hidden',
                  animation: 'nn-fadeUp 0.3s ease',
                  minWidth: 0,
                  alignSelf: 'flex-start',
                  position: 'sticky',
                  top: 20,
                }}>
                  {/* Drawer Header */}
                  <div style={{ padding: '18px 20px', borderBottom: '1px solid #E6E1DA', background: '#F9F7F4', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#8B8479', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>Product Brief</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: '#2D3E50', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{brief?.product_name || selectedProduct.productName}</div>
                        {briefLoading && <div style={{ fontSize: 12, color: '#E8714A', marginTop: 2 }}>⏳ Generating with GPT-4o…</div>}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        {brief && (
                          <button onClick={handleDownloadBrief} style={{ padding: '6px 12px', background: '#E8714A', color: '#fff', fontSize: 11, fontWeight: 700, border: 'none', borderRadius: 7, cursor: 'pointer' }}>↓ .md</button>
                        )}
                        <button onClick={() => { setSelectedProduct(null); setBrief(null); }} style={{ padding: '6px 10px', background: '#F0ECE6', color: '#5C5549', fontSize: 12, border: 'none', borderRadius: 7, cursor: 'pointer' }}>✕</button>
                      </div>
                    </div>

                    {/* Tab Bar */}
                    {brief && (
                      <div style={{ display: 'flex', gap: 0, overflowX: 'auto', marginTop: 6, scrollbarWidth: 'none' }}>
                        {BRIEF_TABS.map(tab => (
                          <button key={tab.id} onClick={() => setBriefTab(tab.id)} style={{ padding: '6px 10px', border: 'none', cursor: 'pointer', background: 'none', fontSize: 11, fontWeight: briefTab === tab.id ? 700 : 500, color: briefTab === tab.id ? '#E8714A' : '#8B8479', borderBottom: briefTab === tab.id ? '2px solid #E8714A' : '2px solid transparent', whiteSpace: 'nowrap', transition: 'all 0.15s' }}>
                            {tab.emoji} {tab.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Drawer Content */}
                  <div style={{ padding: '18px 20px', maxHeight: '70vh', overflowY: 'auto' }}>
                    {briefError && (
                      <div style={{ padding: '10px 14px', background: '#FFF0F0', border: '1px solid #FCC', borderRadius: 8, color: '#C0392B', fontSize: 13, marginBottom: 14 }}>⚠️ {briefError}</div>
                    )}
                    {briefLoading && <BriefSkeleton />}
                    {brief && !briefLoading && (
                      <BriefDrawerContent brief={brief} activeTab={briefTab} product={selectedProduct} />
                    )}
                  </div>
                </div>
              )}

            </div>{/* end two-panel */}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductIntelligencePage;
