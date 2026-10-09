import { createWorkspaceUI } from './workspace-ui.js';
const $ = selector => document.querySelector(selector);
const browserDemo = document.querySelector('meta[name="marketing101-mode"]')?.content === 'browser-demo';
let demoTransport;
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const money = cents => new Intl.NumberFormat('en-DK', { style: 'currency', currency: 'DKK' }).format(cents / 100);
const date = ms => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(ms);
const localInput = ms => { const d = new Date(ms); return new Date(ms - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const badge = status => `<span class="pill ${esc(status.replaceAll(' ', '-'))}">${esc(status)}</span>`;
const state = { me: null, brand: null, policy: null, campaigns: [], workspace: { version: 1, revision: 0, products: [], drafts: [], results: [] }, view: 'dashboard', campaign: null, dirty: false, register: false, message: '', pending: null, selectedProduct: '', pendingDraft: null };
const workspaceUI = createWorkspaceUI({ api, state, esc, toast, navigate, openCampaign, busy, date, money });
let toastTimer;
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 5000); }
async function api(path, method = 'GET', data) {
  if (browserDemo) {
    demoTransport ||= import('./pages-demo.js');
    return (await demoTransport).demoApi(path, method, data);
  }
  const res = await fetch(`/api${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(state.me ? { 'X-CSRF-Token': state.me.csrf } : {}) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) })
  });
  const result = await res.json();
  if (!res.ok) {
    if (res.status === 401 && state.me) { state.me = null; showAuth(); }
    throw new Error(result.error || 'Request failed.');
  }
  return result;
}
async function busy(button, fn) {
  if (button?.disabled) return;
  if (button) button.disabled = true;
  try { await fn(); } catch (error) { toast(error.message); }
  finally { if (button?.isConnected) button.disabled = false; }
}
function showAuth() { $('#app-shell').hidden = true; $('#auth-screen').hidden = false; }
async function loadWorkspace() {
  workspaceUI.reset(); state.pendingDraft = null; state.selectedProduct = '';
  [state.brand, state.policy, state.campaigns, state.workspace] = await Promise.all([api('/brand'), api('/policy'), api('/campaigns'), api('/workspace')]);
  $('#auth-screen').hidden = true; $('#app-shell').hidden = false; $('#account-email').textContent = state.me.email;
  state.view = 'dashboard'; render();
}
$('#auth-toggle').addEventListener('click', () => {
  state.register = !state.register;
  $('#auth-title').textContent = state.register ? 'Make room for momentum.' : 'Welcome back.';
  $('#auth-description').textContent = state.register ? 'Create your personal campaign workspace.' : 'Sign in to your campaign workspace.';
  $('#auth-submit').textContent = state.register ? 'Create account →' : 'Sign in →';
  $('#auth-toggle').textContent = state.register ? 'Already have an account? Sign in' : 'New here? Create an account';
  $('#invite-field').hidden = !state.register;
  $('#auth-form [name=password]').autocomplete = state.register ? 'new-password' : 'current-password';
  $('#auth-error').textContent = '';
});
$('#auth-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('#auth-submit'); button.disabled = true; $('#auth-error').textContent = '';
  try { state.me = await api(state.register ? '/register' : '/login', 'POST', Object.fromEntries(new FormData(event.target))); await loadWorkspace(); event.target.reset(); }
  catch (error) { $('#auth-error').textContent = error.message; }
  finally { button.disabled = false; }
});
$('#logout').addEventListener('click', () => busy($('#logout'), async () => {
  if (browserDemo) {
    if (!confirm('Delete this browser’s Marketing101 demo data? This cannot be undone.')) return;
    await api('/reset', 'POST', {}); state.campaign = null; state.message = ''; state.pending = null; state.dirty = false;
    await loadWorkspace(); toast('Browser demo reset.'); return;
  }
  await api('/logout', 'POST', {}); state.me = null; state.campaign = null; state.message = ''; state.pending = null; showAuth();
}));
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.view)));
function navigate(view) {
  if (state.dirty && !confirm('Discard your unsaved campaign changes?')) return;
  state.dirty = false; state.view = view; render();
}
window.addEventListener('beforeunload', event => { if (state.dirty) { event.preventDefault(); event.returnValue = ''; } });
const headings = { dashboard: 'Overview', composer: 'Create campaign', brand: 'Brand profile', automation: 'Automation', detail: 'Campaign', products: 'Products', studio: 'Content studio', creative: 'Ad designer', calendar: 'Calendar', results: 'Results', data: 'Backup & exports' };
function render() {
  $('#breadcrumb').textContent = `Workspace / ${headings[state.view]}`;
  document.querySelectorAll('nav [data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === state.view || (state.view === 'detail' && button.dataset.view === 'dashboard')));
  if (workspaceUI.views.includes(state.view)) workspaceUI.render(state.view);
  else ({ dashboard, composer, brand: brandForm, automation, detail }[state.view] || dashboard)();
}
function dashboard() {
  const active = state.campaigns.filter(c => ['scheduled', 'running'].includes(c.status)).length;
  const review = state.campaigns.filter(c => c.status === 'awaiting approval').length;
  const spent = state.campaigns.reduce((sum, c) => sum + c.spent, 0);
  $('#view').innerHTML = `
    <div class="page-heading"><div><p class="eyebrow">LET’S MAKE THINGS HAPPEN</p><h1>Your marketing, in motion.</h1><p>A clear view of what’s ready, what’s running, and what comes next.</p></div><button class="button primary" data-go="composer">+ New campaign</button></div>
    <section class="hero"><div><p class="eyebrow">FROM IDEA TO ACTION</p><h2>You bring the idea.<br>We’ll help with the campaign.</h2><p>Describe your next promotion. Get a plan, content, and a schedule — all in one place.</p><button class="button lime" data-go="${state.brand ? 'composer' : 'brand'}">${state.brand ? 'Let’s create a campaign' : 'Set up your brand'} <span>↗</span></button></div><div class="hero-art" aria-hidden="true"><div class="hero-orbit"><span>✧</span></div></div></section>
    <div class="stats"><div class="stat"><p>Active campaigns</p><strong>${active.toString().padStart(2, '0')}</strong><small>Scheduled or running in demo</small></div><div class="stat"><p>Ready for your review</p><strong>${review.toString().padStart(2, '0')}</strong><small>Your approval comes first</small></div><div class="stat"><p>Simulated allocation used</p><strong>${money(spent)}</strong><small>Actual advertising spend: 0 DKK</small></div></div>
    <div class="section-heading"><h2>Your campaigns <span class="muted small">(${state.campaigns.length})</span></h2><span class="small muted">All activity is demo activity</span></div>
    <div class="campaign-list">${state.campaigns.length ? state.campaigns.map(c => `<button class="campaign-row" data-campaign="${esc(c.id)}"><span class="campaign-icon" aria-hidden="true">↗</span><div><h3>${esc(c.data.title)}</h3><p>${esc(c.data.audience)} · ${c.data.items.length} content pieces</p></div>${badge(c.status)}<div class="row-budget">${money(c.data.budget)}<p>Simulated budget</p></div></button>`).join('') : `<div class="empty"><div class="empty-symbol">✧</div><h3>Your next campaign starts here.</h3><p>${state.brand ? 'Tell your companion what you want to promote.' : 'Save your brand profile, then describe your first promotion.'}</p><button class="button" data-go="${state.brand ? 'composer' : 'brand'}">${state.brand ? 'Create your first campaign →' : 'Add your brand →'}</button></div>`}</div>`;
  bindNavigation();
  document.querySelectorAll('[data-campaign]').forEach(button => button.addEventListener('click', () => busy(button, () => openCampaign(button.dataset.campaign))));
}
function bindNavigation() { document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.go))); }
async function openCampaign(id) { state.campaign = await api(`/campaigns/${id}`); state.dirty = false; state.view = 'detail'; render(); }
function brandForm() {
  const b = state.brand || {};
  const input = (key, label, placeholder, max = 2000) => `<label>${label}<input name="${key}" value="${esc(b[key])}" placeholder="${esc(placeholder)}" maxlength="${max}" required></label>`;
  $('#view').innerHTML = `<div class="page-heading"><div><p class="eyebrow">THE FOUNDATION</p><h1>Make it sound like you.</h1><p>Give your companion the facts it needs to create relevant campaigns.</p></div>${state.brand ? '<span class="pill completed">PROFILE SAVED</span>' : ''}</div>
    <form id="brand-form"><section class="card"><h2>Your business</h2><p class="muted">${browserDemo ? 'Saved in this browser only, without account authentication.' : 'These details are private to your account.'}</p><div class="form-grid">${input('name', 'Business name', 'Your business', 120)}${input('product', 'Main product or offer', 'Your sales course', 200)}<label class="span-2">Business details<textarea name="business" maxlength="2000" required placeholder="What do you offer, and who is it for?">${esc(b.business)}</textarea></label>${input('audience', 'Default audience', 'Danish small-business owners', 400)}${input('tone', 'Brand tone', 'Friendly, clear, practical', 120)}<label>Default campaign language<select aria-label="Default campaign language" name="language"><option value="ar" ${b.language !== 'en' ? 'selected' : ''}>العربية</option><option value="en" ${b.language === 'en' ? 'selected' : ''}>English</option></select></label><label class="span-2">Website or product link (optional)<input name="website" type="url" value="${esc(b.website)}" placeholder="Optional product URL" maxlength="1000"><small>Used as the campaign link. Website content is not imported in this release.</small></label></div></section>
    <section class="card"><h2>Approved marketing claims</h2><p class="muted">Only add facts you can substantiate. Leave blank if you have no approved claims.</p><label>One claim per line<textarea name="claims" maxlength="4000" placeholder="For example, the actual course duration or topics covered.">${esc(b.claims)}</textarea></label><div class="note">The demo planner uses product details and your approved claims. It does not invent testimonials, results, or performance promises. Tone is stored in the brief; templates do not reliably adapt writing style yet.</div><button class="button primary" type="submit">Save brand profile →</button></section></form>`;
  $('#brand-form').addEventListener('submit', event => { event.preventDefault(); busy(event.submitter, async () => { state.brand = await api('/brand', 'PUT', Object.fromEntries(new FormData(event.target))); toast('Brand profile saved.'); navigate('composer'); }); });
}
function composer() {
  const b = state.brand;
  $('#view').innerHTML = `<div class="page-heading"><div><p class="eyebrow">ONE IDEA. A WHOLE CAMPAIGN.</p><h1>What are we promoting?</h1><p>Your companion will turn your request into a plan you can review.</p></div></div>
    ${!b ? '<div class="note">First, save your business details in your brand profile. <button class="text-button" data-go="brand">Set up your brand →</button></div>' : ''}
    <div class="composer-layout"><section class="card chat-card"><div class="chat-intro"><div class="companion-icon" aria-hidden="true">✧</div><h2>Tell me what you have in mind.</h2><p>Include the product, audience, duration, and budget. I’ll use your brand profile for anything you leave out, and ask for missing essentials.</p><span class="pill demo">DEMO TEMPLATE PLANNER</span><div class="prompt-examples"><button class="prompt-chip" data-example="Promote my sales course to Danish small-business owners for two weeks, with a total budget of 1,000 DKK.">A two-week product promotion ↗</button><button class="prompt-chip" data-example="Promote my ${esc(b?.product || 'new offer')} for one week, with a budget of 0 DKK.">An organic campaign ↗</button></div></div>
    <form id="chat-form" class="chat-form">${state.workspace.products.length ? `<label>Campaign product<select aria-label="Campaign product" id="campaign-product"><option value="">Use brand profile</option>${state.workspace.products.map(p => `<option value="${p.id}" ${p.id === state.selectedProduct ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select><small>A selected product supplies its audience, link, and approved facts.</small></label>` : ''}${state.pendingDraft ? `<div class="note">Your saved ${esc(state.pendingDraft.language === 'ar' ? 'Arabic' : 'English')} draft will become the first campaign content piece. Review the remaining pieces separately. <button class="text-button" type="button" id="clear-selected-draft">Remove saved draft</button></div>` : ''}<label for="request">Your campaign request</label><textarea id="request" name="request" required maxlength="4000" placeholder="Promote my sales course to Danish small-business owners for two weeks, with a total budget of 1,000 DKK.">${esc(state.message)}</textarea><div id="missing-fields">${state.pending ? missingFields(state.pending) : ''}</div><div class="chat-footer"><span>Nothing publishes until approved or explicitly allowed by your automation policy.</span><button class="button primary" type="submit" ${b ? '' : 'disabled'}>Build my campaign <span>↗</span></button></div></form></section>
    <aside class="composer-context"><div class="card context-card"><h3>Your brand, at a glance</h3>${b ? `<div class="context-item"><small>Business</small><p>${esc(b.name)}</p></div><div class="context-item"><small>Audience</small><p>${esc(b.audience)}</p></div><div class="context-item"><small>Tone</small><p>${esc(b.tone)}</p></div><button class="text-button" data-go="brand">Edit brand profile ↗</button>` : '<p class="muted">Your brand context will appear here.</p>'}</div><div class="card steps"><h3>From idea to launch</h3><p>Describe your promotion</p><p>Edit the campaign plan</p><p>Review and approve</p><p>Watch the demo run</p></div></aside></div>`;
  bindNavigation();
  $('#campaign-product')?.addEventListener('change', event => { state.selectedProduct = event.target.value; state.pendingDraft = null; composer(); });
  $('#clear-selected-draft')?.addEventListener('click', () => { state.pendingDraft = null; composer(); });
  document.querySelectorAll('[data-example]').forEach(button => button.addEventListener('click', () => { $('#request').value = button.dataset.example; state.message = button.dataset.example; state.pending = null; $('#missing-fields').innerHTML = ''; $('#request').focus(); }));
  $('#request').addEventListener('input', () => { state.message = $('#request').value; if (state.pending) { state.pending = null; $('#missing-fields').innerHTML = ''; } });
  $('#chat-form').addEventListener('submit', event => {
    event.preventDefault(); busy(event.submitter, async () => {
      state.message = $('#request').value;
      const fields = new FormData(event.target), details = {};
      const product = state.workspace.products.find(p => p.id === state.selectedProduct);
      if (product) Object.assign(details, { product: product.name, audience: product.audience, productFacts: product.facts, productWebsite: product.website, productCta: product.cta });
      if (state.pendingDraft) details.language = state.pendingDraft.language;
      if (state.pendingDraft?.content.length > 4000) throw new Error('Shorten the saved draft to 4,000 characters before using it in a campaign.');
      for (const key of ['budget', 'days']) if (fields.has(key)) details[key] = Number(fields.get(key));
      const result = await api('/plan', 'POST', { message: state.message, details });
      if (result.missing.length) { state.pending = result; $('#missing-fields').innerHTML = missingFields(result); $('#missing-fields input')?.focus(); }
      else {
        state.pending = null; state.campaign = result.campaign;
        if (state.pendingDraft) {
          const c = state.campaign, data = structuredClone(c.data);
          data.items[0].content = state.pendingDraft.content;
          data.items[0].channel = state.pendingDraft.format === 'ad' ? 'Paid social' : 'Social post';
          state.campaign = await api(`/campaigns/${c.id}`, 'PUT', { data, revision: c.revision }); state.pendingDraft = null;
        }
        state.campaigns = await api('/campaigns'); state.view = 'detail'; state.dirty = false; render(); toast('Your campaign draft is ready.');
      }
    });
  });
}
function missingFields(result) {
  return `<div class="note">I need ${result.missing.map(k => k === 'budget' ? 'the total budget' : 'the number of days').join(' and ')} to finish your plan.</div><div class="form-grid">${result.missing.map(key => key === 'budget' ? '<label>Total budget (DKK)<input name="budget" type="number" min="0" max="1000000" step="0.01" required><small>Use 0 for an organic demo.</small></label>' : '<label>Duration (days)<input name="days" type="number" min="1" max="90" step="1" required></label>').join('')}</div>`;
}
function automation() {
  const p = state.policy;
  $('#view').innerHTML = `<div class="page-heading"><div><p class="eyebrow">YOUR RULES. YOUR CONTROL.</p><h1>Set the boundaries.</h1><p>Allow campaigns to run automatically within limits you explicitly choose.</p></div>${badge(p.enabled ? 'enabled' : 'disabled')}</div>
    <div class="note">Automatic mode applies when you submit a draft for review. Campaigns outside your rules still require manual approval. Revoking permission stops pending automatic jobs at execution.</div>
    <form id="policy-form"><section class="card"><h2>Automatic approval</h2><p class="muted">Manual approval is the default. All available execution is simulated.</p><label class="check-label"><input name="enabled" type="checkbox" ${p.enabled ? 'checked' : ''}> Enable automatic mode for matching campaigns</label><div class="form-grid"><div><h3>Allowed accounts</h3><label class="check-label"><input name="account" type="checkbox" ${p.accounts.includes('demo-workspace') ? 'checked' : ''}> Demo workspace</label><small class="muted">No live accounts connected.</small></div><div><h3>Allowed campaign types</h3><label class="check-label"><input name="type" type="checkbox" ${p.campaignTypes.includes('product-promotion') ? 'checked' : ''}> Product promotion</label></div></div></section>
    <section class="card"><h2>Spending limits</h2><p class="muted">Limits apply to simulated allocation. No money is charged.</p><div class="form-grid"><label>Maximum per campaign (DKK)<input name="maxCampaign" type="number" min="0" max="1000000" step="0.01" value="${p.maxCampaign / 100}" required></label><label>Maximum per day (DKK)<input name="maxDaily" type="number" min="0" max="1000000" step="0.01" value="${p.maxDaily / 100}" required><small>Across all your campaigns, measured by UTC day. Manual deliveries count toward usage; this limit restricts automatic jobs.</small></label></div><h3>Permitted automatic adjustments</h3><p class="muted">None in this release. The companion cannot change approved content, dates, or budgets. Pause and cancel remain available.</p><button class="button primary" type="submit">Save automation rules →</button></section></form>`;
  $('#policy-form').addEventListener('submit', event => { event.preventDefault(); busy(event.submitter, async () => {
    const form = new FormData(event.target);
    state.policy = await api('/policy', 'PUT', { enabled: form.has('enabled'), accounts: form.has('account') ? ['demo-workspace'] : [], campaignTypes: form.has('type') ? ['product-promotion'] : [], maxCampaign: Math.round(Number(form.get('maxCampaign')) * 100), maxDaily: Math.round(Number(form.get('maxDaily')) * 100), adjustments: [] });
    toast('Automation rules saved.'); render();
  }); });
}
function detail() {
  const c = state.campaign, d = c.data, editable = ['draft', 'awaiting approval'].includes(c.status);
  const allocation = d.items.reduce((sum, i) => sum + i.cost, 0);
  $('#view').innerHTML = `<div class="detail-top"><button class="text-button" data-go="dashboard">← All campaigns</button><div>${badge(c.status)} <span class="pill demo">DEMO CAMPAIGN</span></div></div><div class="page-heading"><div><h1>${esc(d.title)}</h1><p>Review the details. Make it yours. Then set it in motion.</p></div></div>
    <div class="detail-grid"><div><section class="card"><h2>The campaign brief</h2><dl class="brief-grid"><div><dt>Product</dt><dd>${esc(d.product)}</dd></div><div><dt>Audience</dt><dd>${esc(d.audience)}</dd></div><div><dt>Objective</dt><dd>${esc(d.objective)}</dd></div><div><dt>Tone / duration</dt><dd>${esc(d.tone)} · ${esc(d.duration)} days</dd></div><div><dt>Suggested channels</dt><dd>${d.suggestedChannels.map(esc).join(', ')}</dd></div><div><dt>Execution destination</dt><dd>Demo workspace only</dd></div></dl><div class="note">${esc(d.note)} Content uses demo templates. Review all wording and links.</div></section>
    <form id="campaign-form">${editable ? `<section class="card"><div class="form-grid"><label>Campaign title<input name="title" required maxlength="240" value="${esc(d.title)}"></label><label>Total simulated budget (DKK)<input name="budget" type="number" min="0" max="1000000" step="0.01" required value="${d.budget / 100}"></label></div><button type="button" id="demo-now" class="text-button">Schedule all pieces now for a quick demo ↗</button><p class="small muted">Save your changes, then review and approve. Otherwise the original schedule is used.</p></section>` : ''}
    <div class="section-heading"><h2>Content & schedule</h2><span class="small muted">${d.items.length} pieces · times shown locally</span></div>
    ${d.items.map((item, index) => `<section class="card content-card" data-item="${esc(item.id)}"><div class="content-heading"><h3><span class="muted">0${index + 1}</span> &nbsp; ${esc(item.channel)}</h3>${editable ? `<button class="text-button" type="button" data-regenerate="${esc(item.id)}">↻ Regenerate</button>` : '<span class="pill">APPROVED CONTENT</span>'}</div>${editable ? `<label>Exact content<textarea dir="auto" aria-label="Exact content" name="content-${item.id}" maxlength="4000" required>${esc(item.content)}</textarea></label><div class="form-grid"><label>Product link<input name="link-${item.id}" type="url" value="${esc(item.destination)}" maxlength="1000"></label><label>Destination<select name="account-${item.id}"><option value="demo-workspace">Demo workspace</option></select></label><label>Scheduled time<input name="due-${item.id}" type="datetime-local" required value="${localInput(item.due)}"></label><label>Simulated allocation (DKK)<input name="cost-${item.id}" type="number" min="0" max="1000000" step="0.01" required value="${item.cost / 100}"></label></div>` : `<div dir="auto" class="readonly-content">${esc(item.content)}</div><div class="content-meta"><span>Link: ${esc(item.destination)}</span><span>Destination: Demo workspace · ${esc(item.channel)}</span><span>Scheduled: ${date(item.due)} · Allocation: ${money(item.cost)}</span><span>Job status: ${esc(c.jobs.find(j => j.item_id === item.id)?.state || 'not queued')}</span></div>`}</section>`).join('')}
    ${editable ? '<div class="form-actions"><button class="button primary" type="submit">Save changes</button><span id="dirty-note" class="small muted">All changes saved</span></div>' : ''}</form>
    ${c.receipts.length ? `<section class="card"><h2>Demo delivery receipts</h2><p class="muted">Recorded simulated deliveries. No real posts, ads, or charges.</p>${c.receipts.map(r => `<div class="receipt"><h3>${date(r.publishedAt)} · Demo workspace</h3><p>Simulated allocation: ${money(r.simulatedCost)}</p><pre dir="auto">${esc(r.content)}</pre><p>Link: ${esc(r.link)}</p><p class="muted">Receipt: ${esc(r.id)}</p></div>`).join('')}</section>` : ''}
    </div><aside class="detail-aside"><section class="card review-card"><h2>${c.status === 'awaiting approval' ? 'Your final review' : 'Campaign summary'}</h2><div class="summary-line"><span>Content pieces</span><strong>${d.items.length}</strong></div><div class="summary-line"><span>Allocated</span><strong>${money(allocation)}</strong></div><div class="summary-line"><span>Simulated usage</span><strong>${money(c.spent)}</strong></div><div class="summary-line summary-total"><span>Budget cap</span><strong>${money(d.budget)}</strong></div><p class="small muted">Actual spend: 0 DKK. Approval covers revision ${c.revision}, the exact content, links, destinations, dates, and allocations shown here.</p>
    ${c.status === 'draft' ? '<button class="button primary full" data-action="submit">Review campaign →</button>' : ''}
    ${c.status === 'awaiting approval' ? '<label class="check-label"><input id="review-confirm" type="checkbox"> I reviewed every content piece, link, date, and allocation.</label><button class="button primary full" data-action="approve" disabled>Approve & schedule →</button>' : ''}
    ${['scheduled', 'running'].includes(c.status) ? '<button class="button full" data-action="pause">Pause campaign</button>' : ''}
    ${c.status === 'paused' ? '<button class="button primary full" data-action="resume">Resume campaign →</button>' : ''}
    ${c.status === 'failed' ? '<button class="button primary full" data-action="retry">Retry failed jobs ↻</button>' : ''}
    ${!['completed', 'cancelled'].includes(c.status) ? '<button class="button danger full" data-action="cancel">Cancel campaign</button>' : ''}
    ${c.status === 'draft' && state.policy.enabled ? '<p class="small muted">Automatic mode is enabled. Submitting can schedule this campaign immediately if it matches your rules.</p>' : ''}
    <button class="button full" id="export-campaign">Export campaign CSV</button><button class="button full" id="duplicate-campaign">Duplicate as draft</button>
    </section><section class="card"><h2>Performance</h2><div class="metrics"><div><strong>—</strong><p>Reach</p></div><div><strong>—</strong><p>Clicks</p></div><div><strong>—</strong><p>Conversions</p></div></div><p class="small muted">Unavailable in demo mode. Enter your actual reports manually in Results.</p></section><section class="card"><h2>Activity history</h2><ol class="timeline">${c.events.map(e => `<li><p>${esc(e.message)}</p><time datetime="${new Date(e.at).toISOString()}">${date(e.at)}</time></li>`).join('')}</ol></section></aside></div>`;
  bindNavigation();
  $('#export-campaign').addEventListener('click', () => { if (state.dirty) toast('Save campaign edits before exporting.'); else workspaceUI.exportCampaign(c); });
  $('#duplicate-campaign').addEventListener('click', () => busy($('#duplicate-campaign'), async () => {
    if (state.dirty) { toast('Save campaign edits before duplicating.'); return; }
    state.campaign = await api(`/campaigns/${c.id}/duplicate`, 'POST', { revision: c.revision });
    state.campaigns = await api('/campaigns'); render(); toast('Duplicated as a draft. Review dates and content before approving.');
  }));
  $('#campaign-form').addEventListener('input', () => {
    state.dirty = true; $('#dirty-note').textContent = 'Unsaved changes — save before review';
    document.querySelectorAll('[data-action="approve"],[data-action="submit"]').forEach(button => button.disabled = true);
    if ($('#review-confirm')) $('#review-confirm').checked = false;
  });
  $('#campaign-form').addEventListener('submit', event => { event.preventDefault(); busy(event.submitter, async () => { await saveEdits(); toast('Changes saved. Review the latest campaign.'); }); });
  $('#demo-now')?.addEventListener('click', () => { document.querySelectorAll('input[type=datetime-local]').forEach(input => { input.value = localInput(Date.now()); }); $('#campaign-form').dispatchEvent(new Event('input')); });
  document.querySelectorAll('[data-regenerate]').forEach(button => button.addEventListener('click', () => busy(button, async () => {
    if (state.dirty) { toast('Save your edits before regenerating content.'); return; }
    state.campaign = await api(`/campaigns/${c.id}/regenerate`, 'POST', { itemId: button.dataset.regenerate, revision: c.revision });
    state.campaigns = await api('/campaigns'); render(); toast('Content variation regenerated. Review it before approving.');
  })));
  $('#review-confirm')?.addEventListener('change', event => { $('[data-action=approve]').disabled = !event.target.checked || state.dirty; });
  document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => busy(button, async () => {
    const action = button.dataset.action;
    if (state.dirty && ['approve', 'submit'].includes(action)) { toast('Save your changes before approval.'); return; }
    if (action === 'cancel' && !confirm('Cancel this campaign and stop all pending jobs?')) return;
    state.campaign = await api(`/campaigns/${c.id}/action`, 'POST', { action, revision: c.revision });
    state.campaigns = await api('/campaigns'); state.dirty = false; render(); toast(`Campaign ${state.campaign.status}.`);
  })));
}
async function saveEdits() {
  const c = state.campaign, data = structuredClone(c.data), form = new FormData($('#campaign-form'));
  data.title = form.get('title'); data.budget = Math.round(Number(form.get('budget')) * 100);
  for (const item of data.items) {
    item.content = form.get(`content-${item.id}`); item.destination = form.get(`link-${item.id}`);
    item.account = form.get(`account-${item.id}`); item.due = new Date(form.get(`due-${item.id}`)).getTime();
    item.cost = Math.round(Number(form.get(`cost-${item.id}`)) * 100);
  }
  state.campaign = await api(`/campaigns/${c.id}`, 'PUT', { data, revision: c.revision });
  state.campaigns = await api('/campaigns'); state.dirty = false; render();
}

// Poll only views that cannot contain unsaved form edits.
setInterval(async () => {
  if (!state.me || document.hidden || state.dirty) return;
  try {
    if (state.view === 'dashboard') {
      const next = await api('/campaigns');
      if (state.view === 'dashboard' && JSON.stringify(next) !== JSON.stringify(state.campaigns)) { state.campaigns = next; dashboard(); }
    } else if (state.view === 'detail' && !['draft', 'awaiting approval'].includes(state.campaign?.status)) {
      const id = state.campaign.id;
      const next = await api(`/campaigns/${id}`);
      if (state.view === 'detail' && state.campaign.id === id && !state.dirty && JSON.stringify(next) !== JSON.stringify(state.campaign)) {
        const campaigns = await api('/campaigns');
        if (state.view === 'detail' && state.campaign.id === id && !state.dirty) { state.campaigns = campaigns; state.campaign = next; detail(); }
      }
    }
  } catch (error) { if (state.me) toast(error.message); }
}, 3000);
if (browserDemo) {
  $('.topbar .pill').textContent = 'BROWSER DEMO';
  $('#logout').textContent = 'Reset demo';
  $('.demo-note p').textContent = 'Saved on this browser only. No real publishing.';
  const notice = document.createElement('div');
  notice.className = 'pages-disclaimer';
  notice.textContent = 'GitHub Pages browser demo · Data stays in this browser, without account authentication. Scheduled demos run only while this page is open; overdue pieces run when you reopen it. No real publishing, spending, or performance metrics.';
  $('.topbar').after(notice);
  try { state.me = await api('/me'); await loadWorkspace(); }
  catch (error) {
    $('#app-shell').hidden = false;
    $('#view').innerHTML = `<div class="card"><h1>Browser storage is unavailable</h1><p>${esc(error.message)}</p><p>Allow local storage for this site, or use Reset demo if saved data is corrupted.</p></div>`;
  }
} else {
  try { state.me = await api('/me'); await loadWorkspace(); } catch { showAuth(); }
}
