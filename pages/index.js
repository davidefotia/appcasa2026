import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';

// ─── COSTANTI ────────────────────────────────────────────────────────────────
const MEMBERS = ['Davide', 'Francesca'];
const MEMBER_COLORS = { Davide: '#2C4A7C', Francesca: '#C4614A' };
const CATEGORIES = ['Casa', 'Cibo', 'Trasporti', 'Salute', 'Svago', 'Altro'];
const CAT_ICONS = { Casa: '🏠', Cibo: '🍽️', Trasporti: '🚗', Salute: '💊', Svago: '🎭', Altro: '📦' };
const MONTH_IT = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const DOW = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
const TABS = [
  { id: 'calendar', icon: '📅', label: 'Calendario' },
  { id: 'shopping', icon: '🛒', label: 'Spesa' },
  { id: 'expenses', icon: '💰', label: 'Spese' },
  { id: 'tasks',    icon: '✅', label: 'Task' },
];

// ─── STORAGE (Vercel KV via API) ─────────────────────────────────────────────
async function dbLoad(key) {
  try {
    const r = await fetch(`/api/data?key=${key}`);
    const j = await r.json();
    return j.value ?? null;
  } catch { return null; }
}
async function dbSave(key, value) {
  try {
    await fetch(`/api/data?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    });
  } catch {}
}

// ─── PARSER iCAL ─────────────────────────────────────────────────────────────
function parseIcal(text) {
  const events = [];
  const lines = text.replace(/\r\n /g, '').replace(/\r\n/g, '\n').split('\n');
  let cur = null;
  for (const line of lines) {
    if (line.startsWith('BEGIN:VEVENT')) { cur = {}; continue; }
    if (line.startsWith('END:VEVENT') && cur) {
      if (cur.date && cur.title) events.push(cur);
      cur = null; continue;
    }
    if (!cur) continue;
    if (line.startsWith('SUMMARY:')) cur.title = line.slice(8).trim();
    if (line.startsWith('DESCRIPTION:')) cur.note = line.slice(12).trim().replace(/\\n/g, ' ').slice(0, 80);
    if (line.startsWith('DTSTART')) {
      const val = line.split(':').slice(1).join(':').trim().replace(/[TZ]/g, '');
      if (val.length >= 8) cur.date = `${val.slice(0,4)}-${val.slice(4,6)}-${val.slice(6,8)}`;
    }
    if (line.startsWith('UID:')) cur.id = 'gcal_' + line.slice(4).trim();
  }
  return events.map(e => ({ ...e, id: e.id || 'gcal_' + Math.random(), member: 'Google', isGcal: true }));
}

// ─── COMPONENTI BASE ──────────────────────────────────────────────────────────
function Avatar({ name, size = 32 }) {
  const bg = name === 'Google' ? '#34A853' : (MEMBER_COLORS[name] || '#888');
  const letter = name === 'Google' ? 'G' : name[0];
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: bg, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'DM Serif Display', serif", fontSize: size * 0.42, fontWeight: 700, flexShrink: 0 }}>
      {letter}
    </div>
  );
}

function EmptyState({ icon, text }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#B0A99A' }}>
      <div style={{ fontSize: 36, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{text}</div>
    </div>
  );
}

function Badge({ label, color }) {
  return (
    <span style={{ background: color + '22', color, border: `1px solid ${color}55`,
      borderRadius: 20, padding: '1px 8px', fontSize: 10, fontWeight: 700,
      fontFamily: "'DM Sans', sans-serif" }}>{label}</span>
  );
}

// ─── SEZIONE CALENDARIO ───────────────────────────────────────────────────────
function CalendarSection({ events, setEvents }) {
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', date: '', member: 'Davide', note: '' });
  const [gcalEvents, setGcalEvents] = useState([]);
  const [gcalStatus, setGcalStatus] = useState('idle');
  const [showGcal, setShowGcal] = useState(true);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;

  // Fetch Google Calendar via API server-side (no CORS)
  async function fetchGcal() {
    setGcalStatus('loading');
    try {
      const res = await fetch('/api/gcal');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      if (!text.includes('BEGIN:VCALENDAR')) throw new Error('Risposta non valida');
      const parsed = parseIcal(text);
      setGcalEvents(parsed);
      setGcalStatus('ok');
    } catch (e) {
      console.error('gcal error:', e);
      setGcalStatus('error');
    }
  }

  useEffect(() => { fetchGcal(); }, []);

  const allEvents = [...(events || []), ...(showGcal ? gcalEvents : [])];

  function getDay(day) {
    const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return allEvents.filter(e => e.date === ds);
  }

  const upcoming = allEvents
    .filter(e => e.date >= today.toISOString().slice(0, 10))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 8);

  function addEvent() {
    if (!form.title || !form.date) return;
    const updated = [...(events || []), { ...form, id: Date.now() }];
    setEvents(updated); dbSave('cal_events', updated);
    setShowForm(false); setForm({ title: '', date: '', member: 'Davide', note: '' });
  }

  function removeEvent(id) {
    const updated = (events || []).filter(e => e.id !== id);
    setEvents(updated); dbSave('cal_events', updated);
  }

  return (
    <div>
      {/* Banner Google Calendar */}
      <div style={{ background: gcalStatus === 'error' ? '#FFF3F3' : '#F0FAF4',
        border: `1px solid ${gcalStatus === 'error' ? '#FFCCCC' : '#B8E6C8'}`,
        borderRadius: 12, padding: '10px 14px', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>📆</span>
            <div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700,
                color: gcalStatus === 'error' ? '#C4614A' : '#1A5C34' }}>Google Calendar</div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: '#555' }}>
                {gcalStatus === 'loading' && 'Sincronizzazione...'}
                {gcalStatus === 'ok' && `✓ ${gcalEvents.length} eventi sincronizzati`}
                {gcalStatus === 'error' && 'Errore — controlla la variabile GCAL_ICAL_URL'}
                {gcalStatus === 'idle' && 'Non configurato'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={fetchGcal} style={{ background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 16, opacity: gcalStatus === 'loading' ? 0.4 : 1 }}>↺</button>
            {gcalStatus === 'ok' && (
              <button onClick={() => setShowGcal(v => !v)} style={{ width: 40, height: 22, borderRadius: 11,
                border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
                background: showGcal ? '#34A853' : '#ccc' }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff',
                  position: 'absolute', top: 2, left: showGcal ? 20 : 2, transition: 'left 0.2s' }}/>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Navigazione mese */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button onClick={() => setViewDate(new Date(year, month - 1, 1))} style={S.navBtn}>‹</button>
        <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 21, color: '#1A1A2E', margin: 0 }}>
          {MONTH_IT[month]} {year}
        </h2>
        <button onClick={() => setViewDate(new Date(year, month + 1, 1))} style={S.navBtn}>›</button>
      </div>

      {/* Griglia */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 20 }}>
        {DOW.map(d => (
          <div key={d} style={{ textAlign: 'center', fontFamily: "'DM Sans', sans-serif",
            fontSize: 10, fontWeight: 700, color: '#B0A99A', padding: '3px 0' }}>{d}</div>
        ))}
        {Array(firstDay).fill(null).map((_, i) => <div key={'p' + i}/>)}
        {Array(daysInMonth).fill(null).map((_, i) => {
          const day = i + 1;
          const dayEvs = getDay(day);
          const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
          return (
            <div key={day} style={{ minHeight: 40, borderRadius: 6, padding: 2,
              background: isToday ? '#2C4A7C' : dayEvs.length ? '#FFF8F3' : '#FAFAF8',
              border: `1px solid ${isToday ? '#2C4A7C' : '#EDE8E1'}` }}>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600,
                textAlign: 'right', color: isToday ? '#fff' : '#1A1A2E', marginBottom: 2 }}>{day}</div>
              {dayEvs.slice(0, 2).map(ev => (
                <div key={ev.id} style={{ background: (ev.isGcal ? '#34A853' : MEMBER_COLORS[ev.member] || '#888') + 'CC',
                  borderRadius: 3, padding: '1px 3px', marginBottom: 1, fontSize: 8, color: '#fff',
                  fontFamily: "'DM Sans', sans-serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ev.title}
                </div>
              ))}
              {dayEvs.length > 2 && <div style={{ fontSize: 8, color: '#B0A99A' }}>+{dayEvs.length - 2}</div>}
            </div>
          );
        })}
      </div>

      {/* Prossimi eventi */}
      <h3 style={S.secTitle}>Prossimi eventi</h3>
      {upcoming.length === 0
        ? <EmptyState icon="📅" text="Nessun evento in programma"/>
        : upcoming.map(ev => (
          <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 10,
            background: '#fff', borderRadius: 12, padding: '10px 13px', marginBottom: 7,
            border: `1px solid ${ev.isGcal ? '#B8E6C8' : '#EDE8E1'}` }}>
            <div style={{ width: 3, height: 32, borderRadius: 2, flexShrink: 0,
              background: ev.isGcal ? '#34A853' : MEMBER_COLORS[ev.member] || '#888' }}/>
            <Avatar name={ev.member} size={26}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13,
                  color: '#1A1A2E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ev.title}
                </span>
                {ev.isGcal && <Badge label="Google" color="#34A853"/>}
              </div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: '#B0A99A' }}>
                {new Date(ev.date + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })}
                {ev.note && ` · ${ev.note}`}
              </div>
            </div>
            {!ev.isGcal && <button onClick={() => removeEvent(ev.id)} style={S.delBtn}>✕</button>}
          </div>
        ))
      }

      {showForm ? (
        <div style={S.formCard}>
          <h3 style={S.formTitle}>Nuovo evento</h3>
          <input style={S.input} placeholder="Titolo*" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}/>
          <input style={S.input} type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}/>
          <select style={S.input} value={form.member} onChange={e => setForm({ ...form, member: e.target.value })}>
            {MEMBERS.map(m => <option key={m}>{m}</option>)}
          </select>
          <input style={S.input} placeholder="Nota (opzionale)" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })}/>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button onClick={addEvent} style={S.primaryBtn}>Aggiungi</button>
            <button onClick={() => setShowForm(false)} style={S.secondaryBtn}>Annulla</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)} style={S.addBtn}>+ Aggiungi evento</button>
      )}
    </div>
  );
}

// ─── SEZIONE SPESA ────────────────────────────────────────────────────────────
function ShoppingSection({ items, setItems }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', qty: '1', unit: 'pz', addedBy: 'Davide' });
  const [filter, setFilter] = useState('tutti');
  const UNITS = ['pz', 'kg', 'g', 'l', 'ml', 'conf', 'busta', 'bottiglia'];

  function addItem() {
    if (!form.name) return;
    const updated = [...(items || []), { ...form, id: Date.now(), checked: false }];
    setItems(updated); dbSave('shopping', updated);
    setShowForm(false); setForm({ name: '', qty: '1', unit: 'pz', addedBy: 'Davide' });
  }
  function toggle(id) {
    const updated = (items || []).map(i => i.id === id ? { ...i, checked: !i.checked } : i);
    setItems(updated); dbSave('shopping', updated);
  }
  function remove(id) {
    const updated = (items || []).filter(i => i.id !== id);
    setItems(updated); dbSave('shopping', updated);
  }
  function clearDone() {
    const updated = (items || []).filter(i => !i.checked);
    setItems(updated); dbSave('shopping', updated);
  }

  const all = items || [];
  const filtered = filter === 'tutti' ? all : all.filter(i => i.addedBy === filter);
  const pending = filtered.filter(i => !i.checked);
  const done = filtered.filter(i => i.checked);

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {['tutti', 'Davide', 'Francesca'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ ...S.chip,
            background: filter === f ? '#2C4A7C' : '#FAFAF8',
            color: filter === f ? '#fff' : '#666' }}>{f === 'tutti' ? 'Tutti' : f}</button>
        ))}
        {done.length > 0 && (
          <button onClick={clearDone} style={{ ...S.chip, marginLeft: 'auto', color: '#C4614A', background: '#C4614A11' }}>
            🗑 Rimuovi ({done.length})
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <div style={S.statBox}><span style={S.statNum}>{pending.length}</span><span style={S.statLabel}>da comprare</span></div>
        <div style={S.statBox}><span style={S.statNum}>{done.length}</span><span style={S.statLabel}>nel carrello</span></div>
      </div>

      {all.length === 0 && <EmptyState icon="🛒" text="La lista è vuota — aggiungete qualcosa!"/>}

      {pending.map(item => (
        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10,
          background: '#fff', borderRadius: 12, padding: '11px 13px', marginBottom: 7, border: '1px solid #EDE8E1' }}>
          <button onClick={() => toggle(item.id)} style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0,
            border: `2px solid ${MEMBER_COLORS[item.addedBy] || '#888'}`, background: 'transparent', cursor: 'pointer' }}/>
          <div style={{ flex: 1 }}>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, color: '#1A1A2E' }}>{item.name}</span>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#B0A99A', marginLeft: 8 }}>{item.qty} {item.unit}</span>
          </div>
          <Avatar name={item.addedBy} size={24}/>
          <button onClick={() => remove(item.id)} style={S.delBtn}>✕</button>
        </div>
      ))}

      {done.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: '#B0A99A', fontWeight: 700, marginBottom: 7 }}>NEL CARRELLO</div>
          {done.map(item => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10,
              background: '#F5F3F0', borderRadius: 12, padding: '9px 13px', marginBottom: 5, opacity: 0.7 }}>
              <button onClick={() => toggle(item.id)} style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                background: MEMBER_COLORS[item.addedBy] || '#888', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 12 }}>✓</button>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#888', textDecoration: 'line-through', flex: 1 }}>
                {item.name} <span style={{ fontSize: 11 }}>{item.qty} {item.unit}</span>
              </span>
              <button onClick={() => remove(item.id)} style={S.delBtn}>✕</button>
            </div>
          ))}
        </div>
      )}

      {showForm ? (
        <div style={S.formCard}>
          <h3 style={S.formTitle}>Aggiungi prodotto</h3>
          <input style={S.input} placeholder="Prodotto*" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={{ ...S.input, flex: 1 }} type="number" min="1" placeholder="Qtà" value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })}/>
            <select style={{ ...S.input, flex: 1 }} value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
              {UNITS.map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
          <select style={S.input} value={form.addedBy} onChange={e => setForm({ ...form, addedBy: e.target.value })}>
            {MEMBERS.map(m => <option key={m}>{m}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button onClick={addItem} style={S.primaryBtn}>Aggiungi</button>
            <button onClick={() => setShowForm(false)} style={S.secondaryBtn}>Annulla</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)} style={S.addBtn}>+ Aggiungi prodotto</button>
      )}
    </div>
  );
}

// ─── SEZIONE SPESE ────────────────────────────────────────────────────────────
function ExpenseSection({ expenses, setExpenses }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ desc: '', amount: '', category: 'Casa', paidBy: 'Davide', date: new Date().toISOString().slice(0, 10) });

  function add() {
    if (!form.desc || !form.amount) return;
    const updated = [...(expenses || []), { ...form, amount: parseFloat(form.amount), id: Date.now() }];
    setExpenses(updated); dbSave('expenses', updated);
    setShowForm(false); setForm({ desc: '', amount: '', category: 'Casa', paidBy: 'Davide', date: new Date().toISOString().slice(0, 10) });
  }
  function remove(id) {
    const updated = (expenses || []).filter(e => e.id !== id);
    setExpenses(updated); dbSave('expenses', updated);
  }

  const exps = expenses || [];
  const total = exps.reduce((s, e) => s + e.amount, 0);
  const byMember = MEMBERS.map(m => ({ name: m, total: exps.filter(e => e.paidBy === m).reduce((s, e) => s + e.amount, 0) }));
  const balance = byMember[0].total - byMember[1].total;
  const byCat = CATEGORIES.map(c => ({ cat: c, total: exps.filter(e => e.category === c).reduce((s, e) => s + e.amount, 0) })).filter(x => x.total > 0);
  const recent = [...exps].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
        <div style={{ ...S.statBox, flexDirection: 'column', alignItems: 'flex-start' }}>
          <span style={S.statLabel}>Totale spese</span>
          <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: '#1A1A2E' }}>€{total.toFixed(2)}</span>
        </div>
        <div style={{ ...S.statBox, flexDirection: 'column', alignItems: 'flex-start' }}>
          <span style={S.statLabel}>Bilancio</span>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700,
            color: Math.abs(balance) < 0.01 ? '#4CAF50' : '#C4614A' }}>
            {Math.abs(balance) < 0.01 ? '✓ In pari' : balance > 0 ? `Fra deve €${balance.toFixed(2)}` : `Dav deve €${Math.abs(balance).toFixed(2)}`}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        {byMember.map(m => (
          <div key={m.name} style={{ flex: 1, background: '#fff', borderRadius: 12, padding: '12px 14px', border: '1px solid #EDE8E1' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Avatar name={m.name} size={22}/>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, color: '#1A1A2E' }}>{m.name}</span>
            </div>
            <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 19, color: MEMBER_COLORS[m.name] }}>€{m.total.toFixed(2)}</div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: '#B0A99A' }}>{total > 0 ? Math.round(m.total / total * 100) : 0}%</div>
          </div>
        ))}
      </div>

      {byCat.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <h3 style={S.secTitle}>Per categoria</h3>
          {byCat.map(x => (
            <div key={x.cat} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 15, width: 22 }}>{CAT_ICONS[x.cat]}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#1A1A2E' }}>{x.cat}</span>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, color: '#1A1A2E' }}>€{x.total.toFixed(2)}</span>
                </div>
                <div style={{ height: 4, background: '#EDE8E1', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${total > 0 ? x.total / total * 100 : 0}%`, background: '#C4614A', borderRadius: 2 }}/>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <h3 style={S.secTitle}>Movimenti recenti</h3>
      {recent.length === 0
        ? <EmptyState icon="💰" text="Nessuna spesa registrata"/>
        : recent.map(exp => (
          <div key={exp.id} style={{ display: 'flex', alignItems: 'center', gap: 10,
            background: '#fff', borderRadius: 12, padding: '10px 13px', marginBottom: 7, border: '1px solid #EDE8E1' }}>
            <span style={{ fontSize: 18 }}>{CAT_ICONS[exp.category]}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, color: '#1A1A2E' }}>{exp.desc}</div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: '#B0A99A' }}>
                {new Date(exp.date + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} · {exp.category}
              </div>
            </div>
            <Avatar name={exp.paidBy} size={22}/>
            <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 15, color: '#1A1A2E', minWidth: 55, textAlign: 'right' }}>€{exp.amount.toFixed(2)}</div>
            <button onClick={() => remove(exp.id)} style={S.delBtn}>✕</button>
          </div>
        ))
      }

      {showForm ? (
        <div style={S.formCard}>
          <h3 style={S.formTitle}>Nuova spesa</h3>
          <input style={S.input} placeholder="Descrizione*" value={form.desc} onChange={e => setForm({ ...form, desc: e.target.value })}/>
          <input style={S.input} type="number" min="0" step="0.01" placeholder="Importo €*" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}/>
          <select style={S.input} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <select style={S.input} value={form.paidBy} onChange={e => setForm({ ...form, paidBy: e.target.value })}>
            {MEMBERS.map(m => <option key={m}>{m}</option>)}
          </select>
          <input style={S.input} type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}/>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button onClick={add} style={S.primaryBtn}>Aggiungi</button>
            <button onClick={() => setShowForm(false)} style={S.secondaryBtn}>Annulla</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)} style={S.addBtn}>+ Aggiungi spesa</button>
      )}
    </div>
  );
}

