const $ = (selector) => document.querySelector(selector);
let currentUser = null;
let sessionReady = Promise.resolve(null);
let pendingPackage = null;

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Permintaan belum berhasil.');
    error.code = data.code;
    throw error;
  }
  return data;
}

async function request(url, options = {}) {
  return api(url, options);
}

function showView(name) {
  document.querySelectorAll('.view').forEach((view) => view.classList.remove('active'));
  $(`#${name}View`).classList.add('active');
  $('header').style.display = name === 'app' || name === 'auth' ? 'none' : '';
  window.scrollTo(0, 0);
  if (name === 'app') renderApp();
}
function goAuth(mode = 'login') { showView('auth'); authMode(mode); }
function authMode(mode) {
  $('#loginForm').style.display = mode === 'login' ? 'block' : 'none';
  $('#registerForm').style.display = mode === 'register' ? 'block' : 'none';
}
function showMessage(id, message) {
  const box = $(id);
  box.textContent = message;
  box.style.display = 'block';
}
let toastTimer;
function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('show'), 2700);
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}
function formatDate(value) {
  const date = new Date(value.replace(' ', 'T') + (value.includes('Z') ? '' : 'Z'));
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

$('#loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const result = await request('/api/auth.php?action=login', {
      method: 'POST', body: JSON.stringify({ username: $('#loginUser').value.trim(), password: $('#loginPass').value }),
    });
    currentUser = result.user;
    routeAfterAuth();
  } catch (error) { showMessage('#loginMsg', error.message); }
});
$('#registerForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const result = await request('/api/auth.php?action=register', {
      method: 'POST',
      body: JSON.stringify({ name: $('#regName').value.trim(), email: $('#regEmail').value.trim(), username: $('#regUser').value.trim(), password: $('#regPass').value }),
    });
    currentUser = result.user;
    routeAfterAuth();
    toast('Akun berhasil dibuat.');
  } catch (error) { showMessage('#registerMsg', error.message); }
});
async function logout() {
  try { await request('/api/auth.php?action=logout', { method: 'POST', body: '{}' }); } catch (_) { /* tetap kembali ke halaman publik */ }
  currentUser = null;
  showView('home');
  toast('Kamu sudah keluar.');
}

