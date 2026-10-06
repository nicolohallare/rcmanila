/* Staff dashboards (editor, Secretariat, librarian): loads the "what needs doing" data and draws the shared pieces.
   Each page decides what goes on its own dashboard; this file only fetches and formats. */
(function () {
  const FN = 'https://unavxknqpibxwcoqemaf.supabase.co/functions/v1/rcm-dash';
  const PUB = 'sb_publishable_zebFaErs-sjDwYWQUMfq3g_VuF2DTI6';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Number(n || 0).toLocaleString('en');
  const TZ = 'Asia/Manila';
  const day = (iso, o) => new Date(String(iso).length === 10 ? iso + 'T12:00:00+08:00' : iso).toLocaleDateString('en-GB', Object.assign({ day: 'numeric', month: 'long', timeZone: TZ }, o || {}));
  const daysUntil = (iso) => Math.round((Date.parse(iso + 'T12:00:00+08:00') - Date.parse(new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10) + 'T12:00:00+08:00')) / 864e5);
  const ago = (iso) => { const d = Math.floor((Date.now() - Date.parse(iso)) / 864e5); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago'; };

  async function load(kind, code) {
    const r = await fetch(FN, { method: 'POST', headers: { 'content-type': 'application/json', 'x-editor-code': code || '', apikey: PUB }, body: JSON.stringify({ for: kind }) });
    const d = await r.json().catch(() => ({ error: 'The server did not answer. Please try again.' }));
    if (r.status === 401) throw Object.assign(new Error(d.error || 'Wrong passcode'), { auth: true });
    if (!r.ok || d.error) throw new Error(d.error || 'Error ' + r.status);
    return d;
  }

  const P = {
    check: 'M4 12l5 5L20 6', user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6', line: 'M4 6h16M4 12h10M4 18h13',
    frame: 'M3 4h18v16H3zM3 15l5-5 4 4 3-3 6 6', clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2', photo: 'M3 5h18v14H3zM9 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM21 16l-5-5-8 8',
    book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 5v16M8 7h7', cal: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4', mail: 'M4 5h16v11H8l-4 4z',
    gift: 'M12 21s-7-4.4-9.3-9A5 5 0 0 1 12 6a5 5 0 0 1 9.3 6c-2.3 4.6-9.3 9-9.3 9z', star: 'M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.2l5.9-.9z',
    alert: 'M12 3 2 20h20zM12 10v4M12 17v.5', up: 'M12 16V4m0 0-5 5m5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3', share: 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
    image: 'M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6',
  };
  const icon = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${P[k] || P.check}"/></svg>`;

  // items: [{ level: 'urgent'|'todo'|'info', icon, title, text, count, go, href, label }]
  function todo(items, doneText) {
    const L = items.filter(Boolean);
    if (!L.length) return `<div class="todo-clear">${icon('check')}<div><b>All caught up.</b><span>${esc(doneText || 'Nothing needs you right now.')}</span></div></div>`;
    const order = { urgent: 0, todo: 1, info: 2 };
    L.sort((a, b) => (order[a.level] ?? 1) - (order[b.level] ?? 1));
    return `<ul class="todo">${L.map((t) => {
      const act = t.go ? `<button type="button" class="btn ${t.level === 'info' ? 'btn-line' : 'btn-blue'} todo-go" data-go="${esc(t.go)}">${esc(t.label || 'Open')}</button>`
        : t.href ? `<a class="btn ${t.level === 'info' ? 'btn-line' : 'btn-blue'} todo-go" href="${esc(t.href)}"${/^https?:|^\/(library|balita|events|meeting)/.test(t.href) ? ' target="_blank" rel="noopener"' : ''}>${esc(t.label || 'Open')}</a>` : '';
      const doneBtn = t.done ? `<button type="button" class="btn btn-line todo-go" data-done="${esc(t.done)}">${icon('check')}<span>Mark as posted</span></button>` : '';
      return `<li class="todo-i ${esc(t.level || 'todo')}"><span class="todo-ic">${icon(t.icon)}</span><div class="todo-t"><b>${t.count != null ? `<span class="todo-n">${fmt(t.count)}</span> ` : ''}${esc(t.title)}</b>${t.text ? `<span>${t.html ? t.text : esc(t.text)}</span>` : ''}</div>${act || doneBtn ? `<div class="todo-acts">${act}${doneBtn}</div>` : ''}</li>`;
    }).join('')}</ul>`;
  }
  // tiles: [{ n, label, sub }]
  const kpis = (tiles) => `<div class="kpis">${tiles.filter(Boolean).map((k) => `<div class="kpi"><b>${typeof k.n === 'number' ? fmt(k.n) : esc(k.n)}</b><span>${esc(k.label)}</span>${k.sub ? `<small>${esc(k.sub)}</small>` : ''}</div>`).join('')}</div>`;
  function hello() {
    const h = Number(new Date().toLocaleString('en-GB', { hour: 'numeric', hour12: false, timeZone: TZ }));
    return { greet: h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening', date: new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ }) };
  }
  // Marks a website post as shared in the Viber Community, so it leaves the to-do list.
  async function posted(page, kind, ref, code) {
    const r = await fetch(FN, { method: 'POST', headers: { 'content-type': 'application/json', 'x-editor-code': code || '', apikey: PUB }, body: JSON.stringify({ for: page, action: 'viber-posted', kind, ref }) });
    const d = await r.json().catch(() => ({})); if (!r.ok || d.error) throw new Error(d.error || 'Error ' + r.status);
  }
  // Viber Community items: [{kind, ref, title, date, link}] -> to-do items with a share button and "Posted".
  const VIBER = { meeting: 'Post this week\'s meeting', event: 'Announce the event', 'event-reminder': 'Remind members about', balita: 'Post the new Balita', exhibit: 'Post this month\'s exhibit' };
  function viberItems(list, opts) {
    return (list || []).map((v) => Object.assign({ level: v.kind === 'event-reminder' || v.kind === 'meeting' ? 'todo' : 'info', icon: 'share', title: `Viber Community: ${VIBER[v.kind] || 'Post'}: ${v.title}`, text: (v.date ? day(v.date, { weekday: 'long' }) + '. ' : '') + 'Share it in “RCM General Information & Announcements”, then click “Mark as posted”.', done: v.kind + '|' + v.ref }, opts(v)));
  }
  const badge = (el, n) => { if (!el) return; el.hidden = !n; el.textContent = n > 99 ? '99+' : String(n || ''); };

  window.RCMDash = { load, esc, fmt, day, daysUntil, ago, icon, todo, kpis, hello, badge, posted, viberItems };
})();