// ─── SEZIONE TASK ─────────────────────────────────────────────────────────────
function TaskSection({ tasks, setTasks }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', assignedTo: 'Davide', priority: 'media', dueDate: '', note: '' });
  const PRIO = { alta: '#C4614A', media: '#E8A838', bassa: '#4CAF50' };

  function add() {
    if (!form.title) return;
    const updated = [...(tasks || []), { ...form, id: Date.now(), done: false }];
    setTasks(updated); dbSave('tasks', updated);
    setShowForm(false); setForm({ title: '', assignedTo: 'Davide', priority: 'media', dueDate: '', note: '' });
  }
  function toggle(id) {
    const updated = (tasks || []).map(t => t.id === id ? { ...t, done: !t.done } : t);
    setTasks(updated); dbSave('tasks', updated);
  }
  function remove(id) {
    const updated = (tasks || []).filter(t => t.id !== id);
    setTasks(updated); dbSave('tasks', updated);
  }

  const ts = tasks || [];
  const PRIO_ORDER = { alta: 0, media: 1, bassa: 2 };
  const pending = ts.filter(t => !t.done).sort((a, b) => PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority]);
  const done = ts.filter(t => t.done).slice(-5);

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        {MEMBERS.map(m => (
          <div key={m} style={{ flex: 1, background: '#fff', borderRadius: 12, padding: '12px 14px',
            border: '1px solid #EDE8E1', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar name={m} size={30}/>
            <div>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: MEMBER_COLORS[m] }}>
                {pending.filter(t => t.assignedTo === m).length}
              </div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: '#B0A99A' }}>task aperti</div>
            </div>
          </div>
        ))}
      </div>

      <h3 style={S.secTitle}>Da fare</h3>
      {pending.length === 0
        ? <EmptyState icon="✅" text="Tutto in ordine! Nessun task aperto"/>
        : pending.map(task => (
          <div key={task.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10,
            background: '#fff', borderRadius: 12, padding: '11px 13px', marginBottom: 7, border: '1px solid #EDE8E1' }}>
            <button onClick={() => toggle(task.id)} style={{ width: 22, height: 22, borderRadius: 6, marginTop: 1,
              flexShrink: 0, border: `2px solid ${PRIO[task.priority]}`, background: 'transparent', cursor: 'pointer' }}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, color: '#1A1A2E' }}>{task.title}</div>
              {task.note && <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: '#888', marginTop: 2 }}>{task.note}</div>}
              <div style={{ display: 'flex', gap: 6, marginTop: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                <Badge label={task.priority.toUpperCase()} color={PRIO[task.priority]}/>
                {task.dueDate && (
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: '#B0A99A' }}>
                    📅 {new Date(task.dueDate + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
                  </span>
                )}
              </div>
            </div>
            <Avatar name={task.assignedTo} size={24}/>
            <button onClick={() => remove(task.id)} style={S.delBtn}>✕</button>
          </div>
        ))
      }

      {done.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ ...S.secTitle, color: '#B0A99A' }}>Completati di recente</h3>
          {done.map(task => (
            <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 10,
              background: '#F5F3F0', borderRadius: 12, padding: '9px 13px', marginBottom: 5, opacity: 0.7 }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, background: '#4CAF50', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12 }}>✓</div>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#888', textDecoration: 'line-through', flex: 1 }}>{task.title}</span>
              <Avatar name={task.assignedTo} size={22}/>
              <button onClick={() => remove(task.id)} style={S.delBtn}>✕</button>
            </div>
          ))}
        </div>
      )}

      {showForm ? (
        <div style={S.formCard}>
          <h3 style={S.formTitle}>Nuovo task</h3>
          <input style={S.input} placeholder="Cosa fare?*" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}/>
          <select style={S.input} value={form.assignedTo} onChange={e => setForm({ ...form, assignedTo: e.target.value })}>
            {MEMBERS.map(m => <option key={m}>{m}</option>)}
          </select>
          <select style={S.input} value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
            <option value="alta">🔴 Alta priorità</option>
            <option value="media">🟡 Media priorità</option>
            <option value="bassa">🟢 Bassa priorità</option>
          </select>
          <input style={S.input} type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })}/>
          <input style={S.input} placeholder="Note (opzionale)" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })}/>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button onClick={add} style={S.primaryBtn}>Aggiungi</button>
            <button onClick={() => setShowForm(false)} style={S.secondaryBtn}>Annulla</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)} style={S.addBtn}>+ Aggiungi task</button>
      )}
    </div>
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function Home() {
  const [tab, setTab] = useState('calendar');
  const [events, setEvents] = useState([]);
  const [shopping, setShopping] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Promise.all([
      dbLoad('cal_events'),
      dbLoad('shopping'),
      dbLoad('expenses'),
      dbLoad('tasks'),
    ]).then(([ev, sh, ex, ts]) => {
      if (ev) setEvents(ev);
      if (sh) setShopping(sh);
      if (ex) setExpenses(ex);
      if (ts) setTasks(ts);
      setReady(true);
    });
  }, []);

  if (!ready) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F7F4EF' }}>
      <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: '#2C4A7C' }}>Casa Mia 🏠</div>
    </div>
  );

  const cur = TABS.find(t => t.id === tab);

  return (
    <>
      <Head>
        <title>Casa Mia</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"/>
        <meta name="theme-color" content="#1A1A2E"/>
        <style>{`
          *, *::before, *::after { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; overflow-x: hidden; width: 100%; }
          button { font-family: inherit; }
        `}</style>
        <meta name="mobile-web-app-capable" content="yes"/>
        <meta name="apple-mobile-web-app-capable" content="yes"/>
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>
        <meta name="apple-mobile-web-app-title" content="Casa Mia"/>
        <link rel="manifest" href="/manifest.json"/>
        <link rel="apple-touch-icon" href="/icon-192.png"/>
        <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap" rel="stylesheet"/>
      </Head>

      <div style={{ minHeight: '100vh', background: '#F7F4EF', paddingBottom: 88 }}>
        {/* Header sticky */}
        <div style={{ background: 'linear-gradient(135deg, #1A1A2E 0%, #2C4A7C 100%)',
          padding: '16px 10px 0', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ maxWidth: 560, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: '#fff' }}>Casa Mia 🏠</div>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: '#ffffff77', marginTop: 1 }}>
                  {new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {MEMBERS.map(m => <Avatar key={m} name={m} size={32}/>)}
              </div>
            </div>
            <div style={{ display: 'flex', background: '#ffffff18', borderRadius: 12, padding: 3, gap: 2 }}>
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, padding: '7px 2px',
                  border: 'none', cursor: 'pointer', borderRadius: 9,
                  background: tab === t.id ? '#fff' : 'transparent',
                  color: tab === t.id ? '#1A1A2E' : '#ffffff88',
                  fontFamily: "'DM Sans', sans-serif", fontSize: 10,
                  fontWeight: tab === t.id ? 700 : 500, transition: 'all 0.2s',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <span style={{ fontSize: 15 }}>{t.icon}</span>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Contenuto */}
        <div style={{ maxWidth: 560, margin: '0 auto', padding: '12px 8px' }}>
          <div style={{ background: '#fff', borderRadius: 18, padding: '14px 10px',
            border: '1px solid #EDE8E1', boxShadow: '0 2px 10px #00000009' }}>
            <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: '#1A1A2E', margin: '0 0 16px 0' }}>
              {cur.icon} {cur.label}
            </h2>
            {tab === 'calendar' && <CalendarSection events={events} setEvents={setEvents}/>}
            {tab === 'shopping' && <ShoppingSection items={shopping} setItems={setShopping}/>}
            {tab === 'expenses' && <ExpenseSection expenses={expenses} setExpenses={setExpenses}/>}
            {tab === 'tasks'    && <TaskSection tasks={tasks} setTasks={setTasks}/>}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── STILI ────────────────────────────────────────────────────────────────────
