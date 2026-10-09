// Integration contract: publish({ key, campaignId, item, now }) returns a receipt.
// This local adapter participates in the same SQLite transaction as the job.
// A future remote adapter needs provider-side idempotency plus reconciliation;
// a database transaction alone cannot guarantee exactly-once remote publishing.
export class DemoIntegration {
  constructor(db) { this.db = db; }
  publish({ key, campaignId, item, now }) {
    const previous = this.db.prepare('SELECT receipt FROM deliveries WHERE key=?').get(key);
    if (previous) return JSON.parse(previous.receipt);
    const receipt = {
      id: `demo-${key}`, mode: 'demo', destination: item.account,
      content: item.content, link: item.destination, simulatedCost: item.cost,
      publishedAt: now, metrics: null
    };
    this.db.prepare('INSERT INTO deliveries(key,campaign_id,item_id,cost,receipt,created) VALUES(?,?,?,?,?,?)')
      .run(key, campaignId, item.id, item.cost, JSON.stringify(receipt), now);
    return receipt;
  }
}
