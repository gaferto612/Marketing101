const fail = message => { throw new Error(message); };
const text = (value, name, max = 1000, required = false) => typeof value === 'string' && value.length <= max && (!required || value.trim()) ? value.trim() : fail(`${name}: enter valid text (maximum ${max}).`);
const id = value => /^[a-zA-Z0-9-]{1,80}$/.test(value || '') ? value : fail('Invalid launch record ID.');
export const countryCodes = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');
export function link(value) {
  if (!value) return '';
  try { const url = new URL(text(value, 'Link')); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error(); return url.href; } catch { fail('Enter an HTTP/HTTPS link without credentials.'); }
}
export function validateProject(project) {
  const language = project.language || 'ar';
  if (!['ar', 'en'].includes(language)) fail('Select Arabic or English.');
  return { id: id(project.id), name: text(project.name, 'Project name', 120, true), description: text(project.description, 'Project description', 2000, true),
    audience: text(project.audience, 'Default audience', 400, true), product: text(project.product, 'Main offer', 200, true),
    facts: text(project.facts || '', 'Approved facts', 3000), tone: text(project.tone || 'Clear and practical', 'Tone', 120, true),
    website: link(project.website), repository: link(project.repository), language,
    phase: ['preparation', 'pilot', 'launch', 'growth'].includes(project.phase) ? project.phase : 'preparation',
    sector: project.sector === 'health' ? 'health' : 'general' };
}
export function projectBrand(project) { return { name: project.name, business: project.description, product: project.product, audience: project.audience, tone: project.tone, claims: project.facts, website: project.website, language: project.language }; }
export function validateLaunch(input) {
  if (input.contentPieces !== undefined && (!Array.isArray(input.contentPieces) || ![0, 3].includes(input.contentPieces.length))) fail('Launch content must have three pieces.');
  if (!countryCodes.includes(input.country)) fail('Select a country.');
  const timezone = text(input.timezone, 'Timezone', 100, true);
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(); } catch { fail('Select a valid timezone.'); }
  if (!['ar', 'en'].includes(input.language) || !['leads', 'sales', 'clicks'].includes(input.metric)) fail('Select a supported language and measurement.');
  if (!Number.isInteger(input.days) || input.days < 1 || input.days > 90) fail('Choose 1–90 days.');
  if (!Number.isFinite(input.budget) || input.budget < 0 || input.budget > 1000000) fail('Budget must be 0–1,000,000 DKK.');
  if (!Number.isSafeInteger(input.target) || input.target < 1 || input.target > 1e9) fail('Choose a positive whole-number target.');
  return { id: id(input.id), name: text(input.name, 'Launch name', 200, true), country: input.country, cities: text(input.cities || '', 'Service cities', 400), timezone,
    language: input.language, audience: text(input.audience, 'Launch audience', 400, true), problem: text(input.problem || '', 'Audience problem', 600),
    evidence: text(input.evidence || '', 'Approved evidence', 2000), offer: text(input.offer, 'Offer description', 2000, true), cta: text(input.cta, 'Next step', 200, true),
    responseUrl: link(input.responseUrl), owner: text(input.owner || '', 'Follow-up owner', 120), success: text(input.success, 'Success definition', 600, true),
    metric: input.metric, target: input.target, budget: input.budget, days: input.days,
    serviceReady: input.serviceReady === true, linkChecked: input.linkChecked === true, evidenceChecked: input.evidenceChecked === true,
    contentPieces: (input.contentPieces || []).map(piece => text(piece, 'Launch content', 4000, true)),
    campaignId: input.campaignId ? id(input.campaignId) : '', updated: Number.isSafeInteger(input.updated) ? input.updated : Date.now() };
}
export function readiness(launch) {
  return [{ done: launch.serviceReady, label: 'الخدمة متاحة فعلياً للجمهور والمنطقة المختارين' },
    { done: !!launch.responseUrl && launch.linkChecked, label: 'فتحت رابط الاستجابة واختبرت الخطوة المطلوبة بنفسي' },
    { done: !!launch.evidence && launch.evidenceChecked, label: 'راجعت دليل الثقة والحقائق المسموح استخدامها' },
    { done: !!launch.owner, label: 'شخص محدد مسؤول عن الرد والمتابعة' }];
}
export function trackingUrl(url, { source, medium, campaign, content = '' }) {
  const parsed = new URL(link(url));
  for (const [key, value] of Object.entries({ source, medium, campaign, content })) {
    if (typeof value !== 'string' || value.length > 120 || (!value.trim() && key !== 'content')) fail('Enter short source, medium and campaign labels.');
    if (value.trim()) parsed.searchParams.set(`utm_${key}`, value.trim()); else parsed.searchParams.delete(`utm_${key}`);
  }
  return parsed.href;
}
export function launchPieces(project, launch) {
  if (launch.contentPieces?.length === 3) return launch.contentPieces;
  const ar = launch.language === 'ar';
  const ending = `${launch.cta}${launch.responseUrl ? `\n${trackingUrl(launch.responseUrl, { source: 'manual', medium: launch.budget ? 'campaign' : 'organic', campaign: launch.id })}` : ''}`;
  return [
    [launch.problem ? (ar ? `سؤال قد يهمك: ${launch.problem}` : `A question to explore: ${launch.problem}`) : project.product, launch.offer, ar ? `الجمهور: ${launch.audience}` : `For ${launch.audience}`, ending],
    [ar ? `تعرّف على ${project.product}` : `Meet ${project.product}`, launch.evidence || (ar ? 'أضف مثالاً حقيقياً أو شرحاً للخدمة قبل النشر.' : 'Add a real example or explanation before publishing.'), ending],
    [ar ? `هل يناسبك ${project.product}؟` : `Is ${project.product} right for you?`, launch.offer, launch.cities ? (ar ? `مناطق توفر الخدمة: ${launch.cities}` : `Service areas: ${launch.cities}`) : '', ending]
  ].map((lines, i) => lines.filter(Boolean).join('\n\n').replace(ending, `${launch.cta}${launch.responseUrl ? '\n' + trackingUrl(launch.responseUrl, { source: 'manual', medium: launch.budget ? 'campaign' : 'organic', campaign: launch.id, content: ['problem', 'evidence', 'offer'][i] }) : ''}`));
}
export function validateFollowup(record, launchIds) {
  if (!launchIds.has(record.launchId)) fail('Follow-up refers to a missing launch.');
  const nextDate = record.nextDate || '';
  if (nextDate && (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate) || Number.isNaN(new Date(nextDate).getTime()) || new Date(nextDate).toISOString().slice(0, 10) !== nextDate)) fail('Choose a valid follow-up date.');
  if (!['new', 'contacted', 'converted', 'closed'].includes(record.stage)) fail('Select a valid follow-up status.');
  return { id: id(record.id), launchId: record.launchId, alias: text(record.alias, 'Reference or alias', 120, true), source: text(record.source || '', 'Source', 120),
    stage: record.stage, nextDate, owner: text(record.owner || '', 'Owner', 120), note: text(record.note || '', 'Operational note', 600) };
}
