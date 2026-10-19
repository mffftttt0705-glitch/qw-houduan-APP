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
  dispatch_orders: [], dispatch_templates: [], seeded: false
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
      const allowed = ['boss', 'handler', 'dispatcher', 'cs'];
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
    if (path === '/api/hall/orders' && method === 'GET') {
      if (hasDB(env)) {
        const r = await queryDB(env, 'SELECT * FROM dispatch_orders WHERE status=\'open\' ORDER BY created_at DESC LIMIT 50');
        return jsonResponse(r.results || []);
      }
      return jsonResponse(memAll('dispatch_orders', r => r.status === 'open').reverse().slice(0, 50));
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

    return errorResponse('接口不存在: ' + path, 404);
  } catch (e) {
    return errorResponse((e && e.message) ? e.message : '服务器错误', 500);
  }
}
