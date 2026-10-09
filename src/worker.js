import { openDatabase } from './db.js';
import { runDue } from './engine.js';
const db = openDatabase();
const interval = Math.max(250, Number(process.env.WORKER_INTERVAL_MS) || 2000);
const tick = () => { try { runDue(db); } catch (error) { console.error('Worker tick failed:', error.message); } };
tick();
const timer = setInterval(tick, interval);
console.log('Marketing101 background worker started (demo only).');
function stop() { clearInterval(timer); db.close(); process.exit(0); }
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
