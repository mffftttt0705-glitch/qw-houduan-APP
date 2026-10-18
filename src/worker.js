/**
 * QW 电竞 API - Cloudflare Workers 单文件版
 * ------------------------------------------------
 * 部署方式（控制台「上传并部署」）：
 * 1. 上传本文件 worker.js
 * 2. 点击「部署」
 * 3. （推荐）Workers 设置 → 绑定 → 添加 D1 数据库，变量名必须是：DB
 *
 * 未绑定 D1 时使用内存模式（重启后数据会丢，仅方便调试）
 * 绑定 D1 后自动持久化。
 *
 * 默认管理员：admin / admin123
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

/* ========== 内存存储（无 D1 时） ========== */
const MEM = {
  users: [],
  side_categories: [],
  sub_categories: [],
  products: [],
  home_tabs: [],
  announcements: [],
  banners: [],
  quick_links: [],
  home_sections: [],
  orders: [],
  messages: [],
  checkin_records: [],
  rank_items: [],
  seeded: false
};

function memAll(table, filterFn) {
  let rows = MEM[table] || [];
  if (filterFn) rows = rows.filter(filterFn);
  return rows;
}
function memGet(table, id) {
  return (MEM[table] || []).find(r => r.id === id) || null;
}
function memInsert(table, row) {
  if (!MEM[table]) MEM[table] = [];
  MEM[table].push(row);
  return row;
}
function memUpdate(table, id, patch) {
  const list = MEM[table] || [];
  const i = list.findIndex(r => r.id === id);
  if (i < 0) return null;
  list[i] = { ...list[i], ...patch };
  return list[i];
}
function memDelete(table, id) {
  MEM[table] = (MEM[table] || []).filter(r => r.id !== id);
}

/* ========== D1 封装 ========== */
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
function hasDB(env) {
  return !!(env && env.DB);
}

