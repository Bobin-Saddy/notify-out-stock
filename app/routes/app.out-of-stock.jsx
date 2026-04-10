import React, { useState } from 'react';
import { json } from "@remix-run/node";
import { useLoaderData, useNavigation, Form } from "react-router";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

/* ─── Loader & Action ───────────────────────────── */

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const settings = await prisma.appSettings.findUnique({ where: { shop: session.shop } });
  return json({ settings });
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const data = {
    shop:           session.shop,
    adminEmail:     formData.get("adminEmail"),
    adminLanguage:  formData.get("adminLanguage") || "en",
    subjectLine:    formData.get("subjectLine"),
    includeSku:     formData.get("includeSku")     === "on",
    includeVendor:  formData.get("includeVendor")  === "on",
    includePrice:   formData.get("includePrice")   === "on",
    includeTags:    formData.get("includeTags")    === "on",
    updateViaEmail: formData.get("updateViaEmail") === "on",
  };

  await prisma.appSettings.upsert({
    where:  { shop: session.shop },
    update: data,
    create: data,
  });

  return json({ success: true });
}

/* ─── Constants ─────────────────────────────────── */

const LANGUAGES = [
  { code: 'en', label: '🇬🇧 English' },
  { code: 'hi', label: '🇮🇳 Hindi — हिन्दी' },
  { code: 'fr', label: '🇫🇷 French — Français' },
  { code: 'de', label: '🇩🇪 German — Deutsch' },
  { code: 'es', label: '🇪🇸 Spanish — Español' },
  { code: 'ar', label: '🇸🇦 Arabic — العربية' },
  { code: 'zh', label: '🇨🇳 Chinese — 中文' },
  { code: 'ja', label: '🇯🇵 Japanese — 日本語' },
];

const TOGGLE_FIELDS = [
  { name: 'updateViaEmail', label: 'Reply to sync inventory',  sub: 'Update stock by replying to the alert email', defaultKey: 'updateViaEmail' },
  { name: 'includeSku',     label: 'Include SKU',              sub: 'Show variant SKU codes in the alert',         defaultKey: 'includeSku',    defaultOn: true },
  { name: 'includePrice',   label: 'Include price',            sub: 'Display product pricing in the alert',        defaultKey: 'includePrice' },
  { name: 'includeVendor',  label: 'Include vendor',           sub: 'Show supplier or brand name',                 defaultKey: 'includeVendor', defaultOn: true },
  { name: 'includeTags',    label: 'Include tags',             sub: 'Append product tags to the alert',            defaultKey: 'includeTags' },
];

const RECENT_ALERTS = [
  { color: '#6c5ce7', name: 'Classic White Tee — XL',  time: '2 hours ago' },
  { color: '#e84393', name: 'Slim Jogger — Black S',   time: '5 hours ago' },
  { color: '#f59e0b', name: 'Canvas Tote — Natural',   time: 'Yesterday'   },
];

/* ─── Page Component ────────────────────────────── */

