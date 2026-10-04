/* Secretariat: the Today dashboard (next meeting, new messages and gifts, events filling up, this year's figures). */
(function () {
  const $ = (id) => document.getElementById(id);
  const D = window.RCMDash, S = () => window.RCMSec;
  const esc = D.esc;
  const KIND = { join: 'Membership', partner: 'Partner or sponsor', volunteer: 'Volunteer', other: 'Message' };
  const peso = (n) => '₱' + Number(n || 0).toLocaleString('en', { maximumFractionDigits: 0 });
  const nextThursday = (today) => { const d = new Date(today + 'T12:00:00Z'); while (d.getUTCDay() !== 4) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

  async function draw() {
    const h = D.hello(); $('sh-h').textContent = h.greet; $('sh-d').textContent = h.date;
    let d;
    try { d = await D.load('secretariat', S().code()); }
    catch (e) { if (e.auth) return S().show('v-login'); $('sh-todo').innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
    const items = [];
    const m = (d.meetings || [])[0];
    const thu = nextThursday(d.today);
    if (!m || m.meeting_date > thu) {
      items.push({ level: D.daysUntil(thu) <= 3 ? 'urgent' : 'todo', icon: 'cal', title: `Add the meeting for ${D.day(thu, { weekday: 'long' })}`, text: 'Members can sign up on the website once it is published. Last week’s venue and times are filled in for you.', go: 'new-meeting', label: 'Add meeting' });
    }
    if (m) {
      const when = D.day(m.meeting_date, { weekday: 'long' });
      const missing = [!m.speaker && 'speaker', !m.topic && 'topic', !m.venue && 'venue'].filter(Boolean);
      if (m.status !== 'published') items.push({ level: D.daysUntil(m.meeting_date) <= 3 ? 'urgent' : 'todo', icon: 'cal', title: `${when}: the meeting is still a draft`, text: missing.length ? `Add the ${missing.join(' and ')}, then publish it so members can sign up.` : 'Publish it so members can sign up on the website.', go: 'meeting:' + m.id, label: 'Finish' });
      else if (missing.length) items.push({ level: 'todo', icon: 'cal', title: `${when}: add the ${missing.join(' and ')}`, text: `${m.signups} signed up so far.`, go: 'meeting:' + m.id, label: 'Edit' });
    }
    if (d.inquiries.new) items.push({ level: 'urgent', icon: 'mail', count: d.inquiries.new, title: d.inquiries.new === 1 ? 'new message from the website' : 'new messages from the website', text: d.inquiries.list.map((q) => `${KIND[q.kind] || 'Message'}: ${q.name}${q.organization ? ' (' + q.organization + ')' : ''}, ${D.ago(q.created_at)}`).join(' · '), go: 'v-inq', label: 'Reply' });
    if (d.donations.new) items.push({ level: 'urgent', icon: 'gift', count: d.donations.new, title: d.donations.new === 1 ? 'gift to check' : 'gifts to check', text: d.donations.list.map((g) => `${g.member_name || 'Donor'} ${peso(g.amount)}${g.check_status === 'match' ? ' (proof matches)' : g.check_status ? ' (check the proof)' : ''}`).join(' · '), go: 'v-don', label: 'Check' });
    if (d.donations.awaiting_receipt) items.push({ level: 'todo', icon: 'gift', count: d.donations.awaiting_receipt, title: 'verified gifts still need a receipt', text: 'Send the official receipt, then mark each one “Receipt sent”.', go: 'v-don', label: 'Open' });
    for (const e of d.events || []) {
      if (e.capacity && e.seats > e.capacity) items.push({ level: 'urgent', icon: 'star', title: `${e.title}: ${e.seats} seats signed up for ${e.capacity}`, text: `On ${D.day(e.event_date, { weekday: 'long' })}. Raise the limit, close sign-ups, or tell the organizer.`, go: 'v-ev', label: 'Open events' });
      if (e.status !== 'published' && D.daysUntil(e.event_date) <= 30) items.push({ level: 'todo', icon: 'star', title: `${e.title} is still a draft`, text: `On ${D.day(e.event_date)}. Publish it so members can sign up.`, go: 'v-ev', label: 'Open events' });
    }
    $('sh-todo').innerHTML = D.todo(items, 'The next meeting is set, and no messages or gifts are waiting.');
    D.badge($('b-today'), items.filter((i) => i.level === 'urgent').length);

    const next = [];
    for (const x of d.meetings || []) next.push({ date: x.meeting_date, html: `<b>${esc(D.day(x.meeting_date, { weekday: 'short' }))}</b> · ${esc(x.label || 'Weekly meeting')}${x.speaker ? ' · ' + esc(x.speaker) : ''}`, right: `${x.signups} signed up` });
    for (const e of d.events || []) {
      const pct = e.capacity ? Math.min(100, Math.round(e.seats / e.capacity * 100)) : 0;
      next.push({ date: e.event_date, html: `<b>${esc(D.day(e.event_date, { weekday: 'short' }))}</b> · <a href="/events/${esc(e.slug)}" target="_blank" rel="noopener">${esc(e.title)}</a>${e.capacity ? `<div class="meter"><i class="${e.seats > e.capacity ? 'over' : ''}" style="width:${pct}%"></i></div>` : ''}`, right: `${e.seats}${e.capacity ? ' / ' + e.capacity : ''} seats` });
    }
    next.sort((a, b) => a.date.localeCompare(b.date));
    $('sh-next').innerHTML = next.length ? next.map((x) => `<li><span style="flex:1">${x.html}</span><span>${esc(x.right)}</span></li>`).join('') : '<li class="muted">Nothing scheduled yet.</li>';

    const s = d.stats;
    $('sh-kpis').innerHTML = D.kpis([
      { n: s.meetings, label: 'Meetings held', sub: 'since ' + D.day(s.ry_from, { year: 'numeric' }) },
      { n: s.meeting_signups, label: 'Meeting sign-ups', sub: 'on the website' },
      { n: s.inquiries, label: 'Website messages' },
      { n: s.gifts, label: 'Gifts verified', sub: s.gifts ? peso(s.gifts_amount) : '' },
    ]);
    $('sh-last').textContent = d.last_meeting ? `Last meeting: ${d.last_meeting.label || 'weekly meeting'}, ${D.day(d.last_meeting.meeting_date, { weekday: 'long' })}, with ${d.last_meeting.signups} signed up on the website.` : '';
  }

  document.addEventListener('rcmsec:home', draw);
  $('sh-refresh').onclick = draw;
  document.addEventListener('click', (e) => {
    const b = e.target.closest('#sh-todo [data-go]'); if (!b) return;
    const g = b.getAttribute('data-go');
    if (g === 'new-meeting') return S().newMeeting();
    if (g.startsWith('meeting:')) return S().openMeeting(g.slice(8));
    const tab = document.querySelector(`#sec-tabs [data-tab="${g}"]`); if (tab) tab.click();
  });
})();