/* ========== 初始化 ========== */
async function ensureSchema(env) {
  if (hasDB(env)) {
    await runDB(env, `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT UNIQUE, password TEXT, role TEXT DEFAULT 'boss',
      diamond REAL DEFAULT 0, coin REAL DEFAULT 0, bio TEXT, gender TEXT, avatar TEXT, banner TEXT,
      status TEXT DEFAULT 'active', created_at TEXT)`);
    await runDB(env, `CREATE TABLE IF NOT EXISTS side_categories (
      id TEXT PRIMARY KEY, name TEXT, sort_order INTEGER DEFAULT 0, enabled INTEGER DEFAULT 1, created_at TEXT)`);
    await runDB(env, `CREATE TABLE IF NOT EXISTS sub_categories (
      id TEXT PRIMARY KEY, side_id TEXT, name TEXT, icon TEXT, sort_order INTEGER DEFAULT 0, enabled INTEGER DEFAULT 1, created_at TEXT)`);
    await runDB(env, `CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY, title TEXT, description TEXT, price REAL DEFAULT 0, image TEXT,
      category_id TEXT, side_id TEXT, tag TEXT, sold_count INTEGER DEFAULT 0,
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

    const sc = await queryDB(env, 'SELECT COUNT(*) as c FROM side_categories');
    if (!(sc.results && sc.results[0] && sc.results[0].c > 0)) {
      await seedDB(env);
    }
  } else if (!MEM.seeded) {
    seedMem();
    MEM.seeded = true;
  }
}

async function seedDB(env) {
  const now = new Date().toISOString();
  const side1 = 'side_delta', side2 = 'side_report';
  await runDB(env, 'INSERT INTO side_categories (id,name,sort_order,enabled,created_at) VALUES (?,?,?,?,?)', [side1, '三角洲行动', 0, 1, now]);
  await runDB(env, 'INSERT INTO side_categories (id,name,sort_order,enabled,created_at) VALUES (?,?,?,?,?)', [side2, '举报投诉', 1, 1, now]);
  const subs = [
    [side1, '特惠体验单'], [side1, '护航专区'], [side1, '绝密对赌单'],
    [side1, '大红专区'], [side1, '趣味单'], [side1, '技术陪'],
    [side1, '娱乐陪'], [side1, '核电站'], [side1, '首页新赛季'],
    [side1, '新暗星燃料'], [side1, '清图单'],
    [side2, '我要投诉'], [side2, '举报有奖'], [side2, '陪陪考核']
  ];
  for (let i = 0; i < subs.length; i++) {
    await runDB(env, 'INSERT INTO sub_categories (id,side_id,name,icon,sort_order,enabled,created_at) VALUES (?,?,?,?,?,?,?)',
      [generateId(), subs[i][0], subs[i][1], '', i, 1, now]);
  }
  await runDB(env, 'INSERT INTO home_tabs (id,name,sort_order,enabled) VALUES (?,?,?,?)', ['tab_home', '首页', 0, 1]);
  await runDB(env, 'INSERT INTO home_tabs (id,name,sort_order,enabled) VALUES (?,?,?,?)', ['tab_delta', '三角洲行动', 1, 1]);
  await runDB(env, 'INSERT INTO announcements (id,content,enabled,sort_order,created_at) VALUES (?,?,?,?,?)',
    [generateId(), '板板！游端、手游都有-直接下单马上安排', 1, 0, now]);
  await runDB(env, 'INSERT INTO banners (id,image,link,title,enabled,sort_order) VALUES (?,?,?,?,?,?)',
    [generateId(), '', '', '首页广告图', 1, 0]);
  const links = [['人工客服', 'users', 'cs'], ['下单流程', 'orders', 'guide'], ['积分签到', 'refresh', 'checkin'], ['积分抽奖', 'gifts', 'lottery']];
  for (let i = 0; i < links.length; i++) {
    await runDB(env, 'INSERT INTO quick_links (id,name,icon,action,sort_order,enabled) VALUES (?,?,?,?,?,?)',
      [generateId(), links[i][0], links[i][1], links[i][2], i, 1]);
  }
  await runDB(env, 'INSERT INTO home_sections (id,name,sort_order,enabled) VALUES (?,?,?,?)', ['sec_delta', '三角洲行动', 0, 1]);
  const sample = [
    ['新用户体验单/绝密888W(限购一单)/端游', 188, '三角洲行动', 3489],
    ['新用户体验单/机密/388w（限购一单）', 103, '三角洲行动', 1972],
    ['护航专区·全图清剿', 68, '三角洲行动', 520],
    ['技术陪·上分套餐', 128, '三角洲行动', 301]
  ];
  for (let i = 0; i < sample.length; i++) {
    await runDB(env, `INSERT INTO products (id,title,description,price,image,category_id,side_id,tag,sold_count,status,sort_order,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [generateId(), sample[i][0], sample[i][0], sample[i][1], '', '', side1, sample[i][2], sample[i][3], 'on', i, now]);
  }
  await runDB(env, 'INSERT OR IGNORE INTO users (id,username,password,role,diamond,status,created_at) VALUES (?,?,?,?,?,?,?)',
    ['000001', 'admin', 'admin123', 'admin', 0, 'active', now]);
}

function seedMem() {
  const now = new Date().toISOString();
  const side1 = 'side_delta', side2 = 'side_report';
  MEM.side_categories = [
    { id: side1, name: '三角洲行动', sort_order: 0, enabled: 1, created_at: now },
    { id: side2, name: '举报投诉', sort_order: 1, enabled: 1, created_at: now }
  ];
  const subNames = [
    [side1, '特惠体验单'], [side1, '护航专区'], [side1, '绝密对赌单'],
    [side1, '大红专区'], [side1, '趣味单'], [side1, '技术陪'],
    [side1, '娱乐陪'], [side1, '核电站'], [side1, '首页新赛季'],
    [side1, '新暗星燃料'], [side1, '清图单'],
    [side2, '我要投诉'], [side2, '举报有奖'], [side2, '陪陪考核']
  ];
  MEM.sub_categories = subNames.map((s, i) => ({
    id: 'sub_' + i, side_id: s[0], name: s[1], icon: '', sort_order: i, enabled: 1, created_at: now
  }));
  MEM.home_tabs = [
    { id: 'tab_home', name: '首页', sort_order: 0, enabled: 1 },
    { id: 'tab_delta', name: '三角洲行动', sort_order: 1, enabled: 1 }
  ];
  MEM.announcements = [{ id: 'ann1', content: '板板！游端、手游都有-直接下单马上安排', enabled: 1, sort_order: 0, created_at: now }];
  MEM.banners = [{ id: 'ban1', image: '', link: '', title: '首页广告图', enabled: 1, sort_order: 0 }];
  MEM.quick_links = [
    { id: 'ql1', name: '人工客服', icon: 'users', action: 'cs', sort_order: 0, enabled: 1 },
    { id: 'ql2', name: '下单流程', icon: 'orders', action: 'guide', sort_order: 1, enabled: 1 },
    { id: 'ql3', name: '积分签到', icon: 'refresh', action: 'checkin', sort_order: 2, enabled: 1 },
    { id: 'ql4', name: '积分抽奖', icon: 'gifts', action: 'lottery', sort_order: 3, enabled: 1 }
  ];
  MEM.home_sections = [{ id: 'sec_delta', name: '三角洲行动', sort_order: 0, enabled: 1 }];
  const sample = [
    ['新用户体验单/绝密888W(限购一单)/端游', 188, 3489],
    ['新用户体验单/机密/388w（限购一单）', 103, 1972],
    ['护航专区·全图清剿', 68, 520],
    ['技术陪·上分套餐', 128, 301]
  ];
  MEM.products = sample.map((s, i) => ({
    id: 'p' + i, title: s[0], description: s[0], price: s[1], image: '',
    category_id: '', side_id: side1, tag: '三角洲行动', sold_count: s[2],
    status: 'on', sort_order: i, created_at: now
  }));
  MEM.users = [{
    id: '000001', username: 'admin', password: 'admin123', role: 'admin',
    diamond: 0, coin: 0, bio: '', gender: '', avatar: '', banner: '',
    status: 'active', created_at: now
  }];
  MEM.orders = [];
  MEM.messages = [];
  MEM.checkin_records = [];
  MEM.rank_items = [];
}

/* ========== 用户 ========== */
function verifyUserId(authHeader) {
  if (!authHeader) return null;
  const raw = String(authHeader).replace(/^Bearer\s+/i, '');
  const parts = raw.split('.');
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

async function handleRegister(env, body) {
  const username = (body.username || '').trim();
  const password = body.password || '';
  const role = body.role === 'handler' ? 'handler' : 'boss';
  if (!username || !password) return errorResponse('请填写用户名和密码');
  if (hasDB(env)) {
    const exists = await queryDB(env, 'SELECT id FROM users WHERE username = ?', [username]);
    if (exists.results && exists.results[0]) return errorResponse('用户名已存在');
    const id = String(Math.floor(10 + Math.random() * 99990)).padStart(6, '0');
    const now = new Date().toISOString();
    await runDB(env, 'INSERT INTO users (id,username,password,role,status,created_at) VALUES (?,?,?,?,?,?)',
      [id, username, password, role, 'active', now]);
    return jsonResponse({ message: '注册成功', user: { id, username, role } });
  }
  if (MEM.users.find(u => u.username === username)) return errorResponse('用户名已存在');
  const id = String(Math.floor(10 + Math.random() * 99990)).padStart(6, '0');
  const user = { id, username, password, role, diamond: 0, coin: 0, bio: '', gender: '', avatar: '', banner: '', status: 'active', created_at: new Date().toISOString() };
  memInsert('users', user);
  return jsonResponse({ message: '注册成功', user: publicUser(user) });
}

async function handleLogin(env, body) {
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

async function handleMe(env, auth) {
  const uid = verifyUserId(auth);
  if (!uid) return errorResponse('请先登录', 401);
  const user = await getUserById(env, uid);
  if (!user) return errorResponse('用户不存在', 404);
  return jsonResponse(publicUser(user));
}

/* ========== 首页 / 分类 / 商品 ========== */
async function handleHome(env) {
  if (hasDB(env)) {
    const tabs = await queryDB(env, 'SELECT * FROM home_tabs WHERE enabled=1 ORDER BY sort_order ASC');
    const announce = await queryDB(env, 'SELECT * FROM announcements WHERE enabled=1 ORDER BY sort_order ASC LIMIT 10');
    const banners = await queryDB(env, 'SELECT * FROM banners WHERE enabled=1 ORDER BY sort_order ASC');
    const links = await queryDB(env, 'SELECT * FROM quick_links WHERE enabled=1 ORDER BY sort_order ASC');
    const sections = await queryDB(env, 'SELECT * FROM home_sections WHERE enabled=1 ORDER BY sort_order ASC');
    const products = await queryDB(env, `SELECT * FROM products WHERE status='on' ORDER BY sort_order ASC, created_at DESC LIMIT 40`);
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

async function handleSideCategories(env) {
  if (hasDB(env)) {
    const r = await queryDB(env, 'SELECT * FROM side_categories WHERE enabled=1 ORDER BY sort_order ASC');
    return jsonResponse(r.results || []);
  }
  return jsonResponse(memAll('side_categories', r => r.enabled).sort((a, b) => a.sort_order - b.sort_order));
}

async function handleSubCategories(env, sideId) {
  if (hasDB(env)) {
    const r = await queryDB(env, 'SELECT * FROM sub_categories WHERE side_id=? AND enabled=1 ORDER BY sort_order ASC', [sideId]);
    return jsonResponse(r.results || []);
  }
  return jsonResponse(memAll('sub_categories', r => r.side_id === sideId && r.enabled).sort((a, b) => a.sort_order - b.sort_order));
}

async function handleProducts(env, url) {
  const sideId = url.searchParams.get('side_id') || '';
  const categoryId = url.searchParams.get('category_id') || '';
  const q = (url.searchParams.get('q') || '').trim();
  if (hasDB(env)) {
    let sql = `SELECT * FROM products WHERE status='on'`;
    const params = [];
    if (sideId) { sql += ' AND side_id=?'; params.push(sideId); }
    if (categoryId) { sql += ' AND category_id=?'; params.push(categoryId); }
    if (q) { sql += ' AND (title LIKE ? OR description LIKE ?)'; params.push('%' + q + '%', '%' + q + '%'); }
    sql += ' ORDER BY sort_order ASC, created_at DESC LIMIT 100';
    const r = await queryDB(env, sql, params);
    return jsonResponse(r.results || []);
  }
  let rows = memAll('products', r => r.status === 'on');
  if (sideId) rows = rows.filter(r => r.side_id === sideId);
  if (categoryId) rows = rows.filter(r => r.category_id === categoryId);
  if (q) rows = rows.filter(r => (r.title || '').includes(q) || (r.description || '').includes(q));
  return jsonResponse(rows);
}

async function handleProductDetail(env, id) {
  if (hasDB(env)) {
    const r = await queryDB(env, 'SELECT * FROM products WHERE id=?', [id]);
    const p = r.results && r.results[0];
    if (!p) return errorResponse('商品不存在', 404);
    return jsonResponse(p);
  }
  const p = memGet('products', id);
  if (!p) return errorResponse('商品不存在', 404);
  return jsonResponse(p);
}

async function handleRank(env) {
  if (hasDB(env)) {
    const r = await queryDB(env, 'SELECT * FROM rank_items ORDER BY score DESC LIMIT 50');
    if (r.results && r.results.length) return jsonResponse(r.results);
    const u = await queryDB(env, `SELECT id,username,avatar,diamond as score FROM users WHERE role='handler' ORDER BY diamond DESC LIMIT 30`);
    return jsonResponse(u.results || []);
  }
  return jsonResponse(MEM.rank_items.length ? MEM.rank_items : []);
}

/* ========== 订单 ========== */
async function handleHallOrders(env) {
  if (hasDB(env)) {
    const r = await queryDB(env, 'SELECT * FROM orders ORDER BY created_at DESC LIMIT 50');
    return jsonResponse(r.results || []);
  }
  return jsonResponse([...(MEM.orders)].reverse().slice(0, 50));
}

async function handleCreateOrder(env, auth, body) {
  const uid = verifyUserId(auth);
  if (!uid) return errorResponse('请先登录', 401);
  const productId = body.product_id || '';
  let title = body.title || '自定义订单';
  let price = parseFloat(body.price) || 0;
  if (productId) {
    if (hasDB(env)) {
      const p = await queryDB(env, 'SELECT * FROM products WHERE id=?', [productId]);
      const prod = p.results && p.results[0];
      if (prod) { title = prod.title; price = prod.price; }
      await runDB(env, 'UPDATE products SET sold_count = COALESCE(sold_count,0)+1 WHERE id=?', [productId]);
    } else {
      const prod = memGet('products', productId);
      if (prod) { title = prod.title; price = prod.price; prod.sold_count = (prod.sold_count || 0) + 1; }
    }
  }
  const id = generateId();
  const now = new Date().toISOString();
  const row = { id, user_id: uid, product_id: productId, title, price, status: 'pending', contact: body.contact || '', remark: body.remark || '', created_at: now };
  if (hasDB(env)) {
    await runDB(env, `INSERT INTO orders (id,user_id,product_id,title,price,status,contact,remark,created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, uid, productId, title, price, 'pending', row.contact, row.remark, now]);
  } else {
    memInsert('orders', row);
  }
  return jsonResponse({ success: true, order_id: id, message: '下单成功' });
}

async function handleMyOrders(env, auth) {
  const uid = verifyUserId(auth);
  if (!uid) return errorResponse('请先登录', 401);
  if (hasDB(env)) {
    const r = await queryDB(env, 'SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC', [uid]);
    return jsonResponse(r.results || []);
  }
  return jsonResponse(memAll('orders', r => r.user_id === uid).reverse());
}

/* ========== 消息 ========== */
async function handleContacts(env, auth) {
  const uid = verifyUserId(auth);
  if (!uid) return errorResponse('请先登录', 401);
  const list = [{ id: 'cs_bot', user_id: 'cs_bot', username: '人工客服', last_message: '有问题点这里咨询' }];
  if (hasDB(env)) {
    const r = await queryDB(env, `
      SELECT DISTINCT CASE WHEN sender_id=? THEN receiver_id ELSE sender_id END as user_id
      FROM messages WHERE sender_id=? OR receiver_id=?`, [uid, uid, uid]);
    for (const row of (r.results || [])) {
      if (row.user_id === 'cs_bot') continue;
      const u = await getUserById(env, row.user_id);
      const last = await queryDB(env, `SELECT content FROM messages WHERE
        (sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?) ORDER BY created_at DESC LIMIT 1`,
        [uid, row.user_id, row.user_id, uid]);
      list.push({
        id: row.user_id, user_id: row.user_id,
        username: u ? u.username : row.user_id,
        last_message: (last.results && last.results[0] && last.results[0].content) || ''
      });
    }
  } else {
    const ids = new Set();
    for (const m of MEM.messages) {
      if (m.sender_id === uid) ids.add(m.receiver_id);
      if (m.receiver_id === uid) ids.add(m.sender_id);
    }
    for (const id of ids) {
      if (id === 'cs_bot') continue;
      const u = memGet('users', id);
      const last = [...MEM.messages].reverse().find(m =>
        (m.sender_id === uid && m.receiver_id === id) || (m.sender_id === id && m.receiver_id === uid));
      list.push({ id, user_id: id, username: u ? u.username : id, last_message: last ? last.content : '' });
    }
  }
  return jsonResponse(list);
}

async function handleMessageHistory(env, auth, body) {
  const uid = verifyUserId(auth);
  if (!uid) return errorResponse('请先登录', 401);
  const contactId = body.contactId || body.user_id || body.receiver_id;
  if (!contactId) return errorResponse('缺少联系人');
  if (hasDB(env)) {
    const r = await queryDB(env, `SELECT * FROM messages WHERE
      (sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?)
      ORDER BY created_at ASC LIMIT 200`, [uid, contactId, contactId, uid]);
    return jsonResponse(r.results || []);
  }
  const rows = MEM.messages.filter(m =>
    (m.sender_id === uid && m.receiver_id === contactId) ||
    (m.sender_id === contactId && m.receiver_id === uid)
  ).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  return jsonResponse(rows);
}

async function handleSendMessage(env, auth, body) {
  const uid = verifyUserId(auth);
  if (!uid) return errorResponse('请先登录', 401);
  const receiver = body.receiver_id || body.contactId;
  const content = (body.content || '').trim();
  if (!receiver || !content) return errorResponse('消息不完整');
  const id = generateId();
  const now = new Date().toISOString();
  const row = { id, sender_id: uid, receiver_id: receiver, content, created_at: now };
  if (hasDB(env)) {
    await runDB(env, 'INSERT INTO messages (id,sender_id,receiver_id,content,created_at) VALUES (?,?,?,?,?)',
      [id, uid, receiver, content, now]);
    if (receiver === 'cs_bot') {
      await runDB(env, 'INSERT INTO messages (id,sender_id,receiver_id,content,created_at) VALUES (?,?,?,?,?)',
        [generateId(), 'cs_bot', uid, '客服已收到，稍后面板板安排～', new Date().toISOString()]);
    }
  } else {
    memInsert('messages', row);
    if (receiver === 'cs_bot') {
      memInsert('messages', { id: generateId(), sender_id: 'cs_bot', receiver_id: uid, content: '客服已收到，稍后面板板安排～', created_at: new Date().toISOString() });
    }
  }
  return jsonResponse({ success: true, message: '已发送' });
}

async function handleUnread() {
  return jsonResponse({ count: 0, unread: 0 });
}

/* ========== 签到 ========== */
async function handleCheckinGet(env, auth) {
  const uid = verifyUserId(auth);
  if (!uid) return errorResponse('请先登录', 401);
  const today = new Date().toISOString().slice(0, 10);
  let checked = false;
  if (hasDB(env)) {
    const done = await queryDB(env, 'SELECT id FROM checkin_records WHERE user_id=? AND checkin_date=?', [uid, today]);
    checked = !!(done.results && done.results[0]);
  } else {
    checked = MEM.checkin_records.some(r => r.user_id === uid && r.checkin_date === today);
  }
  return jsonResponse({ checked, date: today, reward_name: '积分 +10' });
}

async function handleCheckinPost(env, auth) {
  const uid = verifyUserId(auth);
  if (!uid) return errorResponse('请先登录', 401);
  const today = new Date().toISOString().slice(0, 10);
  if (hasDB(env)) {
    const done = await queryDB(env, 'SELECT id FROM checkin_records WHERE user_id=? AND checkin_date=?', [uid, today]);
    if (done.results && done.results[0]) return errorResponse('今日已签到');
    await runDB(env, 'INSERT INTO checkin_records (id,user_id,checkin_date,created_at) VALUES (?,?,?,?)',
      [generateId(), uid, today, new Date().toISOString()]);
    await runDB(env, 'UPDATE users SET coin = COALESCE(coin,0)+10 WHERE id=?', [uid]);
  } else {
    if (MEM.checkin_records.some(r => r.user_id === uid && r.checkin_date === today)) return errorResponse('今日已签到');
    memInsert('checkin_records', { id: generateId(), user_id: uid, checkin_date: today, created_at: new Date().toISOString() });
    const u = memGet('users', uid);
    if (u) u.coin = (u.coin || 0) + 10;
  }
  return jsonResponse({ success: true, message: '签到成功，积分 +10' });
}

/* ========== 管理 ========== */
async function requireAdmin(env, auth) {
  const uid = verifyUserId(auth);
  if (!uid) return null;
  const u = await getUserById(env, uid);
  if (!u || u.role !== 'admin') return null;
  return u;
}

async function handleAdminList(env, auth, table) {
  if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
  const allowed = ['side_categories', 'sub_categories', 'products', 'banners', 'announcements', 'quick_links', 'home_tabs', 'home_sections', 'users', 'orders'];
  if (!allowed.includes(table)) return errorResponse('非法表');
  if (hasDB(env)) {
    const r = await queryDB(env, `SELECT * FROM ${table}`);
    return jsonResponse(r.results || []);
  }
  if (table === 'users') return jsonResponse(MEM.users.map(publicUser));
  return jsonResponse(MEM[table] || []);
}

async function handleAdminSaveSide(env, auth, body) {
  if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
  const id = body.id || generateId();
  const now = new Date().toISOString();
  if (hasDB(env)) {
    if (body.id) {
      await runDB(env, 'UPDATE side_categories SET name=?, sort_order=?, enabled=? WHERE id=?',
        [body.name, body.sort_order || 0, body.enabled !== 0 ? 1 : 0, id]);
    } else {
      await runDB(env, 'INSERT INTO side_categories (id,name,sort_order,enabled,created_at) VALUES (?,?,?,?,?)',
        [id, body.name || '新分类', body.sort_order || 0, 1, now]);
    }
  } else {
    if (body.id) memUpdate('side_categories', id, { name: body.name, sort_order: body.sort_order || 0, enabled: body.enabled !== 0 ? 1 : 0 });
    else memInsert('side_categories', { id, name: body.name || '新分类', sort_order: body.sort_order || 0, enabled: 1, created_at: now });
  }
  return jsonResponse({ success: true, id });
}

async function handleAdminSaveSub(env, auth, body) {
  if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
  const id = body.id || generateId();
  const now = new Date().toISOString();
  if (hasDB(env)) {
    if (body.id) {
      await runDB(env, 'UPDATE sub_categories SET side_id=?, name=?, icon=?, sort_order=?, enabled=? WHERE id=?',
        [body.side_id, body.name, body.icon || '', body.sort_order || 0, body.enabled !== 0 ? 1 : 0, id]);
    } else {
      await runDB(env, 'INSERT INTO sub_categories (id,side_id,name,icon,sort_order,enabled,created_at) VALUES (?,?,?,?,?,?,?)',
        [id, body.side_id, body.name || '新项目', body.icon || '', body.sort_order || 0, 1, now]);
    }
  } else {
    if (body.id) memUpdate('sub_categories', id, { side_id: body.side_id, name: body.name, icon: body.icon || '', sort_order: body.sort_order || 0 });
    else memInsert('sub_categories', { id, side_id: body.side_id, name: body.name || '新项目', icon: body.icon || '', sort_order: 0, enabled: 1, created_at: now });
  }
  return jsonResponse({ success: true, id });
}

async function handleAdminSaveProduct(env, auth, body) {
  if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
  const id = body.id || generateId();
  const now = new Date().toISOString();
  if (hasDB(env)) {
    if (body.id) {
      await runDB(env, `UPDATE products SET title=?, description=?, price=?, image=?, category_id=?, side_id=?, tag=?, status=?, sort_order=? WHERE id=?`,
        [body.title, body.description || '', parseFloat(body.price) || 0, body.image || '', body.category_id || '', body.side_id || '', body.tag || '', body.status || 'on', body.sort_order || 0, id]);
    } else {
      await runDB(env, `INSERT INTO products (id,title,description,price,image,category_id,side_id,tag,sold_count,status,sort_order,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, body.title || '新商品', body.description || '', parseFloat(body.price) || 0, body.image || '', body.category_id || '', body.side_id || '', body.tag || '', 0, 'on', body.sort_order || 0, now]);
    }
  } else {
    if (body.id) {
      memUpdate('products', id, {
        title: body.title, description: body.description || '', price: parseFloat(body.price) || 0,
        image: body.image || '', category_id: body.category_id || '', side_id: body.side_id || '',
        tag: body.tag || '', status: body.status || 'on', sort_order: body.sort_order || 0
      });
    } else {
      memInsert('products', {
        id, title: body.title || '新商品', description: body.description || '', price: parseFloat(body.price) || 0,
        image: body.image || '', category_id: body.category_id || '', side_id: body.side_id || '',
        tag: body.tag || '', sold_count: 0, status: 'on', sort_order: 0, created_at: now
      });
    }
  }
  return jsonResponse({ success: true, id });
}

async function handleAdminSaveBanner(env, auth, body) {
  if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
  const id = body.id || generateId();
  if (hasDB(env)) {
    if (body.id) {
      await runDB(env, 'UPDATE banners SET image=?, link=?, title=?, enabled=?, sort_order=? WHERE id=?',
        [body.image || '', body.link || '', body.title || '', body.enabled !== 0 ? 1 : 0, body.sort_order || 0, id]);
    } else {
      await runDB(env, 'INSERT INTO banners (id,image,link,title,enabled,sort_order) VALUES (?,?,?,?,?,?)',
        [id, body.image || '', body.link || '', body.title || '', 1, body.sort_order || 0]);
    }
  } else {
    if (body.id) memUpdate('banners', id, { image: body.image || '', link: body.link || '', title: body.title || '' });
    else memInsert('banners', { id, image: body.image || '', link: body.link || '', title: body.title || '', enabled: 1, sort_order: 0 });
  }
  return jsonResponse({ success: true, id });
}

async function handleAdminSaveAnnounce(env, auth, body) {
  if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
  const id = body.id || generateId();
  const now = new Date().toISOString();
  if (hasDB(env)) {
    if (body.id) {
      await runDB(env, 'UPDATE announcements SET content=?, enabled=?, sort_order=? WHERE id=?',
        [body.content, body.enabled !== 0 ? 1 : 0, body.sort_order || 0, id]);
    } else {
      await runDB(env, 'INSERT INTO announcements (id,content,enabled,sort_order,created_at) VALUES (?,?,?,?,?)',
        [id, body.content || '', 1, 0, now]);
    }
  } else {
    if (body.id) memUpdate('announcements', id, { content: body.content });
    else memInsert('announcements', { id, content: body.content || '', enabled: 1, sort_order: 0, created_at: now });
  }
  return jsonResponse({ success: true, id });
}

async function handleAdminDelete(env, auth, table, id) {
  if (!(await requireAdmin(env, auth))) return errorResponse('权限不足', 403);
  const allowed = ['side_categories', 'sub_categories', 'products', 'banners', 'announcements', 'quick_links', 'home_sections'];
  if (!allowed.includes(table)) return errorResponse('非法表');
  if (hasDB(env)) await runDB(env, `DELETE FROM ${table} WHERE id=?`, [id]);
  else memDelete(table, id);
  return jsonResponse({ success: true });
}

async function handleUpdateProfile(env, auth, body, field) {
  const uid = verifyUserId(auth);
  if (!uid) return errorResponse('请先登录', 401);
  if (hasDB(env)) {
    if (field === 'name' && body.username) await runDB(env, 'UPDATE users SET username=? WHERE id=?', [body.username, uid]);
    else if (field === 'bio') await runDB(env, 'UPDATE users SET bio=? WHERE id=?', [body.bio || '', uid]);
    else if (field === 'gender') await runDB(env, 'UPDATE users SET gender=? WHERE id=?', [body.gender || '', uid]);
  } else {
    const patch = {};
    if (field === 'name') patch.username = body.username;
    if (field === 'bio') patch.bio = body.bio || '';
    if (field === 'gender') patch.gender = body.gender || '';
    memUpdate('users', uid, patch);
  }
  return jsonResponse({ success: true, message: '已更新' });
}

async function handleGetUser(env, id) {
  const u = await getUserById(env, id);
  if (!u) return errorResponse('用户不存在', 404);
  return jsonResponse(publicUser(u));
}

/* ========== 入口 ========== */
export default {
  async fetch(request, env) {
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
      // 兼容 Workers 子路径
      if (path.startsWith('/api') === false && path !== '' && path !== '/') {
        // keep
      }
      const method = request.method;
      const auth = request.headers.get('Authorization') || '';
      let body = {};
      if (method === 'POST' || method === 'PUT') {
        try { body = await request.json(); } catch (_) { body = {}; }
      }

      // 健康检查
      if (path === '/' || path === '/api' || path === '/api/health') {
        return jsonResponse({
          ok: true,
          name: 'QW电竞 API',
          storage: hasDB(env) ? 'D1' : 'memory',
          tip: hasDB(env) ? '已绑定 D1' : '当前为内存模式，请在 Workers 设置中绑定 D1（变量名 DB）以持久化'
        });
      }

      if (path === '/api/register' && method === 'POST') return await handleRegister(env, body);
      if (path === '/api/login' && method === 'POST') return await handleLogin(env, body);
      if (path === '/api/me' && method === 'GET') return await handleMe(env, auth);

      if (path === '/api/home' && method === 'GET') return await handleHome(env);
      if (path === '/api/categories/side' && method === 'GET') return await handleSideCategories(env);
      if (path.startsWith('/api/categories/sub/') && method === 'GET') {
        return await handleSubCategories(env, decodeURIComponent(path.replace('/api/categories/sub/', '')));
      }
      if (path === '/api/products' && method === 'GET') return await handleProducts(env, url);
      if (path.startsWith('/api/products/') && method === 'GET') {
        return await handleProductDetail(env, decodeURIComponent(path.replace('/api/products/', '')));
      }
      if ((path === '/api/rank' || path === '/api/handlers/rank') && method === 'GET') return await handleRank(env);

      if (path === '/api/hall/orders' && method === 'GET') return await handleHallOrders(env);
      if (path === '/api/orders/buy' && method === 'POST') return await handleCreateOrder(env, auth, body);
      if (path === '/api/orders/my' && method === 'GET') return await handleMyOrders(env, auth);

      if (path === '/api/messages/contacts' && method === 'GET') return await handleContacts(env, auth);
      if (path === '/api/messages/history' && method === 'POST') return await handleMessageHistory(env, auth, body);
      if (path === '/api/messages/send' && method === 'POST') return await handleSendMessage(env, auth, body);
      if (path === '/api/messages/unread' && method === 'GET') return await handleUnread();

      if (path === '/api/checkin' && method === 'GET') return await handleCheckinGet(env, auth);
      if (path === '/api/checkin' && method === 'POST') return await handleCheckinPost(env, auth);

      if (path === '/api/user/name' && method === 'PUT') return await handleUpdateProfile(env, auth, body, 'name');
      if (path === '/api/user/bio' && method === 'PUT') return await handleUpdateProfile(env, auth, body, 'bio');
      if (path === '/api/user/gender' && method === 'PUT') return await handleUpdateProfile(env, auth, body, 'gender');
      if (path.startsWith('/api/users/') && method === 'GET') {
        return await handleGetUser(env, decodeURIComponent(path.replace('/api/users/', '')));
      }

      if (path.startsWith('/api/admin/list/') && method === 'GET') {
        return await handleAdminList(env, auth, path.replace('/api/admin/list/', ''));
      }
      if (path === '/api/admin/side' && method === 'POST') return await handleAdminSaveSide(env, auth, body);
      if (path === '/api/admin/sub' && method === 'POST') return await handleAdminSaveSub(env, auth, body);
      if (path === '/api/admin/product' && method === 'POST') return await handleAdminSaveProduct(env, auth, body);
      if (path === '/api/admin/banner' && method === 'POST') return await handleAdminSaveBanner(env, auth, body);
      if (path === '/api/admin/announce' && method === 'POST') return await handleAdminSaveAnnounce(env, auth, body);
      if (path.startsWith('/api/admin/delete/') && method === 'DELETE') {
        const rest = path.replace('/api/admin/delete/', '');
        const [table, id] = rest.split('/');
        return await handleAdminDelete(env, auth, table, id);
      }

      if (path === '/api/announce' && method === 'GET') {
        if (hasDB(env)) {
          const a = await queryDB(env, 'SELECT * FROM announcements WHERE enabled=1 ORDER BY sort_order');
          return jsonResponse(a.results || []);
        }
        return jsonResponse(memAll('announcements', r => r.enabled));
      }

      return errorResponse('接口不存在: ' + path, 404);
    } catch (e) {
      return errorResponse((e && e.message) ? e.message : '服务器错误', 500);
    }
  }
};
