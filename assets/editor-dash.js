/* Balita editor: the "This week" dashboard at the top of the home view. */
(function () {
  const $ = (id) => document.getElementById(id);
  const D = window.RCMDash, E = () => window.RCMEditor;
  const esc = D.esc;
  const monthName = (iso) => D.day(iso, { day: undefined, month: 'long', year: 'numeric' });
  const STATUS = { processing: 'is still being read', draft: 'is ready to check', scheduled: 'is scheduled' };

  async function draw() {
    let d;
    try { d = await D.load('editor', E().code()); }
    catch (e) { if (e.auth) return E().signin(); $('ed-todo').innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
    const items = [];
    for (const i of d.pending || []) {
      items.push({ level: i.status === 'scheduled' ? 'info' : 'urgent', icon: 'book', title: `Issue ${i.issue_no} ${STATUS[i.status] || 'is not live yet'}`, text: i.status === 'scheduled' && i.publish_at ? 'Goes live ' + new Date(i.publish_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }) : i.issue_date ? 'Dated ' + D.day(i.issue_date, { year: 'numeric' }) : '', go: 'issue:' + i.id, label: i.status === 'draft' ? 'Check and publish' : 'Open' });
    }
    if (d.latest && d.next_due) {
      const left = D.daysUntil(d.next_due), no = d.latest.issue_no + 1;
      const already = (d.pending || []).some((i) => i.issue_no >= no);
      if (!already) items.push({ level: left < 0 ? 'urgent' : left <= 1 ? 'todo' : 'info', icon: 'up', title: left < 0 ? `Issue ${no} is ${-left} day${left === -1 ? '' : 's'} late` : left === 0 ? `Issue ${no} is due today` : `Next: issue ${no}, due ${D.day(d.next_due, { weekday: 'long' })}`, text: `Drop the final PDF in the box below. The last issue online is No. ${d.latest.issue_no} (${D.day(d.latest.issue_date)}).`, go: 'drop', label: 'Upload' });
    }
    const toNext = D.daysUntil(d.cover.next);
    if (!d.cover.next_month) items.push({ level: toNext <= 10 ? 'todo' : 'info', icon: 'image', title: `Cover photo for ${monthName(d.cover.next)} not set`, text: `It changes on ${D.day(d.cover.next)} (in ${toNext} days). Without a new one, this month's cover stays up.`, go: 'cover', label: 'Set cover' });
    for (const f of d.facebook.failed || []) items.push({ level: 'urgent', icon: 'alert', title: `A ${f.kind === 'event' ? 'event' : 'Balita'} post did not reach Facebook`, text: `Tried ${f.attempts} times: ${String(f.error || '').slice(0, 140)}`, href: 'https://www.facebook.com/', label: 'Open Facebook' });
    $('ed-todo').innerHTML = D.todo(items, 'Every issue is live and the next cover is set.');
    const s = d.stats;
    $('ed-kpis').innerHTML = D.kpis([
      { n: s.ry_issues, label: 'Issues this Rotary year', sub: 'since ' + D.day(s.ry_from, { year: 'numeric' }) },
      { n: s.ry_stories, label: 'Stories this year' },
      { n: s.issues, label: 'Issues online', sub: '2015 to today' },
      { n: s.stories, label: 'Stories online' },
    ]);
    $('ed-fb').textContent = d.facebook.last_post ? `New issues post to the Club's Facebook Page by themselves. Last post ${D.ago(d.facebook.last_post)}; ${d.facebook.this_month} this month.` : 'New issues and events post to the Club’s Facebook Page by themselves within 15 minutes of going live.';
  }

  document.addEventListener('rcmed:home', draw);
  document.addEventListener('click', (e) => {
    const b = e.target.closest('#ed-todo [data-go]'); if (!b) return;
    const g = b.getAttribute('data-go');
    if (g.startsWith('issue:')) return E().open(g.slice(6));
    if (g === 'drop') { $('drop').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if (g === 'cover') { const p = $('cover-panel'); p.scrollIntoView({ behavior: 'smooth', block: 'start' }); const dt = p.querySelector('details.sub'); if (dt) dt.open = true; }
  });
})();
