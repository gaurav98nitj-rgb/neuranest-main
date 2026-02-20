import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface MarketSizingData {
  tam: string; sam: string; som: string;
  assumptions: string[]; growth_rate: string;
}
interface MarginStackData {
  cogs: string; amazon_fees: string; ppc_ads: string;
  gross_margin: string; net_margin: string;
  break_even_units: string; notes: string[];
}
interface GTMPhase {
  phase: string; duration: string; tactics: string[]; kpis: string[];
}
interface SupplyChainData {
  moq: string; lead_time: string; sourcing_notes: string;
  certifications: string[]; packaging_format: string; supplier_regions: string[];
}
interface BrandIdentityData {
  brand_name_suggestions: string[]; tone_of_voice: string;
  key_claims: string[]; packaging_format: string;
  brand_archetype: string; color_palette_keywords: string[];
}
interface RiskItem {
  risk: string; probability: 'Low' | 'Medium' | 'High'; impact: 'Low' | 'Medium' | 'High'; mitigation: string;
}
interface ChecklistItem {
  task: string; owner: string; priority: 'P0' | 'P1' | 'P2'; notes?: string | null;
}
interface ProductBrief {
  product_name: string; tagline: string;
  executive_summary: string; opportunity_statement: string;
  market_sizing: MarketSizingData;
  margin_stack: MarginStackData;
  gtm_plan: GTMPhase[];
  supply_chain: SupplyChainData;
  brand_identity: BrandIdentityData;
  risks: RiskItem[];
  launch_checklist: ChecklistItem[];
}

// ─── Design Tokens ────────────────────────────────────────────────────────────

const C = {
  coral: '#E8714A',
  sage: '#1A8754',
  amber: '#D4930D',
  rose: '#C0392B',
  plum: '#7C3AED',
  charcoal: '#2D3E50',
  sand: '#B8B2A8',
  muted: '#8B8479',
  bg: '#F9F7F4',
  white: '#FFFFFF',
  border: '#E6E1DA',
  borderLight: '#F0ECE6',
};

const TABS = [
  { id: 'overview',   label: 'Overview',     emoji: '🎯' },
  { id: 'market',     label: 'Market',        emoji: '📊' },
  { id: 'margin',     label: 'Margin Stack',  emoji: '💰' },
  { id: 'gtm',        label: 'Go-To-Market',  emoji: '🚀' },
  { id: 'supply',     label: 'Supply Chain',  emoji: '🏭' },
  { id: 'brand',      label: 'Brand',         emoji: '🎨' },
  { id: 'risks',      label: 'Risks',         emoji: '⚠️' },
  { id: 'checklist',  label: 'Checklist',     emoji: '✅' },
];

// ─── Small Building Blocks ───────────────────────────────────────────────────

function Pill({ children, color = C.muted }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 20,
      fontSize: 11, fontWeight: 600, color,
      background: `${color}18`, letterSpacing: '0.02em',
    }}>
      {children}
    </span>
  );
}

function SectionCard({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: C.white, border: `1px solid ${C.border}`, borderRadius: 16,
      padding: 28, marginBottom: 20, ...style,
    }}>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.08em', color: C.muted, marginBottom: 6,
    }}>
      {children}
    </div>
  );
}

function SkeletonBlock({ h = 16, w = '100%', mb = 8 }: { h?: number; w?: string | number; mb?: number }) {
  return (
    <div style={{
      height: h, width: w, borderRadius: 6, marginBottom: mb,
      background: 'linear-gradient(90deg, #EDE9E3 25%, #F5F2ED 50%, #EDE9E3 75%)',
      backgroundSize: '200% 100%',
      animation: 'brief-shimmer 1.4s infinite linear',
    }} />
  );
}

const probabilityColor = (v: string) =>
  v === 'High' ? C.rose : v === 'Medium' ? C.amber : C.sage;

const priorityColor = (v: string) =>
  v === 'P0' ? C.rose : v === 'P1' ? C.amber : C.muted;

// ─── Tab Sections ────────────────────────────────────────────────────────────