function renderApp() {
  if (!currentUser) { showView('home'); return; }
  $('#sideName').textContent = currentUser.name;
  $('#sideRole').textContent = currentUser.role === 'admin' ? 'Administrator' : 'Pelanggan';
  $('#menuLabel').textContent = currentUser.role === 'admin' ? 'Menu admin' : 'Menu klien';
  $('#ordersNavLabel').textContent = 'Pesanan saya';
  $('#avatarLetter').textContent = (currentUser.name || 'P').charAt(0).toUpperCase();
  $('#helloName').textContent = currentUser.name.split(' ')[0];
  $('#adminLink').style.display = currentUser.role === 'admin' ? 'flex' : 'none';
  $('#adminLink').innerHTML = '<i>▦</i> Pesanan saya';
  $('[data-section="orders"]').style.display = currentUser.role === 'admin' ? 'none' : 'flex';
  document.querySelector('[data-section="neworder"]').style.display = currentUser.role === 'admin' ? 'none' : 'flex';
  document.querySelector('[data-section="account"]').style.display = currentUser.role === 'admin' ? 'none' : 'flex';
  $('#accountName').value = currentUser.name;
  $('#accountUser').value = currentUser.username;
  $('#accountEmail').value = currentUser.email;
  $('#dashDate').textContent = 'POTONG / ' + new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  dashboardTab('orders');
  if (currentUser.role === 'customer') renderMyOrders();
}
function dashboardTab(name) {
  if (currentUser?.role === 'admin' && name === 'orders') name = 'admin';
  if (name === 'admin' && currentUser?.role !== 'admin') return;
  document.querySelectorAll('.dash-panel').forEach((panel) => { panel.style.display = 'none'; });
  $(`#${name}Panel`).style.display = 'block';
  document.querySelectorAll('.side-link[data-section]').forEach((link) => link.classList.toggle('active', link.dataset.section === name));
  if (name === 'orders') renderMyOrders();
  if (name === 'admin') renderAdmin();
}
function statusClass(status) { return status === 'Selesai' ? 'done' : status === 'Dalam pengerjaan' ? 'pending' : ''; }
async function renderMyOrders() {
  try {
    const { orders } = await request('/api/orders.php');
    $('#myCount').textContent = orders.length;
    $('#myQueue').textContent = orders.filter((order) => order.status !== 'Selesai').length;
    $('#myDone').textContent = orders.filter((order) => order.status === 'Selesai').length;
    $('#tableCount').textContent = `${orders.length} PESANAN`;
    $('#myEmpty').style.display = orders.length ? 'none' : 'block';
    $('#myOrdersTable').style.display = orders.length ? 'table' : 'none';
    $('#myOrders').innerHTML = orders.map((order) => `<tr><td><strong>${escapeHtml(order.id)}</strong></td><td>${escapeHtml(order.package)}</td><td>${escapeHtml(formatDate(order.created_at))}</td><td>${escapeHtml(order.notes || '—')}${order.admin_notes ? `<br><small>Admin: ${escapeHtml(order.admin_notes)}</small>` : ''}</td><td><span class="status ${statusClass(order.status)}">${escapeHtml(order.status)}</span></td></tr>`).join('');
  } catch (error) { toast(error.message); }
}
function openClientOrder(packageChoice = null) {
  showView('app');
  dashboardTab('neworder');
  if (packageChoice) $('#package').value = `${packageChoice.name} — ${packageChoice.price}`;
}
function routeAfterAuth() {
  if (currentUser?.role === 'customer' && pendingPackage) {
    const choice = pendingPackage;
    pendingPackage = null;
    openClientOrder(choice);
    return;
  }
  pendingPackage = null;
  showView('app');
  dashboardTab('orders');
}
async function startOrdering() {
  const user = currentUser || await sessionReady;
  if (!user) { goAuth('register'); return; }
  if (user.role === 'admin') { showView('app'); dashboardTab('orders'); return; }
  openClientOrder();
}
async function orderPackage(name, price) {
  const user = currentUser || await sessionReady;
  if (!user) {
    pendingPackage = { name, price };
    goAuth('login');
    toast('Masuk atau daftar untuk melanjutkan pesanan.');
    return;
  }
  if (user.role === 'admin') { showView('app'); dashboardTab('orders'); return; }
  openClientOrder({ name, price });
}
$('#orderForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const selected = $('#package').value.split(' — ')[0];
  try {
    await request('/api/orders.php', { method: 'POST', body: JSON.stringify({ package: selected, deadline: $('#deadline').value, drive: $('#drive').value.trim(), notes: $('#notes').value.trim() }) });
    event.target.reset();
    dashboardTab('orders');
    toast('Pesanan tersimpan. Admin dapat melihatnya.');
  } catch (error) { toast(error.message); }
});
async function renderAdmin() {
  if (currentUser?.role !== 'admin') return;
  try {
    const [result, totalsResult] = await Promise.all([
      request(`/api/orders.php?status=${encodeURIComponent($('#statusFilter').value)}`),
      request('/api/orders.php?status=all&summary=1'),
    ]);
    const allOrders = totalsResult.orders;
    $('#adminOrdersCount').textContent = allOrders.length;
    $('#adminCustomers').textContent = new Set(allOrders.map((order) => order.username)).size;
    $('#adminRevenue').textContent = 'Rp' + allOrders.reduce((sum, order) => sum + Number(order.price), 0).toLocaleString('id-ID');
    $('#adminEmpty').style.display = result.orders.length ? 'none' : 'block';
    $('#adminOrdersTable').style.display = result.orders.length ? 'table' : 'none';
    $('#adminOrders').innerHTML = result.orders.map((order) => `<tr><td><strong>${escapeHtml(order.code)}</strong><br><a href="${escapeHtml(order.drive_url || '#')}" target="_blank" rel="noopener" ${order.drive_url ? '' : 'aria-disabled="true"'}>Lihat website ↗</a></td><td><strong>${escapeHtml(order.name)}</strong><br><span style="color:#81837b">${escapeHtml(order.email)}</span></td><td><select class="filter" id="pkg-${escapeHtml(order.code)}"><option ${order.package === 'Short & simple' ? 'selected' : ''}>Short & simple</option><option ${order.package === 'Creator cut' ? 'selected' : ''}>Creator cut</option><option ${order.package === 'Project cut' ? 'selected' : ''}>Project cut</option></select></td><td><input class="filter" id="deadline-${escapeHtml(order.code)}" value="${escapeHtml(order.deadline)}" aria-label="Target selesai"><textarea class="filter" id="notes-${escapeHtml(order.code)}" aria-label="Catatan klien">${escapeHtml(order.notes)}</textarea><textarea class="filter" id="adminnotes-${escapeHtml(order.code)}" aria-label="Catatan admin" placeholder="Catatan untuk klien">${escapeHtml(order.admin_notes || '')}</textarea></td><td>Rp${Number(order.price).toLocaleString('id-ID')}</td><td><select class="filter" id="status-${escapeHtml(order.code)}">${['Menunggu konfirmasi', 'Dalam pengerjaan', 'Selesai'].map((status) => `<option ${status === order.status ? 'selected' : ''}>${status}</option>`).join('')}</select><div class="order-actions"><button class="btn small" onclick="saveOrder('${escapeHtml(order.code)}')">Simpan / tandai selesai</button><button class="btn small" onclick="deleteOrder('${escapeHtml(order.code)}')">Hapus</button></div></td></tr>`).join('');
  } catch (error) { toast(error.message); }
}
async function changeStatus(id, status) {
  try { await request('/api/orders.php', { method: 'PATCH', body: JSON.stringify({ id, status }) }); await renderAdmin(); toast('Status pesanan diperbarui.'); }
  catch (error) { toast(error.message); }
}
async function saveOrder(id) {
  const status = $(`#status-${CSS.escape(id)}`).value;
  try { await request('/api/orders.php', { method: 'PATCH', body: JSON.stringify({ id, status, package: $(`#pkg-${CSS.escape(id)}`).value, deadline: $(`#deadline-${CSS.escape(id)}`).value, notes: $(`#notes-${CSS.escape(id)}`).value, admin_notes: $(`#adminnotes-${CSS.escape(id)}`).value }) }); await renderAdmin(); toast(status === 'Selesai' ? 'Pesanan ditandai selesai.' : 'Pesanan diperbarui.'); }
  catch (error) { toast(error.message); }
}
async function deleteOrder(id) {
  if (!confirm(`Hapus pesanan ${id}?`)) return;
  try { await request('/api/orders.php', { method: 'PATCH', body: JSON.stringify({ id, action: 'delete' }) }); await renderAdmin(); toast('Pesanan dihapus.'); }
  catch (error) { toast(error.message); }
}
function exportOrders() {
  request('/api/orders.php?status=all').then(({ orders }) => {
    if (!orders.length) { toast('Belum ada pesanan untuk diunduh.'); return; }
    const values = [['ID', 'Nama', 'Email', 'Paket', 'Estimasi', 'Tanggal', 'Target', 'Catatan', 'Status'], ...orders.map((order) => [order.code, order.name, order.email, order.package, order.price, order.created_at, order.deadline, order.notes, order.status])];
    const csv = values.map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' }));
    link.download = 'pesanan-potong.csv'; link.click(); URL.revokeObjectURL(link.href);
  }).catch((error) => toast(error.message));
}
function orderPackageFromQuery() {
  const name = new URLSearchParams(location.search).get('paket');
  const prices = { 'Short & simple': 'Rp50.000', 'Creator cut': 'Rp150.000', 'Project cut': 'Rp300.000' };
  if (prices[name]) orderPackage(name, prices[name]);
  if (location.search) history.replaceState({}, '', location.pathname);
}

// Make the public landing page the deterministic first view, before any
// session request completes (or if that request is unavailable).
showView('home');

sessionReady = request('/api/auth.php?action=me').then(({ user }) => {
  currentUser = user;
  if (user) showView('app');
  else showView('home');
  return user;
}).catch(() => {
  currentUser = null;
  showView('home');
  return null;
});
sessionReady.then(() => orderPackageFromQuery());

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('PWA service worker belum dapat dipasang.', error);
    });
  });
}
