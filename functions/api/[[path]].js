/**
 * QW 电竞 API - Cloudflare Pages Functions
 * 文件：functions/api/[[path]].js  → 路由 /api/*
 *
 * 身份：admin / handler / boss / dispatcher / cs
 * 控制终端：商品管理 · 用户管理 · 派单系统
 *
 * 绑定 D1 变量名必须为 DB；未绑定则用内存模式（重启会丢数据）
 * 默认管理员：admin / admin123（ID 000000）
 */

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}
function errorResponse(message, status = 400) {
  return jsonResponse({ error: message }, status);
}
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}
function hasDB(env) { return !!(env && env.DB); }

/* ========== 内存模式 ========== */
const MEM = {
  users: [], side_categories: [], sub_categories: [], products: [],
  home_tabs: [], announcements: [], banners: [], quick_links: [], home_sections: [],
  orders: [], messages: [], checkin_records: [], rank_items: [],
  dispatch_orders: [], dispatch_templates: [],
  shops: [], posts: [], post_categories: [], gifts: [], stickers: [],
  recharges: [], withdrawals: [], icons: [], exchange_rules: [], checkin_rewards: [],
  hall_categories: [], theme: null, ai_settings: { enabled: false, model: '', knowledge: '' }, banned_words: [], auto_replies: [],
  seeded: false
};
function memAll(t, fn) { let r = MEM[t] || []; return fn ? r.filter(fn) : r; }
function memGet(t, id) { return (MEM[t] || []).find(x => x.id === id) || null; }
function memInsert(t, row) { if (!MEM[t]) MEM[t] = []; MEM[t].push(row); return row; }
function memUpdate(t, id, patch) {
  const list = MEM[t] || []; const i = list.findIndex(x => x.id === id);
  if (i < 0) return null; list[i] = { ...list[i], ...patch }; return list[i];
}
function memDelete(t, id) { MEM[t] = (MEM[t] || []).filter(x => x.id !== id); }