function OverviewTab({ brief }: { brief: ProductBrief }) {
  return (
    <>
      <SectionCard>
        <Label>Executive Summary</Label>
        <p style={{ fontSize: 15, lineHeight: 1.75, color: C.charcoal, margin: 0 }}>
          {brief.executive_summary}
        </p>
      </SectionCard>
      <SectionCard style={{ background: '#FFF6F3', borderColor: '#F0C9BB' }}>
        <Label>Opportunity Statement</Label>
        <p style={{ fontSize: 16, fontWeight: 600, color: C.coral, margin: 0, lineHeight: 1.5 }}>
          {brief.opportunity_statement}
        </p>
      </SectionCard>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <SectionCard style={{ margin: 0 }}>
          <Label>Key Features</Label>
          {(brief as any).keyFeatures?.map((f: string, i: number) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
              <span style={{ color: C.sage, fontWeight: 700, flexShrink: 0 }}>✓</span>
              <span style={{ fontSize: 13, color: C.charcoal }}>{f}</span>
            </div>
          ))}
        </SectionCard>
        <SectionCard style={{ margin: 0 }}>
          <Label>Target Audience</Label>
          <p style={{ fontSize: 14, color: C.charcoal, margin: '0 0 16px' }}>{(brief as any).targetAudience}</p>
          <Label>Differentiator</Label>
          <p style={{ fontSize: 14, color: C.charcoal, margin: 0 }}>{(brief as any).differentiator}</p>
        </SectionCard>
      </div>
    </>
  );
}

function MarketTab({ brief }: { brief: ProductBrief }) {
  const ms = brief.market_sizing;
  const metrics = [
    { label: 'Total Addressable Market (TAM)', value: ms.tam, color: C.plum },
    { label: 'Serviceable Addressable Market (SAM)', value: ms.sam, color: C.coral },
    { label: 'Serviceable Obtainable Market (SOM)', value: ms.som, color: C.sage },
  ];
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
        {metrics.map(m => (
          <div key={m.label} style={{
            background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24,
            borderTop: `4px solid ${m.color}`,
          }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: m.color, marginBottom: 4 }}>{m.value}</div>
            <div style={{ fontSize: 12, color: C.muted }}>{m.label}</div>
          </div>
        ))}
      </div>
      <SectionCard>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Label>Key Assumptions</Label>
          <Pill color={C.sage}>{ms.growth_rate} Growth Rate</Pill>
        </div>
        {ms.assumptions.map((a, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
            <span style={{
              width: 20, height: 20, borderRadius: '50%', background: `${C.plum}15`,
              color: C.plum, fontSize: 11, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>{i + 1}</span>
            <span style={{ fontSize: 13, color: C.charcoal, lineHeight: 1.5 }}>{a}</span>
          </div>
        ))}
      </SectionCard>
    </>
  );
}

