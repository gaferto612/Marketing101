import { randomUUID } from 'node:crypto';
import { validateBrief } from '../public/marketing-tools.js';

export class InputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function text(value, label, max = 2000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new InputError(`${label} is required (maximum ${max} characters).`);
  return value.trim();
}
export function money(value, label = 'Budget') {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1000000)
    throw new InputError(`${label} must be between 0 and 1,000,000 DKK.`);
  return Math.round(value * 100);
}
export function website(value) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error();
    return url.href;
  } catch { throw new InputError('Enter a valid HTTP or HTTPS product link.'); }
}
export function validateBrand(input) {
  return {
    name: text(input.name, 'Business name', 120),
    business: text(input.business, 'Business details'),
    product: text(input.product, 'Product', 200),
    audience: text(input.audience, 'Audience', 400),
    tone: text(input.tone, 'Tone', 120),
    language: input.language === 'ar' ? 'ar' : 'en',
    cta: typeof input.cta === 'string' ? input.cta.trim().slice(0, 200) : '',
    website: input.website ? website(text(input.website, 'Website', 1000)) : '',
    claims: typeof input.claims === 'string' ? input.claims.trim().slice(0, 4000) : ''
  };
}

// The first release is deliberately a transparent template planner, not an LLM.
// Ambiguous values are surfaced as fields instead of silently inferred.
export function parseRequest(message, brand, details = {}) {
  text(message, 'Campaign request', 4000);
  const normalizedMessage = message.replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).replaceAll('٬', ',').replaceAll('٫', '.');
  const match = normalizedMessage.match(/(?:budget(?: of)?|with(?: a total budget of)?|for)\s+([\d][\d,. ]*)\s*(?:DKK|kr\.?)/i)
    || normalizedMessage.match(/([\d][\d,. ]*)\s*(?:DKK|كرونة|كرونه|كرون)/i);
  let budget;
  if (match) {
    const raw = match[1].trim().replaceAll(' ', '');
    // Accept 1,000 and 1.000 as thousands; 1000.50 / 1000,50 as decimals.
    const normalized = /^\d{1,3}([,.]\d{3})+$/.test(raw)
      ? raw.replace(/[,.]/g, '') : raw.replace(',', '.');
    budget = Number(normalized);
  }
  const period = normalizedMessage.match(/(?:for|over)\s+(\d+|one|two|three|four)\s+(day|week)s?/i);
  const words = { one: 1, two: 2, three: 3, four: 4 };
  const arabicPeriod = normalizedMessage.match(/لمدة\s+(\d+)\s*(يوم|أيام|ايام|أسبوع|اسبوع|أسابيع|اسابيع)/);
  const days = period ? (words[period[1].toLowerCase()] || Number(period[1])) * (period[2].toLowerCase() === 'week' ? 7 : 1)
    : arabicPeriod ? Number(arabicPeriod[1]) * (/سبوع|سابيع/.test(arabicPeriod[2]) ? 7 : 1)
    : /(?:لمدة\s+|ل)(?:أسبوعين|اسبوعين)/.test(normalizedMessage) ? 14
    : /لمدة\s+(?:أسبوع|اسبوع)(?:\s+واحد)?/.test(normalizedMessage) ? 7 : undefined;
  const product = message.match(/(?:promote|advertise|market)\s+(.+?)(?:\s+to\s+|\s+for\s+|[.!]|$)/i)?.[1]?.replace(/^my\s+/i, '');
  const audience = message.match(/\s+to\s+(.+?)(?:\s+for\s+|\s+with\s+|[.!]|$)/i)?.[1];
  const values = { product: product || brand.product, audience: audience || brand.audience, budget, days, ...details };
  const missing = ['budget', 'days'].filter(k => values[k] === undefined || values[k] === null || values[k] === '');
  if (missing.length) return { missing, values, message: 'I need the campaign budget and duration only where they are missing. Zero DKK is allowed for an organic demo.' };
  values.product = text(values.product, 'Product', 200);
  values.audience = text(values.audience, 'Audience', 400);
  money(Number(values.budget));
  values.budget = Number(values.budget);
  values.days = Number(values.days);
  if (!Number.isInteger(values.days) || values.days < 1 || values.days > 90) throw new InputError('Duration must be 1–90 whole days.');
  return { missing: [], values };
}

export function variation(brand, product, audience, variant = 0) {
  const facts = brand.claims ? `\n${brand.claims.split('\n').filter(Boolean)[0]}` : '';
  if (brand.language === 'ar' || /[\u0600-\u06ff]/.test(product)) {
    const ending = brand.cta ? `${brand.cta}${brand.website ? `\n${brand.website}` : ''}` : brand.website ? `اعرف التفاصيل: ${brand.website}` : 'تواصل معنا لمعرفة التفاصيل.';
    const versions = [
      `${product} من ${brand.name}.\nالجمهور: ${audience}.${facts}\n${ending}`,
      `تعرّف على تفاصيل ${product}.\nالجمهور: ${audience}.${facts}\n${ending}`,
      `اطّلع على عرض ${product}.\nالجمهور: ${audience}.${facts}\n${ending}`
    ];
    return versions[variant % 3];
  }
  const versions = [
    `${product} from ${brand.name}.\nFor ${audience}.${facts}\n${brand.cta ? `${brand.cta}${brand.website ? `\n${brand.website}` : ''}` : brand.website ? `Explore the details: ${brand.website}` : 'Contact us for details.'}`,
    `Looking into ${product}?\n${brand.name} invites ${audience} to learn more.${facts}\n${brand.cta ? `${brand.cta}${brand.website ? `\n${brand.website}` : ''}` : brand.website || 'Contact us for details.'}`,
    `Discover ${product}.\nSee the offer from ${brand.name} for ${audience}.${facts}\n${brand.cta ? `${brand.cta}${brand.website ? `\n${brand.website}` : ''}` : brand.website ? `Learn more: ${brand.website}` : 'Contact us for details.'}`
  ];
  return versions[variant % versions.length];
}

