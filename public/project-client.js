import { projectBrand } from './launch-tools.js';

// Project partitions belong to one authenticated account (or one local demo).
// These are organization boundaries, not permissions shared with other users.
export function createProjectApi(transport, state) {
  async function registry() { const data = await transport('/workspace'); state.registry = data; return data; }
  const scoped = root => {
    if (!state.projectId) return { ...root, projects: [] };
    const project = root.projects.find(p => p.id === state.projectId);
    if (!project) throw new Error('Selected project no longer exists. Return to Projects.');
    return project.workspace;
  };
  return async function api(path, method = 'GET', input) {
    if (path === '/registry') {
      const result = method === 'GET' ? await registry() : await transport('/workspace', method, input);
      state.registry = result; return result;
    }
    if (path === '/backup') {
      const [brand, workspace, campaigns] = await Promise.all([transport('/brand'), registry(), transport('/campaigns')]);
      return { format: 'marketing101-backup', version: 1, exportedAt: new Date().toISOString(), brand, workspace, campaigns: campaigns.map(c => ({ id: c.id, data: c.data })) };
    }
    if (path === '/restore' || path === '/reset') { const result = await transport(path, method, input); state.projectId = ''; return result; }
    if (path === '/workspace') {
      const root = await registry();
      if (method === 'GET') return scoped(root);
      if (input.revision !== scoped(root).revision) throw new Error('Project workspace changed. Reload before saving.');
      const next = structuredClone(root);
      if (state.projectId) next.projects.find(p => p.id === state.projectId).workspace = { ...input, projects: [], revision: input.revision + 1 };
      else Object.assign(next, input, { projects: root.projects });
      const saved = await transport('/workspace', 'PUT', next); state.registry = saved; return scoped(saved);
    }
    if (path === '/brand' && state.projectId) {
      const root = await registry(), project = root.projects.find(p => p.id === state.projectId);
      if (!project) throw new Error('Project no longer exists.');
      if (method === 'GET') return projectBrand(project);
      Object.assign(project, { name: input.name, description: input.business, product: input.product, audience: input.audience, facts: input.claims, tone: input.tone, language: input.language, website: input.website });
      const saved = await transport('/workspace', 'PUT', root); state.registry = saved; return projectBrand(saved.projects.find(p => p.id === state.projectId));
    }
    if (path === '/plan') input = { ...input, details: { ...input.details, projectId: state.projectId || '' } };
    const campaignPath = path.match(/^\/campaigns\/([a-f0-9-]+)/);
    if (campaignPath && method !== 'GET') {
      const campaign = await transport(`/campaigns/${campaignPath[1]}`);
      if ((campaign.data.projectId || '') !== (state.projectId || '')) throw new Error('Campaign belongs to another project. Switch projects before editing it.');
    }
    const result = await transport(path, method, input);
    if (path === '/campaigns' && method === 'GET') return result.filter(c => (c.data.projectId || '') === (state.projectId || ''));
    if (/^\/campaigns\//.test(path) && result?.data && (result.data.projectId || '') !== (state.projectId || '')) throw new Error('Campaign belongs to another project. Switch projects to open it.');
    return result;
  };
}