function MarginTab({ brief }: { brief: ProductBrief }) {
  const mg = brief.margin_stack;
  const rows = [
    { label: 'Cost of Goods Sold (COGS)', value: mg.cogs, color: C.rose },
    { label: 'Amazon Fees (Ref + FBA)', value: mg.amazon_fees, color: C.amber },
    { label: 'PPC / Advertising', value: mg.ppc_ads, color: C.amber },
    { label: 'Gross Margin', value: mg.gross_margin, color: C.sage, bold: true },
    { label: 'Net Margin', value: mg.net_margin, color: C.plum, bold: true },
    { label: 'Break-Even Units', value: mg.break_even_units, color: C.charcoal },
  ];
  return (
    <>
      <SectionCard>
        <Label>P&L at Target Price</Label>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {rows.map(r => (
              <tr key={r.label} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                <td style={{ padding: '12px 0', fontSize: 14, color: C.charcoal, fontWeight: r.bold ? 600 : 400 }}>{r.label}</td>
                <td style={{ padding: '12px 0', textAlign: 'right', fontSize: 16, fontWeight: 700, color: r.color }}>{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
      {mg.notes.length > 0 && (
        <SectionCard style={{ background: '#FFFBF0', borderColor: '#F0DDA0' }}>
          <Label>Analyst Notes</Label>
          {mg.notes.map((n, i) => (
            <div key={i} style={{ fontSize: 13, color: C.charcoal, marginBottom: 8, lineHeight: 1.5 }}>
              💡 {n}
            </div>
          ))}
        </SectionCard>
      )}
    </>
  );
}

function GTMTab({ brief }: { brief: ProductBrief }) {
  const phaseColors = [C.coral, C.sage, C.plum];
  return (
    <>
      {brief.gtm_plan.map((phase, i) => (
        <SectionCard key={i}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, background: phaseColors[i],
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 15, fontWeight: 700,
            }}>{i + 1}</div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: C.charcoal }}>{phase.phase}</div>
              <div style={{ fontSize: 12, color: C.muted }}>{phase.duration}</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div>
              <Label>Tactics</Label>
              {phase.tactics.map((t, ti) => (
                <div key={ti} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
                  <span style={{ color: phaseColors[i], flexShrink: 0, fontWeight: 700 }}>→</span>
                  <span style={{ fontSize: 13, color: C.charcoal }}>{t}</span>
                </div>
              ))}
            </div>
            <div>
              <Label>KPIs</Label>
              {phase.kpis.map((k, ki) => (
                <div key={ki} style={{
                  background: `${phaseColors[i]}10`, border: `1px solid ${phaseColors[i]}30`,
                  borderRadius: 8, padding: '8px 12px', marginBottom: 8,
                  fontSize: 13, color: C.charcoal,
                }}>
                  📈 {k}
                </div>
              ))}
            </div>
          </div>
        </SectionCard>
      ))}
    </>
  );
}

function SupplyTab({ brief }: { brief: ProductBrief }) {
  const sc = brief.supply_chain;
  const keyFacts = [
    { label: 'MOQ', value: sc.moq, emoji: '📦' },
    { label: 'Lead Time', value: sc.lead_time, emoji: '⏱' },
    { label: 'Packaging', value: sc.packaging_format, emoji: '🎁' },
  ];
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
        {keyFacts.map(f => (
          <div key={f.label} style={{
            background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, textAlign: 'center',
          }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{f.emoji}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{f.label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.charcoal }}>{f.value}</div>
          </div>
        ))}
      </div>
      <SectionCard>
        <Label>Sourcing Notes</Label>
        <p style={{ fontSize: 14, color: C.charcoal, margin: '0 0 20px', lineHeight: 1.6 }}>{sc.sourcing_notes}</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <Label>Supplier Regions</Label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {sc.supplier_regions.map((r, i) => <Pill key={i} color={C.charcoal}>{r}</Pill>)}
            </div>
          </div>
          <div>
            <Label>Certifications Required</Label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {sc.certifications.map((cert, i) => <Pill key={i} color={C.amber}>{cert}</Pill>)}
            </div>
          </div>
        </div>
      </SectionCard>
    </>
  );
}

function BrandTab({ brief }: { brief: ProductBrief }) {
  const bi = brief.brand_identity;
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <SectionCard style={{ margin: 0 }}>
          <Label>Brand Name Ideas</Label>
          {bi.brand_name_suggestions.map((name, i) => (
            <div key={i} style={{
              padding: '12px 16px', borderRadius: 10, marginBottom: 8,
              background: i === 0 ? `${C.coral}12` : C.borderLight,
              border: i === 0 ? `1px solid ${C.coral}40` : `1px solid ${C.border}`,
              fontSize: 16, fontWeight: 700, color: i === 0 ? C.coral : C.charcoal,
            }}>
              {i === 0 && <span style={{ fontSize: 10, marginRight: 8, color: C.coral }}>★ TOP PICK</span>}
              {name}
            </div>
          ))}
        </SectionCard>
        <SectionCard style={{ margin: 0 }}>
          <Label>Brand Archetype</Label>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.plum, marginBottom: 12 }}>{bi.brand_archetype}</div>
          <Label>Tone of Voice</Label>
          <p style={{ fontSize: 14, color: C.charcoal, margin: '0 0 16px', lineHeight: 1.5 }}>{bi.tone_of_voice}</p>
          <Label>Colour Palette Keywords</Label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {bi.color_palette_keywords.map((k, i) => <Pill key={i} color={C.charcoal}>{k}</Pill>)}
          </div>
        </SectionCard>
      </div>
      <SectionCard>
        <Label>Key Claims (for Listing & Packaging)</Label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {bi.key_claims.map((claim, i) => (
            <div key={i} style={{
              background: `${C.sage}10`, border: `1px solid ${C.sage}30`,
              borderLeft: `3px solid ${C.sage}`, borderRadius: 8,
              padding: '10px 14px', fontSize: 13, color: C.charcoal, lineHeight: 1.4,
            }}>
              ✓ {claim}
            </div>
          ))}
        </div>
      </SectionCard>
    </>
  );
}