export function plan(message, brand, values, now = Date.now()) {
  const copyContext = { ...brand, product: values.product, audience: values.audience,
    language: values.language === 'ar' ? 'ar' : values.language === 'en' ? 'en' : brand.language,
    cta: typeof values.productCta === 'string' ? values.productCta : brand.cta,
    claims: typeof values.productFacts === 'string' ? values.productFacts : brand.claims,
    website: typeof values.productWebsite === 'string' ? values.productWebsite : brand.website };
  const budget = money(values.budget);
  const count = 3;
  const start = now + 60000;
  return {
    title: `${values.product} · ${values.days} days`, request: message, copyContext,
    ...(values.goalPlan ? { goalPlan: checkedBrief(values.goalPlan) } : {}),
    product: values.product, audience: values.audience,
    objective: typeof values.goalObjective === 'string' ? values.goalObjective : 'Introduce the product and invite visits to its details page.',
    tone: brand.tone, currency: 'DKK', budget, duration: values.days,
    generator: 'demo-templates', integration: 'demo', campaignType: 'product-promotion',
    suggestedChannels: budget === 0 ? ['Social post'] : ['Social post', 'Paid social'],
    note: 'Channel suggestions only. All execution goes to Demo workspace. No real ads or posts are published.',
    items: Array.from({ length: count }, (_, i) => ({
      id: randomUUID(), account: 'demo-workspace', channel: budget === 0 || i === 0 ? 'Social post' : 'Paid social',
      destination: copyContext.website, content: variation(copyContext, values.product, values.audience, i),
      variant: i, due: start + Math.round(i * (values.days - 1) / (count - 1)) * 86400000,
      cost: Math.floor(budget / count) + (i === count - 1 ? budget % count : 0)
    }))
  };
}

export function validateCampaign(input) {
  if (!input || !Array.isArray(input.items) || input.items.length < 1 || input.items.length > 20)
    throw new InputError('Campaign must have 1–20 content items.');
  if (input.integration !== 'demo' || input.campaignType !== 'product-promotion') throw new InputError('Only demo product promotions are supported.');
  if (!Number.isInteger(input.duration) || input.duration < 1 || input.duration > 90) throw new InputError('Duration must be 1–90 whole days.');
  const budget = money(Number(input.budget) / 100);
  const ids = new Set();
  const items = input.items.map(item => {
    if (typeof item.id !== 'string' || !/^[a-zA-Z0-9-]{1,60}$/.test(item.id) || ids.has(item.id)) throw new InputError('Content IDs must be unique.');
    ids.add(item.id);
    if (item.account !== 'demo-workspace' || !['Social post', 'Paid social'].includes(item.channel)) throw new InputError('Select the Demo workspace destination.');
    if (!Number.isSafeInteger(item.due) || item.due < 0 || item.due > Date.now() + 366 * 86400000) throw new InputError('Choose a valid date within the next year.');
    if (!Number.isSafeInteger(item.cost) || item.cost < 0 || item.cost > 100000000) throw new InputError('Invalid item budget.');
    return { id: item.id, account: item.account, channel: item.channel,
      content: text(item.content, 'Content', 4000), destination: item.destination ? website(item.destination) : '',
      due: item.due, cost: item.cost, variant: Number.isInteger(item.variant) && item.variant >= 0 ? item.variant % 3 : 0 };
  });
  if (items.reduce((sum, item) => sum + item.cost, 0) > budget) throw new InputError('Item allocations exceed the campaign budget.');
  return {
    title: text(input.title, 'Title', 240), request: text(input.request, 'Request', 4000),
    product: text(input.product, 'Product', 200), audience: text(input.audience, 'Audience', 400),
    objective: text(input.objective, 'Objective', 1000), tone: text(input.tone, 'Tone', 120),
    currency: 'DKK', budget, duration: input.duration, generator: 'demo-templates', integration: 'demo',
    ...(input.copyContext ? { copyContext: validateBrand(input.copyContext) } : {}),
    ...(input.goalPlan ? { goalPlan: checkedBrief(input.goalPlan) } : {}),
    campaignType: 'product-promotion', suggestedChannels: [...new Set(items.map(item => item.channel))],
    note: 'Demo only. No real publishing or spending.', items
  };
}

function checkedBrief(input) {
  try { return validateBrief(input); } catch (error) { throw new InputError(error.message); }
}