const S = {
  navBtn: { background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#2C4A7C', padding: '4px 10px', borderRadius: 8 },
  delBtn: { background: 'none', border: 'none', cursor: 'pointer', color: '#C4C0B8', fontSize: 13, padding: '2px 5px', flexShrink: 0 },
  addBtn: { width: '100%', padding: '13px', border: '2px dashed #C4614A44', background: '#C4614A08',
    color: '#C4614A', borderRadius: 12, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, cursor: 'pointer', marginTop: 12 },
  primaryBtn: { flex: 1, padding: '11px', background: '#2C4A7C', color: '#fff', border: 'none',
    borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  secondaryBtn: { flex: 1, padding: '11px', background: '#EDE8E1', color: '#666', border: 'none',
    borderRadius: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  input: { width: '100%', padding: '10px 12px', border: '1px solid #EDE8E1', borderRadius: 10,
    fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#1A1A2E', background: '#FAFAF8',
    outline: 'none', marginBottom: 9, boxSizing: 'border-box' },
  formCard: { background: '#FAFAF8', border: '1px solid #EDE8E1', borderRadius: 14, padding: 18, marginTop: 14 },
  formTitle: { fontFamily: "'DM Serif Display', serif", fontSize: 16, color: '#1A1A2E', margin: '0 0 12px 0' },
  chip: { padding: '5px 13px', border: '1px solid #EDE8E1', borderRadius: 20, fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  statBox: { flex: 1, background: '#fff', borderRadius: 12, padding: '11px 14px', border: '1px solid #EDE8E1', display: 'flex', flexDirection: 'column', gap: 2 },
  statNum: { fontFamily: "'DM Serif Display', serif", fontSize: 26, color: '#1A1A2E' },
  statLabel: { fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: '#B0A99A' },
  secTitle: { fontFamily: "'DM Serif Display', serif", fontSize: 15, color: '#1A1A2E', margin: '0 0 10px 0' },
};
