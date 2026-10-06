/* Heritage Library workshop: the Today dashboard (what is waiting for the librarian, and the library in numbers). */
(function () {
  const $ = (id) => document.getElementById(id);
  const D = window.RCMDash, L = () => window.RCMLib;
  const esc = D.esc;
  const monthName = (iso) => D.day(iso, { day: undefined, month: 'long', year: 'numeric' });

  async function draw() {
    const h = D.hello(); $('dh-h').textContent = h.greet; $('dh-d').textContent = h.date;
    let d;
    try { d = await D.load('library', L().code()); }
    catch (e) { if (e.auth) return L().show('login'); $('dh-todo').innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
    const t = d.todo, items = [];
    if (t.tags_new) items.push({ level: 'urgent', icon: 'user', count: t.tags_new, title: t.tags_new === 1 ? 'name suggested for an old photo' : 'names suggested for old photos', text: 'Visitors say who is in a photo or on a Balita page. Approve only when you are sure; you can correct the names first.', go: 'tags', label: 'Review' });
    if (t.events_flagged) items.push({ level: 'todo', icon: 'line', count: t.events_flagged, title: 'timeline entries need a quick check', text: 'Each card says what to check, usually a year taken from a later issue. Fix it and publish, or hide it. The other entries are already on the website.', go: 'tl', label: 'Check' });
    if (t.events_draft > t.events_flagged) items.push({ level: 'todo', icon: 'line', count: t.events_draft - t.events_flagged, title: 'timeline drafts to publish', go: 'tl', label: 'Review' });
    const ex = (m) => (t.exhibits || []).find((x) => x.month.slice(0, 7) === m.slice(0, 7));
    const now = ex(d.today), next = ex(t.next_month);
    if (!now || now.status !== 'published') items.push({ level: 'urgent', icon: 'frame', title: `No exhibit is showing for ${monthName(d.today)}`, text: now ? `“${now.title}” is still a draft.` : 'The library and home page fall back to the last exhibit.', go: 'ex', label: now ? 'Publish' : 'Open exhibits' });
    const daysToNext = D.daysUntil(t.next_month);
    if (!next) items.push({ level: daysToNext <= 10 ? 'urgent' : 'info', icon: 'frame', title: `No exhibit yet for ${monthName(t.next_month)}`, text: `It starts in ${daysToNext} days. Ask Claude to draft one from the archive.`, go: 'ex', label: 'Open exhibits' });
    else if (next.status !== 'published') items.push({ level: daysToNext <= 10 ? 'urgent' : 'todo', icon: 'frame', title: `${monthName(t.next_month)} exhibit is ready to read: “${next.title}”`, text: `Read it and publish it before ${D.day(t.next_month)} (in ${daysToNext} days). It only shows from the first of the month.`, go: 'ex', label: 'Read' });
    if (t.minutes_left <= 4) items.push({ level: t.minutes_left ? 'todo' : 'urgent', icon: 'clock', title: t.minutes_left ? `History minutes run out after ${D.day(t.minutes_last)}` : 'No history minutes are ready for coming meetings', text: 'The Secretariat shows one at each meeting. Ask Claude to write the next set.', go: 'min', label: 'Open' });
    if (t.galleries_held) items.push({ level: 'todo', icon: 'photo', count: t.galleries_held, title: t.galleries_held === 1 ? 'photo album is held for a consent check' : 'photo albums are held for a consent check', text: 'Outreach albums: medical missions, homes, schools. Publish when no child or patient can be identified, or keep an album private so it leaves this list.', go: 'held', label: 'Check' });
    // Volumes marked as a duplicate scan (job state "skip: …") are not waiting for anything.
    let skip = new Set();
    try { skip = new Set((await L().call('src-list')).items.filter((x) => /^skip/.test(x.state || '')).map((x) => x.acc)); } catch (e) {}
    const vols = (t.volumes_draft || []).filter((x) => !skip.has(x.acc));
    if (vols.length) {
      const v = vols;
      items.push({ level: 'todo', icon: 'book', count: v.length, title: v.length === 1 ? 'bound volume stopped part-way' : 'bound volumes stopped part-way', html: true, text: v.map((x) => `${esc(x.acc)} (${esc(x.years)}): ${D.fmt(x.done)} of ${D.fmt(x.pages)} pages`).join('<br>') + '<br>Open Bound Balita and click Process: they are ticked, and each continues where it stopped. Use a computer with plenty of memory that can stay on, with other tabs closed.', go: 'vol', label: 'Open' });
      const tv = $('tab-vol'); if (tv) tv.classList.remove('done');
      const vd = $('vol-done'), vt = $('vol-todo');
      if (vd && vt) { vd.classList.add('hidden'); vt.classList.remove('hidden'); vt.innerHTML = `<b>${v.length} volume${v.length > 1 ? 's' : ''} stopped part-way and ${v.length > 1 ? 'are' : 'is'} not on the website:</b> ${v.map((x) => `${esc(x.acc)} (${esc(x.years)}, ${D.fmt(x.done)} of ${D.fmt(x.pages)} pages)`).join('; ')}. Tick ${v.length > 1 ? 'them' : 'it'} below and click <b>Process ticked volumes</b> to run again. Each takes about 20 minutes.`; }
    }
    // Bound-volume covers photographed on a white table: one click straightens and trims them.
    const covN = window.RCMCovers ? await window.RCMCovers.count() : 0;
    if (covN) items.push({ level: 'todo', icon: 'book', count: covN, title: covN === 1 ? 'volume cover to tidy' : 'volume covers to tidy', text: 'The cover photos show white table around the book and some are slightly tilted. One click straightens and trims them; the originals are kept. Keep the page open for a few minutes.', go: 'vol', label: 'Tidy' });
    // Video room: videos waiting, missing still frames, and this Rotary year's videos still to come from the Secretariat.
    let vids = [];
    try { vids = (await L().video('list', {})).items; } catch (e) { vids = []; }
    const vWait = vids.filter((v) => v.status === 'draft' || v.status === 'held');
    const vNoStill = vids.filter((v) => v.status === 'published' && v.path && !v.poster && v.plays !== false);
    const ryYear = Number(d.today.slice(0, 4)) - (Number(d.today.slice(5, 7)) < 7 ? 1 : 0);
    const vRecent = vids.filter((v) => (v.year || 0) > ryYear || (v.year === ryYear && (v.month || 7) >= 7));
    if (vNoStill.length) items.push({ level: 'todo', icon: 'image', count: vNoStill.length, title: vNoStill.length === 1 ? 'published video needs a still frame' : 'published videos need a still frame', text: 'One click makes them from the videos themselves. It takes a few seconds each; keep the page open.', go: 'vid', label: 'Make stills' });
    if (vWait.length) items.push({ level: 'todo', icon: 'frame', count: vWait.length, title: vWait.length === 1 ? 'video waiting for you' : 'videos waiting for you', text: (() => { const h = vWait.filter((v) => v.status === 'held').length; return (h ? `${h} ${h === 1 ? 'is' : 'are'} held for a check (full Zoom meetings and unnamed speeches). ` : '') + 'Watch, check the title and publish, or hide.'; })(), go: 'vid', label: 'Review' });
    if (!vRecent.length) items.push({ level: 'info', icon: 'up', title: 'Add this year’s videos from the Secretariat', text: 'Starting with the induction. Ask for the original files, not Viber copies. Then Videos → Add a new video.', go: 'vid', label: 'Open videos' });
    // Viber Community: this month's exhibit, with a ready message to copy.
    items.push(...D.viberItems(d.viber, (v) => ({ go: 'vcopy:' + encodeURIComponent(`This month in the Rotary Club of Manila's Heritage Library: ${v.title}\n${location.origin}${v.link}`), label: 'Copy message' })));
    D.badge($('b-vid'), vWait.length + vNoStill.length);
    $('dh-todo').innerHTML = D.todo(items, 'No suggestions, drafts or checks are waiting. The library runs by itself.');

    D.badge($('b-tags'), t.tags_new); D.badge($('b-tl'), t.events_draft); D.badge($('b-held'), t.galleries_held);
    D.badge($('b-ex'), (t.exhibits || []).filter((x) => x.status !== 'published').length);

    const s = d.stats, a = d.activity;
    $('dh-kpis').innerHTML = D.kpis([
      { n: s.volumes, label: 'Bound volumes', sub: '1948–2019' }, { n: s.pages, label: 'Balita pages' },
      { n: s.objects, label: 'Trophy room objects' }, { n: s.galleries, label: 'Photo albums' },
      { n: s.photos, label: 'Photos' }, { n: s.timeline, label: 'Timeline entries' }, { n: '__V__', label: 'Videos online' },
    ]);
    $('dh-kpis').innerHTML = $('dh-kpis').innerHTML.replace('__V__', D.fmt(vids.filter((v) => v.status === 'published' && v.path).length));
    $('dh-act').innerHTML = D.kpis([
      { n: a.ask_30d, label: 'Questions asked', sub: 'last 30 days' }, { n: a.names_approved, label: 'Photo names added', sub: 'all time' },
      { n: t.minutes_left, label: 'History minutes ready', sub: t.minutes_last ? 'to ' + D.day(t.minutes_last) : '' },
    ]);
    $('dh-q').innerHTML = (a.recent_questions || []).length ? a.recent_questions.map((q) => `<li><span>${esc(q.question)}</span><span>${esc(D.ago(q.created_at))}</span></li>`).join('') : '<li class="muted">No questions yet.</li>';
  }

  document.addEventListener('rcmlib:tab', (e) => { if (e.detail === 'home') draw(); });
  document.addEventListener('click', async (e) => {
    const p = e.target.closest('#t-home [data-done]');
    if (p) { const [k, r] = p.getAttribute('data-done').split('|'); p.disabled = true; try { await D.posted('library', k, r, L().code()); draw(); } catch (err) { p.disabled = false; p.textContent = err.message; } return; }
    const b = e.target.closest('[data-go]'); if (!b || !$('t-home').contains(b)) return;
    const g = b.getAttribute('data-go');
    if (g.startsWith('vcopy:')) { try { await navigator.clipboard.writeText(decodeURIComponent(g.slice(6))); b.textContent = 'Copied: paste in Viber'; } catch (err) { b.textContent = 'Could not copy'; } return; }
    L().tab(g);
  });
})();
