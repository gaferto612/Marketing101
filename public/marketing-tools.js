// Pure offline tools, shared by the browser workspace and server validation.
export const formats = {
  social: 'Social post', ad: 'Ad copy', video: 'Short video script',
  email: 'Email draft', message: 'Message draft', landing: 'Landing page copy'
};
export const objectives = { awareness: 'Awareness', launch: 'Product launch', leads: 'Enquiries', offer: 'Promote an offer' };
export const freshWorkspace = () => ({ version: 1, revision: 0, products: [], drafts: [], results: [] });
const error = message => { throw new Error(message); };
const string = (value, label, max, required = false) => {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) error(`${label}: enter ${required ? 'a value' : 'text'} within ${max} characters.`);
  return value.trim();
};
const id = value => typeof value === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(value) ? value : error('Invalid record ID.');
const amount = value => value === null || value === '' || value === undefined ? null
  : typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1e12 ? value : error('Results must be non-negative numbers or blank.');
export function optionalLink(value) {
  if (!value) return '';
  const raw = string(value, 'Product link', 1000);
  try { const u = new URL(raw); if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error(); return u.href; }
  catch { error('Use an HTTP or HTTPS product link, or leave it blank.'); }
}
export function validateProduct(p) {
  return { id: id(p.id), name: string(p.name, 'Product name', 200, true), description: string(p.description, 'Description', 2000, true),
    audience: string(p.audience, 'Audience', 400, true), offer: string(p.offer || '', 'Offer', 500),
    facts: string(p.facts || '', 'Approved facts', 3000), cta: string(p.cta || '', 'Call to action', 200),
    website: optionalLink(p.website), color: /^#[a-f0-9]{6}$/i.test(p.color) ? p.color : '#235a43' };
}
export function validateWorkspace(input) {
  if (!input || input.version !== 1) error('Unsupported workspace format.');
  if (new TextEncoder().encode(JSON.stringify(input)).length > 2000000) error('Workspace is larger than 2 MB. Export and reduce older records before saving.');
  for (const key of ['products', 'drafts', 'results']) if (!Array.isArray(input[key]) || input[key].length > 250) error(`Workspace ${key} must contain at most 250 records.`);
  const unique = rows => { const ids = new Set(); for (const r of rows) { if (ids.has(r.id)) error('Duplicate record IDs.'); ids.add(r.id); } return rows; };
  const products = unique(input.products.map(validateProduct));
  const productIds = new Set(products.map(p => p.id));
  const drafts = unique(input.drafts.map(d => {
    if (!productIds.has(d.productId)) error('A draft refers to a missing product.');
    if (!Object.hasOwn(formats, d.format) || !['ar', 'en'].includes(d.language)) error('Invalid content format or language.');
    return { id: id(d.id), productId: d.productId, format: d.format, language: d.language,
      title: string(d.title, 'Draft title', 240, true), content: string(d.content, 'Draft content', 8000, true),
      stage: ['draft', 'ready', 'used'].includes(d.stage) ? d.stage : 'draft',
      updated: Number.isSafeInteger(d.updated) ? d.updated : Date.now() };
  }));
  const results = unique(input.results.map(r => {
    const date = string(r.date, 'Result date', 10, true);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(date).getTime()) || new Date(date).toISOString().slice(0, 10) !== date) error('Enter a valid result date.');
    const row = { id: id(r.id), date, label: string(r.label, 'Result label', 240, true),
      campaignId: r.campaignId ? id(r.campaignId) : '', notes: string(r.notes || '', 'Notes', 2000) };
    for (const field of ['spend', 'impressions', 'clicks', 'leads', 'sales', 'revenue']) row[field] = amount(r[field]);
    for (const field of ['impressions', 'clicks', 'leads', 'sales']) if (row[field] !== null && !Number.isSafeInteger(row[field])) error('Counts must be whole numbers.');
    if (row.impressions !== null && row.clicks !== null && row.clicks > row.impressions) error('Clicks cannot exceed impressions in the same report.');
    return row;
  }));
  return { version: 1, revision: Number.isSafeInteger(input.revision) && input.revision >= 0 ? input.revision : 0, products, drafts, results };
}

