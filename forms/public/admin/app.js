/*
 * Forms admin page. Talks to /admin/api with the admin token from the login
 * form, kept in sessionStorage (this tab only).
 *
 * Messages and ratings are written by the public: everything from the API is
 * inserted with textContent / text nodes, never as HTML.
 */
(() => {
  'use strict';

  const TOKEN_KEY = 'forms-admin-token';
  const PAGE_SIZE = 50;
  const $ = id => document.getElementById(id);

  const state = {
    token: null,
    tab: 'overview',
    site: '',
    overview: null,
    messages: { items: [], filters: { status: '', handled: 'false', q: '' }, selectedId: null, done: false, filtersNode: null },
    ratings: { items: [], insights: null, site: null, ipHash: '', done: false },
  };

  // ---------- helpers ----------

  /** Element builder. Strings among children become text nodes. */
  function h(tag, props = {}, ...children) {
    const svg = ['svg', 'rect', 'line', 'title'].includes(tag);
    const node = svg ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'className') node.setAttribute('class', value);
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else node.setAttribute(key, value === true ? '' : String(value));
    }
    for (const child of children.flat(Infinity)) {
      if (child === null || child === undefined || child === false) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  function fmtDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }

  function fmtAgo(iso) {
    if (!iso) return '';
    const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
    if (seconds < 86400 * 30) return `${Math.floor(seconds / 86400)} d ago`;
    return new Date(iso).toLocaleDateString();
  }

  function fmtDuration(ms) {
    const minutes = Math.floor(ms / 60000);
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    if (days > 0) return `${days} d ${hours} h`;
    if (hours > 0) return `${hours} h ${minutes % 60} min`;
    return `${minutes} min`;
  }

  function starText(stars) {
    const full = Math.round(stars);
    return h('span', { className: 'stars', 'aria-label': `${stars} out of 5 stars` },
      '★'.repeat(full), h('span', { className: 'off' }, '★'.repeat(5 - full)));
  }

  function siteName(id) {
    return state.overview?.sites.find(site => site.id === id)?.name || id;
  }

  function showError(message) {
    const banner = $('app-error');
    banner.textContent = message || '';
    banner.hidden = !message;
  }

  class Unauthorized extends Error {}

  async function api(path, { method = 'GET', body, raw = false } = {}) {
    const headers = { Authorization: `Bearer ${state.token}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`/admin/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 401) throw new Unauthorized();
    if (raw) {
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      return response;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error ? `Request failed: ${data.error}` : `Request failed (${response.status})`);
    return data;
  }

  /** Run an action, reporting errors in the banner; signs out on a bad token */
  async function run(action) {
    try {
      showError('');
      return await action();
    } catch (error) {
      if (error instanceof Unauthorized) {
        signOut('Your token was not accepted. Please sign in again.');
      } else {
        showError(error.message || 'Something went wrong.');
      }
      return undefined;
    }
  }

  function query(params) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') search.set(key, value);
    }
    const text = search.toString();
    return text ? `?${text}` : '';
  }

  async function download(params) {
    const response = await api(`/export${query(params)}`, { raw: true });
    const disposition = response.headers.get('content-disposition') || '';
    const name = disposition.match(/filename="([^"]+)"/)?.[1] || 'export.csv';
    const url = URL.createObjectURL(await response.blob());
    const link = h('a', { href: url, download: name });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- login ----------

  function readToken() {
    try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
  }

  function saveToken(token) {
    try {
      if (token) sessionStorage.setItem(TOKEN_KEY, token);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // Storage blocked: the token lives in memory until the page reloads
    }
  }

  function signOut(message) {
    state.token = null;
    state.overview = null;
    saveToken(null);
    $('app').hidden = true;
    $('login').hidden = false;
    const error = $('login-error');
    error.textContent = message || '';
    error.hidden = !message;
    $('token').value = '';
    $('token').focus();
  }

  async function signIn(token) {
    state.token = token;
    try {
      state.overview = await api('/overview');
    } catch (error) {
      if (error instanceof Unauthorized) return signOut('That token was not accepted.');
      return signOut(`Couldn't reach the service: ${error.message}`);
    }
    saveToken(token);
    $('login').hidden = true;
    $('app').hidden = false;
    fillSitePicker();
    showTab(state.tab);
  }

  // ---------- shell ----------

  function fillSitePicker() {
    const select = $('site');
    select.replaceChildren(
      h('option', { value: '' }, 'All sites'),
      ...state.overview.sites.map(site => h('option', { value: site.id }, site.name)),
    );
    select.value = state.site;
  }

  function showTab(tab) {
    state.tab = tab;
    for (const button of document.querySelectorAll('[data-tab]')) {
      button.setAttribute('aria-current', button.dataset.tab === tab ? 'page' : 'false');
    }
    for (const section of document.querySelectorAll('.tab')) section.hidden = section.id !== `tab-${tab}`;
    state.messages.filtersNode = null; // rebuilt from the current filters
    try { history.replaceState(null, '', `#${tab}`); } catch { /* ignore */ }
    return loadTab();
  }

  function loadTab() {
    if (state.tab === 'overview') return run(loadOverview);
    if (state.tab === 'messages') return run(() => loadMessages(true));
    if (state.tab === 'ratings') return run(() => loadRatings(true));
    if (state.tab === 'health') return run(loadHealth);
    return undefined;
  }

  // ---------- overview ----------

  async function loadOverview() {
    state.overview = await api('/overview');
    renderOverview();
  }

  function stat(value, label, { tone, onClick } = {}) {
    const className = `stat${tone ? ` ${tone}` : ''}`;
    const children = [h('span', { className: 'value' }, String(value)), h('span', { className: 'label' }, label)];
    return onClick
      ? h('button', { type: 'button', className, onClick }, ...children)
      : h('div', { className }, ...children);
  }

  function distribution(summary) {
    const max = Math.max(1, ...Object.values(summary.distribution));
    return h('div', { className: 'dist' }, [5, 4, 3, 2, 1].map(stars => {
      const count = summary.distribution[stars] || 0;
      const fill = h('div', { className: 'dist-fill' });
      fill.style.width = `${(count / max) * 100}%`;
      return h('div', { className: 'dist-row' },
        h('span', {}, `${stars} ★`),
        h('div', { className: 'dist-track' }, fill),
        h('span', { className: 'n' }, String(count)));
    }));
  }

  function openMessages(siteId, filters) {
    state.site = siteId;
    $('site').value = siteId;
    Object.assign(state.messages.filters, { status: '', handled: '', q: '' }, filters);
    showTab('messages');
  }

  function renderOverview() {
    const sites = state.overview.sites.filter(site => !state.site || site.id === state.site);
    const cards = sites.map(site => {
      const m = site.messages;
      const failed = m.failed + m.retrying;
      const card = h('article', { className: 'panel' },
        h('div', { className: 'site-head' }, h('h2', {}, site.name), h('span', { className: 'muted mono' }, site.id)),
        h('h3', {}, 'Messages'),
        h('div', { className: 'stats' },
          stat(m.last7, 'Last 7 days', { onClick: () => openMessages(site.id, {}) }),
          stat(m.last30, 'Last 30 days'),
          stat(m.total, 'All time'),
          stat(m.unhandled, 'Unhandled', { tone: m.unhandled ? 'attention' : '', onClick: () => openMessages(site.id, { handled: 'false' }) }),
          stat(failed, 'Email failed', { tone: failed ? 'bad' : '', onClick: () => openMessages(site.id, { status: 'failed' }) }),
        ));
      if (site.ratings) {
        const r = site.ratings;
        card.append(
          h('h3', {}, 'Ratings'),
          r.count
            ? h('div', {},
              h('div', { className: 'big-rating' },
                h('span', { className: 'value' }, r.average.toFixed(2)),
                starText(r.average),
                h('span', { className: 'muted' }, `${r.count} rating${r.count === 1 ? '' : 's'} · ${r.last7} new this week`)),
              distribution(r),
              h('p', {}, h('button', { type: 'button', className: 'link', onClick: () => { state.site = site.id; $('site').value = site.id; showTab('ratings'); } }, 'Ratings details')))
            : h('p', { className: 'muted' }, 'No ratings yet.'));
      }
      return card;
    });
    $('tab-overview').replaceChildren(h('div', { className: 'grid' }, cards));
  }

  // ---------- messages ----------

  async function loadMessages(reset) {
    const box = state.messages;
    if (reset) { box.items = []; box.done = false; }
    const before = box.items.length ? box.items[box.items.length - 1].id : undefined;
    const { messages } = await api(`/messages${query({
      site: state.site, status: box.filters.status, handled: box.filters.handled, q: box.filters.q, limit: PAGE_SIZE, before,
    })}`);
    box.items.push(...messages);
    box.done = messages.length < PAGE_SIZE;
    if (reset && !box.items.some(item => item.id === box.selectedId)) box.selectedId = box.items[0]?.id ?? null;
    renderMessages();
  }

  function select(options, value, onChange, label) {
    const node = h('select', { 'aria-label': label, onChange: event => onChange(event.target.value) },
      options.map(([optionValue, text]) => h('option', { value: optionValue }, text)));
    node.value = value;
    return node;
  }

  let searchTimer = null;

  function renderMessages() {
    const box = state.messages;
    // Built once per visit to the tab, so typing in search keeps focus while the list refreshes
    const filters = box.filtersNode || h('div', { className: 'row filters' },
      select([['false', 'Unhandled'], ['true', 'Handled'], ['', 'Handled or not']], box.filters.handled,
        value => { box.filters.handled = value; run(() => loadMessages(true)); }, 'Handled'),
      select([['', 'Any email status'], ['sent', 'Email sent'], ['failed', 'Email failed'], ['pending', 'Email pending']], box.filters.status,
        value => { box.filters.status = value; run(() => loadMessages(true)); }, 'Email status'),
      h('input', {
        type: 'search', placeholder: 'Search name, email, message or page', value: box.filters.q, 'aria-label': 'Search',
        onInput: event => {
          box.filters.q = event.target.value;
          clearTimeout(searchTimer);
          searchTimer = setTimeout(() => run(() => loadMessages(true)), 300);
        },
      }),
      h('button', { type: 'button', onClick: () => run(() => download({ site: state.site, type: 'messages' })) }, 'Export CSV'));

    const list = box.items.length
      ? h('div', { className: 'message-list' },
        box.items.map(item => h('button', {
          type: 'button',
          className: `message-item${item.handled_at ? ' handled' : ''}`,
          'aria-current': item.id === box.selectedId ? 'true' : 'false',
          onClick: () => { box.selectedId = item.id; renderMessages(); },
        },
        h('div', { className: 'row' },
          h('span', { className: 'from' }, item.name || item.email || 'Anonymous'),
          h('span', { className: 'spacer' }),
          h('span', { className: 'muted' }, fmtAgo(item.created_at))),
        h('span', { className: 'snippet' }, item.message.slice(0, 160)),
        h('div', { className: 'row' },
          !state.site && h('span', { className: 'badge' }, siteName(item.site)),
          item.status === 'failed' && h('span', { className: 'badge bad' }, 'Email failed'),
          item.status === 'pending' && h('span', { className: 'badge warn' }, 'Email pending'),
          item.handled_at && h('span', { className: 'badge ok' }, 'Handled')))),
        !box.done && h('button', { type: 'button', onClick: () => run(() => loadMessages(false)) }, 'Load more'))
      : h('p', { className: 'empty panel' }, 'No messages match.');

    box.filtersNode = filters;
    const selected = box.items.find(item => item.id === box.selectedId);
    const inbox = h('div', { className: 'inbox' }, list, selected ? messageDetail(selected) : h('div'));
    const section = $('tab-messages');
    if (section.firstChild === filters && section.children.length === 2) section.lastChild.replaceWith(inbox);
    else section.replaceChildren(filters, inbox);
  }

  function replaceMessage(updated) {
    const box = state.messages;
    box.items = box.items.map(item => (item.id === updated.id ? updated : item));
    renderMessages();
  }

  function messageDetail(item) {
    const replyHref = item.email
      ? `mailto:${encodeURIComponent(item.email)}?subject=${encodeURIComponent(`Re: your message to ${siteName(item.site)}`)}`
      : null;
    const meta = Object.entries(item.meta || {});
    const emailStatus = item.status === 'sent'
      ? `Sent ${fmtDate(item.sent_at)}`
      : `${item.status === 'failed' ? 'Failed' : 'Pending'} after ${item.attempts} attempt${item.attempts === 1 ? '' : 's'}`;

    return h('article', { className: 'panel detail' },
      h('div', { className: 'row' },
        h('h2', {}, item.name || item.email || 'Anonymous'),
        h('span', { className: 'spacer' }),
        h('span', { className: 'muted' }, `#${item.id}`)),
      h('dl', {},
        h('dt', {}, 'Received'), h('dd', {}, fmtDate(item.created_at)),
        h('dt', {}, 'Site'), h('dd', {}, siteName(item.site)),
        h('dt', {}, 'Email'), h('dd', {}, item.email ? h('a', { href: replyHref }, item.email) : '(not given)'),
        item.page && [h('dt', {}, 'Page'), h('dd', { className: 'mono' }, item.page)],
        meta.map(([key, value]) => [h('dt', {}, key), h('dd', {}, value)]),
        h('dt', {}, 'Email to you'), h('dd', {}, emailStatus, item.last_error && h('div', { className: 'error mono' }, item.last_error)),
        item.handled_at && [h('dt', {}, 'Handled'), h('dd', {}, fmtDate(item.handled_at))]),
      h('pre', { className: 'message-body' }, item.message),
      h('div', { className: 'row' },
        h('button', {
          type: 'button',
          className: 'primary',
          onClick: () => run(async () => {
            const { message } = await api(`/messages/${item.id}/handled`, { method: 'POST', body: { handled: !item.handled_at } });
            replaceMessage(message);
          }),
        }, item.handled_at ? 'Mark unhandled' : 'Mark handled'),
        replyHref && h('a', { href: replyHref }, 'Reply by email'),
        item.status !== 'sent' && h('button', {
          type: 'button',
          onClick: event => run(async () => {
            event.target.disabled = true;
            const { message } = await api(`/messages/${item.id}/retry`, { method: 'POST' });
            replaceMessage(message);
            if (message.status !== 'sent') showError(`Email still failing: ${message.last_error || 'unknown error'}`);
          }),
        }, 'Retry email'),
        h('span', { className: 'spacer' }),
        h('button', {
          type: 'button',
          className: 'danger',
          onClick: () => run(async () => {
            if (!confirm(`Delete message #${item.id} permanently?`)) return;
            await api(`/messages/${item.id}`, { method: 'DELETE' });
            const box = state.messages;
            const index = box.items.findIndex(entry => entry.id === item.id);
            box.items.splice(index, 1);
            box.selectedId = box.items[Math.min(index, box.items.length - 1)]?.id ?? null;
            renderMessages();
          }),
        }, 'Delete')));
  }

  // ---------- ratings ----------

  function ratingSites() {
    return state.overview.sites.filter(site => site.ratingsEnabled);
  }

  async function loadRatings(reset) {
    const box = state.ratings;
    const sites = ratingSites();
    const chosen = sites.find(site => site.id === state.site) || (sites.length === 1 ? sites[0] : null);
    if (!chosen) {
      box.site = null;
      return renderRatingsChooser(sites);
    }
    if (reset || box.site !== chosen.id) {
      box.site = chosen.id;
      box.items = [];
      box.done = false;
      box.insights = await api(`/ratings/insights${query({ site: chosen.id })}`);
    }
    const before = box.items.length ? box.items[box.items.length - 1].id : undefined;
    const { ratings } = await api(`/ratings${query({ site: chosen.id, ip_hash: box.ipHash, limit: PAGE_SIZE, before })}`);
    box.items.push(...ratings);
    box.done = ratings.length < PAGE_SIZE;
    renderRatings();
  }

  function renderRatingsChooser(sites) {
    $('tab-ratings').replaceChildren(h('div', { className: 'panel' },
      sites.length
        ? [h('p', {}, 'Choose a site with ratings:'),
          h('div', { className: 'row' }, sites.map(site => h('button', {
            type: 'button',
            onClick: () => { state.site = site.id; $('site').value = site.id; run(() => loadRatings(true)); },
          }, site.name)))]
        : h('p', { className: 'muted' }, 'No site has ratings turned on. Set ratings: true for a site in sites.yaml.')));
  }

  function dayChart(byDay) {
    // 90 days, oldest on the left, including days with no ratings
    const days = [];
    const counts = new Map(byDay.map(row => [row.day, row]));
    const today = new Date();
    for (let offset = 89; offset >= 0; offset--) {
      const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - offset));
      const key = date.toISOString().slice(0, 10);
      days.push({ day: key, count: counts.get(key)?.count || 0, average: counts.get(key)?.average });
    }
    const max = Math.max(1, ...days.map(day => day.count));
    const width = 900;
    const height = 140;
    const barWidth = width / days.length;
    const svg = h('svg', { viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': 'New ratings per day, last 90 days' },
      h('line', { className: 'axis', x1: 0, y1: height - 0.5, x2: width, y2: height - 0.5 }),
      days.map((day, index) => {
        const barHeight = (day.count / max) * (height - 4);
        return h('rect', {
          className: 'bar', x: index * barWidth + 1, y: height - barHeight, width: Math.max(1, barWidth - 2), height: barHeight,
        }, h('title', {}, `${day.day}: ${day.count} rating${day.count === 1 ? '' : 's'}${day.average ? `, average ${day.average}` : ''}`));
      }));
    return h('div', { className: 'chart' }, svg,
      h('div', { className: 'chart-labels' }, h('span', {}, days[0].day), h('span', {}, `max ${max} a day`), h('span', {}, 'today')));
  }

  function renderRatings() {
    const box = state.ratings;
    const { summary, byDay, byPage, bursts } = box.insights;

    const summaryPanel = h('article', { className: 'panel' },
      h('div', { className: 'row' },
        h('h2', {}, `${siteName(box.site)} ratings`),
        h('span', { className: 'spacer' }),
        h('button', { type: 'button', onClick: () => run(() => download({ site: box.site, type: 'ratings' })) }, 'Export CSV')),
      summary.count
        ? [h('div', { className: 'big-rating' },
          h('span', { className: 'value' }, summary.average.toFixed(2)),
          starText(summary.average),
          h('span', { className: 'muted' }, `${summary.count} rating${summary.count === 1 ? '' : 's'}`)),
        distribution(summary)]
        : h('p', { className: 'muted' }, 'No ratings yet.'),
      h('p', { className: 'hint' }, 'The site shows the rating once there are at least 5, after its next build.'));

    const chartPanel = h('article', { className: 'panel' }, h('h3', {}, 'New ratings per day (90 days)'), dayChart(byDay));

    const pagePanel = h('article', { className: 'panel' }, h('h3', {}, 'By page'),
      byPage.length
        ? h('div', { className: 'table-wrap' }, h('table', {},
          h('thead', {}, h('tr', {}, h('th', {}, 'Page'), h('th', { className: 'num' }, 'Ratings'), h('th', { className: 'num' }, 'Average'))),
          h('tbody', {}, byPage.map(row => h('tr', {},
            h('td', { className: 'mono' }, row.page || '(none)'),
            h('td', { className: 'num' }, String(row.count)),
            h('td', { className: 'num' }, row.average.toFixed(2)))))))
        : h('p', { className: 'muted' }, 'No ratings yet.'));

    const burstPanel = h('article', { className: 'panel' },
      h('h3', {}, 'Several ratings from one IP'),
      h('p', { className: 'hint' }, 'Could be one person rating from many browsers, or an office or school sharing an address. Delete only clear abuse, never because ratings are low.'),
      bursts.length
        ? h('div', { className: 'table-wrap' }, h('table', {},
          h('thead', {}, h('tr', {}, h('th', {}, 'IP hash'), h('th', { className: 'num' }, 'Ratings'), h('th', { className: 'num' }, 'Average'), h('th', {}, 'Between'), h('th', {}))),
          h('tbody', {}, bursts.map(row => h('tr', {},
            h('td', { className: 'mono' }, row.ip_hash.slice(0, 12)),
            h('td', { className: 'num' }, String(row.count)),
            h('td', { className: 'num' }, row.average.toFixed(2)),
            h('td', {}, `${fmtDate(row.first_at)} – ${fmtDate(row.last_at)}`),
            h('td', {}, h('div', { className: 'row' },
              h('button', {
                type: 'button',
                onClick: () => {
                  box.ipHash = row.ip_hash;
                  box.items = [];
                  run(() => loadRatings(false));
                },
              }, 'Show'),
              h('button', {
                type: 'button',
                className: 'danger',
                onClick: () => run(async () => {
                  if (!confirm(`Delete all ${row.count} ratings from IP hash ${row.ip_hash.slice(0, 12)}…?`)) return;
                  await api(`/ratings${query({ site: box.site, ip_hash: row.ip_hash })}`, { method: 'DELETE' });
                  box.ipHash = '';
                  await loadRatings(true);
                }),
              }, 'Delete all'))))))))
        : h('p', { className: 'muted' }, 'None with 3 or more ratings.'));

    const listPanel = h('article', { className: 'panel' },
      h('div', { className: 'row' },
        h('h3', {}, box.ipHash ? `Ratings from IP hash ${box.ipHash.slice(0, 12)}` : 'Latest ratings'),
        h('span', { className: 'spacer' }),
        box.ipHash && h('button', { type: 'button', onClick: () => { box.ipHash = ''; run(() => loadRatings(true)); } }, 'Show all')),
      box.items.length
        ? [h('div', { className: 'table-wrap' }, h('table', {},
          h('thead', {}, h('tr', {}, h('th', {}, 'Given'), h('th', {}, 'Stars'), h('th', {}, 'Page'), h('th', {}, 'IP hash'), h('th', {}))),
          h('tbody', {}, box.items.map(row => h('tr', {},
            h('td', {}, fmtDate(row.created_at), row.updated_at !== row.created_at && h('div', { className: 'hint' }, `changed ${fmtDate(row.updated_at)}`)),
            h('td', {}, starText(row.stars)),
            h('td', { className: 'mono' }, row.page || ''),
            h('td', { className: 'mono' }, (row.ip_hash || '').slice(0, 12)),
            h('td', {}, h('button', {
              type: 'button',
              className: 'danger',
              onClick: () => run(async () => {
                if (!confirm(`Delete this ${row.stars}-star rating?`)) return;
                await api(`/ratings/${row.id}`, { method: 'DELETE' });
                await loadRatings(true);
              }),
            }, 'Delete'))))))),
        !box.done && h('button', { type: 'button', onClick: () => run(() => loadRatings(false)) }, 'Load more')]
        : h('p', { className: 'muted' }, 'No ratings.'));

    $('tab-ratings').replaceChildren(h('div', { className: 'stack' },
      h('div', { className: 'grid' }, summaryPanel, pagePanel), chartPanel, burstPanel, listPanel));
  }

  // ---------- health ----------

  async function loadHealth() {
    state.overview = await api('/overview');
    renderHealth();
  }

  function renderHealth() {
    const { health, sites } = state.overview;
    const uptime = new Date(health.now) - new Date(health.startedAt);
    const smtp = health.smtp;
    const last = health.lastDelivery;
    const blocked = health.blocked;

    const service = h('article', { className: 'panel' },
      h('h2', {}, 'Service'),
      h('div', { className: 'table-wrap' }, h('table', {}, h('tbody', {},
        h('tr', {}, h('th', {}, 'Running since'), h('td', {}, `${fmtDate(health.startedAt)} (${fmtDuration(uptime)})`)),
        h('tr', {}, h('th', {}, 'SMTP connection'), h('td', {},
          smtp
            ? [h('span', { className: `badge ${smtp.ok ? 'ok' : 'bad'}` }, smtp.ok ? 'OK' : 'Failing'), ` checked ${fmtAgo(smtp.checkedAt)}`,
              smtp.error && h('div', { className: 'error mono' }, smtp.error)]
            : 'Not checked yet')),
        h('tr', {}, h('th', {}, 'Last email sent'), h('td', {},
          last
            ? [h('span', { className: `badge ${last.ok ? 'ok' : 'bad'}` }, last.ok ? 'Delivered' : 'Failed'),
              ` message #${last.submissionId}, ${fmtAgo(last.at)}`, last.error && h('div', { className: 'error mono' }, last.error)]
            : 'None since the service started'))))));

    const emails = h('article', { className: 'panel' },
      h('h2', {}, 'Email delivery'),
      h('p', { className: 'hint' }, 'Failed emails are retried every 5 minutes, up to 5 attempts. After that they stay failed until you retry them from Messages.'),
      h('div', { className: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Site'), h('th', { className: 'num' }, 'Pending'), h('th', { className: 'num' }, 'Retrying'), h('th', { className: 'num' }, 'Gave up'), h('th', {}))),
        h('tbody', {}, sites.map(site => h('tr', {},
          h('td', {}, site.name),
          h('td', { className: 'num' }, String(site.messages.pending)),
          h('td', { className: 'num' }, String(site.messages.retrying)),
          h('td', { className: 'num' }, String(site.messages.failed)),
          h('td', {}, (site.messages.failed + site.messages.retrying) > 0
            && h('button', { type: 'button', className: 'link', onClick: () => openMessages(site.id, { status: 'failed' }) }, 'Show failed'))))))));

    const reasons = [
      ['honeypot', 'Honeypot filled', 'Bots that fill every field. They were told it was sent.'],
      ['proofOfWork', 'Proof of work missing or wrong', 'Scripts that skip the puzzle.'],
      ['rateLimited', 'Rate limited', 'Too many messages or ratings from one IP address.'],
      ['origin', 'Wrong website', 'Sent from a page not listed for the site.'],
      ['invalid', 'Invalid fields', 'Empty, too long, too many links, bad email or bad rating.'],
    ];
    const spam = h('article', { className: 'panel' },
      h('h2', {}, 'Blocked since the service started'),
      h('p', { className: 'hint' }, 'Counted in memory, so these reset when the service restarts.'),
      h('div', { className: 'table-wrap' }, h('table', {}, h('tbody', {}, reasons.map(([key, label, help]) => h('tr', {},
        h('th', {}, label, h('div', { className: 'hint' }, help)),
        h('td', { className: 'num' }, String(blocked[key] || 0))))))));

    $('tab-health').replaceChildren(h('div', { className: 'grid' }, service, emails, spam));
  }

  // ---------- start ----------

  document.addEventListener('DOMContentLoaded', () => {
    $('login-form').addEventListener('submit', event => {
      event.preventDefault();
      const token = $('token').value.trim();
      if (token) signIn(token);
    });
    $('signout').addEventListener('click', () => signOut());
    $('refresh').addEventListener('click', () => loadTab());
    $('site').addEventListener('change', event => {
      state.site = event.target.value;
      state.ratings.ipHash = '';
      loadTab();
    });
    for (const button of document.querySelectorAll('[data-tab]')) {
      button.addEventListener('click', () => showTab(button.dataset.tab));
    }

    const fromHash = location.hash.slice(1);
    if (['overview', 'messages', 'ratings', 'health'].includes(fromHash)) state.tab = fromHash;

    const saved = readToken();
    if (saved) signIn(saved);
    else signOut();
  });
})();
