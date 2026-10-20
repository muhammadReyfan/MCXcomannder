require('dotenv').config();
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const path = require('node:path');
const { pool, query } = require('./db');

const app = express();
const port = Number(process.env.PORT || 3000);
if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET wajib diisi dengan minimal 32 karakter.');
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(session({
  store: new PgSession({ pool, tableName: 'user_sessions', createTableIfMissing: true }),
  name: 'mcx.sid', secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 24 * 7 }
}));
app.use(express.static(path.join(__dirname, '..', 'public'), { index: false, maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));

// Same-origin guard for browser writes. Requests without Origin (e.g. health checks)
// are left alone; browser-originated cross-site writes are rejected.
app.use((req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next();
  try {
    const originUrl = new URL(origin);
    if (originUrl.host !== req.get('host')) return res.status(403).json({ error: 'Permintaan lintas situs ditolak.' });
  } catch {
    return res.status(403).json({ error: 'Origin request tidak valid.' });
  }
  next();
});

// Small in-memory limiter for auth endpoints. For multi-instance production,
// use a shared rate-limit store at the hosting/proxy layer.
const authAttempts = new Map();
function authRateLimit(req, res, next) {
  const now = Date.now();
  const key = `${req.ip}:${req.path}`;
  const windowMs = 15 * 60 * 1000;
  const max = 30;
  let entry = authAttempts.get(key);
  if (!entry || now - entry.startedAt >= windowMs) entry = { startedAt: now, count: 0 };
  entry.count += 1;
  authAttempts.set(key, entry);
  if (authAttempts.size > 5000) {
    for (const [k, v] of authAttempts) if (now - v.startedAt >= windowMs) authAttempts.delete(k);
  }
  if (entry.count > max) return res.status(429).json({ error: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.' });
  next();
}

const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
function requireAuth(req, res, next) { if (!req.session.userId) return res.status(401).json({ error: 'Silakan login terlebih dahulu.' }); next(); }
const userId = req => req.session.userId;
const sendError = (res, status, message) => res.status(status).json({ error: message });

app.get('/api/health', asyncRoute(async (_req, res) => { await query('SELECT 1'); res.json({ ok: true, database: 'connected' }); }));
app.post('/api/auth/register', authRateLimit, asyncRoute(async (req, res) => {
  const name = String(req.body.name || '').trim(); const email = String(req.body.email || '').trim().toLowerCase(); const password = String(req.body.password || '');
  if (name.length < 2 || name.length > 80) return sendError(res, 400, 'Nama harus 2–80 karakter.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return sendError(res, 400, 'Email tidak valid.');
  if (password.length < 10 || password.length > 72) return sendError(res, 400, 'Password harus 10–72 karakter.');
  const hash = await bcrypt.hash(password, 12);
  try { const result = await query('INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id,name,email', [name,email,hash]); req.session.userId = result.rows[0].id; req.session.user = result.rows[0]; res.status(201).json({ user: result.rows[0] }); }
  catch (err) { if (err.code === '23505') return sendError(res, 409, 'Email sudah terdaftar.'); throw err; }
}));
app.post('/api/auth/login', authRateLimit, asyncRoute(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase(); const password = String(req.body.password || '');
  const result = await query('SELECT id,name,email,password_hash FROM users WHERE email=$1', [email]);
  if (!result.rowCount || !(await bcrypt.compare(password, result.rows[0].password_hash))) return sendError(res, 401, 'Email atau password salah.');
  await new Promise((resolve,reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
  const user = { id: result.rows[0].id, name: result.rows[0].name, email: result.rows[0].email }; req.session.userId = user.id; req.session.user = user; res.json({ user });
}));
app.post('/api/auth/logout', (req,res) => req.session.destroy(err => { if (err) return sendError(res,500,'Gagal logout.'); res.clearCookie('mcx.sid'); res.json({ ok:true }); }));
app.get('/api/auth/me', (req,res) => res.json({ user: req.session.user || null }));

// Each module uses a strict column allowlist; user_id is always injected by the server.
const resources = {
 tasks: { table:'tasks', fields:['title','category','priority','deadline','project','notes','completed'], required:['title'], order:'created_at DESC', validate:b=> { if (b.priority && !['Rendah','Sedang','Tinggi'].includes(b.priority)) throw Error('Prioritas tidak valid.'); } },
 projects: { table:'projects', fields:['name','description','status','deadline'], required:['name'], order:'updated_at DESC' },
 goals: { table:'goals', fields:['title','description','timeframe','target_date','status'], required:['title'], order:'created_at DESC' },
 milestones: { table:'milestones', fields:['goal_id','title','target_date','completed'], required:['title'], order:'created_at DESC' },
 habits: { table:'habits', fields:['title','frequency'], required:['title'], order:'created_at DESC' },
 fitness: { table:'fitness_logs', fields:['activity','duration_minutes','notes','log_date'], required:['activity'], order:'log_date DESC' },
 study: { table:'study_sessions', fields:['subject','duration_minutes','notes','study_date'], required:['subject'], order:'study_date DESC' },
 finance: { table:'finance_transactions', fields:['type','amount','category','description','transaction_date'], required:['type','amount','category'], order:'transaction_date DESC', validate:b=> { if (!['Pemasukan','Pengeluaran'].includes(b.type)) throw Error('Jenis transaksi tidak valid.'); if (!Number.isFinite(Number(b.amount)) || Number(b.amount)<=0) throw Error('Nominal harus lebih besar dari nol.'); } },
 savings: { table:'savings_goals', fields:['title','target_amount','saved_amount','target_date'], required:['title','target_amount'], order:'created_at DESC', validate:b=> { if (!(Number(b.target_amount)>0) || Number(b.saved_amount||0)<0) throw Error('Nominal tabungan tidak valid.'); } },
 reviews: { table:'weekly_reviews', fields:['week_start','wins','challenges','next_week','mood'], required:['week_start'], order:'week_start DESC' }
};
for (const [name, cfg] of Object.entries(resources)) {
  const base = `/api/${name}`;
  app.get(base, requireAuth, asyncRoute(async (req,res) => { const r = await query(`SELECT * FROM ${cfg.table} WHERE user_id=$1 ORDER BY ${cfg.order} LIMIT 500`, [userId(req)]); res.json({ items:r.rows }); }));
  app.post(base, requireAuth, asyncRoute(async (req,res) => {
    const body = req.body || {};
    if (name === 'milestones' && body.goal_id !== undefined && body.goal_id !== null && body.goal_id !== '') {
      const goalId = Number(body.goal_id);
      if (!Number.isSafeInteger(goalId) || goalId < 1) return sendError(res, 400, 'ID goal tidak valid.');
      const ownedGoal = await query('SELECT id FROM goals WHERE id=$1 AND user_id=$2', [goalId, userId(req)]);
      if (!ownedGoal.rowCount) return sendError(res, 400, 'Goal tidak ditemukan pada akun ini.');
      body.goal_id = goalId;
    }
    for (const f of cfg.required) if (body[f] === undefined || body[f] === null || String(body[f]).trim()==='') return sendError(res,400,`${f} wajib diisi.`);
    if (cfg.validate) { try { cfg.validate(body); } catch(e) { return sendError(res,400,e.message); } }
    const fields = cfg.fields.filter(f => body[f] !== undefined); if (!fields.length) return sendError(res,400,'Tidak ada data untuk disimpan.');
    const values = fields.map(f => body[f]); const cols = ['user_id',...fields].join(','); const placeholders = ['$1',...fields.map((_,i)=>`$${i+2}`)].join(',');
    const r = await query(`INSERT INTO ${cfg.table}(${cols}) VALUES(${placeholders}) RETURNING *`, [userId(req),...values]); res.status(201).json({ item:r.rows[0] });
  }));
  app.patch(`${base}/:id`, requireAuth, asyncRoute(async (req,res) => {
    const id = Number(req.params.id); if (!Number.isSafeInteger(id) || id<1) return sendError(res,400,'ID tidak valid.');
    const body=req.body||{};
    if (name === 'milestones' && body.goal_id !== undefined && body.goal_id !== null && body.goal_id !== '') {
      const goalId = Number(body.goal_id);
      if (!Number.isSafeInteger(goalId) || goalId < 1) return sendError(res, 400, 'ID goal tidak valid.');
      const ownedGoal = await query('SELECT id FROM goals WHERE id=$1 AND user_id=$2', [goalId, userId(req)]);
      if (!ownedGoal.rowCount) return sendError(res, 400, 'Goal tidak ditemukan pada akun ini.');
      body.goal_id = goalId;
    }
    if (cfg.validate) { try { cfg.validate(body); } catch(e) { return sendError(res,400,e.message); } }
    const fields=cfg.fields.filter(f=>body[f]!==undefined); if (!fields.length) return sendError(res,400,'Tidak ada perubahan.');
    const set=fields.map((f,i)=>`${f}=$${i+3}`).join(', '); if (cfg.table==='tasks'||cfg.table==='projects'||cfg.table==='goals') fields.push();
    const r=await query(`UPDATE ${cfg.table} SET ${set}${['tasks','projects','goals'].includes(cfg.table)?', updated_at=NOW()':''} WHERE id=$1 AND user_id=$2 RETURNING *`,[id,userId(req),...fields.map(f=>body[f])]);
    if (!r.rowCount) return sendError(res,404,'Data tidak ditemukan.'); res.json({item:r.rows[0]});
  }));
  app.delete(`${base}/:id`, requireAuth, asyncRoute(async (req,res) => { const id=Number(req.params.id); if(!Number.isSafeInteger(id)||id<1)return sendError(res,400,'ID tidak valid.'); const r=await query(`DELETE FROM ${cfg.table} WHERE id=$1 AND user_id=$2 RETURNING id`,[id,userId(req)]); if(!r.rowCount)return sendError(res,404,'Data tidak ditemukan.'); res.json({ok:true}); }));
}

// Catatan habit tersimpan di PostgreSQL, terpisah per akun, bukan hanya di browser.
// Endpoint ini men-toggle status untuk satu habit pada satu tanggal.
app.post('/api/habits/:id/log', requireAuth, asyncRoute(async (req,res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return sendError(res, 400, 'ID habit tidak valid.');
  const date = String(req.body?.date || new Date().toISOString().slice(0,10));
  // Terima format YYYY-MM-DD yang benar-benar valid agar tidak menyimpan tanggal sembarang.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0,10) !== date) {
    return sendError(res, 400, 'Tanggal harus berformat YYYY-MM-DD yang valid.');
  }
  const owned = await query('SELECT id FROM habits WHERE id=$1 AND user_id=$2', [id, userId(req)]);
  if (!owned.rowCount) return sendError(res, 404, 'Habit tidak ditemukan.');
  const r = await query(
    `INSERT INTO habit_logs(user_id, habit_id, log_date, completed)
     VALUES($1, $2, $3, TRUE)
     ON CONFLICT(habit_id, log_date)
     DO UPDATE SET completed = NOT habit_logs.completed
     WHERE habit_logs.user_id = EXCLUDED.user_id
     RETURNING *`,
    [userId(req), id, date]
  );
  if (!r.rowCount) return sendError(res, 409, 'Catatan habit tidak cocok dengan akun ini.');
  res.json({ item: r.rows[0] });
}));
app.get('/api/habits/logs', requireAuth, asyncRoute(async(req,res)=>{
  const r = await query('SELECT * FROM habit_logs WHERE user_id=$1 ORDER BY log_date DESC, habit_id ASC LIMIT 5000', [userId(req)]);
  res.json({ items: r.rows });
}));
app.get('/api/dashboard', requireAuth, asyncRoute(async(req,res)=>{
 const uid=userId(req); const [tasks,projects,goals,habits,finance,savings,study,fitness]=await Promise.all([
 query('SELECT COUNT(*)::int total, COUNT(*) FILTER(WHERE completed)::int completed FROM tasks WHERE user_id=$1',[uid]),
 query("SELECT COUNT(*)::int total, COUNT(*) FILTER(WHERE status='Aktif')::int active FROM projects WHERE user_id=$1",[uid]),
 query("SELECT COUNT(*)::int total, COUNT(*) FILTER(WHERE status='Aktif')::int active FROM goals WHERE user_id=$1",[uid]),
 query('SELECT COUNT(*)::int total FROM habits WHERE user_id=$1',[uid]),
 query("SELECT COALESCE(SUM(amount) FILTER(WHERE type='Pemasukan'),0) income, COALESCE(SUM(amount) FILTER(WHERE type='Pengeluaran'),0) expense FROM finance_transactions WHERE user_id=$1 AND date_trunc('month',transaction_date)=date_trunc('month',CURRENT_DATE)",[uid]),
 query('SELECT COALESCE(SUM(saved_amount),0) saved,COALESCE(SUM(target_amount),0) target FROM savings_goals WHERE user_id=$1',[uid]),
 query('SELECT COALESCE(SUM(duration_minutes),0)::int minutes FROM study_sessions WHERE user_id=$1 AND study_date >= CURRENT_DATE-6',[uid]),
 query('SELECT COALESCE(SUM(duration_minutes),0)::int minutes FROM fitness_logs WHERE user_id=$1 AND log_date >= CURRENT_DATE-6',[uid])
 ]); res.json({tasks:tasks.rows[0],projects:projects.rows[0],goals:goals.rows[0],habits:habits.rows[0],finance:finance.rows[0],savings:savings.rows[0],study:study.rows[0],fitness:fitness.rows[0]});
}));
// Safe, explicit import endpoint for the legacy browser tasks. Never overwrites or deletes local data.
app.post('/api/migrations/legacy-tasks', requireAuth, asyncRoute(async(req,res)=>{
 const items=req.body.tasks; if(!Array.isArray(items)||items.length>500)return sendError(res,400,'Kirim array tasks maksimal 500 item.');
 const client=await pool.connect(); let imported=0; let skipped=0;
 try { await client.query('BEGIN'); for(const t of items){ if(!t||typeof t.title!=='string'||!t.title.trim()){skipped++;continue;}
 const legacyId=String(t.id||''); const existing=legacyId?await client.query("SELECT id FROM tasks WHERE user_id=$1 AND notes LIKE $2 LIMIT 1",[userId(req),`%[legacy-id:${legacyId}]%`]):{rowCount:0}; if(existing.rowCount){skipped++;continue;}
 await client.query('INSERT INTO tasks(user_id,title,category,priority,deadline,project,notes,completed) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[userId(req),t.title.trim().slice(0,200),String(t.category||'Pribadi').slice(0,60),['Rendah','Sedang','Tinggi'].includes(t.priority)?t.priority:'Sedang',t.deadline||null,String(t.project||'').slice(0,120),`${String(t.notes||'')} ${legacyId?`[legacy-id:${legacyId}]`:''}`.trim(),Boolean(t.completed)]); imported++; }
 await client.query('COMMIT'); res.json({ok:true,imported,skipped,message:'Impor selesai. Data localStorage lama tidak dihapus.'}); } catch(e){await client.query('ROLLBACK');throw e;} finally{client.release();}
}));
app.get('*', (req,res,next) => { if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Endpoint API tidak ditemukan.' }); res.sendFile(path.join(__dirname,'..','public','index.html'), err => { if (err) next(err); }); });
app.use((err,req,res,next)=>{ console.error(err); if(res.headersSent)return next(err); res.status(500).json({error:'Terjadi kesalahan server.'}); });
const server=app.listen(port,()=>console.log(`MCX Command Center berjalan di http://localhost:${port}`));
async function shutdown(){server.close(async()=>{await pool.end();process.exit(0);});}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