export function generatePack(product, { language = 'ar', goal = 'awareness', tone = 'clear', variant = 0 } = {}) {
  const p = validateProduct(product), ar = language === 'ar';
  if (!Object.hasOwn(objectives, goal) || !['ar', 'en'].includes(language) || !['clear', 'friendly', 'concise'].includes(tone)) error('Choose a supported goal, language, and tone.');
  const facts = p.facts.split('\n').filter(Boolean);
  const factText = facts.length ? facts.map(f => `• ${f}`).join('\n') : '';
  const cta = p.cta || (ar ? 'تواصل معنا لمعرفة التفاصيل.' : 'Contact us for details.');
  const link = p.website ? `\n${p.website}` : '';
  const hooks = ar ? [`تعرّف على ${p.name}`, `${p.name} — إليك التفاصيل`, `هل يناسبك ${p.name}؟`]
    : [`Discover ${p.name}`, `${p.name} — the details`, `Is ${p.name} right for you?`];
  const hook = hooks[((variant % 3) + 3) % 3];
  const opening = ar ? { awareness: hook, launch: `نقدّم لك ${p.name}`, leads: `مهتم بـ${p.name}؟`, offer: `اطّلع على عرض ${p.name}` }[goal]
    : { awareness: hook, launch: `Introducing ${p.name}`, leads: `Interested in ${p.name}?`, offer: `Explore the offer for ${p.name}` }[goal];
  const intro = tone === 'friendly' ? (ar ? 'أهلاً! ' : 'Hello! ') : '';
  const details = tone === 'concise' ? facts.slice(0, 1).join('\n') : [p.description, factText].filter(Boolean).join('\n\n');
  const body = [intro + opening, ar ? `لـ${p.audience}.` : `For ${p.audience}.`, details, p.offer, cta + link].filter(Boolean).join('\n\n');
  const items = {
    social: body,
    ad: `${ar ? 'العنوان' : 'Headline'}: ${opening}\n\n${ar ? 'النص' : 'Body'}:\n${body}`,
    video: ar ? `مسودة فيديو قصير — التوقيت تقريبي\n\n0–5 ثوانٍ: ${opening}\nالمشهد: بطاقة عنوان أو صورة المنتج التي تملكها.\n\n5–20 ثانية: ${details}\nالمشهد: شرح المنتج، بدون ادعاءات إضافية.\n\n20–30 ثانية: ${cta}${link}`
      : `Short video draft — approximate timing\n\n0–5 seconds: ${opening}\nVisual: title card or your own product image.\n\n5–20 seconds: ${details}\nVisual: explain the product without adding claims.\n\n20–30 seconds: ${cta}${link}`,
    email: `${ar ? 'الموضوع' : 'Subject'}: ${opening}\n\n${ar ? 'مرحباً،' : 'Hello,'}\n\n${body}\n\n${ar ? 'استخدمها فقط مع أشخاص وافقوا على استلام رسائلك.' : 'Use only with recipients who opted in to your messages.'}`,
    message: `${intro}${opening}\n${tone === 'concise' ? '' : p.description + '\n'}${p.offer ? p.offer + '\n' : ''}${cta}${link}`,
    landing: `${ar ? 'العنوان الرئيسي' : 'Hero headline'}: ${opening}\n\n${ar ? 'لمن هذا المنتج؟' : 'Who is it for?'}\n${p.audience}\n\n${ar ? 'عن المنتج' : 'About the product'}\n${p.description}\n\n${factText ? `${ar ? 'تفاصيل معتمدة' : 'Approved details'}\n${factText}\n\n` : ''}${p.offer ? `${ar ? 'العرض' : 'Offer'}\n${p.offer}\n\n` : ''}${ar ? 'الدعوة إلى الإجراء' : 'Call to action'}\n${cta}${link}`
  };
  return Object.entries(items).map(([format, content]) => ({ format, title: `${p.name} · ${formats[format]}`, language, content }));
}
export function qualityChecks(content, language = 'en') {
  const checks = [];
  if (content.length > 2200) checks.push(language === 'ar' ? 'النص طويل؛ راجع حدود المنصة قبل النشر.' : 'Long copy: check platform limits before publishing.');
  if (/\[[^\]]+\]|\{[^}]+\}/.test(content)) checks.push(language === 'ar' ? 'راجع أي حقول أو نصوص غير مكتملة.' : 'Review any unresolved placeholders.');
  if (/guarantee|guaranteed|100%|best ever|مضمون|نضمن|الأفضل/i.test(content)) checks.push(language === 'ar' ? 'راجع الادعاءات المطلقة وتأكد من وجود دليل عليها.' : 'Verify absolute claims and their evidence.');
  return checks;
}
export function metrics(rows) {
  const total = field => rows.some(r => r[field] !== null) ? rows.reduce((n, r) => n + (r[field] ?? 0), 0) : null;
  // Ratios use only rows with both measurements, never treat missing values as zero.
  const ratio = (num, den, factor = 1) => { const pairs = rows.filter(r => r[num] !== null && r[den] !== null); const base = pairs.reduce((n, r) => n + r[den], 0); return base > 0 ? pairs.reduce((n, r) => n + r[num], 0) / base * factor : null; };
  return { spend: total('spend'), clicks: total('clicks'), leads: total('leads'), revenue: total('revenue'),
    ctr: ratio('clicks', 'impressions', 100), cpl: ratio('spend', 'leads'), roas: ratio('revenue', 'spend') };
}
export function csv(rows) {
  if (!rows.length) return '\uFEFF';
  const keys = Object.keys(rows[0]);
  const cell = value => { let text = String(value ?? ''); if (/^[\s]*[=+@-]/.test(text)) text = "'" + text; return `"${text.replaceAll('"', '""')}"`; };
  return '\uFEFF' + [keys.map(cell).join(','), ...rows.map(r => keys.map(k => cell(r[k])).join(','))].join('\r\n');
}
const icsEscape = value => String(value).replaceAll('\\', '\\\\').replace(/\r\n|\r|\n/g, '\\n').replaceAll(',', '\\,').replaceAll(';', '\\;');
const utc = time => new Date(time).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
function fold(line) {
  const lines = []; let current = '';
  for (const char of line) { if (new TextEncoder().encode(current + char).length > 74) { lines.push(current); current = ' '; } current += char; }
  lines.push(current); return lines.join('\r\n');
}
export function calendarFile(campaigns) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Marketing101//Local campaign calendar//EN', 'CALSCALE:GREGORIAN'];
  for (const c of campaigns.filter(c => c.status !== 'cancelled')) for (const item of c.data.items) {
    lines.push('BEGIN:VEVENT', `UID:${c.id}-${item.id}@marketing101.local`, `DTSTAMP:${utc(c.created)}`, `DTSTART:${utc(item.due)}`,
      `SUMMARY:${icsEscape(`${c.data.title} — ${item.channel}`)}`, `DESCRIPTION:${icsEscape(`Preparation reminder only. No automatic publishing.\n${item.content}`)}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR'); return lines.map(fold).join('\r\n') + '\r\n';
}

export function normalizeBackup(input, validateBrand, validateCampaign) {
  if (!input || input.format !== 'marketing101-backup' || input.version !== 1 || !Array.isArray(input.campaigns) || input.campaigns.length > 250) error('Unsupported backup format.');
  const workspace = validateWorkspace(input.workspace || freshWorkspace());
  const seen = new Set();
  const campaigns = input.campaigns.map(c => {
    const campaignId = id(c.id); if (seen.has(campaignId)) error('Duplicate campaign IDs.'); seen.add(campaignId);
    return { id: campaignId, data: validateCampaign(c.data) };
  });
  return { workspace, brand: input.brand ? validateBrand(input.brand) : null, campaigns };
}