function RisksTab({ brief }: { brief: ProductBrief }) {
  return (
    <SectionCard>
      <Label>Risk Register</Label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {brief.risks.map((r, i) => (
          <div key={i} style={{
            border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden',
            display: 'grid', gridTemplateColumns: '1fr 80px 80px 2fr',
            alignItems: 'center',
          }}>
            <div style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.charcoal }}>{r.risk}</div>
            </div>
            <div style={{ padding: '14px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>PROB</div>
              <Pill color={probabilityColor(r.probability)}>{r.probability}</Pill>
            </div>
            <div style={{ padding: '14px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>IMPACT</div>
              <Pill color={probabilityColor(r.impact)}>{r.impact}</Pill>
            </div>
            <div style={{ padding: '14px 16px', background: C.bg, borderLeft: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, marginBottom: 4 }}>MITIGATION</div>
              <div style={{ fontSize: 13, color: C.charcoal, lineHeight: 1.4 }}>{r.mitigation}</div>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function ChecklistTab({ brief }: { brief: ProductBrief }) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const toggle = (i: number) => {
    setChecked(prev => {
      const n = new Set(prev);
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });
  };
  const p0 = brief.launch_checklist.filter(c => c.priority === 'P0');
  const p1 = brief.launch_checklist.filter(c => c.priority === 'P1');
  const p2 = brief.launch_checklist.filter(c => c.priority === 'P2');

  const Group = ({ items, label, color }: { items: ChecklistItem[]; label: string; color: string }) => {
    const globalOffset = brief.launch_checklist.indexOf(items[0]);
    return (
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{
            padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
            background: `${color}15`, color, border: `1px solid ${color}40`,
          }}>{label}</span>
          <span style={{ fontSize: 12, color: C.muted }}>{items.length} tasks</span>
        </div>
        {items.map((item, localIdx) => {
          const globalIdx = brief.launch_checklist.indexOf(item);
          const done = checked.has(globalIdx);
          return (
            <div
              key={localIdx}
              onClick={() => toggle(globalIdx)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px',
                borderRadius: 10, marginBottom: 4, cursor: 'pointer',
                background: done ? `${C.sage}08` : C.white,
                border: `1px solid ${done ? C.sage + '40' : C.border}`,
                transition: 'all 0.15s',
              }}
            >
              <div style={{
                width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1,
                background: done ? C.sage : C.white,
                border: done ? 'none' : `2px solid ${C.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s',
              }}>
                {done && <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>✓</span>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 13, fontWeight: 500,
                  color: done ? C.muted : C.charcoal,
                  textDecoration: done ? 'line-through' : 'none',
                }}>
                  {item.task}
                </div>
                {item.notes && (
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{item.notes}</div>
                )}
              </div>
              <Pill color={
                item.owner === 'Founder' ? C.coral :
                item.owner === 'Agency' ? C.plum :
                item.owner === 'Supplier' ? C.amber : C.charcoal
              }>
                {item.owner}
              </Pill>
            </div>
          );
        })}
      </div>
    );
  };

  const done = checked.size;
  const total = brief.launch_checklist.length;
  const pct = Math.round((done / total) * 100);

  return (
    <SectionCard>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <Label>Launch Checklist ({done}/{total} done)</Label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 120, height: 6, background: C.borderLight, borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: C.sage, borderRadius: 3, transition: 'width 0.3s ease' }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.sage }}>{pct}%</span>
        </div>
      </div>
      {p0.length > 0 && <Group items={p0} label="P0 — Must Do First" color={C.rose} />}
      {p1.length > 0 && <Group items={p1} label="P1 — Important" color={C.amber} />}
      {p2.length > 0 && <Group items={p2} label="P2 — Nice to Have" color={C.muted} />}
    </SectionCard>
  );
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div>
      <style>{`
        @keyframes brief-shimmer {
          from { background-position: 200% center; }
          to { background-position: -200% center; }
        }
      `}</style>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          background: C.white, border: `1px solid ${C.border}`, borderRadius: 16,
          padding: 28, marginBottom: 20,
          animation: `brief-fadeUp 0.4s ease ${i * 0.12}s both`,
        }}>
          <SkeletonBlock h={10} w={100} mb={16} />
          <SkeletonBlock h={16} mb={8} />
          <SkeletonBlock h={16} w="80%" mb={8} />
          <SkeletonBlock h={16} w="60%" mb={0} />
        </div>
      ))}
    </div>
  );
}

// ─── Manual Entry Form ────────────────────────────────────────────────────────

function ManualEntryForm({ onSubmit }: { onSubmit: (p: Partial<GenNextProduct>, niches: string[]) => void }) {
  const [productName, setProductName] = useState('');
  const [tagline, setTagline] = useState('');
  const [category, setCategory] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [niche, setNiche] = useState('');
  const [whiteSpace, setWhiteSpace] = useState('');

  const handleSubmit = () => {
    if (!productName.trim()) return;
    onSubmit({
      productName, tagline, category, targetPrice,
      whiteSpace, keyFeatures: [], ingredients_or_specs: [],
      targetAudience: '', differentiator: '',
      launchDifficulty: 'Medium', confidenceScore: 75,
      estimatedMonthlySales: 'TBD', salesPotential: 70,
    }, niche ? [niche] : ['general']);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px', borderRadius: 10, fontSize: 14,
    border: `1px solid ${C.border}`, outline: 'none', boxSizing: 'border-box',
    background: C.white, color: C.charcoal,
  };

  return (
    <div style={{ maxWidth: 600, margin: '60px auto 0', animation: 'brief-fadeUp 0.5s ease' }}>
      <style>{`@keyframes brief-fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }`}</style>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>📄</div>
        <h1 style={{ fontSize: 32, fontWeight: 700, margin: '0 0 8px', color: C.charcoal }}>
          Product Brief Generator
        </h1>
        <p style={{ color: C.muted, fontSize: 15, margin: 0, lineHeight: 1.6 }}>
          Enter your product concept and we'll generate a full investor-grade brief with market sizing, margin stack, GTM plan, and more.
        </p>
      </div>

      <div style={{
        background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 32,
      }}>
        <div style={{ marginBottom: 16 }}>
          <Label>Product Name *</Label>
          <input value={productName} onChange={e => setProductName(e.target.value)} style={inputStyle}
            placeholder="e.g. MushFlow Adaptogenic Coffee Blend" />
        </div>
        <div style={{ marginBottom: 16 }}>
          <Label>Tagline</Label>
          <input value={tagline} onChange={e => setTagline(e.target.value)} style={inputStyle}
            placeholder="e.g. The focused calm you've been missing" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <Label>Category / Niche</Label>
            <input value={category} onChange={e => setCategory(e.target.value)} style={inputStyle}
              placeholder="e.g. Wellness / Nootropics" />
          </div>
          <div>
            <Label>Target Price</Label>
            <input value={targetPrice} onChange={e => setTargetPrice(e.target.value)} style={inputStyle}
              placeholder="e.g. $34.99" />
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <Label>Market Niche (for competitor context)</Label>
          <input value={niche} onChange={e => setNiche(e.target.value)} style={inputStyle}
            placeholder="e.g. mushroom coffee" />
        </div>
        <div style={{ marginBottom: 24 }}>
          <Label>White Space / Core Opportunity</Label>
          <textarea value={whiteSpace} onChange={e => setWhiteSpace(e.target.value)}
            style={{ ...inputStyle, height: 80, resize: 'vertical' }}
            placeholder="e.g. No clean-label adaptogenic coffee with Lion's Mane + L-Theanine at sub-$35 price point" />
        </div>
        <button
          onClick={handleSubmit}
          disabled={!productName.trim()}
          style={{
            width: '100%', padding: '14px', background: C.coral, color: '#fff',
            fontSize: 15, fontWeight: 700, border: 'none', borderRadius: 10,
            cursor: productName.trim() ? 'pointer' : 'not-allowed',
            opacity: productName.trim() ? 1 : 0.5,
          }}
        >
          Generate Product Brief →
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const API_BASE = '/api/v1/product-intelligence';

const ProductBriefPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // State passed from ProductIntelligencePage via router
  const routerState = location.state as {
    product?: GenNextProduct;
    niches?: string[];
    competitors?: Record<string, unknown[]>;
  } | null;

  const [brief, setBrief] = useState<ProductBrief | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [copied, setCopied] = useState(false);
  const [currentProduct, setCurrentProduct] = useState<GenNextProduct | null>(
    routerState?.product ?? null
  );

  // Auto-generate when arriving with product state
  useEffect(() => {
    if (routerState?.product && !brief) {
      generateBrief(routerState.product, routerState.niches ?? [], routerState.competitors ?? {});
    }
  }, []);

  const generateBrief = async (
    product: GenNextProduct | Partial<GenNextProduct>,
    niches: string[],
    competitors: Record<string, unknown[]> = {}
  ) => {
    setLoading(true);
    setError('');
    setBrief(null);
    setCurrentProduct(product as GenNextProduct);
    try {
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
      // Attach original product fields for overview tab
      setBrief({ ...data, keyFeatures: product.keyFeatures ?? [], targetAudience: product.targetAudience ?? '', differentiator: product.differentiator ?? '' } as any);
    } catch (e: any) {
      setError(e.message || 'Failed to generate brief');
    }
    setLoading(false);
  };

  const handleDownload = async () => {
    if (!currentProduct) return;
    try {
      const res = await fetch(`${API_BASE}/brief/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: currentProduct,
          niches: routerState?.niches ?? [],
          competitors: routerState?.competitors ?? {},
          geo: 'US',
        }),
      });
      const data = await res.json();
      const blob = new Blob([data.markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = data.filename;
      a.click(); URL.revokeObjectURL(url);
    } catch {
      setError('Failed to export brief');
    }
  };

  const handleCopy = () => {
    if (!brief) return;
    const text = [
      `# ${brief.product_name}`,
      `${brief.tagline}`,
      '',
      `## Executive Summary`,
      brief.executive_summary,
      '',
      `## Opportunity`,
      brief.opportunity_statement,
    ].join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Show manual entry if no product passed
  if (!loading && !brief && !currentProduct) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg }}>
        <ManualEntryForm onSubmit={(p, niches) => generateBrief(p, niches)} />
      </div>
    );
  }

  const difficultyColor = (d: string) =>
    d === 'Easy' ? C.sage : d === 'Medium' ? C.amber : C.rose;

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <style>{`
        @keyframes brief-fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @keyframes brief-shimmer { from { background-position:200% center; } to { background-position:-200% center; } }
      `}</style>

      {/* Hero Header */}
      <div style={{
        background: C.white, borderBottom: `1px solid ${C.border}`,
        padding: '24px 32px',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <button
                onClick={() => navigate('/product-intelligence')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 13, padding: 0 }}
              >
                ← Product Intel
              </button>
              <span style={{ color: C.border }}>/</span>
              <span style={{ fontSize: 12, color: C.muted }}>Brief</span>
            </div>
            {loading ? (
              <SkeletonBlock h={28} w={320} mb={8} />
            ) : (
              <>
                <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 4px', color: C.charcoal }}>
                  {brief?.product_name ?? currentProduct?.productName}
                </h1>
                <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>{brief?.tagline ?? currentProduct?.tagline}</p>
              </>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            {currentProduct && (
              <div style={{ display: 'flex', gap: 8 }}>
                {currentProduct.launchDifficulty && (
                  <Pill color={difficultyColor(currentProduct.launchDifficulty)}>
                    {currentProduct.launchDifficulty} Launch
                  </Pill>
                )}
                {currentProduct.targetPrice && (
                  <span style={{ fontSize: 20, fontWeight: 800, color: C.sage }}>{currentProduct.targetPrice}</span>
                )}
              </div>
            )}
            {brief && (
              <>
                <button
                  onClick={handleCopy}
                  style={{
                    padding: '8px 16px', background: C.borderLight, color: C.charcoal,
                    fontSize: 13, fontWeight: 600, border: `1px solid ${C.border}`,
                    borderRadius: 8, cursor: 'pointer',
                  }}
                >
                  {copied ? '✓ Copied' : 'Copy Summary'}
                </button>
                <button
                  onClick={handleDownload}
                  style={{
                    padding: '8px 16px', background: C.coral, color: '#fff',
                    fontSize: 13, fontWeight: 600, border: 'none',
                    borderRadius: 8, cursor: 'pointer',
                  }}
                >
                  ↓ Download .md
                </button>
              </>
            )}
            <button
              onClick={() => { setBrief(null); setCurrentProduct(null); setError(''); }}
              style={{
                padding: '8px 16px', background: C.borderLight, color: C.muted,
                fontSize: 13, fontWeight: 500, border: 'none', borderRadius: 8, cursor: 'pointer',
              }}
            >
              New Brief
            </button>
          </div>
        </div>

        {/* Confidence Ring + Stats */}
        {currentProduct && !loading && (
          <div style={{ maxWidth: 1100, margin: '16px auto 0', display: 'flex', gap: 20 }}>
            {[
              { label: 'Est. Monthly Revenue', value: currentProduct.estimatedMonthlySales },
              { label: 'Sales Potential', value: `${currentProduct.salesPotential}/100` },
              { label: 'Confidence Score', value: `${currentProduct.confidenceScore}%` },
              { label: 'Category', value: currentProduct.category },
            ].map(s => (
              <div key={s.label} style={{
                background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 16px',
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.charcoal, marginTop: 2 }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tab Bar */}
      {brief && (
        <div style={{
          background: C.white, borderBottom: `1px solid ${C.border}`,
          padding: '0 32px',
        }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', gap: 0 }}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '14px 18px', border: 'none', cursor: 'pointer',
                  background: 'none', fontSize: 13, fontWeight: activeTab === tab.id ? 700 : 500,
                  color: activeTab === tab.id ? C.coral : C.muted,
                  borderBottom: activeTab === tab.id ? `2px solid ${C.coral}` : '2px solid transparent',
                  transition: 'all 0.15s', whiteSpace: 'nowrap',
                }}
              >
                {tab.emoji} {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 32px' }}>
        {error && (
          <div style={{
            padding: '14px 18px', background: '#FFF0F0', border: '1px solid #FCC',
            borderRadius: 10, color: C.rose, fontSize: 14, marginBottom: 20,
          }}>
            ⚠️ {error}
          </div>
        )}

        {loading && <LoadingSkeleton />}

        {!loading && brief && (
          <div style={{ animation: 'brief-fadeUp 0.4s ease' }}>
            {activeTab === 'overview'   && <OverviewTab  brief={brief} />}
            {activeTab === 'market'     && <MarketTab    brief={brief} />}
            {activeTab === 'margin'     && <MarginTab    brief={brief} />}
            {activeTab === 'gtm'        && <GTMTab       brief={brief} />}
            {activeTab === 'supply'     && <SupplyTab    brief={brief} />}
            {activeTab === 'brand'      && <BrandTab     brief={brief} />}
            {activeTab === 'risks'      && <RisksTab     brief={brief} />}
            {activeTab === 'checklist'  && <ChecklistTab brief={brief} />}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductBriefPage;
