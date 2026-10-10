import { formats, objectives, validateProduct, generatePack, qualityChecks, metrics, csv, calendarFile, funnelStages, goalMetrics, validateBrief, briefChecks, briefObjective, filterDrafts, filterResults, metricsCoverage } from './marketing-tools.js';
import { StudioEdits, freezeForm } from './editor-state.js';

export function createWorkspaceUI({ api, state, esc, toast, navigate, openCampaign, busy, date, money }) {
  let editingProduct = null, generated = [], studioOptions = { language: 'ar', goal: 'awareness', tone: 'clear', variant: 0 };
  let generatedProduct = null, monthOffset = 0;
  const edits = new StudioEdits();
  let draftFilters = { query: '', format: '', stage: '', language: '' }, draftLimit = 20;
  let reportFilters = { campaignId: '', from: '', to: '' }, editingBrief = null;
  const $ = selector => document.querySelector(selector);
  const uid = () => crypto.randomUUID();
  const options = (values, selected) => Object.entries(values).map(([key, label]) => `<option value="${esc(key)}" ${key === selected ? 'selected' : ''}>${esc(label)}</option>`).join('');
  const products = selected => state.workspace.products.map(p => `<option value="${esc(p.id)}" ${selected === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  const heading = (title, subtitle) => `<div class="page-heading"><div><p class="eyebrow">FREE MARKETING WORKSPACE</p><h1>${title}</h1><p>${subtitle}</p></div><span class="pill">NO EXTERNAL SERVICES</span></div>`;
  const empty = (message, target = 'products') => `<div class="empty"><h3>${message}</h3><button class="button" id="empty-action">${target === 'products' ? 'Add a product →' : 'Create a campaign →'}</button></div>`;
  const dirty = form => form?.addEventListener('input', () => state.dirty = true);
  function download(name, content, type = 'text/plain;charset=utf-8') {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a'); link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  async function save(next) {
    const epoch = state.sessionEpoch;
    const saved = await api('/workspace', 'PUT', next);
    if (state.sessionEpoch !== epoch || saved.revision < state.workspace.revision) throw new Error('Workspace session changed during this save. Reload the current workspace.');
    state.workspace = saved; state.dirty = false;
  }
  async function update(fn) { const next = structuredClone(state.workspace); fn(next); await save(next); }
  const formatRows = rows => rows.map(d => ({ title: d.title, format: formats[d.format], language: d.language, stage: d.stage, content: d.content }));
  function bindEmpty(target = 'products') { $('#empty-action')?.addEventListener('click', () => navigate(target)); }

  function productView() {
    if (state.view !== 'products') return;
    const p = state.workspace.products.find(p => p.id === editingProduct) || { color: '#235a43' };
    $('#view').innerHTML = heading('Your products, ready to promote.', 'Save the facts once. Reuse them across content, campaigns, and creative designs.') + `
      <div class="tool-grid"><section class="card"><h2>${p.id ? 'Edit product' : 'Add a product'}</h2><form id="product-form"><div class="form-grid">
      <label>Product name<input name="name" required maxlength="200" value="${esc(p.name)}"></label><label>Audience<input name="audience" required maxlength="400" value="${esc(p.audience)}"></label>
      <label class="span-2">Product description<textarea name="description" required maxlength="2000" aria-label="Product description">${esc(p.description)}</textarea></label>
      <label class="span-2">Offer details<textarea name="offer" maxlength="500" aria-label="Offer details" placeholder="Your actual price, package, or offer. No invented discounts.">${esc(p.offer)}</textarea></label>
      <label class="span-2">Approved product facts<textarea name="facts" maxlength="3000" aria-label="Approved product facts" placeholder="One substantiated fact per line.">${esc(p.facts)}</textarea></label>
      <label>Audience question or problem<textarea name="problem" maxlength="600" aria-label="Audience question or problem" placeholder="Use what you actually know about your audience.">${esc(p.problem)}</textarea></label><label>Approved differentiator<textarea name="difference" maxlength="600" aria-label="Approved differentiator" placeholder="A specific, substantiated difference.">${esc(p.difference)}</textarea></label><label class="span-2">Common customer questions<textarea name="objections" maxlength="600" aria-label="Common customer questions" placeholder="Questions you hear; do not invent answers.">${esc(p.objections)}</textarea></label>
      <label>Call to action<input name="cta" maxlength="200" value="${esc(p.cta)}" placeholder="Contact us for details"></label><label>Brand color<input name="color" type="color" value="${p.color}"></label>
      <label class="span-2">Product link (optional)<input name="website" type="url" maxlength="1000" value="${esc(p.website)}"></label></div><div class="form-actions"><button class="button primary" type="submit">Save product</button>${p.id ? '<button class="button" type="button" id="cancel-product">Cancel edit</button>' : ''}</div></form></section>
      <section><div class="section-heading"><h2>Product library (${state.workspace.products.length})</h2></div>${state.workspace.products.map(p => `<article class="card product-card"><h3>${esc(p.name)}</h3><p class="muted">${esc(p.description)}</p><p class="small">Audience: ${esc(p.audience)}</p>${p.offer ? `<p class="small">Offer: ${esc(p.offer)}</p>` : ''}<div class="form-actions"><button class="button" data-edit="${p.id}">Edit</button><button class="button" data-studio="${p.id}">Create content</button><button class="text-button danger" data-delete="${p.id}">Delete</button></div></article>`).join('') || '<div class="empty"><h3>Your product library is empty.</h3><p>Add your first product with its actual facts.</p></div>'}</section></div>`;
    dirty($('#product-form'));
    $('#product-form').addEventListener('submit', event => { event.preventDefault(); busy(event.submitter, async () => {
      const product = validateProduct({ ...Object.fromEntries(new FormData(event.target)), id: p.id || uid() });
      await freezeForm(event.target, () => update(w => {
        const i = w.products.findIndex(p => p.id === product.id);
        product.revision = i < 0 ? 1 : w.products[i].revision + 1;
        if (i < 0) w.products.push(product); else { w.products[i] = product; for (const d of w.drafts.filter(d => d.productId === product.id)) d.stage = 'draft'; }
      }));
      editingProduct = null; productView(); toast('Product saved.');
    }); });
    $('#cancel-product')?.addEventListener('click', () => { state.dirty = false; editingProduct = null; productView(); });
    document.querySelectorAll('[data-edit]').forEach(button => button.addEventListener('click', () => { if (state.dirty && !confirm('Discard unsaved product edits?')) return; state.dirty = false; editingProduct = button.dataset.edit; productView(); }));
    document.querySelectorAll('[data-studio]').forEach(button => button.addEventListener('click', () => { studioOptions.productId = button.dataset.studio; navigate('studio'); }));
    document.querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', () => busy(button, async () => {
      if (state.dirty) { toast('Save or discard product edits before deleting.'); return; }
      if (!confirm('Delete this product and its saved content drafts? Existing campaigns remain.')) return;
      await update(w => { w.products = w.products.filter(p => p.id !== button.dataset.delete); w.drafts = w.drafts.filter(d => d.productId !== button.dataset.delete); w.briefs = w.briefs.filter(b => b.productId !== button.dataset.delete); });
      if (editingProduct === button.dataset.delete) editingProduct = null;
      if (generatedProduct === button.dataset.delete) { generated = []; edits.clearKit(); }
      if (state.selectedProduct === button.dataset.delete) { state.selectedProduct = ''; state.pendingDraft = null; state.activeBrief = null; }
      productView(); toast('Product deleted.');
    })));
  }

  function strategyView() {
    if (state.view !== 'strategy') return;
    if (!state.workspace.products.length) { $('#view').innerHTML = heading('Start with a measurable plan.', 'Connect audience, offer, message, and a goal before preparing a campaign.') + empty('Add a product to create your strategy brief.'); bindEmpty(); return; }
    const briefs = state.workspace.briefs || [];
    const b = briefs.find(b => b.id === editingBrief) || { goal: 'leads', stage: 'consideration', metric: 'leads', days: 14, budget: 0 };
    const product = state.workspace.products.find(p => p.id === b.productId) || state.workspace.products[0];
    const checks = briefChecks(product, b);
    $('#view').innerHTML = heading('Start with a measurable plan.', 'Planning targets are your chosen goals, not predicted results or recommended spending.') + `
      <div class="tool-grid"><section class="card"><h2>${b.id ? 'Edit strategy brief' : 'Create strategy brief'}</h2><form id="brief-form"><div class="form-grid">
      <label class="span-2">Strategy product<select aria-label="Strategy product" name="productId">${products(product.id)}</select></label>
      <label>Strategy objective<select aria-label="Strategy objective" name="goal">${options(objectives, b.goal)}</select></label><label>Audience stage<select aria-label="Audience stage" name="stage">${options(funnelStages, b.stage)}</select></label>
      <label>Primary measurement<select aria-label="Primary measurement" name="metric">${options(goalMetrics, b.metric)}</select></label><label>Planning target<input name="target" type="number" min="0.01" max="1000000000000" step="any" required value="${b.target ?? ''}" placeholder="Your own target"></label>
      <label>Plan duration (days)<input name="days" type="number" min="1" max="90" step="1" required value="${b.days}"></label><label>Planned budget (DKK)<input name="budget" type="number" min="0" max="1000000" step=".01" required value="${b.budget}"></label>
      <label class="span-2">Testable hypothesis<textarea aria-label="Testable hypothesis" name="hypothesis" maxlength="800" placeholder="For this audience, I will compare this message against that message and measure this action.">${esc(b.hypothesis)}</textarea></label></div>
      <div class="form-actions"><button class="button primary" type="submit">Save strategy brief</button>${b.id ? '<button class="button" type="button" id="new-brief">New brief</button>' : ''}</div></form></section>
      <section class="card"><h2>Brief completeness</h2><p class="muted" id="brief-completeness">${checks.filter(c => c.done).length} of ${checks.length} preparation checks. This is not a conversion score.</p><ul class="preparation-list" id="brief-checks">${checks.map(c => `<li>${c.done ? '✓' : '○'} ${esc(c.label)}</li>`).join('')}</ul><h3>A practical message sequence</h3><ol class="preparation-list"><li>Discover: explain the audience question, without inventing promises.</li><li>Evaluate: show approved product facts and invite specific questions.</li><li>Take action: present the actual offer and one clear next step.</li></ol><p class="small muted">Change one message element at a time. Record the actual outcome; this tool does not infer causality or statistical significance.</p></section></div>
      <section><div class="section-heading"><h2>Saved strategy briefs (${briefs.length})</h2></div>${briefs.map(b => { const p = state.workspace.products.find(p => p.id === b.productId); return `<article class="card"><h3>${esc(p.name)} · ${esc(objectives[b.goal])}</h3><p>${esc(briefObjective(b))}</p><p class="small muted">Audience stage: ${esc(funnelStages[b.stage])}</p><div class="form-actions"><button class="button" data-edit-brief="${b.id}">Edit brief</button><button class="button primary" data-use-brief="${b.id}">Use brief in campaign</button><button class="text-button danger" data-delete-brief="${b.id}">Delete brief</button></div></article>`; }).join('') || '<div class="empty"><p>No strategy briefs saved yet.</p></div>'}</section>`;
    dirty($('#brief-form'));
    $('#brief-form').addEventListener('input', () => {
      const form = $('#brief-form'); const selected = state.workspace.products.find(p => p.id === form.elements.productId.value);
      const current = briefChecks(selected, { hypothesis: form.elements.hypothesis.value.trim() });
      $('#brief-completeness').textContent = `${current.filter(c => c.done).length} of ${current.length} preparation checks. This is not a conversion score.`;
      $('#brief-checks').innerHTML = current.map(c => `<li>${c.done ? '✓' : '○'} ${esc(c.label)}</li>`).join('');
    });
    $('#brief-form').addEventListener('submit', event => { event.preventDefault(); busy(event.submitter, async () => {
      const f = Object.fromEntries(new FormData(event.target));
      const brief = validateBrief({ ...f, id: b.id || uid(), target: Number(f.target), days: Number(f.days), budget: Number(f.budget), updated: Date.now() });
      await freezeForm(event.target, () => update(w => { const i = w.briefs.findIndex(b => b.id === brief.id); if (i < 0) w.briefs.push(brief); else w.briefs[i] = brief; }));
      editingBrief = brief.id; strategyView(); toast('Strategy brief saved.');
    }); });
    $('#new-brief')?.addEventListener('click', () => { if (state.dirty && !confirm('Discard unsaved brief edits?')) return; state.dirty = false; editingBrief = null; strategyView(); });
    document.querySelectorAll('[data-edit-brief]').forEach(button => button.addEventListener('click', () => { if (state.dirty && !confirm('Discard unsaved brief edits?')) return; state.dirty = false; editingBrief = button.dataset.editBrief; strategyView(); }));
    document.querySelectorAll('[data-use-brief]').forEach(button => button.addEventListener('click', () => {
      if (state.dirty) { toast('Save brief edits before preparing a campaign.'); return; }
      const brief = briefs.find(b => b.id === button.dataset.useBrief), p = state.workspace.products.find(p => p.id === brief.productId);
      state.activeBrief = structuredClone(brief); state.selectedProduct = p.id; state.pendingDraft = null; state.pending = null;
      studioOptions = { ...studioOptions, productId: p.id, goal: brief.goal };
      state.message = `Promote ${p.name} to ${p.audience} for ${brief.days} days, with a budget of ${brief.budget} DKK.`;
      navigate('composer');
    }));
    document.querySelectorAll('[data-delete-brief]').forEach(button => button.addEventListener('click', () => busy(button, async () => {
      if (state.dirty) { toast('Save or discard brief edits before deleting.'); return; }
      if (!confirm('Delete this strategy brief? Existing campaign snapshots remain.')) return;
      await update(w => w.briefs = w.briefs.filter(b => b.id !== button.dataset.deleteBrief));
      if (editingBrief === button.dataset.deleteBrief) editingBrief = null;
      if (state.activeBrief?.id === button.dataset.deleteBrief) state.activeBrief = null;
      strategyView();
    })));
  }

  function studioView() {
    if (state.view !== 'studio') return;
    if (!state.workspace.products.length) { $('#view').innerHTML = heading('A full content kit, from your facts.', 'Draft posts, ads, video scripts, emails, messages, and landing-page copy.') + empty('Add a product to start your content kit.'); bindEmpty(); return; }
    const matching = filterDrafts(state.workspace.drafts, draftFilters), shown = matching.slice(0, draftLimit);
    state.dirty = edits.dirty;
    $('#view').innerHTML = heading('A full content kit, from your facts.', 'Arabic and English templates. No paid AI, invented testimonials, or external connections.') + `
      <section class="card"><form id="studio-form"><div class="form-grid four"><label>Product<select aria-label="Product" name="productId">${products(studioOptions.productId)}</select></label><label>Content language<select aria-label="Content language" name="language">${options({ ar: 'العربية', en: 'English' }, studioOptions.language)}</select></label><label>Campaign objective<select aria-label="Campaign objective" name="goal">${options(objectives, studioOptions.goal)}</select></label><label>Writing style<select aria-label="Writing style" name="tone">${options({ clear: 'Clear', friendly: 'Friendly', concise: 'Concise' }, studioOptions.tone)}</select></label></div><div class="form-actions"><button class="button primary" type="submit">Generate content kit</button><button class="button" type="button" id="new-variation">Next variation</button><span class="small muted">Variation ${(studioOptions.variant % 3) + 1}/3</span></div></form><p class="small muted">These are transparent local templates. Your product facts supply the claims; review the output before using it.</p></section>
      ${generated.length ? `<section><div class="section-heading"><h2>Your editable kit</h2><div class="form-actions"><button class="button" id="export-kit">Download kit</button><button class="button primary" id="save-kit">Save all drafts</button></div></div><div class="kit-grid">${generated.map((d, i) => { const content = edits.contentKit(i, d.content); return `<article class="card"><h3>${esc(formats[d.format])}</h3><label>Content<textarea aria-label="${esc(formats[d.format])} content" data-kit-index="${i}" dir="${d.language === 'ar' ? 'rtl' : 'ltr'}" maxlength="8000">${esc(content)}</textarea></label><p class="small muted">${qualityChecks(content, d.language).map(esc).join(' ') || (d.language === 'ar' ? 'راجع المعلومات والدعوة إلى الإجراء قبل النشر.' : 'Review the facts and call to action before publishing.')}</p><button class="text-button" data-copy-kit="${i}">Copy content</button></article>`; }).join('')}</div></section>` : ''}
      <section><div class="section-heading"><h2>Saved drafts (${matching.length}/${state.workspace.drafts.length})</h2><div class="form-actions"><button class="button" id="save-all-draft-edits">Save draft edits</button><button class="button" id="discard-studio-edits">Discard unsaved edits</button><button class="button" id="export-drafts">Export CSV</button></div></div>
      <form id="draft-filter" class="card"><div class="form-grid four"><label>Search saved content<input name="query" maxlength="200" value="${esc(draftFilters.query)}"></label><label>Content format<select aria-label="Content format" name="format"><option value="">All formats</option>${options(formats, draftFilters.format)}</select></label><label>Draft status<select aria-label="Draft status" name="stage"><option value="">All statuses</option>${options({ draft: 'Draft', ready: 'Ready', used: 'Used' }, draftFilters.stage)}</select></label><label>Draft language<select aria-label="Draft language" name="language"><option value="">All languages</option>${options({ ar: 'العربية', en: 'English' }, draftFilters.language)}</select></label></div><button class="button" type="submit">Filter drafts</button><p class="small muted">Filters preserve unsaved edits. Mark ready only after reviewing the current product facts; readiness does not publish anything.</p></form>
      ${shown.map(d => { const product = state.workspace.products.find(p => p.id === d.productId), outdated = d.sourceRevision !== product.revision; return `<article class="card saved-draft"><div class="section-heading"><h3>${esc(d.title)}</h3><span class="pill">${esc(d.stage)}</span></div>${outdated ? '<p class="note">Product facts need review. This draft was made from an older or unknown product revision.</p>' : ''}<label>Saved content<textarea data-saved-content="${d.id}" aria-label="Saved content ${esc(d.title)}" maxlength="8000" dir="${d.language === 'ar' ? 'rtl' : 'ltr'}">${esc(edits.contentDraft(d.id, d.content))}</textarea></label><div class="form-actions"><button class="button" data-save-draft="${d.id}">Save edits</button><button class="button" data-stage-draft="${d.id}">${d.stage === 'ready' ? 'Mark draft' : 'Mark ready'}</button><button class="text-button" data-copy-draft="${d.id}">Copy</button>${['social', 'ad'].includes(d.format) ? `<button class="text-button" data-use-draft="${d.id}">Use in campaign</button>` : ''}<button class="text-button danger" data-delete-draft="${d.id}">Delete</button></div></article>`; }).join('') || '<div class="empty"><h3>No drafts match these filters.</h3></div>'}${matching.length > shown.length ? '<button class="button" id="show-more-drafts">Show 20 more drafts</button>' : ''}</section>`;
    $('#studio-form').addEventListener('submit', event => { event.preventDefault(); studioOptions = { ...Object.fromEntries(new FormData(event.target)), variant: studioOptions.variant }; makeKit(); });
    $('#new-variation').addEventListener('click', () => { studioOptions = { ...Object.fromEntries(new FormData($('#studio-form'))), variant: studioOptions.variant + 1 }; makeKit(); });
    function makeKit() {
      if (edits.kit.size && !confirm('Replace unsaved generated-kit edits? Saved-draft edits will be preserved.')) return;
      try { generatedProduct = studioOptions.productId; generated = generatePack(state.workspace.products.find(p => p.id === generatedProduct), studioOptions); edits.clearKit(); state.dirty = edits.dirty; studioView(); }
      catch (error) { toast(error.message); }
    }
    const currentKit = () => generated.map((d, i) => ({ ...d, content: edits.contentKit(i, d.content) }));
    document.querySelectorAll('[data-kit-index]').forEach(field => field.addEventListener('input', () => {
      edits.setKit(Number(field.dataset.kitIndex), field.value, generated[Number(field.dataset.kitIndex)].content); state.dirty = edits.dirty;
      const checks = qualityChecks(field.value, generated[Number(field.dataset.kitIndex)].language);
      field.closest('article').querySelector('p.small').textContent = checks.join(' ') || 'Review the facts and call to action before publishing.';
    }));
    document.querySelectorAll('[data-saved-content]').forEach(field => field.addEventListener('input', () => { const d = state.workspace.drafts.find(d => d.id === field.dataset.savedContent); edits.setDraft(d.id, field.value, d.content); state.dirty = edits.dirty; }));
    $('#save-kit')?.addEventListener('click', event => busy(event.currentTarget, async () => {
      const kit = currentKit();
      await update(w => kit.forEach(d => w.drafts.push({ ...d, id: uid(), productId: generatedProduct, sourceRevision: w.products.find(p => p.id === generatedProduct).revision, goal: studioOptions.goal, stage: 'draft', updated: Date.now() })));
      const changedDuringSave = edits.reconcileKitSave(kit, currentKit());
      generated = changedDuringSave ? kit : []; state.dirty = edits.dirty; studioView(); toast(changedDuringSave ? 'Kit saved. Newer kit edits are still unsaved.' : 'Six content drafts saved.');
    }));
    $('#export-kit')?.addEventListener('click', () => download('marketing-content-kit.txt', currentKit().map(d => `${formats[d.format]}\n${d.content}`).join('\n\n----------\n\n')));
    $('#export-drafts').addEventListener('click', () => { if (edits.drafts.size) { toast('Save draft edits before exporting saved content.'); return; } download('marketing-content.csv', csv(formatRows(matching)), 'text/csv;charset=utf-8'); });
    $('#draft-filter').addEventListener('submit', event => { event.preventDefault(); draftFilters = Object.fromEntries(new FormData(event.target)); draftLimit = 20; studioView(); });
    $('#show-more-drafts')?.addEventListener('click', () => { draftLimit += 20; studioView(); });
    $('#discard-studio-edits').addEventListener('click', () => { edits.clear(); state.dirty = false; studioView(); toast('Unsaved studio edits discarded.'); });
    const copy = async content => { try { await navigator.clipboard.writeText(content); toast('Copied.'); } catch { toast('Clipboard is unavailable. Select the text and copy it manually.'); } };
    document.querySelectorAll('[data-copy-kit]').forEach(b => b.addEventListener('click', () => copy(currentKit()[Number(b.dataset.copyKit)].content)));
    document.querySelectorAll('[data-copy-draft]').forEach(b => b.addEventListener('click', () => copy($(`[data-saved-content="${b.dataset.copyDraft}"]`).value)));
    const saveDraftEdits = button => busy(button, async () => {
      const previous = structuredClone(state.workspace.drafts), snapshot = new Map(edits.drafts);
      await update(w => { for (const d of w.drafts) if (snapshot.has(d.id)) { d.content = snapshot.get(d.id); d.stage = 'draft'; d.updated = Date.now(); } });
      edits.reconcileDraftSave(previous, state.workspace.drafts); state.dirty = edits.dirty; studioView(); toast('Saved draft edits.');
    });
    $('#save-all-draft-edits').addEventListener('click', event => saveDraftEdits(event.currentTarget));
    document.querySelectorAll('[data-save-draft]').forEach(b => b.addEventListener('click', () => saveDraftEdits(b)));
    document.querySelectorAll('[data-stage-draft]').forEach(b => b.addEventListener('click', () => busy(b, async () => {
      if (state.dirty) { toast('Save content edits before marking readiness.'); return; }
      await update(w => { const d = w.drafts.find(d => d.id === b.dataset.stageDraft); d.stage = d.stage === 'ready' ? 'draft' : 'ready'; if (d.stage === 'ready') d.sourceRevision = w.products.find(p => p.id === d.productId).revision; }); studioView();
    })));
    document.querySelectorAll('[data-delete-draft]').forEach(b => b.addEventListener('click', () => busy(b, async () => { if (edits.dirty) { toast('Save or discard unsaved edits before deleting a draft.'); return; } if (!confirm('Delete this saved draft?')) return; await update(w => w.drafts = w.drafts.filter(d => d.id !== b.dataset.deleteDraft)); studioView(); })));
    document.querySelectorAll('[data-use-draft]').forEach(b => b.addEventListener('click', () => {
      if (state.dirty) { toast('Save your content edits first.'); return; }
      const draft = state.workspace.drafts.find(d => d.id === b.dataset.useDraft);
      const product = state.workspace.products.find(p => p.id === draft.productId);
      if (state.activeBrief && state.activeBrief.productId !== product.id) {
        if (!confirm('This content belongs to another product. Replace the active strategy with a new campaign?')) return;
        state.activeBrief = null;
      }
      state.selectedProduct = product.id; state.pendingDraft = structuredClone(draft); state.pending = null;
      if (!state.activeBrief || !state.message) state.message = `Promote ${product.name} to ${product.audience} for ${state.activeBrief?.days ?? 14} days, with a budget of ${state.activeBrief?.budget ?? 0} DKK.`;
      navigate('composer');
    }));
  }

  function creativeView() {
    if (state.view !== 'creative') return;
    if (!state.workspace.products.length) { $('#view').innerHTML = heading('Make your first ad visual.', 'Create and download a text-based design locally, without paid image services.') + empty('Add a product to create your ad visual.'); bindEmpty(); return; }
    $('#view').innerHTML = heading('Make your first ad visual.', 'Square, portrait, and landscape PNG designs. All drawing happens in your browser.') + `<div class="tool-grid"><section class="card"><form id="creative-form"><label>Design product<select aria-label="Design product" name="productId">${products()}</select></label><label>Canvas size<select aria-label="Canvas size" name="size">${options({ square: 'Square · 1080 × 1080', story: 'Portrait · 1080 × 1920', landscape: 'Landscape · 1200 × 628' })}</select></label><label>Design language<select aria-label="Design language" name="language"><option value="ar">العربية</option><option value="en">English</option></select></label><label>Headline<input name="headline" maxlength="120" required></label><label>Supporting text<textarea name="body" maxlength="320" aria-label="Supporting text"></textarea></label><label>Button text<input name="cta" maxlength="60"></label><label>Background color<input name="color" type="color"></label><button class="button primary" type="submit">Download PNG</button></form><p class="small muted">Use your actual product details. Long text is shortened on the image; check the preview before downloading.</p></section><section class="card canvas-card"><h2>Design preview</h2><canvas id="ad-canvas" aria-label="Ad design preview" role="img"></canvas><p class="small muted">This is a simple graphic template, not an AI-generated photograph.</p></section></div>`;
    function fillProduct() { const p = state.workspace.products.find(p => p.id === $('#creative-form [name=productId]').value); for (const [key, value] of Object.entries({ headline: p.name, body: p.offer || p.description, cta: p.cta || 'تواصل معنا', color: p.color })) $('#creative-form').elements[key].value = value; draw(); }
    function wrap(ctx, text, x, y, width, lineHeight, maxLines) {
      const words = text.split(/\s+/), lines = []; let line = '';
      for (const word of words) { const next = line ? `${line} ${word}` : word; if (ctx.measureText(next).width > width && line) { lines.push(line); line = word; } else line = next; }
      if (line) lines.push(line);
      const limited = lines.slice(0, maxLines);
      if (lines.length > maxLines) limited[maxLines - 1] += '…';
      limited.forEach((line, i) => ctx.fillText(line, x, y + i * lineHeight, width));
    }
    function draw() {
      const f = Object.fromEntries(new FormData($('#creative-form'))), c = $('#ad-canvas');
      [c.width, c.height] = { square: [1080, 1080], story: [1080, 1920], landscape: [1200, 628] }[f.size];
      const ctx = c.getContext('2d'), ar = f.language === 'ar', w = c.width, h = c.height;
      const rgb = [1, 3, 5].map(i => parseInt(f.color.slice(i, i + 2), 16) / 255);
      const light = rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722 > .65;
      const ink = light ? '#16342b' : '#ffffff', secondary = light ? '#496056' : '#e3eddd';
      ctx.fillStyle = f.color; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = light ? '#16342b12' : '#ffffff12'; ctx.beginPath(); ctx.arc(w * .9, h * .1, w * .35, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#dcf397'; ctx.fillRect(80, 80, 90, 10);
      ctx.direction = ar ? 'rtl' : 'ltr'; ctx.textAlign = ar ? 'right' : 'left'; const x = ar ? w - 80 : 80;
      ctx.font = 'bold 28px Arial'; ctx.fillStyle = secondary; ctx.fillText(state.brand?.name || 'Marketing101', x, 155, w - 160);
      const headlineSize = h < 700 ? 60 : 76; ctx.font = `bold ${headlineSize}px Arial`; ctx.fillStyle = ink;
      wrap(ctx, f.headline, x, h < 700 ? 245 : h * .35, w - 160, headlineSize * 1.3, h < 700 ? 2 : 3);
      ctx.font = `${h < 700 ? 30 : 38}px Arial`; ctx.fillStyle = secondary; wrap(ctx, f.body, x, h < 700 ? 400 : h * .62, w - 160, 52, h < 700 ? 2 : 3);
      ctx.fillStyle = '#dcf397'; const bx = ar ? w - 500 : 80; ctx.fillRect(bx, h - 160, 420, 80);
      ctx.font = 'bold 30px Arial'; ctx.fillStyle = '#16342b'; ctx.textAlign = 'center'; ctx.fillText(f.cta || (ar ? 'اعرف المزيد' : 'Learn more'), bx + 210, h - 109, 390);
    }
    $('#creative-form [name=productId]').addEventListener('change', fillProduct);
    $('#creative-form').addEventListener('input', draw); fillProduct();
    $('#creative-form').addEventListener('submit', event => { event.preventDefault(); const a = document.createElement('a'); a.href = $('#ad-canvas').toDataURL('image/png'); a.download = `marketing-ad-${$('#creative-form [name=size]').value}.png`; a.click(); toast('PNG design downloaded.'); });
  }

  function calendarView() {
    if (state.view !== 'calendar') return;
    const now = new Date(), start = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1), end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    const entries = state.campaigns.filter(c => c.status !== 'cancelled').flatMap(c => c.data.items.map(item => ({ c, item }))).filter(e => e.item.due >= start.getTime() && e.item.due < end.getTime()).sort((a, b) => a.item.due - b.item.due);
    $('#view').innerHTML = heading('Know what comes next.', 'Preparation reminders and demo schedules. Calendar export does not publish content.') + `<section class="card"><div class="section-heading"><h2>${esc(start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }))}</h2><div class="form-actions"><button class="button" id="previous-month" aria-label="Previous month">←</button><button class="button" id="next-month" aria-label="Next month">→</button><button class="button primary" id="export-calendar">Export calendar</button></div></div><p class="small muted">Times are displayed in your device timezone. The downloaded .ics file uses UTC.</p>${entries.map(({ c, item }) => `<button class="calendar-entry" data-calendar-campaign="${c.id}"><time>${date(item.due)}</time><div><strong>${esc(c.data.title)}</strong><p>${esc(item.channel)} · ${esc(c.status)}</p></div><span>${money(item.cost)}</span></button>`).join('') || '<div class="empty"><h3>No content scheduled this month.</h3><p>Change the month or create a campaign.</p></div>'}</section>`;
    $('#previous-month').addEventListener('click', () => { monthOffset--; calendarView(); }); $('#next-month').addEventListener('click', () => { monthOffset++; calendarView(); });
    $('#export-calendar').addEventListener('click', () => download('marketing-calendar.ics', calendarFile(state.campaigns), 'text/calendar;charset=utf-8'));
    document.querySelectorAll('[data-calendar-campaign]').forEach(b => b.addEventListener('click', () => busy(b, () => openCampaign(b.dataset.calendarCampaign))));
  }

  function resultsView() {
    if (state.view !== 'results') return;
    const rows = filterResults(state.workspace.results, reportFilters), coverage = metricsCoverage(rows);
    const m = metrics(rows), fmt = (n, suffix = '') => n === null ? '—' : `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n)}${suffix}`;
    const goal = state.campaigns.find(c => c.id === reportFilters.campaignId)?.data.goalPlan;
    const goalHTML = goal ? `<section class="card"><h2>Reported outcome vs planning target</h2><p><strong>${fmt(m[goal.metric])}</strong> reported / <strong>${fmt(goal.target)}</strong> target · ${esc(goalMetrics[goal.metric])}</p><p class="small muted">The target was set for ${goal.days} days. This comparison uses only the selected reports and dates; it does not establish attribution, causality, or statistical confidence.</p></section>` : '';
    const filterHTML = `<form id="report-filter" class="card"><div class="form-grid"><label>Filter campaign<select aria-label="Filter campaign" name="campaignId"><option value="">All reports</option><option value="unassigned" ${reportFilters.campaignId === 'unassigned' ? 'selected' : ''}>Unassigned reports</option>${state.campaigns.map(c => `<option value="${c.id}" ${reportFilters.campaignId === c.id ? 'selected' : ''}>${esc(c.data.title)}</option>`).join('')}</select></label><label>From date<input name="from" aria-label="From date" type="date" value="${reportFilters.from}"></label><label>To date<input name="to" aria-label="To date" type="date" value="${reportFilters.to}"></label></div><button class="button" type="submit">Filter reports</button><p class="small muted">${rows.length} of ${state.workspace.results.length} reports selected. Exports below follow this selection. Overlapping report periods can double-count totals; enter distinct observations.</p><p class="small" id="metric-coverage">Paired data: CTR ${coverage.ctr}/${coverage.total}, cost per lead ${coverage.cpl}/${coverage.total}, ROAS ${coverage.roas}/${coverage.total}. This is measurement coverage, not statistical confidence.</p></form>`;
    const fields = { spend: 'Actual spend (DKK)', impressions: 'Impressions', clicks: 'Clicks', leads: 'Leads', sales: 'Sales', revenue: 'Revenue (DKK)' };
    $('#view').innerHTML = heading('Measure what actually happened.', 'Enter your real reports manually. These records are separate from simulated campaign activity.') + `${filterHTML}${goalHTML}<div class="stats result-stats">${[['Spend', m.spend, ' DKK'], ['Revenue', m.revenue, ' DKK'], ['Leads', m.leads, ''], ['Sales', m.sales, ''], ['CTR', m.ctr, '%'], ['Cost per lead', m.cpl, ' DKK'], ['ROAS', m.roas, '×']].map(([label, value, suffix]) => `<div class="stat"><p>${label}</p><strong>${fmt(value, suffix)}</strong><small>Manually entered data</small></div>`).join('')}</div><div class="note">Leave unavailable measurements blank. Ratios use only reports containing both required measurements. A blank value is not a zero.</div><section class="card"><h2>Add a result report</h2><form id="results-form"><div class="form-grid"><label>Report name<input name="label" required maxlength="240"></label><label>Report date<input name="date" type="date" required value="${new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)}"></label><label class="span-2">Related campaign (optional)<select name="campaignId"><option value="">No campaign selected</option>${state.campaigns.map(c => `<option value="${c.id}">${esc(c.data.title)}</option>`).join('')}</select></label>${Object.entries(fields).map(([key, label]) => `<label>${label}<input name="${key}" type="number" min="0" max="1000000000000" step="${['spend', 'revenue'].includes(key) ? '.01' : '1'}"></label>`).join('')}<label class="span-2">Result notes<textarea name="notes" aria-label="Result notes" maxlength="2000"></textarea></label></div><button class="button primary" type="submit">Save result report</button></form></section><section class="card"><div class="section-heading"><h2>Reports (${rows.length})</h2><button class="button" id="export-results">Export reports CSV</button></div>${rows.map(r => `<article class="report-row"><div><h3>${esc(r.label)}</h3><p class="small muted">${r.date} · Spend: ${fmt(r.spend, ' DKK')} · Clicks: ${fmt(r.clicks)} · Leads: ${fmt(r.leads)} · Revenue: ${fmt(r.revenue, ' DKK')}</p>${r.notes ? `<p class="small">${esc(r.notes)}</p>` : ''}</div><button class="text-button danger" data-delete-result="${r.id}">Delete</button></article>`).join('') || '<p class="muted">No reports yet. Nothing is fabricated from demo runs.</p>'}</section>`;
    dirty($('#results-form'));
    $('#results-form').addEventListener('submit', event => { event.preventDefault(); busy(event.submitter, async () => {
      const f = Object.fromEntries(new FormData(event.target));
      for (const key of Object.keys(fields)) f[key] = f[key] === '' ? null : Number(f[key]);
      await freezeForm(event.target, () => update(w => w.results.unshift({ ...f, id: uid() }))); resultsView(); toast('Actual result report saved.');
    }); });
    $('#report-filter').addEventListener('submit', event => {
      event.preventDefault(); if (state.dirty) { toast('Save the pending report before changing filters.'); return; }
      const selected = Object.fromEntries(new FormData(event.target));
      try { filterResults(state.workspace.results, selected); reportFilters = selected; resultsView(); } catch (error) { toast(error.message); }
    });
    $('#export-results').addEventListener('click', () => download('marketing-results.csv', csv(rows), 'text/csv;charset=utf-8'));
    document.querySelectorAll('[data-delete-result]').forEach(b => b.addEventListener('click', () => busy(b, async () => { if (state.dirty) { toast('Save or discard the pending report before deleting.'); return; } if (!confirm('Delete this report?')) return; await update(w => w.results = w.results.filter(r => r.id !== b.dataset.deleteResult)); resultsView(); })));
  }

  function dataView() {
    if (state.view !== 'data') return;
    $('#view').innerHTML = heading('Keep your work portable.', 'Download backups, content, and schedules. Restore safely without automatically running campaigns.') + `<div class="tool-grid"><section class="card"><h2>Download a full backup</h2><p>Includes your brand, products, drafts, manual result reports, and campaign plans. Save the file somewhere you control.</p><button class="button primary" id="backup-workspace">Download backup JSON</button><div class="summary-line"><span>Products</span><strong>${state.workspace.products.length}</strong></div><div class="summary-line"><span>Content drafts</span><strong>${state.workspace.drafts.length}</strong></div><div class="summary-line"><span>Campaign plans</span><strong>${state.campaigns.length}</strong></div><div class="summary-line"><span>Manual reports</span><strong>${state.workspace.results.length}</strong></div><p class="small muted">Backups are plain files, not encrypted. They contain your own marketing data.</p></section><section class="card"><h2>Restore from a backup</h2><p>This replaces your existing workspace and campaign plans. Campaigns are restored as unapproved drafts; automatic mode is turned off. Simulation jobs and receipts are not restored.</p><form id="restore-form"><label>Backup file<input name="backup" type="file" accept=".json,application/json" required></label><button class="button" type="submit">Validate & restore backup</button></form><p class="small muted">Maximum file size: 3 MB. Download a current backup before replacing data.</p></section></div><section class="card"><h2>Export for your next tools</h2><div class="form-actions"><button class="button" id="data-export-content">Content CSV</button><button class="button" id="data-export-results">Results CSV</button><button class="button" id="data-export-calendar">Calendar .ics</button></div><p class="small muted">No accounts or services are connected. Exports are files you can use manually or migrate later.</p></section>`;
    $('#backup-workspace').addEventListener('click', () => busy($('#backup-workspace'), async () => {
      const [brand, workspace, campaigns] = await Promise.all([api('/brand'), api('/workspace'), api('/campaigns')]);
      const backup = { format: 'marketing101-backup', version: 1, exportedAt: new Date().toISOString(), brand, workspace, campaigns: campaigns.map(c => ({ id: c.id, data: c.data })) };
      download(`marketing101-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(backup, null, 2), 'application/json'); toast('Backup downloaded.');
    }));
    $('#restore-form').addEventListener('submit', event => { event.preventDefault(); busy(event.submitter, async () => {
      const file = event.target.elements.backup.files[0]; if (!file || file.size > 3000000) throw new Error('Choose a JSON backup smaller than 3 MB.');
      let backup; try { backup = JSON.parse(await file.text()); } catch { throw new Error('Invalid JSON backup.'); }
      if (backup.format !== 'marketing101-backup' || backup.version !== 1) throw new Error('This is not a Marketing101 backup.');
      const counts = await api('/validate-backup', 'POST', backup);
      if (!confirm(`Replace your existing workspace with ${counts.products} products, ${counts.drafts} drafts, ${counts.campaigns} campaign plans, and ${counts.reports} reports? All restored campaigns will require fresh approval.`)) return;
      state.sessionEpoch++; await api('/restore', 'POST', backup);
      [state.brand, state.workspace, state.campaigns, state.policy] = await Promise.all([api('/brand'), api('/workspace'), api('/campaigns'), api('/policy')]);
      state.campaign = null; state.pendingDraft = null; state.activeBrief = null; state.selectedProduct = ''; generated = []; edits.clear(); editingProduct = null; editingBrief = null; state.dirty = false;
      dataView(); toast('Backup restored. All campaign plans are unapproved drafts.');
    }); });
    $('#data-export-content').addEventListener('click', () => download('marketing-content.csv', csv(formatRows(state.workspace.drafts)), 'text/csv;charset=utf-8'));
    $('#data-export-results').addEventListener('click', () => download('marketing-results.csv', csv(state.workspace.results), 'text/csv;charset=utf-8'));
    $('#data-export-calendar').addEventListener('click', () => download('marketing-calendar.ics', calendarFile(state.campaigns), 'text/calendar;charset=utf-8'));
  }
  function exportCampaign(c) {
    const d = c.data;
    const rows = d.items.map(i => ({ campaign: d.title, objective: d.objective, product: d.product, audience: d.audience, channel: i.channel,
      scheduled: new Date(i.due).toISOString(), simulatedBudgetDKK: i.cost / 100, destination: i.destination, content: i.content }));
    download(`marketing-campaign-${c.id.slice(0, 8)}.csv`, csv(rows), 'text/csv;charset=utf-8');
  }
  return { render: view => ({ products: productView, strategy: strategyView, studio: studioView, creative: creativeView, calendar: calendarView, results: resultsView, data: dataView }[view])?.(), views: ['products', 'strategy', 'studio', 'creative', 'calendar', 'results', 'data'], exportCampaign, discardEdits: () => edits.clear(), reset: () => { editingProduct = null; editingBrief = null; generated = []; generatedProduct = null; edits.clear(); draftFilters = { query: '', format: '', stage: '', language: '' }; draftLimit = 20; reportFilters = { campaignId: '', from: '', to: '' }; studioOptions = { language: 'ar', goal: 'awareness', tone: 'clear', variant: 0 }; monthOffset = 0; } };
}