async function queryDB(env, sql, params = []) {
  if (!env.DB) return { results: [] };
  const stmt = env.DB.prepare(sql);
  if (params.length) return await stmt.bind(...params).all();
  return await stmt.all();
}
async function runDB(env, sql, params = []) {
  if (!env.DB) return {};
  const stmt = env.DB.prepare(sql);
  if (params.length) return await stmt.bind(...params).run();
  return await stmt.run();
}
function verifyUserId(authHeader) {
  if (!authHeader) return null;
  const parts = String(authHeader).replace(/^Bearer\s+/i, '').split('.');
  if (parts.length !== 2) return null;
  return parts[1];
}
function publicUser(u) {
  if (!u) return null;
  const { password, ...rest } = u;
  return rest;
}
async function getUserById(env, userId) {
  if (hasDB(env)) {
    const r = await queryDB(env, 'SELECT * FROM users WHERE id = ?', [userId]);
    return (r.results && r.results[0]) || null;
  }
  return memGet('users', userId);
}
async function requireAdmin(env, auth) {
  const uid = verifyUserId(auth);
  if (!uid) return null;
  const u = await getUserById(env, uid);
  if (!u || u.role !== 'admin') return null;
  return u;
}
async function nextUserId(env) {
  let max = -1;
  if (hasDB(env)) {
    const r = await queryDB(env, 'SELECT id FROM users');
    for (const row of (r.results || [])) {
      const n = parseInt(String(row.id).replace(/\D/g, ''), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  } else {
    for (const row of MEM.users) {
      const n = parseInt(String(row.id).replace(/\D/g, ''), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  return String(Math.max(0, max + 1)).padStart(6, '0');
}

function seedMem() {
  const now = new Date().toISOString();
  const side1 = 'side_delta', side2 = 'side_report';
  MEM.side_categories = [
    { id: side1, name: '三角洲行动', image: '', sort_order: 0, enabled: 1, created_at: now },
    { id: side2, name: '举报投诉', image: '', sort_order: 1, enabled: 1, created_at: now }
  ];
  const subs = [
    [side1, '特惠体验单'], [side1, '护航专区'], [side1, '绝密对赌单'],
    [side1, '大红专区'], [side1, '趣味单'], [side1, '技术陪'],
    [side2, '我要投诉'], [side2, '举报有奖']
  ];
  MEM.sub_categories = subs.map((s, i) => ({
    id: 'sub_' + i, side_id: s[0], name: s[1], icon: '', image: '', sort_order: i, enabled: 1, created_at: now
  }));
  MEM.home_tabs = [{ id: 'tab_home', name: '首页', sort_order: 0, enabled: 1 }];
  MEM.announcements = [{ id: 'ann1', content: '板板！游端、手游都有-直接下单马上安排', enabled: 1, sort_order: 0, created_at: now }];
  MEM.banners = [];
  MEM.quick_links = [
    { id: 'ql1', name: '人工客服', icon: 'users', action: 'cs', sort_order: 0, enabled: 1 },
    { id: 'ql2', name: '下单流程', icon: 'orders', action: 'guide', sort_order: 1, enabled: 1 },
    { id: 'ql3', name: '积分签到', icon: 'refresh', action: 'checkin', sort_order: 2, enabled: 1 },
    { id: 'ql4', name: '积分抽奖', icon: 'gifts', action: 'lottery', sort_order: 3, enabled: 1 }
  ];
  MEM.home_sections = [{ id: 'sec_delta', name: '三角洲行动', sort_order: 0, enabled: 1 }];
  MEM.products = [];
  MEM.users = [{
    id: '000000', username: 'admin', password: 'admin123', role: 'admin',
    diamond: 0, coin: 0, bio: '', gender: '', avatar: '', banner: '', status: 'active', created_at: now
  }];
  MEM.orders = []; MEM.messages = []; MEM.checkin_records = []; MEM.rank_items = [];
  MEM.dispatch_orders = []; MEM.dispatch_templates = [];
  MEM.seeded = true;
}

async function ensureSchema(env) {
  if (hasDB(env)) {
    await runDB(env, `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT UNIQUE, password TEXT, role TEXT DEFAULT 'boss',
      diamond REAL DEFAULT 0, coin REAL DEFAULT 0, bio TEXT, gender TEXT, avatar TEXT, banner TEXT,
      status TEXT DEFAULT 'active', created_at TEXT)`);
    await runDB(env, `CREATE TABLE IF NOT EXISTS side_categories (
      id TEXT PRIMARY KEY, name TEXT, image TEXT, sort_order INTEGER DEFAULT 0, enabled INTEGER DEFAULT 1, created_at TEXT)`);
    await runDB(env, `CREATE TABLE IF NOT EXISTS sub_categories (
      id TEXT PRIMARY KEY, side_id TEXT, name TEXT, icon TEXT, image TEXT, sort_order INTEGER DEFAULT 0, enabled INTEGER DEFAULT 1, created_at TEXT)`);
    await runDB(env, `CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY, title TEXT, description TEXT, detail TEXT, price REAL DEFAULT 0, stock INTEGER DEFAULT 0,
      image TEXT, category_id TEXT, side_id TEXT, tag TEXT, sold_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'on', sort_order INTEGER DEFAULT 0, created_at TEXT)`);
    await runDB(env, `CREATE TABLE IF NOT EXISTS home_tabs (
      id TEXT PRIMARY KEY, name TEXT, sort_order INTEGER DEFAULT 0, enabled INTEGER DEFAULT 1)`);
    await runDB(env, `CREATE TABLE IF NOT EXISTS announcements (
      id TEXT PRIMARY KEY, content TEXT, enabled INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0, created_at TEXT)`);
    await runDB(env, `CREATE TABLE IF NOT EXISTS banners (
      id TEXT PRIMARY KEY, image TEXT, link TEXT, title TEXT, enabled INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0)`);
    await runDB(env, `CREATE TABLE IF NOT EXISTS quick_links (
      id TEXT PRIMARY KEY, name TEXT, icon TEXT, action TEXT, sort_order INTEGER DEFAULT 0, enabled INTEGER DEFAULT 1)`);
    await runDB(env, `CREATE TABLE IF NOT EXISTS home_sections (
      id TEXT PRIMARY KEY, name TEXT, sort_order INTEGER DEFAULT 0, enabled INTEGER DEFAULT 1)`);
    await runDB(env, `CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY, user_id TEXT, product_id TEXT, title TEXT, price REAL, status TEXT DEFAULT 'pending',
      contact TEXT, remark TEXT, created_at TEXT)`);
    await runDB(env, `CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, sender_id TEXT, receiver_id TEXT, content TEXT, created_at TEXT)`);
    await runDB(env, `CREATE TABLE IF NOT EXISTS checkin_records (
      id TEXT PRIMARY KEY, user_id TEXT, checkin_date TEXT, created_at TEXT)`);
    await runDB(env, `CREATE TABLE IF NOT EXISTS rank_items (
      id TEXT PRIMARY KEY, username TEXT, score REAL DEFAULT 0, avatar TEXT, rank_type TEXT DEFAULT 'handler', sort_order INTEGER DEFAULT 0)`);
    await runDB(env, `CREATE TABLE IF NOT EXISTS dispatch_orders (
      id TEXT PRIMARY KEY, title TEXT, game_category TEXT, price REAL DEFAULT 0, quantity INTEGER DEFAULT 1,
      urgency TEXT DEFAULT '普通', detail TEXT, remark TEXT, contact TEXT, status TEXT DEFAULT 'open',
      publisher_id TEXT, created_at TEXT)`);
    await runDB(env, `CREATE TABLE IF NOT EXISTS dispatch_templates (
      id TEXT PRIMARY KEY, title TEXT, game_category TEXT, price REAL DEFAULT 0, quantity INTEGER DEFAULT 1,
      urgency TEXT DEFAULT '普通', detail TEXT, remark TEXT, contact TEXT, created_at TEXT)`);
    await runDB(env, `CREATE TABLE IF NOT EXISTS shops (
      id TEXT PRIMARY KEY, name TEXT, owner_id TEXT, description TEXT, status TEXT DEFAULT 'active', avatar TEXT, created_at TEXT)`);
    await runDB(env, `CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY, user_id TEXT, username TEXT, content TEXT, images TEXT, category_id TEXT, likes INTEGER DEFAULT 0, created_at TEXT)`);
    await runDB(env, `CREATE TABLE IF NOT EXISTS post_categories (id TEXT PRIMARY KEY, name TEXT, sort_order INTEGER DEFAULT 0)`);
    await runDB(env, `CREATE TABLE IF NOT EXISTS gifts (id TEXT PRIMARY KEY, name TEXT, price REAL DEFAULT 0, image TEXT, enabled INTEGER DEFAULT 1)`);
    await runDB(env, `CREATE TABLE IF NOT EXISTS stickers (id TEXT PRIMARY KEY, name TEXT, url TEXT, is_public INTEGER DEFAULT 1, created_at TEXT)`);
    await runDB(env, `CREATE TABLE IF NOT EXISTS recharges (id TEXT PRIMARY KEY, user_id TEXT, amount REAL, status TEXT DEFAULT 'pending', created_at TEXT)`);
    await runDB(env, `CREATE TABLE IF NOT EXISTS withdrawals (id TEXT PRIMARY KEY, user_id TEXT, amount REAL, status TEXT DEFAULT 'pending', created_at TEXT)`);
    await runDB(env, `CREATE TABLE IF NOT EXISTS icons (id TEXT PRIMARY KEY, key_name TEXT, url TEXT)`);
    await runDB(env, `CREATE TABLE IF NOT EXISTS exchange_rules (id TEXT PRIMARY KEY, name TEXT, cost INTEGER DEFAULT 0, reward TEXT)`);
    await runDB(env, `CREATE TABLE IF NOT EXISTS checkin_rewards (id TEXT PRIMARY KEY, day_index INTEGER, reward TEXT, amount REAL DEFAULT 10)`);
    await runDB(env, `CREATE TABLE IF NOT EXISTS hall_categories (id TEXT PRIMARY KEY, name TEXT, sort_order INTEGER DEFAULT 0)`);
    try { await runDB(env, 'ALTER TABLE products ADD COLUMN stock INTEGER DEFAULT 0'); } catch (_) {}
    try { await runDB(env, 'ALTER TABLE products ADD COLUMN detail TEXT'); } catch (_) {}
    try { await runDB(env, 'ALTER TABLE side_categories ADD COLUMN image TEXT'); } catch (_) {}
    try { await runDB(env, 'ALTER TABLE sub_categories ADD COLUMN image TEXT'); } catch (_) {}

    const sc = await queryDB(env, 'SELECT COUNT(*) as c FROM side_categories');
    if (!(sc.results && sc.results[0] && sc.results[0].c > 0)) {
      const now = new Date().toISOString();
      const side1 = 'side_delta', side2 = 'side_report';
      await runDB(env, 'INSERT INTO side_categories (id,name,image,sort_order,enabled,created_at) VALUES (?,?,?,?,?,?)',
        [side1, '三角洲行动', '', 0, 1, now]);
      await runDB(env, 'INSERT INTO side_categories (id,name,image,sort_order,enabled,created_at) VALUES (?,?,?,?,?,?)',
        [side2, '举报投诉', '', 1, 1, now]);
      const subs = [[side1, '特惠体验单'], [side1, '护航专区'], [side1, '绝密对赌单'], [side1, '大红专区'], [side2, '我要投诉']];
      for (let i = 0; i < subs.length; i++) {
        await runDB(env, 'INSERT INTO sub_categories (id,side_id,name,icon,image,sort_order,enabled,created_at) VALUES (?,?,?,?,?,?,?,?)',
          [generateId(), subs[i][0], subs[i][1], '', '', i, 1, now]);
      }
      await runDB(env, 'INSERT INTO home_tabs (id,name,sort_order,enabled) VALUES (?,?,?,?)', ['tab_home', '首页', 0, 1]);
      await runDB(env, 'INSERT INTO announcements (id,content,enabled,sort_order,created_at) VALUES (?,?,?,?,?)',
        [generateId(), '板板！游端、手游都有-直接下单马上安排', 1, 0, now]);
    }
    const uc = await queryDB(env, 'SELECT COUNT(*) as c FROM users');
    if (!(uc.results && uc.results[0] && uc.results[0].c > 0)) {
      await runDB(env, 'INSERT INTO users (id,username,password,role,diamond,status,created_at) VALUES (?,?,?,?,?,?,?)',
        ['000000', 'admin', 'admin123', 'admin', 0, 'active', new Date().toISOString()]);
    }
  } else if (!MEM.seeded) {
    seedMem();
  }
}

export async function onRequest(context) {
  const request = context.request;
  const env = context.env;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }

  try {
    await ensureSchema(env);
    const url = new URL(request.url);
    let path = url.pathname;
    if (path.endsWith('/') && path.length > 1) path = path.slice(0, -1);
    const method = request.method;
    const auth = request.headers.get('Authorization') || '';
    let body = {};
    if (method === 'POST' || method === 'PUT') {
      try { body = await request.json(); } catch (_) { body = {}; }
    }

    if (path === '/' || path === '/api' || path === '/api/health') {
      return jsonResponse({
        ok: true,
        name: 'QW电竞 API',
        storage: hasDB(env) ? 'D1' : 'memory',
        features: ['商品管理', '用户管理', '派单系统', '身份系统']
      });
    }

    // 注册
    if (path === '/api/register' && method === 'POST') {
      const username = (body.username || '').trim();
      const password = body.password || '';
      const allowed = ['boss', 'handler', 'dispatcher', 'cs', 'service'];
      let role = body.role || 'boss';
      if (!allowed.includes(role)) role = 'boss';
      if (!username || !password) return errorResponse('请填写用户名和密码');
      if (hasDB(env)) {
        const exists = await queryDB(env, 'SELECT id FROM users WHERE username = ?', [username]);
        if (exists.results && exists.results[0]) return errorResponse('用户名已存在');
        const id = await nextUserId(env);
        await runDB(env, 'INSERT INTO users (id,username,password,role,status,created_at) VALUES (?,?,?,?,?,?)',
          [id, username, password, role, 'active', new Date().toISOString()]);
        return jsonResponse({ message: '注册成功', user: { id, username, role } });
      }
      if (MEM.users.find(u => u.username === username)) return errorResponse('用户名已存在');
      const id = await nextUserId(env);
      const user = { id, username, password, role, diamond: 0, coin: 0, bio: '', gender: '', avatar: '', banner: '', status: 'active', created_at: new Date().toISOString() };
      memInsert('users', user);
      return jsonResponse({ message: '注册成功', user: publicUser(user) });
    }

    // 登录
    if (path === '/api/login' && method === 'POST') {
      const account = (body.username || body.account || '').trim();
      const password = body.password || '';
      if (!account || !password) return errorResponse('请填写账号和密码');
      let user = null;
      if (hasDB(env)) {
        let r = await queryDB(env, 'SELECT * FROM users WHERE username = ?', [account]);
        if (!(r.results && r.results[0])) r = await queryDB(env, 'SELECT * FROM users WHERE id = ?', [account]);
        user = r.results && r.results[0];
      } else {
        user = MEM.users.find(u => u.username === account || u.id === account) || null;
      }
      if (!user) return errorResponse('用户不存在');
      if (user.password !== password) return errorResponse('密码错误');
      if (user.status === 'banned') return errorResponse('账号已封禁');
      return jsonResponse({ token: 't.' + user.id, user: publicUser(user) });
    }

    if (path === '/api/me' && method === 'GET') {
      const uid = verifyUserId(auth);
      if (!uid) return errorResponse('请先登录', 401);
      const user = await getUserById(env, uid);
      if (!user) return errorResponse('用户不存在', 404);
      return jsonResponse(publicUser(user));
    }

    // 首页
    if (path === '/api/home' && method === 'GET') {
      if (hasDB(env)) {
        const tabs = await queryDB(env, 'SELECT * FROM home_tabs WHERE enabled=1 ORDER BY sort_order');
        const announce = await queryDB(env, 'SELECT * FROM announcements WHERE enabled=1 ORDER BY sort_order LIMIT 10');
        const banners = await queryDB(env, 'SELECT * FROM banners WHERE enabled=1 ORDER BY sort_order');
        const links = await queryDB(env, 'SELECT * FROM quick_links WHERE enabled=1 ORDER BY sort_order');
        const sections = await queryDB(env, 'SELECT * FROM home_sections WHERE enabled=1 ORDER BY sort_order');
        const products = await queryDB(env, `SELECT * FROM products WHERE status='on' ORDER BY sort_order, created_at DESC LIMIT 40`);
        return jsonResponse({
          tabs: tabs.results || [], announcements: announce.results || [], banners: banners.results || [],
          quick_links: links.results || [], sections: sections.results || [], products: products.results || []
        });
      }
      return jsonResponse({
        tabs: memAll('home_tabs', r => r.enabled),
        announcements: memAll('announcements', r => r.enabled),
        banners: memAll('banners', r => r.enabled),
        quick_links: memAll('quick_links', r => r.enabled),
        sections: memAll('home_sections', r => r.enabled),
        products: memAll('products', r => r.status === 'on')
      });
    }

    if (path === '/api/categories/side' && method === 'GET') {
      if (hasDB(env)) {
        const r = await queryDB(env, 'SELECT * FROM side_categories WHERE enabled=1 ORDER BY sort_order');
        return jsonResponse(r.results || []);
      }
      return jsonResponse(memAll('side_categories', r => r.enabled).sort((a, b) => a.sort_order - b.sort_order));
    }
    if (path.startsWith('/api/categories/sub/') && method === 'GET') {
      const sideId = decodeURIComponent(path.replace('/api/categories/sub/', ''));
      if (hasDB(env)) {
        const r = await queryDB(env, 'SELECT * FROM sub_categories WHERE side_id=? AND enabled=1 ORDER BY sort_order', [sideId]);
        return jsonResponse(r.results || []);
      }
      return jsonResponse(memAll('sub_categories', r => r.side_id === sideId && r.enabled).sort((a, b) => a.sort_order - b.sort_order));
    }
    if (path === '/api/products' && method === 'GET') {
      const sideId = url.searchParams.get('side_id') || '';
      const categoryId = url.searchParams.get('category_id') || '';
      const q = (url.searchParams.get('q') || '').trim();
      if (hasDB(env)) {
        let sql = `SELECT * FROM products WHERE status='on'`;
        const params = [];
        if (sideId) { sql += ' AND side_id=?'; params.push(sideId); }
        if (categoryId) { sql += ' AND category_id=?'; params.push(categoryId); }
        if (q) { sql += ' AND (title LIKE ? OR description LIKE ?)'; params.push('%' + q + '%', '%' + q + '%'); }
        sql += ' ORDER BY sort_order, created_at DESC LIMIT 100';
        const r = await queryDB(env, sql, params);
        return jsonResponse(r.results || []);
      }
      let rows = memAll('products', r => r.status === 'on');
      if (sideId) rows = rows.filter(r => r.side_id === sideId);
      if (categoryId) rows = rows.filter(r => r.category_id === categoryId);
      if (q) rows = rows.filter(r => (r.title || '').includes(q) || (r.description || '').includes(q));
      return jsonResponse(rows);
    }
    if (path.startsWith('/api/products/') && method === 'GET') {
      const id = decodeURIComponent(path.replace('/api/products/', ''));
      const p = hasDB(env)
        ? ((await queryDB(env, 'SELECT * FROM products WHERE id=?', [id])).results || [])[0]
        : memGet('products', id);
      if (!p) return errorResponse('商品不存在', 404);
      return jsonResponse(p);
    }
    if ((path === '/api/rank' || path === '/api/handlers/rank') && method === 'GET') {
      if (hasDB(env)) {
        const u = await queryDB(env, `SELECT id,username,avatar,diamond as score FROM users WHERE role='handler' ORDER BY diamond DESC LIMIT 30`);
        return jsonResponse(u.results || []);
      }
      return jsonResponse(memAll('users', u => u.role === 'handler').map(u => ({ id: u.id, username: u.username, score: u.diamond })));
    }
    if (path === '/api/orders/buy' && method === 'POST') {
      const uid = verifyUserId(auth);
      if (!uid) return errorResponse('请先登录', 401);
      const productId = body.product_id || '';
      let title = body.title || '订单';
      let price = parseFloat(body.price) || 0;
      if (productId) {
        if (hasDB(env)) {
          const p = await queryDB(env, 'SELECT * FROM products WHERE id=?', [productId]);
          const prod = p.results && p.results[0];
          if (prod) {
            title = prod.title; price = prod.price;
            await runDB(env, 'UPDATE products SET sold_count=COALESCE(sold_count,0)+1 WHERE id=?', [productId]);
          }
        } else {
          const prod = memGet('products', productId);
          if (prod) { title = prod.title; price = prod.price; prod.sold_count = (prod.sold_count || 0) + 1; }
        }
      }
      const id = generateId(), now = new Date().toISOString();
      const row = { id, user_id: uid, product_id: productId, title, price, status: 'pending', contact: body.contact || '', remark: body.remark || '', created_at: now };
      if (hasDB(env)) {
        await runDB(env, `INSERT INTO orders (id,user_id,product_id,title,price,status,contact,remark,created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
          [id, uid, productId, title, price, 'pending', row.contact, row.remark, now]);
      } else memInsert('orders', row);
      return jsonResponse({ success: true, order_id: id, message: '下单成功' });
    }
    if (path === '/api/orders/my' && method === 'GET') {
      const uid = verifyUserId(auth);
      if (!uid) return errorResponse('请先登录', 401);
      if (hasDB(env)) {
        const r = await queryDB(env, 'SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC', [uid]);
        return jsonResponse(r.results || []);
      }
      return jsonResponse(memAll('orders', r => r.user_id === uid).reverse());
    }
    if (path === '/api/messages/contacts' && method === 'GET') {
      const uid = verifyUserId(auth);
      if (!uid) return errorResponse('请先登录', 401);
      return jsonResponse([{ id: 'cs_bot', user_id: 'cs_bot', username: '人工客服', last_message: '有问题点这里咨询' }]);
    }
    if (path === '/api/messages/history' && method === 'POST') {
      const uid = verifyUserId(auth);
      if (!uid) return errorResponse('请先登录', 401);
      const contactId = body.contactId || body.user_id || body.receiver_id;
      if (hasDB(env)) {
        const r = await queryDB(env, `SELECT * FROM messages WHERE (sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?) ORDER BY created_at ASC LIMIT 200`,
          [uid, contactId, contactId, uid]);
        return jsonResponse(r.results || []);
      }
      return jsonResponse(MEM.messages.filter(m =>
        (m.sender_id === uid && m.receiver_id === contactId) || (m.sender_id === contactId && m.receiver_id === uid)
      ));
    }
    if (path === '/api/messages/send' && method === 'POST') {
      const uid = verifyUserId(auth);
      if (!uid) return errorResponse('请先登录', 401);
      const receiver = body.receiver_id || body.contactId;
      const content = (body.content || '').trim();
      if (!receiver || !content) return errorResponse('消息不完整');
      const id = generateId(), now = new Date().toISOString();
      if (hasDB(env)) {
        await runDB(env, 'INSERT INTO messages (id,sender_id,receiver_id,content,created_at) VALUES (?,?,?,?,?)', [id, uid, receiver, content, now]);
      } else memInsert('messages', { id, sender_id: uid, receiver_id: receiver, content, created_at: now });
      return jsonResponse({ success: true });
    }
    if (path === '/api/messages/unread' && method === 'GET') return jsonResponse({ count: 0 });
    if (path === '/api/checkin' && method === 'GET') {
      const uid = verifyUserId(auth);
      if (!uid) return errorResponse('请先登录', 401);
      const today = new Date().toISOString().slice(0, 10);
      let checked = false;
      if (hasDB(env)) {
        const done = await queryDB(env, 'SELECT id FROM checkin_records WHERE user_id=? AND checkin_date=?', [uid, today]);
        checked = !!(done.results && done.results[0]);
      } else checked = MEM.checkin_records.some(r => r.user_id === uid && r.checkin_date === today);
      return jsonResponse({ checked, date: today, reward_name: '积分 +10' });
    }
    if (path === '/api/checkin' && method === 'POST') {
      const uid = verifyUserId(auth);
      if (!uid) return errorResponse('请先登录', 401);
      const today = new Date().toISOString().slice(0, 10);
      if (hasDB(env)) {
        const done = await queryDB(env, 'SELECT id FROM checkin_records WHERE user_id=? AND checkin_date=?', [uid, today]);
        if (done.results && done.results[0]) return errorResponse('今日已签到');
        await runDB(env, 'INSERT INTO checkin_records (id,user_id,checkin_date,created_at) VALUES (?,?,?,?)',
          [generateId(), uid, today, new Date().toISOString()]);
        await runDB(env, 'UPDATE users SET coin=COALESCE(coin,0)+10 WHERE id=?', [uid]);
      } else {
        if (MEM.checkin_records.some(r => r.user_id === uid && r.checkin_date === today)) return errorResponse('今日已签到');
        memInsert('checkin_records', { id: generateId(), user_id: uid, checkin_date: today, created_at: new Date().toISOString() });
        const u = memGet('users', uid); if (u) u.coin = (u.coin || 0) + 10;
      }
      return jsonResponse({ success: true, message: '签到成功，积分 +10' });
    }
    if (path === '/api/user/name' && method === 'PUT') {
      const uid = verifyUserId(auth);
      if (!uid) return errorResponse('请先登录', 401);
      if (hasDB(env)) await runDB(env, 'UPDATE users SET username=? WHERE id=?', [body.username, uid]);
      else memUpdate('users', uid, { username: body.username });
      return jsonResponse({ success: true });
    }
    if (path === '/api/user/bio' && method === 'PUT') {
      const uid = verifyUserId(auth);
      if (!uid) return errorResponse('请先登录', 401);
      if (hasDB(env)) await runDB(env, 'UPDATE users SET bio=? WHERE id=?', [body.bio || '', uid]);
      else memUpdate('users', uid, { bio: body.bio || '' });
      return jsonResponse({ success: true });
    }
    if (path === '/api/user/gender' && method === 'PUT') {
      const uid = verifyUserId(auth);
      if (!uid) return errorResponse('请先登录', 401);
      if (hasDB(env)) await runDB(env, 'UPDATE users SET gender=? WHERE id=?', [body.gender || '', uid]);
      else memUpdate('users', uid, { gender: body.gender || '' });
      return jsonResponse({ success: true });
    }
    if (path.startsWith('/api/users/') && method === 'GET') {
      const id = decodeURIComponent(path.replace('/api/users/', ''));
      const u = await getUserById(env, id);
      if (!u) return errorResponse('用户不存在', 404);
      return jsonResponse(publicUser(u));
    }

    // ===== 管理：商品 =====
    if (path === '/api/admin/products' && method === 'GET') {
      if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
      if (hasDB(env)) {
        const r = await queryDB(env, 'SELECT * FROM products ORDER BY created_at DESC');
        return jsonResponse(r.results || []);
      }
      return jsonResponse([...(MEM.products)].reverse());
    }
    if (path === '/api/admin/product' && method === 'POST') {
      if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
      const id = body.id || generateId();
      const now = new Date().toISOString();
      const fields = {
        title: body.title || '新商品', description: body.description || '', detail: body.detail || '',
        price: parseFloat(body.price) || 0, stock: parseInt(body.stock, 10) || 0, image: body.image || '',
        category_id: body.category_id || '', side_id: body.side_id || '', status: body.status || 'on', tag: body.tag || ''
      };
      if (hasDB(env)) {
        if (body.id) {
          await runDB(env, `UPDATE products SET title=?,description=?,detail=?,price=?,stock=?,image=?,category_id=?,side_id=?,status=?,tag=? WHERE id=?`,
            [fields.title, fields.description, fields.detail, fields.price, fields.stock, fields.image, fields.category_id, fields.side_id, fields.status, fields.tag, id]);
        } else {
          await runDB(env, `INSERT INTO products (id,title,description,detail,price,stock,image,category_id,side_id,tag,sold_count,status,sort_order,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [id, fields.title, fields.description, fields.detail, fields.price, fields.stock, fields.image, fields.category_id, fields.side_id, fields.tag, 0, 'on', 0, now]);
        }
      } else {
        if (body.id) memUpdate('products', id, fields);
        else memInsert('products', { id, ...fields, sold_count: 0, sort_order: 0, created_at: now });
      }
      return jsonResponse({ success: true, id });
    }
    if (path === '/api/admin/product/status' && method === 'POST') {
      if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
      if (hasDB(env)) await runDB(env, 'UPDATE products SET status=? WHERE id=?', [body.status || 'off', body.id]);
      else memUpdate('products', body.id, { status: body.status || 'off' });
      return jsonResponse({ success: true });
    }
    if (path === '/api/admin/side' && method === 'POST') {
      if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
      const id = body.id || generateId();
      const now = new Date().toISOString();
      if (hasDB(env)) {
        if (body.id) await runDB(env, 'UPDATE side_categories SET name=?,image=?,sort_order=?,enabled=? WHERE id=?',
          [body.name, body.image || '', body.sort_order || 0, body.enabled !== 0 ? 1 : 0, id]);
        else await runDB(env, 'INSERT INTO side_categories (id,name,image,sort_order,enabled,created_at) VALUES (?,?,?,?,?,?)',
          [id, body.name || '新分类', body.image || '', 0, 1, now]);
      } else {
        if (body.id) memUpdate('side_categories', id, { name: body.name, image: body.image || '' });
        else memInsert('side_categories', { id, name: body.name || '新分类', image: body.image || '', sort_order: 0, enabled: 1, created_at: now });
      }
      return jsonResponse({ success: true, id });
    }
    if (path === '/api/admin/sub' && method === 'POST') {
      if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
      const id = body.id || generateId();
      const now = new Date().toISOString();
      const img = body.image || body.icon || '';
      if (hasDB(env)) {
        if (body.id) await runDB(env, 'UPDATE sub_categories SET side_id=?,name=?,icon=?,image=?,sort_order=?,enabled=? WHERE id=?',
          [body.side_id, body.name, img, img, body.sort_order || 0, body.enabled !== 0 ? 1 : 0, id]);
        else await runDB(env, 'INSERT INTO sub_categories (id,side_id,name,icon,image,sort_order,enabled,created_at) VALUES (?,?,?,?,?,?,?,?)',
          [id, body.side_id, body.name || '新项目', img, img, 0, 1, now]);
      } else {
        if (body.id) memUpdate('sub_categories', id, { side_id: body.side_id, name: body.name, icon: img, image: img });
        else memInsert('sub_categories', { id, side_id: body.side_id, name: body.name || '新项目', icon: img, image: img, sort_order: 0, enabled: 1, created_at: now });
      }
      return jsonResponse({ success: true, id });
    }

    // ===== 管理：用户 =====
    if (path === '/api/admin/users' && method === 'GET') {
      if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
      if (hasDB(env)) {
        const r = await queryDB(env, 'SELECT * FROM users ORDER BY id ASC');
        return jsonResponse((r.results || []).map(publicUser));
      }
      return jsonResponse(MEM.users.map(publicUser));
    }
    if (path === '/api/admin/user/ban' && method === 'POST') {
      if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
      if (hasDB(env)) await runDB(env, 'UPDATE users SET status=? WHERE id=?', [body.status || 'banned', body.id]);
      else memUpdate('users', body.id, { status: body.status || 'banned' });
      return jsonResponse({ success: true });
    }
    if (path === '/api/admin/user/update' && method === 'POST') {
      if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
      const id = body.id;
      if (!id) return errorResponse('缺少 id');
      if (body.new_id && body.new_id !== id) {
        if (hasDB(env)) {
          const clash = await queryDB(env, 'SELECT id FROM users WHERE id=?', [body.new_id]);
          if (clash.results && clash.results[0]) return errorResponse('新 ID 已存在');
          await runDB(env, 'UPDATE users SET id=? WHERE id=?', [body.new_id, id]);
        } else {
          if (memGet('users', body.new_id)) return errorResponse('新 ID 已存在');
          const u = memGet('users', id);
          if (u) { u.id = body.new_id; }
        }
        return jsonResponse({ success: true, id: body.new_id });
      }
      const patch = {};
      if (body.username != null) patch.username = body.username;
      if (body.password != null && body.password !== '') patch.password = body.password;
      if (body.gender != null) patch.gender = body.gender;
      if (body.role != null) patch.role = body.role;
      if (body.diamond != null) patch.diamond = parseFloat(body.diamond) || 0;
      if (hasDB(env)) {
        if (patch.username != null) await runDB(env, 'UPDATE users SET username=? WHERE id=?', [patch.username, id]);
        if (patch.password != null) await runDB(env, 'UPDATE users SET password=? WHERE id=?', [patch.password, id]);
        if (patch.gender != null) await runDB(env, 'UPDATE users SET gender=? WHERE id=?', [patch.gender, id]);
        if (patch.role != null) await runDB(env, 'UPDATE users SET role=? WHERE id=?', [patch.role, id]);
        if (patch.diamond != null) await runDB(env, 'UPDATE users SET diamond=? WHERE id=?', [patch.diamond, id]);
      } else memUpdate('users', id, patch);
      return jsonResponse({ success: true });
    }
    if (path === '/api/admin/user/delete' && method === 'POST') {
      if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
      if (body.id === '000000') return errorResponse('不能删除默认管理员');
      if (hasDB(env)) await runDB(env, 'DELETE FROM users WHERE id=?', [body.id]);
      else memDelete('users', body.id);
      return jsonResponse({ success: true });
    }

    // ===== 管理：派单 =====
    if (path === '/api/admin/dispatch' && method === 'GET') {
      if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
      if (hasDB(env)) {
        const r = await queryDB(env, 'SELECT * FROM dispatch_orders ORDER BY created_at DESC LIMIT 100');
        return jsonResponse(r.results || []);
      }
      return jsonResponse([...(MEM.dispatch_orders)].reverse());
    }
    if (path === '/api/admin/dispatch' && method === 'POST') {
      if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
      const uid = verifyUserId(auth);
      const id = generateId(), now = new Date().toISOString();
      const row = {
        id, title: body.title || '', game_category: body.game_category || '',
        price: parseFloat(body.price) || 0, quantity: parseInt(body.quantity, 10) || 1,
        urgency: body.urgency || '普通', detail: body.detail || '', remark: body.remark || '',
        contact: body.contact || '', status: 'open', publisher_id: uid || '', created_at: now
      };
      if (hasDB(env)) {
        await runDB(env, `INSERT INTO dispatch_orders (id,title,game_category,price,quantity,urgency,detail,remark,contact,status,publisher_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [row.id, row.title, row.game_category, row.price, row.quantity, row.urgency, row.detail, row.remark, row.contact, row.status, row.publisher_id, now]);
      } else memInsert('dispatch_orders', row);
      return jsonResponse({ success: true, id });
    }
    if (path === '/api/admin/dispatch/templates' && method === 'GET') {
      if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
      if (hasDB(env)) {
        const r = await queryDB(env, 'SELECT * FROM dispatch_templates ORDER BY created_at DESC');
        return jsonResponse(r.results || []);
      }
      return jsonResponse([...(MEM.dispatch_templates)].reverse());
    }
    if (path === '/api/admin/dispatch/templates' && method === 'POST') {
      if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
      const id = generateId(), now = new Date().toISOString();
      const row = {
        id, title: body.title || '', game_category: body.game_category || '',
        price: parseFloat(body.price) || 0, quantity: parseInt(body.quantity, 10) || 1,
        urgency: body.urgency || '普通', detail: body.detail || '', remark: body.remark || '',
        contact: body.contact || '', created_at: now
      };
      if (hasDB(env)) {
        await runDB(env, `INSERT INTO dispatch_templates (id,title,game_category,price,quantity,urgency,detail,remark,contact,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [row.id, row.title, row.game_category, row.price, row.quantity, row.urgency, row.detail, row.remark, row.contact, now]);
      } else memInsert('dispatch_templates', row);
      return jsonResponse({ success: true, id });
    }


    // ===== index.html 路径兼容 =====
    if (path === '/api/announce' && method === 'GET') {
      if (hasDB(env)) { const a = await queryDB(env, 'SELECT * FROM announcements WHERE enabled=1 ORDER BY sort_order'); return jsonResponse(a.results || []); }
      return jsonResponse(memAll('announcements', r => r.enabled));
    }
    if (path === '/api/categories' && method === 'GET') {
      if (hasDB(env)) { const r = await queryDB(env, 'SELECT * FROM side_categories WHERE enabled=1 ORDER BY sort_order'); return jsonResponse(r.results || []); }
      return jsonResponse(memAll('side_categories', r => r.enabled));
    }
    if (path === '/api/banners' && method === 'GET') {
      if (hasDB(env)) { const r = await queryDB(env, 'SELECT * FROM banners WHERE enabled=1 ORDER BY sort_order'); return jsonResponse(r.results || []); }
      return jsonResponse(memAll('banners', r => r.enabled));
    }
    if (path === '/api/icons' && method === 'GET') {
      if (hasDB(env)) { const r = await queryDB(env, 'SELECT * FROM icons'); return jsonResponse(r.results || []); }
      return jsonResponse(MEM.icons || []);
    }
    if (path === '/api/shops' && method === 'GET') {
      if (hasDB(env)) { const r = await queryDB(env, 'SELECT * FROM shops ORDER BY created_at DESC'); return jsonResponse(r.results || []); }
      return jsonResponse(MEM.shops || []);
    }
    if (path.startsWith('/api/shops/') && method === 'GET') {
      const parts = path.replace('/api/shops/', '').split('/');
      const shopId = decodeURIComponent(parts[0] || '');
      if (parts[1] === 'products') {
        if (hasDB(env)) { const r = await queryDB(env, "SELECT * FROM products WHERE status='on' LIMIT 50"); return jsonResponse(r.results || []); }
        return jsonResponse(memAll('products', r => r.status === 'on'));
      }
      if (parts[1] === 'categories' || parts[1] === 'handlers' || parts[1] === 'reviews') return jsonResponse([]);
      if (hasDB(env)) {
        const r = await queryDB(env, 'SELECT * FROM shops WHERE id=?', [shopId]);
        const shop = r.results && r.results[0];
        if (!shop) return errorResponse('店铺不存在', 404);
        return jsonResponse(shop);
      }
      const shop = memGet('shops', shopId);
      if (!shop) return errorResponse('店铺不存在', 404);
      return jsonResponse(shop);
    }
    if (path === '/api/posts' && method === 'GET') {
      const userId = url.searchParams.get('user_id') || '';
      if (hasDB(env)) {
        let sql = 'SELECT * FROM posts', params = [];
        if (userId) { sql += ' WHERE user_id=?'; params.push(userId); }
        sql += ' ORDER BY created_at DESC LIMIT 100';
        const r = await queryDB(env, sql, params);
        return jsonResponse(r.results || []);
      }
      let rows = MEM.posts || [];
      if (userId) rows = rows.filter(p => p.user_id === userId);
      return jsonResponse([...rows].reverse());
    }
    if (path === '/api/posts' && method === 'POST') {
      const uid = verifyUserId(auth);
      if (!uid) return errorResponse('请先登录', 401);
      const u = await getUserById(env, uid);
      const id = generateId(), now = new Date().toISOString();
      const row = { id, user_id: uid, username: u ? u.username : '', content: body.content || '', images: JSON.stringify(body.images || []), category_id: body.category_id || '', likes: 0, created_at: now };
      if (hasDB(env)) await runDB(env, 'INSERT INTO posts (id,user_id,username,content,images,category_id,likes,created_at) VALUES (?,?,?,?,?,?,?,?)', [id, uid, row.username, row.content, row.images, row.category_id, 0, now]);
      else memInsert('posts', row);
      return jsonResponse({ success: true, id });
    }
    if (path === '/api/post-categories' && method === 'GET') {
      if (hasDB(env)) { const r = await queryDB(env, 'SELECT * FROM post_categories ORDER BY sort_order'); return jsonResponse(r.results || []); }
      return jsonResponse(MEM.post_categories || []);
    }
    if (path === '/api/gifts' && method === 'GET') {
      if (hasDB(env)) { const r = await queryDB(env, 'SELECT * FROM gifts WHERE enabled=1'); return jsonResponse(r.results || []); }
      return jsonResponse((MEM.gifts || []).filter(g => g.enabled !== 0));
    }
    if (path === '/api/stickers' && method === 'GET') {
      if (hasDB(env)) { const r = await queryDB(env, 'SELECT * FROM stickers WHERE is_public=1'); return jsonResponse(r.results || []); }
      return jsonResponse((MEM.stickers || []).filter(x => x.is_public));
    }
    if (path === '/api/handlers' && method === 'GET') {
      if (hasDB(env)) { const r = await queryDB(env, "SELECT id,username,avatar,diamond,role FROM users WHERE role='handler'"); return jsonResponse(r.results || []); }
      return jsonResponse(memAll('users', u => u.role === 'handler').map(publicUser));
    }
    if (path === '/api/heartbeat' && method === 'GET') return jsonResponse({ ok: true, t: Date.now() });
    if (path === '/api/theme' && method === 'GET') return jsonResponse(MEM.theme || { preset: 'default' });
    if (path === '/api/ai/settings' && method === 'GET') return jsonResponse(MEM.ai_settings || {});
    if (path === '/api/exchange/rules' && method === 'GET') {
      if (hasDB(env)) { const r = await queryDB(env, 'SELECT * FROM exchange_rules'); return jsonResponse(r.results || []); }
      return jsonResponse(MEM.exchange_rules || []);
    }
    if (path === '/api/admin/recharges' && method === 'GET') {
      if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
      if (hasDB(env)) { const r = await queryDB(env, 'SELECT * FROM recharges ORDER BY created_at DESC'); return jsonResponse(r.results || []); }
      return jsonResponse(MEM.recharges || []);
    }
    if (path === '/api/admin/withdrawals' && method === 'GET') {
      if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
      if (hasDB(env)) { const r = await queryDB(env, 'SELECT * FROM withdrawals ORDER BY created_at DESC'); return jsonResponse(r.results || []); }
      return jsonResponse(MEM.withdrawals || []);
    }
    if (path === '/api/admin/announce' && method === 'GET') {
      if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
      if (hasDB(env)) { const r = await queryDB(env, 'SELECT * FROM announcements ORDER BY sort_order'); return jsonResponse(r.results || []); }
      return jsonResponse(MEM.announcements || []);
    }
    if (path === '/api/admin/checkin-rewards' && method === 'GET') {
      if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
      if (hasDB(env)) { const r = await queryDB(env, 'SELECT * FROM checkin_rewards ORDER BY day_index'); return jsonResponse(r.results || []); }
      return jsonResponse(MEM.checkin_rewards || []);
    }
    if (path === '/api/admin/gifts' && method === 'GET') {
      if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
      if (hasDB(env)) { const r = await queryDB(env, 'SELECT * FROM gifts'); return jsonResponse(r.results || []); }
      return jsonResponse(MEM.gifts || []);
    }
    if (path === '/api/admin/stickers' && method === 'GET') {
      if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
      if (hasDB(env)) { const r = await queryDB(env, 'SELECT * FROM stickers'); return jsonResponse(r.results || []); }
      return jsonResponse(MEM.stickers || []);
    }
    if (path === '/api/admin/db/tables' && method === 'GET') {
      if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
      return jsonResponse(['users','products','orders','messages','shops','posts','dispatch_orders','banners','announcements']);
    }
    if (path === '/api/dispatcher/orders' && method === 'GET') {
      if (hasDB(env)) { const r = await queryDB(env, 'SELECT * FROM dispatch_orders ORDER BY created_at DESC LIMIT 100'); return jsonResponse(r.results || []); }
      return jsonResponse([...(MEM.dispatch_orders || [])].reverse());
    }
    if (path === '/api/hall/categories' && method === 'GET') {
      if (hasDB(env)) { const r = await queryDB(env, 'SELECT * FROM hall_categories ORDER BY sort_order'); return jsonResponse(r.results || []); }
      return jsonResponse(MEM.hall_categories || []);
    }
    if (path === '/api/recharge-images' && method === 'GET') return jsonResponse([]);
    if (path === '/api/messages/unread' && method === 'GET') {
      const uid = verifyUserId(auth);
      if (!uid) return jsonResponse({ count: 0 });
      if (hasDB(env)) {
        const r = await queryDB(env, 'SELECT COUNT(*) as c FROM messages WHERE receiver_id=?', [uid]);
        const c = Number((r.results && r.results[0] && r.results[0].c) || 0);
        return jsonResponse({ count: Math.min(c, 99) });
      }
      const c = (MEM.messages || []).filter(m => m.receiver_id === uid).length;
      return jsonResponse({ count: Math.min(c, 99) });
    }



    // ===== 图片上传到 B2 / R2（绑定变量名：BUCKET 或 B2）=====
    if (path === '/api/upload' && method === 'POST') {
      const uid = verifyUserId(auth);
      if (!uid) return errorResponse('请先登录', 401);
      let form;
      try { form = await request.formData(); } catch (_) {
        return errorResponse('请使用 multipart/form-data 上传');
      }
      const file = form.get('file');
      if (!file || typeof file === 'string') return errorResponse('请选择文件 file');
      const bucket = env.BUCKET || env.B2 || env.R2;
      if (!bucket || typeof bucket.put !== 'function') {
        return errorResponse('未绑定图库：Pages 绑定 R2/B2，变量名用 BUCKET 或 B2', 500);
      }
      const rawName = (file.name || 'image.jpg').replace(/[^\w.\-]+/g, '_');
      const key = 'uploads/' + Date.now() + '_' + rawName;
      const contentType = file.type || 'application/octet-stream';
      await bucket.put(key, file.stream(), { httpMetadata: { contentType } });
      const publicBase = (env.B2_PUBLIC_URL || env.R2_PUBLIC_URL || env.PUBLIC_FILE_URL || '').replace(/\/$/, '');
      const url = publicBase ? (publicBase + '/' + key) : key;
      return jsonResponse({ success: true, url, key, contentType });
    }
    if ((path === '/api/user/avatar' || path === '/api/user/banner') && (method === 'POST' || method === 'PUT')) {
      const uid = verifyUserId(auth);
      if (!uid) return errorResponse('请先登录', 401);
      const field = path.endsWith('banner') ? 'banner' : 'avatar';
      const val = body.avatar_url || body.avatar || body.banner || body.url || '';
      if (hasDB(env)) {
        await runDB(env, 'UPDATE users SET ' + field + '=? WHERE id=?', [val, uid]);
      } else {
        const patch = {}; patch[field] = val;
        memUpdate('users', uid, patch);
      }
      return jsonResponse({ success: true });
    }
    if (path === '/api/admin/b2/list' && method === 'GET') {
      if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
      const bucket = env.BUCKET || env.B2 || env.R2;
      if (!bucket || typeof bucket.list !== 'function') return jsonResponse([]);
      try {
        const listed = await bucket.list({ limit: 100, prefix: 'uploads/' });
        const base = (env.B2_PUBLIC_URL || env.R2_PUBLIC_URL || env.PUBLIC_FILE_URL || '').replace(/\/$/, '');
        const objects = (listed.objects || []).map(o => ({
          key: o.key, size: o.size, uploaded: o.uploaded,
          url: base ? (base + '/' + o.key) : o.key
        }));
        return jsonResponse(objects);
      } catch (e) {
        return errorResponse('图库列表失败: ' + (e && e.message ? e.message : e), 500);
      }
    }



    // ===== 管理端完整 CRUD（对齐 Web 控制台）=====
    if (path === '/api/admin/deduct' && method === 'POST') {
      if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
      const uid = String(body.user_id || body.id || '');
      const amount = parseFloat(body.amount) || 0;
      if (!uid || amount <= 0) return errorResponse('参数错误');
      const u = await getUserById(env, uid);
      if (!u) return errorResponse('用户不存在', 404);
      const cur = parseFloat(u.diamond) || 0;
      if (amount > cur) return errorResponse('超过余额');
      const next = cur - amount;
      if (hasDB(env)) await runDB(env, 'UPDATE users SET diamond=? WHERE id=?', [next, uid]);
      else memUpdate('users', uid, { diamond: next });
      return jsonResponse({ success: true, diamond: next });
    }
    if (path.startsWith('/api/admin/recharges/') && method === 'POST') {
      if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
      const parts = path.replace('/api/admin/recharges/', '').split('/');
      const id = parts[0];
      const action = parts[1] || body.action || '';
      if (hasDB(env)) {
        const r = await queryDB(env, 'SELECT * FROM recharges WHERE id=?', [id]);
        const row = r.results && r.results[0];
        if (!row) return errorResponse('记录不存在', 404);
        if (action === 'approve') {
          await runDB(env, "UPDATE recharges SET status='approved' WHERE id=?", [id]);
          const u = await getUserById(env, row.user_id);
          if (u) {
            const d = (parseFloat(u.diamond)||0) + (parseFloat(row.amount)||0);
            await runDB(env, 'UPDATE users SET diamond=? WHERE id=?', [d, row.user_id]);
          }
        } else if (action === 'reject') {
          await runDB(env, "UPDATE recharges SET status='rejected' WHERE id=?", [id]);
        } else if (action === 'delete') {
          await runDB(env, 'DELETE FROM recharges WHERE id=?', [id]);
        }
      } else {
        const row = memGet('recharges', id);
        if (!row) return errorResponse('记录不存在', 404);
        if (action === 'approve') {
          memUpdate('recharges', id, { status: 'approved' });
          const u = memGet('users', row.user_id);
          if (u) memUpdate('users', row.user_id, { diamond: (parseFloat(u.diamond)||0) + (parseFloat(row.amount)||0) });
        } else if (action === 'reject') memUpdate('recharges', id, { status: 'rejected' });
        else if (action === 'delete') memDelete('recharges', id);
      }
      return jsonResponse({ success: true });
    }
    if (path === '/api/admin/banners' && method === 'POST') {
      if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
      const id = generateId(), now = new Date().toISOString();
      const row = { id, title: body.title || '', image: body.image || body.url || '', sort_order: parseInt(body.sort_order,10)||0, enabled: 1, created_at: now };
      if (hasDB(env)) await runDB(env, 'INSERT INTO banners (id,title,image,sort_order,enabled,created_at) VALUES (?,?,?,?,?,?)', [id, row.title, row.image, row.sort_order, 1, now]);
      else memInsert('banners', row);
      return jsonResponse({ success: true, id });
    }
    if (path.startsWith('/api/admin/banners/') && (method === 'DELETE' || method === 'POST')) {
      if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
      const id = path.replace('/api/admin/banners/', '').split('/')[0];
      if (hasDB(env)) await runDB(env, 'DELETE FROM banners WHERE id=?', [id]);
      else memDelete('banners', id);
      return jsonResponse({ success: true });
    }
    if (path === '/api/admin/icons' && method === 'POST') {
      if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
      const key_name = body.key_name || body.key || '';
      const url = body.url || '';
      if (!key_name) return errorResponse('缺少 key_name');
      const id = key_name;
      if (hasDB(env)) {
        await runDB(env, 'DELETE FROM icons WHERE key_name=?', [key_name]);
        await runDB(env, 'INSERT INTO icons (id,key_name,url) VALUES (?,?,?)', [id, key_name, url]);
      } else {
        MEM.icons = (MEM.icons || []).filter(x => x.key_name !== key_name);
        memInsert('icons', { id, key_name, url });
      }
      return jsonResponse({ success: true });
    }
    if (path.startsWith('/api/admin/icons/') && (method === 'DELETE' || method === 'POST')) {
      if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
      const key = decodeURIComponent(path.replace('/api/admin/icons/', '').split('/')[0]);
      if (hasDB(env)) await runDB(env, 'DELETE FROM icons WHERE key_name=? OR id=?', [key, key]);
      else MEM.icons = (MEM.icons || []).filter(x => x.key_name !== key && x.id !== key);
      return jsonResponse({ success: true });
    }
    if (path === '/api/admin/gifts' && method === 'POST') {
      if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
      const id = generateId();
      const row = { id, name: body.name || '', price: parseFloat(body.price)||0, image: body.image || body.url || '', enabled: 1 };
      if (hasDB(env)) await runDB(env, 'INSERT INTO gifts (id,name,price,image,enabled) VALUES (?,?,?,?,1)', [id, row.name, row.price, row.image]);
      else memInsert('gifts', row);
      return jsonResponse({ success: true, id });
    }
    if (path.startsWith('/api/admin/gifts/') && (method === 'DELETE' || method === 'POST')) {
      if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
      const id = path.replace('/api/admin/gifts/', '').split('/')[0];
      if (hasDB(env)) await runDB(env, 'DELETE FROM gifts WHERE id=?', [id]);
      else memDelete('gifts', id);
      return jsonResponse({ success: true });
    }
    if (path === '/api/ai/settings' && method === 'POST') {
      if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
      MEM.ai_settings = {
        enabled: !!body.enabled,
        model: body.model || '',
        knowledge: body.knowledge || '',
        ...(body || {})
      };
      return jsonResponse({ success: true, settings: MEM.ai_settings });
    }
    if (path === '/api/auto-replies' && method === 'GET') {
      return jsonResponse(MEM.auto_replies || []);
    }
    if (path === '/api/auto-replies' && method === 'POST') {
      if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
      const id = generateId();
      const row = { id, keywords: body.keywords || '', reply: body.reply || body.content || '' };
      if (!MEM.auto_replies) MEM.auto_replies = [];
      MEM.auto_replies.push(row);
      return jsonResponse({ success: true, id });
    }
    if (path.startsWith('/api/auto-replies/') && (method === 'DELETE' || method === 'POST')) {
      if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
      const id = path.replace('/api/auto-replies/', '').split('/')[0];
      MEM.auto_replies = (MEM.auto_replies || []).filter(x => x.id !== id);
      return jsonResponse({ success: true });
    }
    if (path === '/api/admin/stickers' && method === 'POST') {
      if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
      const id = generateId(), now = new Date().toISOString();
      const row = { id, name: body.name || 'sticker', url: body.url || '', is_public: 1, created_at: now };
      if (hasDB(env)) await runDB(env, 'INSERT INTO stickers (id,name,url,is_public,created_at) VALUES (?,?,?,1,?)', [id, row.name, row.url, now]);
      else memInsert('stickers', row);
      return jsonResponse({ success: true, id });
    }
    if (path.startsWith('/api/admin/stickers/') && (method === 'DELETE' || method === 'POST')) {
      if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
      const id = path.replace('/api/admin/stickers/', '').split('/')[0];
      if (hasDB(env)) await runDB(env, 'DELETE FROM stickers WHERE id=?', [id]);
      else memDelete('stickers', id);
      return jsonResponse({ success: true });
    }
    if (path === '/api/admin/checkin-rewards' && method === 'POST') {
      if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
      const day_index = parseInt(body.day_index || body.day, 10) || 1;
      const id = 'day_' + day_index;
      const row = { id, day_index, reward: body.reward || body.name || '金币', amount: parseFloat(body.amount)||10, sort_order: parseInt(body.sort_order,10)||0, enabled: body.enabled !== false && body.enabled !== 0 ? 1 : 0 };
      if (hasDB(env)) {
        await runDB(env, 'DELETE FROM checkin_rewards WHERE day_index=?', [day_index]);
        await runDB(env, 'INSERT INTO checkin_rewards (id,day_index,reward,amount) VALUES (?,?,?,?)', [id, day_index, row.reward, row.amount]);
      } else {
        MEM.checkin_rewards = (MEM.checkin_rewards || []).filter(x => x.day_index !== day_index);
        memInsert('checkin_rewards', row);
      }
      return jsonResponse({ success: true, id });
    }
    if (path.startsWith('/api/admin/checkin-rewards/') && (method === 'DELETE' || method === 'POST')) {
      if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
      const id = path.replace('/api/admin/checkin-rewards/', '').split('/')[0];
      if (hasDB(env)) await runDB(env, 'DELETE FROM checkin_rewards WHERE id=? OR day_index=?', [id, parseInt(id,10)||0]);
      else MEM.checkin_rewards = (MEM.checkin_rewards || []).filter(x => x.id !== id && String(x.day_index) !== id);
      return jsonResponse({ success: true });
    }
    if (path === '/api/admin/exchange-rules' && method === 'POST') {
      if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
      const id = generateId();
      const row = { id, name: body.name || '', cost: parseInt(body.cost,10)||0, reward: body.reward || body.desc || body.description || '' };
      if (hasDB(env)) await runDB(env, 'INSERT INTO exchange_rules (id,name,cost,reward) VALUES (?,?,?,?)', [id, row.name, row.cost, row.reward]);
      else memInsert('exchange_rules', row);
      return jsonResponse({ success: true, id });
    }
    if (path.startsWith('/api/admin/exchange-rules/') && (method === 'DELETE' || method === 'POST')) {
      if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
      const id = path.replace('/api/admin/exchange-rules/', '').split('/')[0];
      if (hasDB(env)) await runDB(env, 'DELETE FROM exchange_rules WHERE id=?', [id]);
      else memDelete('exchange_rules', id);
      return jsonResponse({ success: true });
    }
    if (path === '/api/post-categories' && method === 'POST') {
      if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
      const id = generateId();
      const row = { id, name: body.name || '', sort_order: parseInt(body.sort_order,10)||0 };
      if (hasDB(env)) await runDB(env, 'INSERT INTO post_categories (id,name,sort_order) VALUES (?,?,?)', [id, row.name, row.sort_order]);
      else memInsert('post_categories', row);
      return jsonResponse({ success: true, id });
    }
    if (path.startsWith('/api/post-categories/') && (method === 'DELETE' || method === 'POST')) {
      if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
      const id = path.replace('/api/post-categories/', '').split('/')[0];
      if (hasDB(env)) await runDB(env, 'DELETE FROM post_categories WHERE id=?', [id]);
      else memDelete('post_categories', id);
      return jsonResponse({ success: true });
    }
    if (path.startsWith('/api/posts/') && method === 'DELETE') {
      const uid = verifyUserId(auth);
      if (!uid) return errorResponse('请先登录', 401);
      const id = path.replace('/api/posts/', '').split('/')[0];
      const isAdmin = await requireAdmin(env, auth);
      if (hasDB(env)) {
        const r = await queryDB(env, 'SELECT * FROM posts WHERE id=?', [id]);
        const post = r.results && r.results[0];
        if (!post) return errorResponse('不存在', 404);
        if (!isAdmin && post.user_id !== uid) return errorResponse('无权删除', 403);
        await runDB(env, 'DELETE FROM posts WHERE id=?', [id]);
      } else {
        const post = memGet('posts', id);
        if (!post) return errorResponse('不存在', 404);
        if (!isAdmin && post.user_id !== uid) return errorResponse('无权删除', 403);
        memDelete('posts', id);
      }
      return jsonResponse({ success: true });
    }
    if (path === '/api/hall/publish-demand' && method === 'POST') {
      const uid = verifyUserId(auth);
      if (!uid) return errorResponse('请先登录', 401);
      const u = await getUserById(env, uid);
      const id = generateId(), now = new Date().toISOString();
      const row = {
        id, title: body.title || '', game_category: body.game_category || body.category || '',
        price: parseFloat(body.price)||0, quantity: 1, urgency: body.urgency || '普通',
        detail: body.detail || body.desc || '', remark: body.remark || '', contact: body.contact || '',
        status: 'open', publisher_id: uid, publisher_name: u ? u.username : '', created_at: now
      };
      if (hasDB(env)) {
        await runDB(env, `INSERT INTO dispatch_orders (id,title,game_category,price,quantity,urgency,detail,remark,contact,status,publisher_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [id, row.title, row.game_category, row.price, 1, row.urgency, row.detail, row.remark, row.contact, 'open', uid, now]);
      } else memInsert('dispatch_orders', row);
      return jsonResponse({ success: true, id });
    }
    if (path.startsWith('/api/hall/orders/') && method === 'POST') {
      const uid = verifyUserId(auth);
      if (!uid) return errorResponse('请先登录', 401);
      const parts = path.replace('/api/hall/orders/', '').split('/');
      const id = parts[0];
      const action = parts[1] || body.action || '';
      if (action === 'cancel') {
        if (hasDB(env)) {
          const r = await queryDB(env, 'SELECT * FROM dispatch_orders WHERE id=?', [id]);
          const row = r.results && r.results[0];
          if (!row) return errorResponse('不存在', 404);
          const isAdmin = await requireAdmin(env, auth);
          if (!isAdmin && row.publisher_id !== uid) return errorResponse('无权撤销', 403);
          await runDB(env, "UPDATE dispatch_orders SET status='cancelled' WHERE id=?", [id]);
        } else {
          const row = memGet('dispatch_orders', id);
          if (!row) return errorResponse('不存在', 404);
          const isAdmin = await requireAdmin(env, auth);
          if (!isAdmin && row.publisher_id !== uid) return errorResponse('无权撤销', 403);
          memUpdate('dispatch_orders', id, { status: 'cancelled' });
        }
        return jsonResponse({ success: true });
      }
      return errorResponse('未知操作');
    }
    if (path === '/api/hall/orders' && method === 'GET') {
      const cat = url.searchParams.get('cat') || '';
      if (hasDB(env)) {
        let sql = "SELECT * FROM dispatch_orders WHERE status!='cancelled'";
        const params = [];
        if (cat) { sql += ' AND game_category=?'; params.push(cat); }
        sql += ' ORDER BY created_at DESC LIMIT 100';
        const r = await queryDB(env, sql, params);
        return jsonResponse(r.results || []);
      }
      let rows = (MEM.dispatch_orders || []).filter(o => o.status !== 'cancelled');
      if (cat) rows = rows.filter(o => o.game_category === cat);
      return jsonResponse([...rows].reverse());
    }


    return errorResponse('接口不存在: ' + path, 404);
  } catch (e) {
    return errorResponse((e && e.message) ? e.message : '服务器错误', 500);
  }
}