export default function SettingsPage() {
  const { settings } = useLoaderData();
  const navigation   = useNavigation();
  const isSaving     = navigation.state === 'submitting';
  const [charCount, setCharCount] = useState(settings?.subjectLine?.length ?? 0);

  return (
    <div style={s.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Fraunces:wght@600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input:focus, select:focus { border-color: #6c5ce7 !important; background: #fff !important; outline: none; }
        input::placeholder { color: #ccc; }
        button:active { transform: scale(0.97); }
        @keyframes spin { to { transform: rotate(360deg); } }
        .tog-item:hover { background: #faf9f7; }
        .s-icon:hover { background: #f5f3ef; }
        .s-icon:hover svg { stroke: #888; }
      `}</style>

      <div style={s.layout}>

        {/* ── Icon Sidebar ── */}
        <aside style={s.sidebar}>
          <div style={s.sLogo}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2">
              <rect x="2" y="2" width="5" height="5" rx="1"/>
              <rect x="9" y="2" width="5" height="5" rx="1"/>
              <rect x="2" y="9" width="5" height="5" rx="1"/>
              <rect x="9" y="9" width="5" height="5" rx="1"/>
            </svg>
          </div>

          <SideIcon><HamburgerIcon /></SideIcon>
          <SideIcon><ClockIcon /></SideIcon>
          <SideIcon><MailIcon /></SideIcon>
          <div style={s.sSep} />
          <SideIcon active>
            <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="#6c5ce7" strokeWidth="1.7">
              <circle cx="8" cy="8" r="2.5"/>
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M11.5 3.1l-1.4 1.4M4.5 11.5l-1.4 1.4"/>
            </svg>
          </SideIcon>
          <SideIcon>
            <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="#bbb" strokeWidth="1.7">
              <circle cx="6" cy="5" r="3"/>
              <path d="M1 14c0-3 2-5 5-5m4 4l2 2 3-4"/>
            </svg>
          </SideIcon>
        </aside>

        {/* ── Body ── */}
        <div style={s.body}>

          {/* Topbar */}
          <div style={s.topbar}>
            <div style={s.breadcrumb}>
              <span style={s.breadCrumbDim}>App</span>
              <ChevronIcon />
              <span style={s.breadCrumbActive}>Settings</span>
            </div>
            <div style={s.tActions}>
              <button type="button" style={s.btnGhost}>Discard</button>
              <button
                form="settings-form"
                style={{ ...s.btnSave, opacity: isSaving ? 0.75 : 1 }}
                disabled={isSaving}
              >
                {isSaving
                  ? <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="#fff" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}><path d="M7 1a6 6 0 110 12A6 6 0 017 1z" strokeOpacity="0.3"/><path d="M7 1a6 6 0 016 6"/></svg>
                  : <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="2 7 6 11 12 3"/></svg>
                }
                {isSaving ? 'Saving…' : 'Save settings'}
              </button>
            </div>
          </div>

          {/* Content Grid */}
          <Form method="POST" id="settings-form">
            <div style={s.content}>

              {/* ── Left Column ── */}
              <div style={s.leftCol}>

                {/* Notifications Card */}
                <div style={s.card}>
                  <div style={s.cardHead}>
                    <div style={s.chLeft}>
                      <div style={{ ...s.cIcon, background: '#f0edfd' }}>
                        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#6c5ce7" strokeWidth="1.8">
                          <rect x="1" y="3" width="14" height="10" rx="2"/><path d="M1 6l7 4 7-4"/>
                        </svg>
                      </div>
                      <div>
                        <div style={s.cardTitle}>Notifications</div>
                        <div style={s.cardSub}>Who receives stock alerts</div>
                      </div>
                    </div>
                  </div>
                  <div style={s.cardBody}>
                    <Field label="Receiver email" hint={<>Free plan: 1 email. <a href="#" style={s.link}>Upgrade for more →</a></>}>
                      <div style={s.inpRow}>
                        <input
                          name="adminEmail"
                          type="email"
                          defaultValue={settings?.adminEmail}
                          placeholder="admin@yourstore.com"
                          required
                          style={s.inp}
                        />
                        <button type="button" style={s.addBtn}>+ Add</button>
                      </div>
                    </Field>
                    <Field label="Alert language">
                      <select name="adminLanguage" defaultValue={settings?.adminLanguage || 'en'} style={s.inp}>
                        {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                      </select>
                    </Field>
                  </div>
                </div>

                {/* Email Contents Card */}
                <div style={s.card}>
                  <div style={s.cardHead}>
                    <div style={s.chLeft}>
                      <div style={{ ...s.cIcon, background: '#fff0f3' }}>
                        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#e84393" strokeWidth="1.8">
                          <rect x="1" y="2" width="14" height="12" rx="2"/><path d="M5 6h6M5 9h4"/>
                        </svg>
                      </div>
                      <div>
                        <div style={s.cardTitle}>Email contents</div>
                        <div style={s.cardSub}>Customize what's included</div>
                      </div>
                    </div>
                    <span style={s.badgeNew}>5 options</span>
                  </div>
                  <div>
                    {TOGGLE_FIELDS.map((f, i) => (
                      <ToggleRow
                        key={f.name}
                        name={f.name}
                        label={f.label}
                        sub={f.sub}
                        defaultChecked={settings?.[f.defaultKey] ?? f.defaultOn ?? false}
                        last={i === TOGGLE_FIELDS.length - 1}
                      />
                    ))}
                  </div>
                </div>

                {/* Subject Line Card */}
                <div style={s.card}>
                  <div style={s.cardHead}>
                    <div style={s.chLeft}>
                      <div style={{ ...s.cIcon, background: '#fff8ec' }}>
                        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#f59e0b" strokeWidth="1.8">
                          <path d="M2 4l6 5 6-5"/><rect x="1" y="3" width="14" height="10" rx="1.5"/>
                        </svg>
                      </div>
                      <div>
                        <div style={s.cardTitle}>Email subject line</div>
                        <div style={s.cardSub}>Template for alert subject</div>
                      </div>
                    </div>
                  </div>
                  <div style={s.cardBody}>
                    <div style={{ position: 'relative' }}>
                      <input
                        name="subjectLine"
                        type="text"
                        defaultValue={settings?.subjectLine}
                        placeholder="Out of stock products — action required"
                        maxLength={100}
                        style={{ ...s.inp, paddingRight: '72px' }}
                        onInput={e => setCharCount(e.currentTarget.value.length)}
                      />
                      <span style={s.charCount}>{charCount}/100</span>
                    </div>
                  </div>
                </div>

              </div>

              {/* ── Right Column ── */}
              <div style={s.rightCol}>

                {/* Stats Card */}
                <div style={{ ...s.card, padding: '20px 22px' }}>
                  <div style={s.statHeading}>Overview</div>
                  <div style={s.statRow}>
                    <div>
                      <div style={s.statLabel}>Out of stock</div>
                      <div style={s.statVal}>24</div>
                    </div>
                    <span style={{ ...s.chip, background: '#fff8ec', color: '#f59e0b' }}>+3 today</span>
                  </div>
                  <div style={s.statDivider} />
                  <div style={s.statRow}>
                    <div>
                      <div style={s.statLabel}>Alerts sent</div>
                      <div style={s.statVal}>138</div>
                    </div>
                    <span style={{ ...s.chip, background: '#e8f8f0', color: '#10a37f' }}>Active</span>
                  </div>
                </div>

                {/* Activity Card */}
                <div style={s.card}>
                  <div style={s.actHeader}>Recent alerts</div>
                  {RECENT_ALERTS.map((a, i) => (
                    <div
                      key={i}
                      style={{
                        ...s.actItem,
                        borderBottom: i < RECENT_ALERTS.length - 1 ? '1px solid #f7f4f0' : 'none',
                      }}
                    >
                      <div style={{ ...s.actDot, background: a.color }} />
                      <div>
                        <div style={s.actName}>{a.name}</div>
                        <div style={s.actTime}>{a.time}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Upgrade CTA */}
                <div style={s.planCard}>
                  <div style={s.planTitle}>Upgrade to Pro</div>
                  <div style={s.planSub}>Unlimited emails, priority alerts &amp; more</div>
                  <button type="button" style={s.planBtn}>View Pro features →</button>
                </div>

              </div>
            </div>
          </Form>
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-components ────────────────────────────── */

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: '18px' }}>
      <label style={s.lbl}>{label}</label>
      {children}
      {hint && <p style={s.hint}>{hint}</p>}
    </div>
  );
}

function ToggleRow({ name, label, sub, defaultChecked, last }) {
  const [on, setOn] = useState(defaultChecked);
  return (
    <div
      className="tog-item"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '13px 22px',
        borderBottom: last ? 'none' : '1px solid #f7f4f0',
        transition: 'background .1s',
      }}
    >
      <div>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a2e' }}>{label}</div>
        <div style={{ fontSize: '11px', color: '#bbb', marginTop: '2px' }}>{sub}</div>
      </div>
      <label style={{ position: 'relative', width: '40px', height: '22px', flexShrink: 0, cursor: 'pointer' }}>
        <input type="checkbox" name={name} checked={on} onChange={() => setOn(p => !p)} style={{ display: 'none' }} />
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '22px',
          background: on ? '#6c5ce7' : '#e8e3dc',
          transition: 'background .2s',
        }}>
          <div style={{
            position: 'absolute', width: '16px', height: '16px',
            left: '3px', top: '3px', borderRadius: '50%', background: '#fff',
            transform: on ? 'translateX(18px)' : 'translateX(0)',
            transition: 'transform .2s',
          }} />
        </div>
      </label>
    </div>
  );
}

function SideIcon({ children, active }) {
  return (
    <div
      className={active ? '' : 's-icon'}
      style={{
        width: '38px', height: '38px', borderRadius: '10px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', background: active ? '#f0edfd' : 'transparent',
        transition: 'background .15s',
      }}
    >
      {children}
    </div>
  );
}

function HamburgerIcon() {
  return <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="#bbb" strokeWidth="1.7"><path d="M1 3h14M1 8h14M1 13h14"/></svg>;
}
function ClockIcon() {
  return <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="#bbb" strokeWidth="1.7"><circle cx="8" cy="8" r="6.5"/><path d="M8 5v3l2 2"/></svg>;
}
function MailIcon() {
  return <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="#bbb" strokeWidth="1.7"><rect x="1" y="3" width="14" height="10" rx="2"/><path d="M1 6l7 4 7-4"/></svg>;
}
function ChevronIcon() {
  return <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#ccc" strokeWidth="2"><path d="M4 2l4 4-4 4"/></svg>;
}

/* ─── Styles ────────────────────────────────────── */

const s = {
  page: {
    fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    background: '#f0ede8',
    minHeight: '100vh',
  },
  layout: { display: 'flex', minHeight: '100vh' },
  sidebar: {
    width: '64px', background: '#fff',
    borderRight: '1px solid #e8e3dc',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', padding: '18px 0', gap: '6px',
    minHeight: '100vh', flexShrink: 0,
  },
  sLogo: {
    width: '36px', height: '36px', background: '#6c5ce7',
    borderRadius: '10px', display: 'flex', alignItems: 'center',
    justifyContent: 'center', marginBottom: '12px',
  },
  sSep: { width: '28px', height: '1px', background: '#eee', margin: '6px 0' },
  body: { flex: 1, display: 'flex', flexDirection: 'column' },
  topbar: {
    background: '#fff', borderBottom: '1px solid #e8e3dc',
    height: '58px', padding: '0 28px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  breadcrumb: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' },
  breadCrumbDim: { color: '#bbb' },
  breadCrumbActive: { color: '#1a1a2e', fontWeight: 700 },
  tActions: { display: 'flex', alignItems: 'center', gap: '8px' },
  btnGhost: {
    height: '34px', padding: '0 14px', border: '1px solid #e0dbd3',
    borderRadius: '8px', background: '#fff', fontFamily: 'inherit',
    fontSize: '12px', fontWeight: 600, color: '#666', cursor: 'pointer',
  },
  btnSave: {
    height: '34px', padding: '0 16px', border: 'none', borderRadius: '8px',
    background: '#6c5ce7', fontFamily: 'inherit', fontSize: '12px', fontWeight: 700,
    color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center',
    gap: '6px', letterSpacing: '0.02em', transition: 'background .15s, transform .1s',
  },
  content: {
    padding: '24px 28px',
    display: 'grid', gridTemplateColumns: '2fr 1.2fr', gap: '20px', alignItems: 'start',
  },
  leftCol: { display: 'flex', flexDirection: 'column', gap: '16px' },
  rightCol: { display: 'flex', flexDirection: 'column', gap: '16px' },
  card: {
    background: '#fff', borderRadius: '16px',
    border: '1px solid #e8e3dc', overflow: 'hidden',
  },
  cardHead: {
    padding: '18px 22px', borderBottom: '1px solid #f0ede8',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  chLeft: { display: 'flex', alignItems: 'center', gap: '10px' },
  cIcon: {
    width: '32px', height: '32px', borderRadius: '9px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { fontSize: '13px', fontWeight: 700, color: '#1a1a2e' },
  cardSub:   { fontSize: '11px', color: '#aaa', marginTop: '1px' },
  cardBody:  { padding: '22px' },
  badgeNew: {
    background: '#f0edfd', color: '#6c5ce7',
    fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '20px', letterSpacing: '0.04em',
  },
  lbl: {
    fontSize: '11px', fontWeight: 700, color: '#999',
    letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px', display: 'block',
  },
  inp: {
    width: '100%', border: '1.5px solid #ede9e2', borderRadius: '10px',
    padding: '0 14px', height: '42px', fontFamily: 'inherit', fontSize: '13px',
    color: '#1a1a2e', background: '#faf9f7', outline: 'none',
    transition: 'border-color .15s, background .15s', boxSizing: 'border-box',
  },
  inpRow: { display: 'flex', gap: '8px' },
  addBtn: {
    height: '42px', padding: '0 16px', border: '1.5px solid #ede9e2',
    borderRadius: '10px', background: '#faf9f7', fontFamily: 'inherit',
    fontSize: '12px', fontWeight: 700, color: '#6c5ce7', cursor: 'pointer', whiteSpace: 'nowrap',
  },
  hint: { fontSize: '11px', color: '#bbb', marginTop: '6px' },
  link: { color: '#6c5ce7', textDecoration: 'none', fontWeight: 600 },
  charCount: {
    position: 'absolute', right: '14px', top: '50%',
    transform: 'translateY(-50%)', fontSize: '11px', color: '#ccc', pointerEvents: 'none',
  },
  statHeading: {
    fontSize: '11px', fontWeight: 700, color: '#999',
    letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '16px',
  },
  statRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' },
  statLabel: { fontSize: '11px', color: '#aaa', fontWeight: 600, marginBottom: '4px' },
  statVal: { fontSize: '22px', fontWeight: 700, color: '#1a1a2e', fontFamily: "'Fraunces', Georgia, serif" },
  chip: { fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px' },
  statDivider: { height: '1px', background: '#f0ede8', margin: '0 0 14px' },
  actHeader: {
    padding: '14px 20px', borderBottom: '1px solid #f0ede8',
    fontSize: '11px', fontWeight: 700, color: '#999', letterSpacing: '0.08em', textTransform: 'uppercase',
  },
  actItem: { display: 'flex', alignItems: 'center', gap: '12px', padding: '13px 20px' },
  actDot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  actName: { fontSize: '12px', fontWeight: 600, color: '#1a1a2e' },
  actTime: { fontSize: '11px', color: '#bbb' },
  planCard: {
    background: 'linear-gradient(135deg, #6c5ce7 0%, #a855f7 100%)',
    borderRadius: '16px', padding: '20px 22px', color: '#fff',
  },
  planTitle: { fontSize: '13px', fontWeight: 700, marginBottom: '4px' },
  planSub: { fontSize: '11px', opacity: 0.75, marginBottom: '16px' },
  planBtn: {
    width: '100%', height: '34px', borderRadius: '8px', border: 'none',
    background: 'rgba(255,255,255,0.2)', color: '#fff', fontFamily: 'inherit',
    fontSize: '12px', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.03em',
  },
};