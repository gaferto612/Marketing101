// Separate buffers so saving one part of the studio cannot erase another.
export class StudioEdits {
  kit = new Map();
  drafts = new Map();
  setKit(index, value, original) { if (value === original) this.kit.delete(index); else this.kit.set(index, value); }
  setDraft(id, value, original) { if (value === original) this.drafts.delete(id); else this.drafts.set(id, value); }
  contentKit(index, original) { return this.kit.get(index) ?? original; }
  contentDraft(id, original) { return this.drafts.get(id) ?? original; }
  get dirty() { return this.kit.size > 0 || this.drafts.size > 0; }
  clearKit() { this.kit.clear(); }
  clearDrafts() { this.drafts.clear(); }
  clear() { this.clearKit(); this.clearDrafts(); }
  reconcileDraftSave(previousRows, savedRows) {
    const current = new Map(previousRows.map(d => [d.id, this.contentDraft(d.id, d.content)]));
    this.clearDrafts();
    for (const d of savedRows) if (current.has(d.id)) this.setDraft(d.id, current.get(d.id), d.content);
  }
  reconcileKitSave(savedKit, currentKit) {
    this.clearKit();
    for (let i = 0; i < savedKit.length; i++) this.setKit(i, currentKit[i].content, savedKit[i].content);
    return this.kit.size > 0;
  }
}

export async function freezeForm(form, action) {
  if (!form) return action();
  const controls = [...form.elements].map(node => ({ node, disabled: node.disabled }));
  for (const { node } of controls) node.disabled = true;
  try { return await action(); }
  finally { if (form.isConnected) for (const { node, disabled } of controls) node.disabled = disabled; }
}
