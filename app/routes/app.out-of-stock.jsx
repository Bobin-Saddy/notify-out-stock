import React from 'react';
import { json } from "@remix-run/node";
import { useLoaderData, useNavigation, Form } from "react-router";
import { ArrowLeft, Loader2, CheckCircle2, Mail, LayoutList, AlignLeft } from 'lucide-react';
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

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
  { name: 'updateViaEmail', label: 'Update inventory via email',  sub: 'Reply to alert to sync stock directly',  defaultKey: 'updateViaEmail' },
  { name: 'includeSku',     label: 'Include SKU',                 sub: 'Show variant SKU in alert',             defaultKey: 'includeSku',    defaultOn: true },
  { name: 'includePrice',   label: 'Include price',               sub: 'Display product pricing',               defaultKey: 'includePrice' },
  { name: 'includeVendor',  label: 'Include vendor',              sub: 'Show supplier / brand name',            defaultKey: 'includeVendor', defaultOn: true },
  { name: 'includeTags',    label: 'Include tags',                sub: 'Attach product tags to alert',          defaultKey: 'includeTags' },
];

export default function SettingsPage() {
  const { settings } = useLoaderData();
  const navigation  = useNavigation();
  const isSaving    = navigation.state === "submitting";

  return (
    <div style={styles.wrap}>
      {/* ── Header ── */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <button type="button" style={styles.backBtn} onClick={() => history.back()}>
            <ArrowLeft size={16} />
          </button>
          <span style={styles.headerTitle}>Basic Settings</span>
        </div>
        <button
          form="settings-form"
          style={{ ...styles.saveBtn, opacity: isSaving ? 0.7 : 1 }}
          disabled={isSaving}
        >
          {isSaving
            ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
            : <CheckCircle2 size={14} />}
          {isSaving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      <Form method="POST" id="settings-form" style={styles.content}>

        {/* ── General Settings ── */}
        <Section icon={<Mail size={15} color="#185FA5" />} iconBg="#E6F1FB" title="General settings">
          <Field label="Receiver email" hint={<>Only 1 email allowed on current plan. <a href="#" style={styles.link}>Upgrade for more →</a></>}>
            <div style={styles.inputRow}>
              <input
                name="adminEmail"
                type="email"
                defaultValue={settings?.adminEmail}
                placeholder="admin@yourstore.com"
                required
                style={styles.input}
              />
              <button type="button" style={styles.addBtn}>Add</button>
            </div>
          </Field>
          <Field label="Alert email language" hint="Out-of-stock alerts will be sent in this language.">
            <select name="adminLanguage" defaultValue={settings?.adminLanguage || 'en'} style={styles.input}>
              {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </Field>
        </Section>

        {/* ── Email Display Preferences ── */}
        <Section icon={<LayoutList size={15} color="#3B6D11" />} iconBg="#EAF3DE" title="Email display preferences">
          <div style={styles.checksGrid}>
            {TOGGLE_FIELDS.map((f, i) => (
              <ToggleRow
                key={f.name}
                name={f.name}
                label={f.label}
                sub={f.sub}
                defaultChecked={settings?.[f.defaultKey] ?? f.defaultOn ?? false}
                isLast={i === TOGGLE_FIELDS.length - 1}
                isOddLast={TOGGLE_FIELDS.length % 2 !== 0 && i === TOGGLE_FIELDS.length - 1}
              />
            ))}
          </div>
        </Section>

        {/* ── Email Subject Line ── */}
        <Section icon={<AlignLeft size={15} color="#BA7517" />} iconBg="#FAEEDA" title="Email subject line">
          <Field label="Subject">
            <div style={{ position: 'relative' }}>
              <input
                name="subjectLine"
                type="text"
                defaultValue={settings?.subjectLine}
                placeholder="Out of stock products — action required"
                maxLength={100}
                style={{ ...styles.input, paddingRight: '80px' }}
                onInput={e => {
                  const counter = e.currentTarget.parentElement.querySelector('.char-count');
                  if (counter) counter.textContent = `${e.currentTarget.value.length} / 100`;
                }}
              />
              <span className="char-count" style={styles.charCount}>
                {(settings?.subjectLine?.length ?? 0)} / 100
              </span>
            </div>
          </Field>
        </Section>

      </Form>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input:focus, select:focus { border-color: rgba(0,0,0,0.4) !important; outline: none; }
        input::placeholder { color: #aaa; }
        button:active { transform: scale(0.97); }
      `}</style>
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────── */

function Section({ icon, iconBg, title, children }) {
  return (
    <div style={styles.section}>
      <div style={styles.sectionHeader}>
        <div style={{ ...styles.sectionIcon, background: iconBg }}>{icon}</div>
        <span style={styles.sectionTitle}>{title}</span>
      </div>
      <div style={styles.sectionBody}>{children}</div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div style={styles.field}>
      <label style={styles.label}>{label}</label>
      {children}
      {hint && <p style={styles.hint}>{hint}</p>}
    </div>
  );
}

function ToggleRow({ name, label, sub, defaultChecked, isLast, isOddLast }) {
  const [checked, setChecked] = React.useState(defaultChecked);
  return (
    <label
      style={{
        ...styles.toggleRow,
        borderBottom: isLast || isOddLast ? 'none' : '0.5px solid rgba(0,0,0,0.08)',
        gridColumn: isOddLast ? '1 / -1' : undefined,
      }}
    >
      {/* Hidden real checkbox for form submission */}
      <input type="checkbox" name={name} checked={checked} onChange={() => {}} style={{ display: 'none' }} />
      {/* Visual toggle */}
      <div
        onClick={() => setChecked(p => !p)}
        style={{
          ...styles.toggleTrack,
          background: checked ? '#1D9E75' : 'rgba(0,0,0,0.15)',
        }}
      >
        <div style={{ ...styles.toggleThumb, transform: checked ? 'translateX(16px)' : 'translateX(0)' }} />
      </div>
      <div style={styles.toggleText}>
        <span style={styles.toggleLabel}>
          {label}
          {checked && <span style={styles.badge}>On</span>}
        </span>
        <span style={styles.toggleSub}>{sub}</span>
      </div>
    </label>
  );
}

/* ─── Styles ─────────────────────────────────────── */

const styles = {
  wrap: {
    fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    background: '#F5F5F4',
    minHeight: '100vh',
    color: '#111',
  },
  header: {
    background: '#fff',
    borderBottom: '0.5px solid rgba(0,0,0,0.08)',
    padding: '0 1.5rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '60px',
    position: 'sticky',
    top: 0,
    zIndex: 20,
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '12px' },
  backBtn: {
    width: '34px', height: '34px', borderRadius: '50%',
    border: '0.5px solid rgba(0,0,0,0.15)', background: 'transparent',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', color: '#555', transition: 'background 0.15s',
  },
  headerTitle: { fontSize: '15px', fontWeight: 700, letterSpacing: '0.01em' },
  saveBtn: {
    background: '#111', color: '#fff', border: 'none',
    padding: '0 18px', height: '36px', borderRadius: '8px',
    fontSize: '13px', fontWeight: 600, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: '7px',
    letterSpacing: '0.02em', transition: 'opacity 0.15s, transform 0.1s',
  },
  content: { maxWidth: '760px', margin: '0 auto', padding: '2rem 1.25rem 4rem' },
  section: {
    background: '#fff', borderRadius: '12px',
    border: '0.5px solid rgba(0,0,0,0.08)',
    overflow: 'hidden', marginBottom: '1rem',
  },
  sectionHeader: {
    padding: '1.1rem 1.4rem', borderBottom: '0.5px solid rgba(0,0,0,0.08)',
    display: 'flex', alignItems: 'center', gap: '10px',
  },
  sectionIcon: {
    width: '28px', height: '28px', borderRadius: '7px',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  sectionTitle: { fontSize: '11px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#666' },
  sectionBody: { padding: '1.4rem' },
  field: { marginBottom: '1.1rem' },
  label: { fontSize: '11px', fontWeight: 700, color: '#666', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.45rem', display: 'block' },
  hint: { fontSize: '12px', color: '#999', marginTop: '0.35rem' },
  link: { color: '#185FA5', textDecoration: 'none' },
  input: {
    width: '100%', border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: '8px',
    padding: '0 13px', height: '40px', fontFamily: 'inherit', fontSize: '14px',
    background: '#fff', color: '#111', boxSizing: 'border-box',
  },
  inputRow: { display: 'flex', gap: '8px' },
  addBtn: {
    height: '40px', padding: '0 16px', border: '0.5px solid rgba(0,0,0,0.2)',
    borderRadius: '8px', background: 'transparent', fontFamily: 'inherit',
    fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: '#111',
    whiteSpace: 'nowrap',
  },
  charCount: { position: 'absolute', right: '13px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: '#aaa', pointerEvents: 'none' },
  checksGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', margin: '-1.4rem' },
  toggleRow: {
    display: 'flex', alignItems: 'flex-start', gap: '12px',
    padding: '1rem 1.25rem', cursor: 'pointer',
    borderRight: '0.5px solid rgba(0,0,0,0.08)',
  },
  toggleTrack: {
    position: 'relative', width: '36px', height: '20px', borderRadius: '20px',
    flexShrink: 0, marginTop: '1px', transition: 'background 0.2s', cursor: 'pointer',
  },
  toggleThumb: {
    position: 'absolute', height: '14px', width: '14px', left: '3px', top: '3px',
    background: '#fff', borderRadius: '50%', transition: 'transform 0.2s',
  },
  toggleText: { flex: 1 },
  toggleLabel: { fontSize: '13px', fontWeight: 500, display: 'block', lineHeight: 1.3 },
  toggleSub: { fontSize: '11px', color: '#999', marginTop: '2px', display: 'block' },
  badge: {
    display: 'inline-block', background: '#EAF3DE', color: '#3B6D11',
    fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: '10px',
    letterSpacing: '0.04em', marginLeft: '6px', verticalAlign: 'middle',
  },
};