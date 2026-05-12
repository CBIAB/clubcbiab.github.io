// =============================================
// CLUB DEL ÁRBITRO CBiAB — app.js
// Base de datos: Supabase
// =============================================

const SUPABASE_URL  = 'https://vhjiorojlsmjjyfohgjc.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoamlvcm9qbHNtamp5Zm9oZ2pjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MDAxNTcsImV4cCI6MjA5Mzk3NjE1N30.pBQsxHpBValCJE2Z2qoSuANx3MfZO3wlha4Sz9kTBQQ';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const ADMIN_USER_ARBITROS  = 'adminarbitros';
const ADMIN_USER_OFICIALES = 'adminoficiales';
const ADMIN_PASS           = 'cbiab2026';

// ── Umbral de aprobado: 20 aciertos sobre 25 preguntas ────────────────────────
const MINIMO_APROBADO = 20;
const TOTAL_PREGUNTAS = 25;

// ── EMAILJS — rellena estos valores tras crear cuenta en emailjs.com ─────────
// Instrucciones en el README o pregunta al técnico del club
const EMAILJS_SERVICE_ID        = 'TU_SERVICE_ID';        // ej: 'service_abc123'
const EMAILJS_TEMPLATE_TEST     = 'TU_TEMPLATE_TEST_ID';  // ej: 'template_xyz456'
const EMAILJS_TEMPLATE_REMINDER = 'TU_TEMPLATE_REMINDER_ID';
const EMAILJS_PUBLIC_KEY        = 'TU_PUBLIC_KEY';        // ej: 'AbCdEf1234567890'

function emailjsListo() {
  return typeof emailjs !== 'undefined' &&
    EMAILJS_PUBLIC_KEY !== 'TU_PUBLIC_KEY' &&
    EMAILJS_SERVICE_ID !== 'TU_SERVICE_ID';
}

// Inicializar EmailJS solo si las claves están configuradas
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    if (emailjsListo()) emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
  });
}

// Envía email de confirmación al árbitro tras completar un test
async function sendTestCompletionEmail(arbitro, tipo, nota, correctas, total) {
  if (!emailjsListo() || !arbitro?.email) return;
  const tipoLabel = tipo === 'mensual' ? 'Test Mensual Oficial' : 'Test de Práctica';
  const emoji     = nota >= 7 ? '🎉' : nota >= 5 ? '📚' : '💪';
  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_TEST, {
      to_email : arbitro.email,
      to_name  : arbitro.nombre,
      tipo     : tipoLabel,
      nota     : nota.toFixed(1),
      correctas: correctas,
      total    : total,
      emoji    : emoji,
      fecha    : new Date().toLocaleDateString('es-ES', { day:'2-digit', month:'long', year:'numeric' })
    }, EMAILJS_PUBLIC_KEY);
  } catch (e) { console.warn('EmailJS (test):', e); }
}

// Envía recordatorio de test mensual pendiente
async function sendReminderEmail(arbitro) {
  if (!emailjsListo() || !arbitro?.email) return;
  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_REMINDER, {
      to_email: arbitro.email,
      to_name : arbitro.nombre,
      dia     : new Date().getDate(),
      mes     : new Date().toLocaleDateString('es-ES', { month: 'long' })
    }, EMAILJS_PUBLIC_KEY);
  } catch (e) { console.warn('EmailJS (reminder):', e); }
}

let PREGUNTAS    = [];
let currentUser  = null;
let testState    = {};
let historyTab   = 'todos';
let appMode      = null; // 'arbitro' | 'oficial'

function loadPreguntas() {
  PREGUNTAS = (appMode === 'oficial') ? PREGUNTAS_OFICIALES_DATA : PREGUNTAS_DATA;
}

// ── SELECCIÓN DE ROL ──────────────────────────
function selectRole(tipo) {
  appMode = tipo;
  loadPreguntas();
  document.getElementById('home-phase-1').classList.add('hidden');
  document.getElementById('home-phase-2').classList.remove('hidden');
  const ind = document.getElementById('home-role-indicator');
  if (ind) ind.innerHTML = tipo === 'oficial'
    ? '<span class="role-badge badge-oficial">📋 Oficial de Mesa</span>'
    : '<span class="role-badge badge-arbitro">🏀 Árbitro</span>';
}

function changeRole() {
  appMode = null;
  document.getElementById('home-phase-1').classList.remove('hidden');
  document.getElementById('home-phase-2').classList.add('hidden');
}

// ── CATEGORÍAS POR TIPO ───────────────────────
function getCategorias(tipo) {
  if (tipo === 'oficial') return ['Oficial de Mesa'];
  return ['Eskola Laguntzaile','G6 (comité vizcaíno)','G5 (comité vasco)','G4 (comité vasco)','G3 FEB','G2 FEB','G1 FEB'];
}

function renderCategoriaSelect(selectId, tipo, selectedValue) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = '<option value="">Selecciona categoría</option>' +
    getCategorias(tipo).map(c =>
      `<option value="${c}"${selectedValue === c ? ' selected' : ''}>${c}</option>`
    ).join('');
}

// ── SEGURIDAD: Hash SHA-256 (Web Crypto API, nativo en el navegador) ─────────
async function hashPassword(pwd) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pwd));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Pantalla ──────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}

function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? 'Cargando...' : btn.dataset.label;
}

// ── AUTH ──────────────────────────────────────
async function doLogin() {
  const user   = document.getElementById('login-user').value.trim();
  const pass   = document.getElementById('login-pass').value;
  const errEl  = document.getElementById('login-error');
  const btn    = document.getElementById('btn-login');
  errEl.classList.add('hidden');

  if (!user || !pass) { showError(errEl, 'Rellena todos los campos.'); return; }

  // Admins
  if (user === ADMIN_USER_ARBITROS && pass === ADMIN_PASS) {
    appMode = 'arbitro'; loadPreguntas();
    currentUser = { username: user, nombre: 'Administrador', isAdmin: true, adminTipo: 'arbitro' };
    openAdmin(); return;
  }
  if (user === ADMIN_USER_OFICIALES && pass === ADMIN_PASS) {
    appMode = 'oficial'; loadPreguntas();
    currentUser = { username: user, nombre: 'Administrador', isAdmin: true, adminTipo: 'oficial' };
    openAdmin(); return;
  }

  btn.disabled = true; btn.textContent = 'Entrando...';

  const hashedPass = await hashPassword(pass);

  // 1. Intento con contraseña cifrada (SHA-256)
  let { data } = await sb.from('arbitros').select('*').eq('username', user).eq('password', hashedPass).single();

  if (!data) {
    // 2. Fallback: contraseña en texto plano (cuentas anteriores al cifrado)
    //    Si coincide, se migra automáticamente al hash — el usuario no nota nada
    const { data: plain } = await sb.from('arbitros').select('*').eq('username', user).eq('password', pass).single();
    if (plain) {
      await sb.from('arbitros').update({ password: hashedPass }).eq('id', plain.id);
      data = plain;
    }
  }

  btn.disabled = false; btn.textContent = 'Entrar';

  if (!data) {
    showError(errEl, 'Usuario o contraseña incorrectos.');
    return;
  }

  if (!data.aprobado) {
    showScreen('screen-pendiente');
    return;
  }

  // Verificar que el tipo de cuenta coincide con la sección desde la que intenta entrar
  const tipoUsuario = data.tipo || 'arbitro';
  if (tipoUsuario !== appMode) {
    const esperado = tipoUsuario === 'oficial' ? 'Oficiales de Mesa' : 'Árbitros';
    showError(errEl, `Esta cuenta es de ${tipoUsuario === 'oficial' ? 'Oficial de Mesa' : 'Árbitro'}. Accede desde el apartado de ${esperado}.`);
    btn.disabled = false; btn.textContent = 'Entrar';
    return;
  }

  currentUser = data;
  openDashboard();
}

async function doRegister() {
  const nombre = document.getElementById('reg-name').value.trim();
  const user   = document.getElementById('reg-user').value.trim();
  const pass   = document.getElementById('reg-pass').value;
  const errEl  = document.getElementById('reg-error');
  const btn    = document.getElementById('btn-register');
  errEl.classList.add('hidden');

  const tipoSeleccionado = document.querySelector('input[name="reg-tipo"]:checked')?.value || 'arbitro';

  if (!nombre || !user || !pass) { showError(errEl, 'Rellena todos los campos.'); return; }
  if (pass.length < 6)           { showError(errEl, 'La contraseña debe tener al menos 6 caracteres.'); return; }
  if (user === ADMIN_USER)       { showError(errEl, 'Ese nombre de usuario no está disponible.'); return; }

  const consentEl = document.getElementById('reg-consent');
  if (!consentEl || !consentEl.checked) {
    showError(errEl, 'Debes aceptar la Política de Privacidad para registrarte.');
    return;
  }

  btn.disabled = true; btn.textContent = 'Creando cuenta...';

  const hashedPass = await hashPassword(pass);

  const { data, error } = await sb
    .from('arbitros')
    .insert({
      username: user,
      nombre,
      password: hashedPass,
      consentimiento_rgpd: true,
      fecha_consentimiento: new Date().toISOString(),
      tipo: tipoSeleccionado
    })
    .select()
    .single();

  btn.disabled = false; btn.textContent = 'Crear cuenta';

  if (error) {
    if (error.code === '23505') showError(errEl, 'Ese nombre de usuario ya está en uso.');
    else showError(errEl, 'Error al crear la cuenta. Inténtalo de nuevo.');
    return;
  }

  // Nuevo registro → pendiente de aprobación
  showScreen('screen-pendiente');
}

function doLogout() {
  currentUser = null;
  appMode     = null;
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  // Volver a la selección de rol
  const p1 = document.getElementById('home-phase-1');
  const p2 = document.getElementById('home-phase-2');
  if (p1) p1.classList.remove('hidden');
  if (p2) p2.classList.add('hidden');
  showScreen('screen-home');
}

// ── ADMIN ─────────────────────────────────────
async function openAdmin() {
  showScreen('screen-loading');
  // Badge de rol en el título del panel
  const tipoBadge = document.getElementById('admin-tipo-badge');
  if (tipoBadge) tipoBadge.innerHTML = currentUser.adminTipo === 'oficial'
    ? '<span class="role-badge badge-oficial">📋 Oficiales de Mesa</span>'
    : '<span class="role-badge badge-arbitro">🏀 Árbitros</span>';

  await Promise.all([loadConfigMensual(), renderPendientes(), renderAdminStats(), renderAdminTable(), loadReportes(), loadSolicitudesPassword()]);
  document.getElementById('admin-detail').classList.add('hidden');
  document.getElementById('admin-table-container').classList.remove('hidden');
  document.getElementById('admin-search').value = '';
  showScreen('screen-admin');
}

async function renderPendientes() {
  const { data } = await sb.from('arbitros').select('id, nombre, username').eq('aprobado', false).eq('tipo', currentUser.adminTipo).order('created_at');
  const section  = document.getElementById('admin-pendientes-section');
  const lista    = document.getElementById('admin-pendientes-lista');

  if (!data || data.length === 0) {
    section.classList.add('hidden');
    return;
  }

  document.getElementById('admin-pendientes-count').textContent = data.length;
  // Badge en el título del panel
  const badgeTitulo = document.getElementById('admin-pendientes-badge-titulo');
  if (badgeTitulo) { badgeTitulo.textContent = data.length; badgeTitulo.classList.remove('hidden'); }
  section.classList.remove('hidden');

  lista.innerHTML = data.map(a => `
    <div class="estado-item" id="pendiente-${a.id}">
      <div>
        <span class="estado-item-nombre">${a.nombre}</span>
        <span style="font-size:0.75rem;color:var(--text-3);margin-left:8px">@${a.username}</span>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn-aprobar" onclick="aprobarArbitro('${a.id}')">✅ Aprobar</button>
        <button class="btn-rechazar" onclick="rechazarArbitro('${a.id}', '${a.nombre}')">❌ Rechazar</button>
      </div>
    </div>`).join('');
}

async function aprobarArbitro(id) {
  await sb.from('arbitros').update({ aprobado: true }).eq('id', id);
  document.getElementById('pendiente-' + id)?.remove();
  const section = document.getElementById('admin-pendientes-section');
  const quedan  = section.querySelectorAll('.estado-item').length;
  if (quedan === 0) section.classList.add('hidden');
  else document.getElementById('admin-pendientes-count').textContent = quedan;
  await renderAdminStats();
  await renderAdminTable();
}

async function rechazarArbitro(id, nombre) {
  if (!confirm(`¿Seguro que quieres rechazar y eliminar el registro de ${nombre}?`)) return;
  await sb.from('arbitros').delete().eq('id', id);
  document.getElementById('pendiente-' + id)?.remove();
  const section = document.getElementById('admin-pendientes-section');
  const quedan  = section.querySelectorAll('.estado-item').length;
  if (quedan === 0) section.classList.add('hidden');
  else document.getElementById('admin-pendientes-count').textContent = quedan;
}

async function renderAdminStats() {
  const now   = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
  const mes   = now.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  document.getElementById('admin-mes-label').textContent = mes.charAt(0).toUpperCase() + mes.slice(1);

  const { data: arbitros }   = await sb.from('arbitros').select('id, nombre, username').eq('aprobado', true).eq('tipo', currentUser.adminTipo);
  const { data: practicas }  = await sb.from('test_resultados').select('id').eq('tipo', 'practica').eq('tipo_usuario', currentUser.adminTipo);
  const { data: esteMes }    = await sb.from('test_resultados').select('arbitro_id, nota').eq('tipo', 'mensual').eq('tipo_usuario', currentUser.adminTipo).gte('fecha', start).lte('fecha', end);

  const totalArbitros  = (arbitros || []).length;
  const completadosIds = new Set((esteMes || []).map(r => r.arbitro_id));
  const completados    = (arbitros || []).filter(a => completadosIds.has(a.id));
  const pendientes     = (arbitros || []).filter(a => !completadosIds.has(a.id));
  const avgMes         = esteMes && esteMes.length
    ? (esteMes.reduce((s,r) => s + r.nota, 0) / esteMes.length).toFixed(1) : '—';

  // Stats de aprobados/suspensos (correctas >= MINIMO_APROBADO → nota >= 8.0)
  const aprobadosMes   = (esteMes || []).filter(r => r.nota >= (MINIMO_APROBADO / TOTAL_PREGUNTAS) * 10);
  const suspensosMes   = completados.length - aprobadosMes.length;
  const mejorNotaMes   = esteMes && esteMes.length ? Math.max(...esteMes.map(r => r.nota)).toFixed(1) : '—';
  const pctAprobados   = completados.length ? Math.round((aprobadosMes.length / completados.length) * 100) : 0;

  document.getElementById('admin-stat-arbitros').textContent   = totalArbitros;
  document.getElementById('admin-stat-completado').textContent = completados.length;
  document.getElementById('admin-stat-pendiente').textContent  = pendientes.length;
  document.getElementById('admin-stat-avg').textContent        = avgMes;
  document.getElementById('admin-stat-practica').textContent   = (practicas || []).length;
  // Stats extra
  const elAprobados = document.getElementById('admin-stat-aprobados');
  const elSuspensos = document.getElementById('admin-stat-suspensos');
  const elMejor     = document.getElementById('admin-stat-mejor');
  if (elAprobados) elAprobados.textContent = `${aprobadosMes.length} (${pctAprobados}%)`;
  if (elSuspensos) elSuspensos.textContent = suspensosMes;
  if (elMejor)     elMejor.textContent     = mejorNotaMes;

  // Lista completados con badge aprobado/suspenso
  const mapNotas = {};
  (esteMes || []).forEach(r => { mapNotas[r.arbitro_id] = r.nota; });

  const elC = document.getElementById('admin-completados');
  elC.innerHTML = completados.length === 0
    ? '<div class="estado-item-empty">Nadie ha completado el test todavía</div>'
    : completados.sort((a,b) => (mapNotas[b.id]||0) - (mapNotas[a.id]||0)).map(a => {
        const nota     = mapNotas[a.id];
        const cls      = nota >= 8 ? 'nota-alta' : nota >= 6 ? 'nota-media' : 'nota-baja';
        const aprobado = nota >= (MINIMO_APROBADO / TOTAL_PREGUNTAS) * 10;
        const badge    = aprobado
          ? '<span class="mini-badge aprobado">APR</span>'
          : '<span class="mini-badge suspenso">SUS</span>';
        return `<div class="estado-item">
          <span class="estado-item-nombre">${a.nombre} ${badge}</span>
          <span class="estado-item-nota ${cls}">${nota.toFixed(1)}</span>
        </div>`;
      }).join('');

  // Lista pendientes
  const elP = document.getElementById('admin-pendientes');
  elP.innerHTML = pendientes.length === 0
    ? '<div class="estado-item-empty">✅ ¡Todos han completado el test!</div>'
    : pendientes.map(a => `
        <div class="estado-item">
          <span class="estado-item-nombre">${a.nombre}</span>
          <span style="font-size:0.75rem;color:var(--text-3)">@${a.username}</span>
        </div>`).join('');

  // Guardamos para el export
  window._adminArbitros  = arbitros || [];
  window._adminEsteMes   = esteMes  || [];
}

async function renderAdminTable() {
  const query = document.getElementById('admin-search').value.toLowerCase();
  const container = document.getElementById('admin-table-container');

  const { data: arbitros } = await sb.from('arbitros').select('*').eq('aprobado', true).eq('tipo', currentUser.adminTipo).order('nombre');
  const { data: resultados } = await sb.from('test_resultados').select('*').eq('tipo_usuario', currentUser.adminTipo).order('fecha');

  if (!arbitros || arbitros.length === 0) {
    container.innerHTML = '<p class="empty-admin">No hay árbitros registrados todavía.</p>';
    return;
  }

  let lista = arbitros.filter(a =>
    !query || a.username.toLowerCase().includes(query) || a.nombre.toLowerCase().includes(query)
  );

  const rows = lista.map(a => {
    const hist      = (resultados || []).filter(r => r.arbitro_id === a.id);
    const mensuales = hist.filter(r => r.tipo === 'mensual');
    const practicas = hist.filter(r => r.tipo === 'practica');
    const avgM      = mensuales.length ? (mensuales.reduce((s,r) => s + r.nota, 0) / mensuales.length).toFixed(1) : '—';
    const bestM     = mensuales.length ? Math.max(...mensuales.map(r => r.nota)).toFixed(1) : '—';
    const last      = hist.length ? formatDate(new Date(hist[hist.length - 1].fecha)) : 'Sin actividad';
    return `<tr>
      <td><strong>${a.nombre}</strong></td>
      <td>@${a.username}</td>
      <td>${mensuales.length}</td>
      <td>${practicas.length}</td>
      <td>${avgM}</td>
      <td>${bestM}</td>
      <td>${last}</td>
      <td><button class="btn-ver" onclick="showAdminDetail('${a.id}')">Ver detalle</button></td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <table class="admin-table">
      <thead><tr>
        <th>Nombre</th><th>Usuario</th><th>Mensuales</th><th>Práctica</th>
        <th>Media mens.</th><th>Mejor mens.</th><th>Último test</th><th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

  // guardamos los datos para el detalle sin nueva consulta
  window._adminData = { arbitros, resultados };
  await renderInactivos(arbitros, resultados);
}

async function showAdminDetail(arbitroId) {
  // Recargar datos frescos del árbitro para tener email, teléfono, etc.
  const { data: aFresh } = await sb.from('arbitros').select('*').eq('id', arbitroId).single();
  const { arbitros, resultados } = window._adminData || {};
  // Fusionar datos frescos en el array en memoria
  if (aFresh && arbitros) {
    const idx = arbitros.findIndex(x => x.id === arbitroId);
    if (idx !== -1) arbitros[idx] = { ...arbitros[idx], ...aFresh };
  }
  const a    = aFresh || (arbitros || []).find(x => x.id === arbitroId);
  const hist = (resultados || []).filter(r => r.arbitro_id === arbitroId);
  const mensuales = hist.filter(r => r.tipo === 'mensual');
  const practicas = hist.filter(r => r.tipo === 'practica');

  adminDetailUserId = arbitroId;
  document.getElementById('admin-table-container').classList.add('hidden');
  document.getElementById('admin-new-pass').value = '';
  document.getElementById('admin-reset-msg').classList.add('hidden');
  const detail = document.getElementById('admin-detail');
  detail.classList.remove('hidden');
  document.getElementById('admin-detail-name').textContent = a.nombre + ' (@' + a.username + ')';

  // Tarjeta de perfil completo
  const perfilBadge = a.perfil_completo
    ? '<span class="perfil-badge ok">✅ Perfil completo</span>'
    : '<span class="perfil-badge pendiente">⚠️ Perfil incompleto</span>';
  document.getElementById('admin-detail-perfil').innerHTML = `
    <div class="admin-perfil-grid">
      <div class="admin-perfil-item">
        <span class="admin-perfil-label">📧 Email</span>
        <span class="admin-perfil-valor">${a.email || '<em>No indicado</em>'}</span>
      </div>
      <div class="admin-perfil-item">
        <span class="admin-perfil-label">📱 Teléfono</span>
        <span class="admin-perfil-valor">${a.telefono || '<em>No indicado</em>'}</span>
      </div>
      <div class="admin-perfil-item">
        <span class="admin-perfil-label">🏀 Categoría</span>
        <span class="admin-perfil-valor">${a.categoria || '<em>No indicada</em>'}</span>
      </div>
      <div class="admin-perfil-item">
        <span class="admin-perfil-label">👤 Usuario</span>
        <span class="admin-perfil-valor">@${a.username}</span>
      </div>
      <div class="admin-perfil-item">
        <span class="admin-perfil-label">📋 Estado perfil</span>
        <span class="admin-perfil-valor">${perfilBadge}</span>
      </div>
      <div class="admin-perfil-item">
        <span class="admin-perfil-label">📅 Fecha de registro</span>
        <span class="admin-perfil-valor">${a.created_at ? formatDate(new Date(a.created_at)) : '—'}</span>
      </div>
    </div>`;

  const avgM   = mensuales.length ? (mensuales.reduce((s,r) => s + r.nota, 0) / mensuales.length).toFixed(1) : '—';
  const bestM  = mensuales.length ? Math.max(...mensuales.map(r => r.nota)).toFixed(1) : '—';
  const worstM = mensuales.length ? Math.min(...mensuales.map(r => r.nota)).toFixed(1) : '—';

  document.getElementById('admin-detail-stats').innerHTML = `
    <div class="stat-card"><div class="stat-num">${mensuales.length}</div><div class="stat-label">Tests mensuales</div></div>
    <div class="stat-card"><div class="stat-num">${practicas.length}</div><div class="stat-label">Tests práctica</div></div>
    <div class="stat-card"><div class="stat-num">${avgM}</div><div class="stat-label">Media mensuales</div></div>
    <div class="stat-card"><div class="stat-num nota-alta">${bestM}</div><div class="stat-label">Mejor mensual</div></div>
    <div class="stat-card"><div class="stat-num nota-baja">${worstM}</div><div class="stat-label">Peor mensual</div></div>`;

  const histEl = document.getElementById('admin-detail-history');
  if (hist.length === 0) {
    histEl.innerHTML = '<p class="empty-msg">Este árbitro no ha realizado ningún test todavía.</p>';
  } else {
    histEl.innerHTML = [...hist].reverse().map(h => {
      const cls   = h.nota >= 7 ? 'nota-alta' : h.nota >= 5 ? 'nota-media' : 'nota-baja';
      const badge = h.tipo === 'mensual'
        ? '<span class="badge-mensual">Mensual</span>'
        : '<span class="badge-practica">Práctica</span>';
      const fecha   = formatDate(new Date(h.fecha));
      const nombre  = a.nombre;
      const notaFmt = h.nota.toFixed(1);
      const comentBadge = h.comentario_admin
        ? `<span class="modal-comment-badge">💬</span>`
        : '';
      return `<div class="history-item">
        <div class="history-item-left">
          <span class="history-fecha">${fecha}</span>
          <span class="history-tipo">${badge} · ${h.correctas}/${h.total} correctas ${comentBadge}</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <span class="history-nota ${cls}">${notaFmt}</span>
          <button class="btn-ver-test" onclick="showTestReview('${h.id}','${nombre.replace(/'/g,"\\'")}','${fecha}','${notaFmt}')">🔍 Ver test</button>
        </div>
      </div>`;
    }).join('');
  }

  // Gráfico evolución
  if (adminChart) { adminChart.destroy(); adminChart = null; }
  const sortedHist = mensuales.sort((a,b) => new Date(a.fecha)-new Date(b.fecha));
  adminChart = renderChart('chart-admin', sortedHist);

  detail.scrollIntoView({ behavior: 'smooth' });
}

function closeAdminDetail() {
  document.getElementById('admin-detail').classList.add('hidden');
  document.getElementById('admin-table-container').classList.remove('hidden');
}

async function exportToExcel() {
  const btn = document.querySelector('.btn-export');
  btn.textContent = '⏳ Generando...'; btn.disabled = true;

  const { data: arbitros }   = await sb.from('arbitros').select('id, nombre, username').eq('tipo', currentUser.adminTipo);
  const { data: resultados } = await sb.from('test_resultados').select('*').eq('tipo_usuario', currentUser.adminTipo).order('fecha');

  const now   = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
  const mes   = now.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  const wb = XLSX.utils.book_new();

  // ── Hoja 1: Resumen de árbitros ──
  const resumenData = (arbitros || []).map(a => {
    const hist      = (resultados || []).filter(r => r.arbitro_id === a.id);
    const mensuales = hist.filter(r => r.tipo === 'mensual');
    const practicas = hist.filter(r => r.tipo === 'practica');
    const esteMes   = mensuales.filter(r => r.fecha >= start && r.fecha <= end);
    const avgM      = mensuales.length ? (mensuales.reduce((s,r) => s + r.nota, 0) / mensuales.length) : null;
    return {
      'Nombre':              a.nombre,
      'Usuario':             a.username,
      'Tests mensuales':     mensuales.length,
      'Tests de práctica':   practicas.length,
      'Media mensuales':     avgM ? +avgM.toFixed(2) : '—',
      'Mejor mensual':       mensuales.length ? +Math.max(...mensuales.map(r=>r.nota)).toFixed(2) : '—',
      'Peor mensual':        mensuales.length ? +Math.min(...mensuales.map(r=>r.nota)).toFixed(2) : '—',
      [`Test ${mes}`]:       esteMes.length ? +esteMes[0].nota.toFixed(2) : 'Pendiente',
    };
  });
  const ws1 = XLSX.utils.json_to_sheet(resumenData);
  ws1['!cols'] = [22,18,16,16,16,14,14,20].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws1, 'Resumen árbitros');

  // ── Hoja 2: Test mensual de este mes ──
  const esteMesData = (resultados || [])
    .filter(r => r.tipo === 'mensual' && r.fecha >= start && r.fecha <= end)
    .map(r => {
      const a = (arbitros || []).find(x => x.id === r.arbitro_id) || {};
      return {
        'Nombre':     a.nombre || '—',
        'Usuario':    a.username || '—',
        'Nota':       +r.nota.toFixed(2),
        'Correctas':  r.correctas,
        'Total':      r.total,
        'Fecha':      formatDate(new Date(r.fecha)),
      };
    })
    .sort((a, b) => b['Nota'] - a['Nota']);
  const ws2 = XLSX.utils.json_to_sheet(esteMesData.length ? esteMesData : [{ Info: 'Sin resultados este mes' }]);
  ws2['!cols'] = [24, 18, 10, 10, 10, 20].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws2, `Test ${mes}`);

  // ── Hoja 3: Historial completo ──
  const historialData = (resultados || []).map(r => {
    const a = (arbitros || []).find(x => x.id === r.arbitro_id) || {};
    return {
      'Nombre':   a.nombre || '—',
      'Usuario':  a.username || '—',
      'Tipo':     r.tipo === 'mensual' ? 'Mensual' : 'Práctica',
      'Nota':     +r.nota.toFixed(2),
      'Correctas': r.correctas,
      'Total':    r.total,
      'Fecha':    formatDate(new Date(r.fecha)),
    };
  });
  const ws3 = XLSX.utils.json_to_sheet(historialData.length ? historialData : [{ Info: 'Sin historial' }]);
  ws3['!cols'] = [24, 18, 12, 10, 10, 10, 20].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws3, 'Historial completo');

  const fecha = now.toLocaleDateString('es-ES').replace(/\//g, '-');
  XLSX.writeFile(wb, `CBiAB_Arbitros_${fecha}.xlsx`);

  btn.textContent = '⬇️ Exportar Excel'; btn.disabled = false;
}

// ── TIMER ─────────────────────────────────
let timerInterval = null;
let timerSegundos = 0;

function initTimer() {
  clearInterval(timerInterval);
  timerSegundos = 35 * 60;
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    timerSegundos--;
    updateTimerDisplay();
    if (timerSegundos <= 0) {
      clearInterval(timerInterval);
      finishTest(true);   // forzar fin sin pedir confirmación
    }
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
}

function updateTimerDisplay() {
  const el  = document.getElementById('test-timer');
  if (!el) return;
  const min = Math.floor(timerSegundos / 60);
  const seg = timerSegundos % 60;
  el.textContent = `${String(min).padStart(2,'0')}:${String(seg).padStart(2,'0')}`;
  el.className = 'test-timer';
  if (timerSegundos <= 60)  el.classList.add('danger');
  else if (timerSegundos <= 300) el.classList.add('warning');
}

// ── PERFIL ────────────────────────────────
let perfilChart = null;

async function openPerfil(mandatory = false) {
  showScreen('screen-loading');
  const { data } = await sb.from('arbitros').select('*').eq('id', currentUser.id).single();
  if (data) currentUser = { ...currentUser, ...data };

  document.getElementById('perfil-nombre').value    = data.nombre    || '';
  document.getElementById('perfil-username').value  = data.username  || '';
  document.getElementById('perfil-telefono').value  = data.telefono  || '';
  document.getElementById('perfil-email').value     = data.email     || '';
  renderCategoriaSelect('perfil-categoria', data.tipo || 'arbitro', data.categoria || '');
  document.getElementById('perfil-msg').classList.add('hidden');

  // Modo obligatorio: oculta el botón volver y muestra el banner
  const bannerEl  = document.getElementById('perfil-obligatorio-banner');
  const volverBtn = document.getElementById('perfil-btn-volver');
  if (mandatory) {
    bannerEl.classList.remove('hidden');
    if (volverBtn) volverBtn.style.display = 'none';
  } else {
    bannerEl.classList.add('hidden');
    if (volverBtn) volverBtn.style.display = '';
  }
  document.getElementById('pass-msg').classList.add('hidden');
  document.getElementById('pass-actual').value    = '';
  document.getElementById('pass-nueva').value     = '';
  document.getElementById('pass-confirmar').value = '';

  // Stats
  const { data: hist } = await sb.from('test_resultados').select('tipo,nota,fecha').eq('arbitro_id', currentUser.id);
  const mensuales = (hist||[]).filter(h => h.tipo === 'mensual');
  const practicas = (hist||[]).filter(h => h.tipo === 'practica');
  const avgM = mensuales.length ? (mensuales.reduce((s,h)=>s+h.nota,0)/mensuales.length).toFixed(1) : '—';
  const bestM = mensuales.length ? Math.max(...mensuales.map(h=>h.nota)).toFixed(1) : '—';

  document.getElementById('perfil-stats').innerHTML = `
    <div class="stat-card"><div class="stat-num">${mensuales.length}</div><div class="stat-label">Mensuales</div></div>
    <div class="stat-card"><div class="stat-num">${practicas.length}</div><div class="stat-label">Práctica</div></div>
    <div class="stat-card"><div class="stat-num">${avgM}</div><div class="stat-label">Media</div></div>
    <div class="stat-card"><div class="stat-num nota-alta">${bestM}</div><div class="stat-label">Mejor</div></div>`;

  // Gráfico
  if (perfilChart) { perfilChart.destroy(); perfilChart = null; }
  const sorted = mensuales.sort((a,b) => new Date(a.fecha)-new Date(b.fecha));
  perfilChart = renderChart('chart-perfil', sorted);

  showScreen('screen-perfil');
}

async function savePerfil() {
  const telefono  = document.getElementById('perfil-telefono').value.trim();
  const email     = document.getElementById('perfil-email').value.trim().toLowerCase();
  const categoria = document.getElementById('perfil-categoria').value;
  const msgEl     = document.getElementById('perfil-msg');

  // Validar campos obligatorios
  if (!telefono || !email || !categoria) {
    msgEl.className = 'msg-err';
    msgEl.textContent = 'Teléfono, email y categoría son obligatorios.';
    msgEl.classList.remove('hidden');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    msgEl.className = 'msg-err';
    msgEl.textContent = 'Introduce un email válido.';
    msgEl.classList.remove('hidden');
    return;
  }

  const perfilCompleto = true;
  const { error } = await sb.from('arbitros')
    .update({ telefono, email, categoria, perfil_completo: perfilCompleto })
    .eq('id', currentUser.id);

  if (!error) {
    currentUser.telefono       = telefono;
    currentUser.email          = email;
    currentUser.categoria      = categoria;
    currentUser.perfil_completo = true;
  }

  msgEl.className = error ? 'msg-err' : 'msg-ok';
  msgEl.textContent = error ? 'Error al guardar. Inténtalo de nuevo.' : '✅ Perfil guardado correctamente.';
  msgEl.classList.remove('hidden');

  if (!error) {
    const eraMandatory = !document.getElementById('perfil-obligatorio-banner').classList.contains('hidden');
    if (eraMandatory) {
      // Perfil completado por primera vez → ir al dashboard
      setTimeout(() => openDashboard(), 1500);
    } else {
      setTimeout(() => msgEl.classList.add('hidden'), 3000);
    }
  }
}

async function changePassword() {
  const actual    = document.getElementById('pass-actual').value;
  const nueva     = document.getElementById('pass-nueva').value;
  const confirmar = document.getElementById('pass-confirmar').value;
  const msgEl     = document.getElementById('pass-msg');

  if (!actual || !nueva || !confirmar) {
    msgEl.className = 'msg-err'; msgEl.textContent = 'Rellena todos los campos.'; msgEl.classList.remove('hidden'); return;
  }
  if (nueva.length < 6) {
    msgEl.className = 'msg-err'; msgEl.textContent = 'La nueva contraseña debe tener al menos 6 caracteres.'; msgEl.classList.remove('hidden'); return;
  }
  if (nueva !== confirmar) {
    msgEl.className = 'msg-err'; msgEl.textContent = 'Las contraseñas no coinciden.'; msgEl.classList.remove('hidden'); return;
  }

  const { data } = await sb.from('arbitros').select('password').eq('id', currentUser.id).single();

  // Acepta tanto hash como texto plano (migración automática para cuentas antiguas)
  const hashedActual = await hashPassword(actual);
  const passwordOk = data.password === hashedActual || data.password === actual;
  if (!passwordOk) {
    msgEl.className = 'msg-err'; msgEl.textContent = 'La contraseña actual no es correcta.'; msgEl.classList.remove('hidden'); return;
  }

  const hashedNueva = await hashPassword(nueva);
  const { error } = await sb.from('arbitros').update({ password: hashedNueva }).eq('id', currentUser.id);
  msgEl.className = error ? 'msg-err' : 'msg-ok';
  msgEl.textContent = error ? 'Error al cambiar la contraseña.' : '✅ Contraseña cambiada correctamente.';
  msgEl.classList.remove('hidden');
  if (!error) {
    document.getElementById('pass-actual').value = '';
    document.getElementById('pass-nueva').value = '';
    document.getElementById('pass-confirmar').value = '';
    setTimeout(() => msgEl.classList.add('hidden'), 3000);
  }
}

// ── GRÁFICO ───────────────────────────────
function renderChart(canvasId, datos) {
  const ctx    = document.getElementById(canvasId);
  if (!ctx) return null;
  const labels = datos.map(d => formatDate(new Date(d.fecha)).split(' ')[0]);
  const notas  = datos.map(d => +d.nota.toFixed(2));

  return new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Nota mensual',
        data: notas,
        borderColor: '#F07020',
        backgroundColor: 'rgba(240,112,32,0.1)',
        borderWidth: 2.5,
        pointBackgroundColor: '#F07020',
        pointRadius: 5,
        pointHoverRadius: 7,
        tension: 0.3,
        fill: true,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          min: 0, max: 10,
          ticks: { stepSize: 2, font: { size: 11 } },
          grid: { color: 'rgba(0,0,0,0.05)' }
        },
        x: { ticks: { font: { size: 10 }, maxRotation: 45 } }
      }
    }
  });
}

// ── CONTROL TEST MENSUAL (ADMIN) ──────────
let adminChart = null;

async function loadConfigMensual() {
  const { data } = await sb.from('configuracion').select('valor').eq('clave', 'test_mensual_abierto').single();
  const abierto  = !data || data.valor === 'true';
  const toggle   = document.getElementById('toggle-mensual');
  const estado   = document.getElementById('control-mensual-estado');
  if (toggle) toggle.checked = abierto;
  if (estado) {
    estado.textContent = abierto ? '🟢 Abierto — los árbitros pueden hacer el test mensual' : '🔴 Cerrado — los árbitros no pueden hacer el test mensual';
    estado.className   = 'control-mensual-estado ' + (abierto ? 'estado-abierto' : 'estado-cerrado');
  }
}

async function toggleTestMensual() {
  const abierto = document.getElementById('toggle-mensual').checked;
  await sb.from('configuracion').upsert({ clave: 'test_mensual_abierto', valor: String(abierto) });
  const estado = document.getElementById('control-mensual-estado');
  estado.textContent = abierto ? '🟢 Abierto — los árbitros pueden hacer el test mensual' : '🔴 Cerrado — los árbitros no pueden hacer el test mensual';
  estado.className   = 'control-mensual-estado ' + (abierto ? 'estado-abierto' : 'estado-cerrado');
}

async function checkTestMensualAbierto() {
  const { data } = await sb.from('configuracion').select('valor').eq('clave', 'test_mensual_abierto').single();
  return !data || data.valor === 'true';
}

// ── INACTIVOS (ADMIN) ─────────────────────
async function renderInactivos(arbitros, resultados) {
  const hace2Meses = new Date();
  hace2Meses.setMonth(hace2Meses.getMonth() - 2);

  const inactivos = (arbitros||[]).filter(a => {
    const ultMensual = (resultados||[])
      .filter(r => r.arbitro_id === a.id && r.tipo === 'mensual')
      .sort((x,y) => new Date(y.fecha)-new Date(x.fecha))[0];
    return !ultMensual || new Date(ultMensual.fecha) < hace2Meses;
  });

  const section = document.getElementById('admin-inactivos-section');
  const lista   = document.getElementById('admin-inactivos-lista');
  if (inactivos.length === 0) { section.classList.add('hidden'); return; }

  document.getElementById('admin-inactivos-count').textContent = inactivos.length;
  section.classList.remove('hidden');
  lista.innerHTML = inactivos.map(a => {
    const ultMensual = (resultados||[])
      .filter(r => r.arbitro_id === a.id && r.tipo === 'mensual')
      .sort((x,y) => new Date(y.fecha)-new Date(x.fecha))[0];
    const cuando = ultMensual ? `Último test: ${formatDate(new Date(ultMensual.fecha))}` : 'Sin actividad';
    return `<div class="estado-item">
      <span class="estado-item-nombre">${a.nombre}</span>
      <span style="font-size:0.75rem;color:var(--text-3)">${cuando}</span>
    </div>`;
  }).join('');
}

function toggleInactivosList() {
  const lista = document.getElementById('admin-inactivos-lista');
  lista.classList.toggle('hidden');
}

// ── RESET CONTRASEÑA (ADMIN) ──────────────
let adminDetailUserId = null;

async function eliminarArbitro() {
  const { arbitros } = window._adminData || {};
  const a = (arbitros || []).find(x => x.id === adminDetailUserId);
  if (!a) return;

  const confirmado = confirm(`¿Seguro que quieres eliminar la cuenta de ${a.nombre}?\n\nSe borrarán todos sus datos e historial de tests. Esta acción NO se puede deshacer.`);
  if (!confirmado) return;

  // Primero borramos sus resultados, luego la cuenta
  await sb.from('test_resultados').delete().eq('arbitro_id', adminDetailUserId);
  const { error } = await sb.from('arbitros').delete().eq('id', adminDetailUserId);

  if (error) {
    alert('Error al eliminar la cuenta. Inténtalo de nuevo.');
    return;
  }

  closeAdminDetail();
  await openAdmin();
}

async function adminResetPassword() {
  const nueva  = document.getElementById('admin-new-pass').value.trim();
  const msgEl  = document.getElementById('admin-reset-msg');
  if (!nueva || nueva.length < 6) {
    msgEl.className = 'msg-err'; msgEl.textContent = 'La contraseña debe tener al menos 6 caracteres.'; msgEl.classList.remove('hidden'); return;
  }
  const hashedNueva = await hashPassword(nueva);
  const { error } = await sb.from('arbitros').update({ password: hashedNueva }).eq('id', adminDetailUserId);
  msgEl.className = error ? 'msg-err' : 'msg-ok';
  msgEl.textContent = error ? 'Error al resetear la contraseña.' : '✅ Contraseña reseteada correctamente.';
  msgEl.classList.remove('hidden');
  document.getElementById('admin-new-pass').value = '';
  setTimeout(() => msgEl.classList.add('hidden'), 3000);
}

// ── RANKING ───────────────────────────────
let rankingTab = 'mes';

function backToDashboard() {
  if (currentUser && !currentUser.isAdmin) openDashboard();
  else if (currentUser && currentUser.isAdmin) openAdmin();
  else showScreen('screen-home');
}

async function openRanking() {
  if (!currentUser || !currentUser.isAdmin) { showScreen('screen-home'); return; }
  showScreen('screen-loading');
  rankingTab = 'mes';
  document.getElementById('rtab-mes').classList.add('active');
  document.getElementById('rtab-historico').classList.remove('active');
  await renderRanking();
  showScreen('screen-ranking');
}

async function switchRankingTab(tab) {
  rankingTab = tab;
  document.querySelectorAll('#screen-ranking .htab').forEach(b => b.classList.remove('active'));
  document.getElementById('rtab-' + tab).classList.add('active');
  await renderRanking();
}

async function renderRanking() {
  document.getElementById('ranking-podio').innerHTML = '<p class="empty-msg">Cargando...</p>';
  document.getElementById('ranking-lista').innerHTML  = '';

  const tipoFiltro = currentUser?.adminTipo || currentUser?.tipo || 'arbitro';
  const { data: arbitros }   = await sb.from('arbitros').select('id, nombre, username').eq('aprobado', true).eq('tipo', tipoFiltro);
  let resultados;

  if (rankingTab === 'mes') {
    const now   = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
    const mes   = now.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    document.getElementById('ranking-mes-label').textContent = `📆 ${mes.charAt(0).toUpperCase() + mes.slice(1)}`;
    const { data } = await sb.from('test_resultados').select('arbitro_id, nota').eq('tipo', 'mensual').eq('tipo_usuario', tipoFiltro).gte('fecha', start).lte('fecha', end);
    resultados = data || [];
  } else {
    document.getElementById('ranking-mes-label').textContent = '📊 Todos los tests mensuales';
    const { data } = await sb.from('test_resultados').select('arbitro_id, nota').eq('tipo', 'mensual').eq('tipo_usuario', tipoFiltro);
    resultados = data || [];
  }

  // Calcular media por árbitro
  const mapaNotas = {};
  resultados.forEach(r => {
    if (!mapaNotas[r.arbitro_id]) mapaNotas[r.arbitro_id] = [];
    mapaNotas[r.arbitro_id].push(r.nota);
  });

  const clasificacion = (arbitros || [])
    .map(a => {
      const notas = mapaNotas[a.id] || [];
      const avg   = notas.length ? notas.reduce((s,n) => s+n, 0) / notas.length : null;
      return { ...a, avg, tests: notas.length };
    })
    .filter(a => a.avg !== null)
    .sort((a, b) => b.avg - a.avg);

  if (clasificacion.length === 0) {
    document.getElementById('ranking-podio').innerHTML = `
      <div class="ranking-empty">
        <div style="font-size:48px;margin-bottom:12px">🏅</div>
        <p>Todavía no hay resultados este mes.<br>¡Sé el primero en hacer el test mensual!</p>
      </div>`;
    document.getElementById('ranking-lista').innerHTML = '';
    return;
  }

  // PODIO (top 3)
  const coronas  = ['👑', '🥈', '🥉'];
  const podioClases = ['podio-1', 'podio-2', 'podio-3'];
  const top3 = clasificacion.slice(0, 3);
  const podioHTML = top3.map((a, i) => {
    const notaCls = a.avg >= 7 ? 'nota-alta' : a.avg >= 5 ? 'nota-media' : 'nota-baja';
    const esMio   = currentUser && a.id === currentUser.id ? ' (Tú)' : '';
    return `
      <div class="podio-item ${podioClases[i]}">
        <div class="podio-corona">${coronas[i]}</div>
        <div class="podio-pos">${i + 1}º</div>
        <div class="podio-nombre">${a.nombre}${esMio}</div>
        <div class="podio-nota ${notaCls}">${a.avg.toFixed(1)}</div>
        <div class="podio-sub">${a.tests} test${a.tests !== 1 ? 's' : ''}</div>
      </div>`;
  }).join('');
  document.getElementById('ranking-podio').innerHTML = podioHTML;

  // LISTA completa (desde posición 4)
  const resto = clasificacion.slice(3);
  if (resto.length === 0) {
    document.getElementById('ranking-lista').innerHTML = '';
    return;
  }

  document.getElementById('ranking-lista').innerHTML = resto.map((a, i) => {
    const pos     = i + 4;
    const notaCls = a.avg >= 7 ? 'nota-alta' : a.avg >= 5 ? 'nota-media' : 'nota-baja';
    const esMio   = currentUser && a.id === currentUser.id;
    return `
      <div class="ranking-item ${esMio ? 'yo' : ''}">
        <div class="ranking-pos">${pos}º</div>
        <div class="ranking-nombre">
          ${a.nombre}${esMio ? ' <span style="color:var(--orange)">← Tú</span>' : ''}
          <span>@${a.username} · ${a.tests} test${a.tests !== 1 ? 's' : ''}</span>
        </div>
        <div>
          <div class="ranking-nota ${notaCls}">${a.avg.toFixed(1)}</div>
        </div>
      </div>`;
  }).join('');
}

// ── DASHBOARD ─────────────────────────────────
async function openDashboard() {
  showScreen('screen-loading');

  // Recargar datos frescos del árbitro
  const { data: freshUser } = await sb.from('arbitros').select('*').eq('id', currentUser.id).single();
  if (freshUser) {
    currentUser = { ...currentUser, ...freshUser };
    appMode = currentUser.tipo || 'arbitro';
    loadPreguntas();
  }

  // Bloquear si el perfil no está completo
  if (!currentUser.perfil_completo) {
    await openPerfil(true);   // mandatory = true
    return;
  }

  document.getElementById('dash-name').textContent     = currentUser.nombre;
  document.getElementById('dash-username').textContent = '@' + currentUser.username;
  const roleBadge = document.getElementById('dash-role-badge');
  if (roleBadge) roleBadge.innerHTML = currentUser.tipo === 'oficial'
    ? '<span class="role-badge badge-oficial">📋 Oficial de Mesa</span>'
    : '<span class="role-badge badge-arbitro">🏀 Árbitro</span>';
  historyTab = 'todos';
  await Promise.all([renderStats(), renderHistory(), updateMensualCard()]);

  // Recordatorio día 25+ si no ha hecho el test mensual
  const hoy = new Date();
  const bannerRec = document.getElementById('banner-recordatorio');
  bannerRec.classList.add('hidden');
  if (hoy.getDate() >= 25) {
    const testMensual = await checkMonthlyTest();
    if (!testMensual) {
      document.getElementById('banner-dia').textContent = hoy.getDate();
      bannerRec.classList.remove('hidden');
      // Enviar email recordatorio una sola vez por mes (usando localStorage como control)
      const claveRecordatorio = `rem_${currentUser.id}_${hoy.getFullYear()}_${hoy.getMonth()}`;
      if (!localStorage.getItem(claveRecordatorio)) {
        sendReminderEmail(currentUser);
        localStorage.setItem(claveRecordatorio, '1');
      }
    }
  }

  showScreen('screen-dashboard');
}

async function checkMonthlyTest() {
  const now   = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  const { data } = await sb
    .from('test_resultados')
    .select('nota, fecha')
    .eq('arbitro_id', currentUser.id)
    .eq('tipo', 'mensual')
    .gte('fecha', start)
    .lte('fecha', end)
    .limit(1);

  return data && data.length > 0 ? data[0] : null;
}

function nextFirstOfMonth() {
  const now  = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return next.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

async function updateMensualCard() {
  const done  = await checkMonthlyTest();
  const card  = document.getElementById('card-mensual');
  const icon  = document.getElementById('mensual-icon');
  const title = document.getElementById('mensual-titulo');
  const desc  = document.getElementById('mensual-desc');
  const extra = document.getElementById('mensual-extra');

  if (done) {
    const notaCls = done.nota >= 7 ? 'nota-alta' : done.nota >= 5 ? 'nota-media' : 'nota-baja';
    card.classList.add('card-mensual-done');
    card.onclick = null;
    icon.textContent  = '✅';
    title.textContent = 'Test mensual completado';
    desc.textContent  = 'Ya has realizado el test de este mes';
    extra.innerHTML   = `
      <div class="mensual-nota-badge">
        <span>${done.nota.toFixed(1)}</span><span style="font-size:0.75rem;opacity:0.8">/ 10</span>
      </div>
      <div class="mensual-unlock">🔓 Próximo test: 1 de ${nextFirstOfMonth().split('de').slice(1).join('de').trim()}</div>`;
    extra.classList.remove('hidden');
  } else {
    card.classList.remove('card-mensual-done');
    card.onclick      = () => startTest('mensual');
    icon.textContent  = '📅';
    title.textContent = 'Realizar test mensual';
    desc.textContent  = '25 preguntas aleatorias · Nota oficial registrada';
    extra.classList.add('hidden');
  }
}

async function renderStats() {
  const { data: hist } = await sb
    .from('test_resultados')
    .select('tipo, nota, correctas, total')
    .eq('arbitro_id', currentUser.id);

  const todos     = hist || [];
  const mensuales = todos.filter(h => h.tipo === 'mensual');
  const practicas = todos.filter(h => h.tipo === 'practica');

  document.getElementById('stat-mensual').textContent  = mensuales.length;
  document.getElementById('stat-practica').textContent = practicas.length;
  document.getElementById('stat-total').textContent    = todos.length;

  if (mensuales.length === 0) {
    document.getElementById('stat-avg').textContent  = '—';
    document.getElementById('stat-best').textContent = '—';
  } else {
    const notas = mensuales.map(h => h.nota);
    document.getElementById('stat-avg').textContent  = (notas.reduce((a,b) => a+b,0) / notas.length).toFixed(1);
    document.getElementById('stat-best').textContent = Math.max(...notas).toFixed(1);
  }
}

async function switchHistoryTab(tab) {
  historyTab = tab;
  document.querySelectorAll('.htab').forEach(b => b.classList.remove('active'));
  document.getElementById('htab-' + tab).classList.add('active');
  await renderHistory();
}

async function renderHistory() {
  const el = document.getElementById('history-list');
  el.innerHTML = '<p class="empty-msg">Cargando...</p>';

  let query = sb
    .from('test_resultados')
    .select('*')
    .eq('arbitro_id', currentUser.id)
    .order('fecha', { ascending: false })
    .limit(30);

  if (historyTab !== 'todos') query = query.eq('tipo', historyTab);

  const { data: hist } = await query;

  if (!hist || hist.length === 0) {
    el.innerHTML = '<p class="empty-msg">No hay tests en esta categoría todavía.</p>';
    return;
  }

  el.innerHTML = hist.map(h => {
    const cls   = h.nota >= 7 ? 'nota-alta' : h.nota >= 5 ? 'nota-media' : 'nota-baja';
    const badge = h.tipo === 'mensual'
      ? '<span class="badge-mensual">Mensual</span>'
      : '<span class="badge-practica">Práctica</span>';
    const comentario = h.comentario_admin
      ? `<div class="history-comment">💬 <strong>Comentario del árbitro:</strong> ${h.comentario_admin}</div>`
      : '';
    return `<div class="history-item">
      <div class="history-item-left">
        <span class="history-fecha">${formatDate(new Date(h.fecha))}</span>
        <span class="history-tipo">${badge} · ${h.correctas}/${h.total} correctas</span>
        ${comentario}
      </div>
      <span class="history-nota ${cls}">${h.nota.toFixed(1)}</span>
    </div>`;
  }).join('');
}

// ── TEST ──────────────────────────────────────
function startAnonymousTest() {
  currentUser = null;
  startTest('practica');
}

async function startTestErrores() {
  if (!currentUser || currentUser.isAdmin) return;

  // Obtener todas las preguntas falladas por este árbitro
  const { data: falladas } = await sb
    .from('test_respuestas')
    .select('pregunta_id, test_resultados!inner(arbitro_id)')
    .eq('test_resultados.arbitro_id', currentUser.id)
    .eq('es_correcta', false);

  const MIN_ERRORES = 50;

  if (!falladas || falladas.length === 0) {
    alert('🎉 ¡Enhorabuena! No tienes ningún error registrado todavía.');
    return;
  }

  if (falladas.length < MIN_ERRORES) {
    const faltan = MIN_ERRORES - falladas.length;
    alert(`🔒 Test bloqueado. Necesitas al menos ${MIN_ERRORES} errores registrados para activar este modo.\n\nActualmente tienes ${falladas.length} error${falladas.length !== 1 ? 'es' : ''}. Te ${faltan === 1 ? 'falta 1 error más' : `faltan ${faltan} errores más`}.`);
    return;
  }

  // Contar frecuencia de fallos por pregunta y ordenar de mayor a menor
  const frecuencia = {};
  falladas.forEach(r => {
    frecuencia[r.pregunta_id] = (frecuencia[r.pregunta_id] || 0) + 1;
  });

  // Ordenar por número de fallos y tomar las más falladas
  const idsOrdenados = Object.entries(frecuencia)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => parseInt(id));

  const preguntasFalladas = idsOrdenados
    .map(id => PREGUNTAS.find(p => p.id === id))
    .filter(Boolean);

  // Tomar hasta 25, mezcladas (ordenadas por frecuencia de fallo)
  const seleccionadas = shuffle(preguntasFalladas).slice(0, TOTAL_PREGUNTAS);

  testState = {
    preguntas: seleccionadas,
    indice: 0, selecciones: {},
    tipo: 'practica',
    label: 'Test de Errores Habituales'
  };
  document.getElementById('test-title').textContent = 'Test de Errores Habituales';
  showScreen('screen-test');
  renderQuestion();
  initTimer();
}

async function startTest(tipo) {
  if (tipo === 'mensual' && currentUser && !currentUser.isAdmin) {
    const abierto = await checkTestMensualAbierto();
    if (!abierto) {
      alert('El test mensual está cerrado en este momento por el administrador. Consulta con tu comité.');
      return;
    }
    const done = await checkMonthlyTest();
    if (done) {
      alert(`Ya has realizado el test mensual de este mes (nota: ${done.nota.toFixed(1)}). El próximo se abre el 1 de ${nextFirstOfMonth().split('de').slice(1).join('de').trim()}.`);
      return;
    }
  }

  const seleccionadas = shuffle([...PREGUNTAS]).slice(0, 25);
  const label = tipo === 'mensual' ? 'Test Mensual Oficial' : 'Test de Práctica';

  testState = { preguntas: seleccionadas, indice: 0, selecciones: {}, tipo, label };
  document.getElementById('test-title').textContent = label;
  showScreen('screen-test');
  renderQuestion();
  initTimer();
}

function renderQuestion() {
  const { preguntas, indice, selecciones } = testState;
  const q          = preguntas[indice];
  const total      = preguntas.length;
  const selActual  = selecciones[indice]; // 'A'|'B'|'C'|undefined

  document.getElementById('test-progress-label').textContent = `${indice + 1} / ${total}`;
  document.getElementById('progress-bar-inner').style.width  = ((indice / total) * 100) + '%';
  const artEl = document.getElementById('q-articulo');
  if (artEl) { artEl.textContent = ''; artEl.style.display = 'none'; }
  document.getElementById('q-numero').textContent = 'Pregunta ' + (indice + 1);
  document.getElementById('q-texto').textContent  = q.pregunta;
  document.getElementById('q-feedback').className = 'feedback hidden';

  // Mostrar botón "Reportar pregunta" solo para árbitros registrados (no admin, no anónimo)
  const reportArea = document.getElementById('test-report-area');
  if (reportArea) reportArea.style.display = (currentUser && !currentUser.isAdmin) ? '' : 'none';

  // Navegación anterior/siguiente
  const btnAnt = document.getElementById('btn-anterior');
  const btnSig = document.getElementById('btn-siguiente');
  if (btnAnt) btnAnt.disabled = indice === 0;
  if (btnSig) btnSig.disabled = indice === total - 1;

  // Opciones — restaurar selección previa si ya se había contestado
  const letras = ['A','B','C'];
  document.getElementById('q-opciones').innerHTML = q.opciones.map((op, i) => {
    const estaElegida = letras[i] === selActual;
    return `<button class="option-btn${estaElegida ? ' elegida' : ''}" onclick="selectAnswer(${i})">
      <span class="option-label">${letras[i]}</span>
      <span>${op}</span>
    </button>`;
  }).join('');

  renderNavBar();
}

function selectAnswer(idx) {
  const { preguntas, indice } = testState;
  const q           = preguntas[indice];
  const letras      = ['A','B','C'];
  const elegida     = letras[idx];
  const esCorrecta  = elegida === q.correcta;
  const idxCorrecta = letras.indexOf(q.correcta);

  // Guardar selección (reemplaza si ya había respuesta previa)
  testState.selecciones[testState.indice] = elegida;

  // Marcar la opción elegida sin revelar correcto/incorrecto ni deshabilitar
  document.querySelectorAll('.option-btn').forEach((btn, i) => {
    btn.classList.toggle('elegida', i === idx);
  });

  renderNavBar();
}

function nextQuestion() {
  if (testState.indice < testState.preguntas.length - 1) {
    testState.indice++;
    renderQuestion();
  }
}

function prevQuestion() {
  if (testState.indice > 0) {
    testState.indice--;
    renderQuestion();
  }
}

function jumpToQuestion(idx) {
  testState.indice = idx;
  renderQuestion();
}

function renderNavBar() {
  const { preguntas, indice, selecciones } = testState;
  const el = document.getElementById('test-nav-circles');
  if (!el) return;

  const respondidas = Object.keys(selecciones).length;
  const total       = preguntas.length;
  const countEl     = document.getElementById('nav-bar-count');
  if (countEl) countEl.textContent = `${respondidas} de ${total} respondidas`;

  el.innerHTML = preguntas.map((_, i) => {
    const respondida = selecciones[i] !== undefined;
    const esCurrent  = i === indice;
    let cls = 'nav-circle';
    if (esCurrent)       cls += ' current';
    else if (respondida) cls += ' respondida';
    return `<button class="${cls}" onclick="jumpToQuestion(${i})">${i + 1}</button>`;
  }).join('');
}

function confirmExitTest() {
  if (confirm('¿Seguro que quieres salir? Perderás el progreso del test.')) { stopTimer(); afterResult(); }
}

async function finishTest(forzar = false) {
  const { preguntas, selecciones, tipo } = testState;
  const total = preguntas.length;

  // Comprobar preguntas sin responder (salvo cuando el tiempo expira)
  if (!forzar) {
    const sinResponder = preguntas.filter((_, i) => selecciones[i] === undefined).length;
    if (sinResponder > 0) {
      const ok = confirm(`Tienes ${sinResponder} pregunta${sinResponder !== 1 ? 's' : ''} sin responder.\n\nContarán como incorrectas. ¿Quieres finalizar igualmente?`);
      if (!ok) return;
    }
  }

  // Calcular resultados desde las selecciones
  const letras = ['A','B','C'];
  let correctas = 0;
  const respuestas = preguntas.map((q, i) => {
    const elegida    = selecciones[i] || null;
    const esCorrecta = elegida !== null && elegida === q.correcta;
    if (esCorrecta) correctas++;
    return {
      preguntaId: q.id, pregunta: q.pregunta, opciones: q.opciones,
      correcta: q.correcta, elegida: elegida || '—', esCorrecta,
      observacion: q.observacion, articulo: q.articulo
    };
  });
  testState.respuestas = respuestas;
  testState.correctas  = correctas;

  const nota = (correctas / total) * 10;

  if (currentUser && !currentUser.isAdmin) {
    const { data: resultado } = await sb.from('test_resultados')
      .insert({ arbitro_id: currentUser.id, tipo, correctas, total, nota, tipo_usuario: currentUser.tipo || 'arbitro' })
      .select().single();

    if (resultado) {
      const dbRespuestas = respuestas.map(r => ({
        resultado_id: resultado.id,
        pregunta_id:  r.preguntaId,
        elegida:      r.elegida,
        es_correcta:  r.esCorrecta
      }));
      await sb.from('test_respuestas').insert(dbRespuestas);
      sendTestCompletionEmail(currentUser, tipo, nota, correctas, total);
    }
  }

  stopTimer();
  renderResult(correctas, total, nota);
  showScreen('screen-result');
  if (tipo === 'mensual') updateMensualCard();
}

function renderResult(correctas, total, nota) {
  const aprobado = correctas >= MINIMO_APROBADO;
  const pct      = Math.round((correctas / total) * 100);
  const esMensual = testState.tipo === 'mensual';

  let emoji, titulo;
  if (correctas >= 24)              { emoji = '🏆'; titulo = '¡Sobresaliente!'; }
  else if (correctas >= MINIMO_APROBADO) { emoji = '✅'; titulo = '¡Aprobado!'; }
  else if (correctas >= 15)         { emoji = '📚'; titulo = 'Cerca del aprobado'; }
  else                              { emoji = '💪'; titulo = '¡Sigue practicando!'; }

  document.getElementById('result-emoji').textContent = emoji;
  document.getElementById('result-title').textContent = titulo;

  const cls = aprobado ? 'nota-alta' : correctas >= 15 ? 'nota-media' : 'nota-baja';
  document.getElementById('result-score').className   = 'result-score ' + cls;
  document.getElementById('result-score').textContent = `${correctas} / ${total}`;

  // Badge aprobado/suspenso (solo en test mensual)
  const badgeEl = document.getElementById('result-aprobado-badge');
  if (badgeEl) {
    if (esMensual) {
      badgeEl.textContent  = aprobado ? '✅ APROBADO' : '❌ SUSPENSO';
      badgeEl.className    = 'result-aprobado-badge ' + (aprobado ? 'aprobado' : 'suspenso');
      badgeEl.classList.remove('hidden');
    } else {
      badgeEl.classList.add('hidden');
    }
  }

  const faltan = MINIMO_APROBADO - correctas;
  const subMsg = aprobado
    ? `${pct}% de aciertos · Nota: ${nota.toFixed(1)}/10`
    : `${pct}% de aciertos · Te ${faltan === 1 ? 'faltó 1 acierto' : `faltaron ${faltan} aciertos`} para aprobar`;
  document.getElementById('result-nota').textContent = subMsg;
  document.getElementById('review-section').classList.add('hidden');
}

function reviewErrors() {
  const errores = testState.respuestas.filter(r => !r.esCorrecta);
  const el  = document.getElementById('review-list');
  const sec = document.getElementById('review-section');

  if (errores.length === 0) {
    el.innerHTML = '<p class="empty-msg">¡Sin errores! Todas las respuestas son correctas.</p>';
    sec.classList.remove('hidden');
    return;
  }

  const letras = ['A','B','C'];
  el.innerHTML = errores.map(r => {
    const idxC  = letras.indexOf(r.correcta);
    const obs   = r.observacion ? `<div class="review-item-obs">💡 ${r.observacion}</div>` : '';
    const art   = r.articulo ? `<div class="review-item-art">📖 Consulta el <strong>Artículo / Interpretación ${r.articulo}</strong></div>` : '';
    return `<div class="review-item">
      <div class="review-item-q">${r.pregunta}</div>
      <div class="review-item-wrong">Tu respuesta: ${r.elegida} — ${r.opciones[letras.indexOf(r.elegida)] || ''}</div>
      <div class="review-item-correct">✅ Correcta: ${r.correcta} — ${r.opciones[idxC]}</div>
      ${art}
      ${obs}
    </div>`;
  }).join('');

  sec.classList.remove('hidden');
  sec.scrollIntoView({ behavior: 'smooth' });
}

async function afterResult() {
  if (currentUser && !currentUser.isAdmin) openDashboard();
  else showScreen('screen-home');
}

// ── UTILIDADES ────────────────────────────────
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function formatDate(d) {
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

// ── MODAL REVISIÓN DE TEST ────────────────────
let currentModalResultadoId = null;

async function showTestReview(resultadoId, nombreArbitro, fecha, nota) {
  currentModalResultadoId = resultadoId;

  // Título y subtítulo del modal
  document.getElementById('modal-titulo').textContent = nombreArbitro;
  document.getElementById('modal-sub').textContent = `${fecha} · Nota: ${nota}`;

  // Limpiar mensaje de guardado
  document.getElementById('modal-comment-msg').classList.add('hidden');

  // Cargar comentario existente
  const { data: resultado } = await sb
    .from('test_resultados')
    .select('comentario_admin')
    .eq('id', resultadoId)
    .single();
  document.getElementById('modal-comentario').value = resultado?.comentario_admin || '';

  // Cargar respuestas individuales
  const { data: respuestas } = await sb
    .from('test_respuestas')
    .select('*')
    .eq('resultado_id', resultadoId);

  const letras = ['A', 'B', 'C'];
  const body = document.getElementById('modal-body');

  if (!respuestas || respuestas.length === 0) {
    body.innerHTML = '<p class="empty-msg">No hay respuestas detalladas guardadas para este test.</p>';
  } else {
    body.innerHTML = respuestas.map((r, i) => {
      const pregunta = PREGUNTAS.find(p => p.id === r.pregunta_id);
      if (!pregunta) return '';
      const clsBloque = r.es_correcta ? 'ok' : 'mal';
      const idxCorrecta = letras.indexOf(pregunta.correcta);
      const art = pregunta.articulo
        ? `<div class="modal-art">📖 Art. / Interp. <strong>${pregunta.articulo}</strong></div>`
        : '';
      const obs = pregunta.observacion
        ? `<div class="modal-obs">💡 ${pregunta.observacion}</div>`
        : '';
      const opciones = pregunta.opciones.map((op, j) => {
        let clsOp = '';
        if (j === idxCorrecta) clsOp = 'correcta';
        else if (letras[j] === r.elegida && !r.es_correcta) clsOp = 'elegida-mal';
        return `<div class="modal-opcion ${clsOp}">
          <span class="modal-opcion-letra">${letras[j]}</span>${op}
        </div>`;
      }).join('');
      return `<div class="modal-pregunta ${clsBloque}">
        <div class="modal-pregunta-header">
          <span class="modal-q-num">${i + 1}.</span> ${pregunta.pregunta}
        </div>
        <div class="modal-pregunta-respuestas">${opciones}</div>
        ${art}
        ${obs}
      </div>`;
    }).join('');
  }

  // Mostrar modal
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('modal-test').classList.remove('hidden');
  document.getElementById('modal-test').scrollTop = 0;
}

async function saveAdminComment() {
  if (!currentModalResultadoId) return;
  const comentario = document.getElementById('modal-comentario').value.trim();
  await sb
    .from('test_resultados')
    .update({ comentario_admin: comentario })
    .eq('id', currentModalResultadoId);
  const msg = document.getElementById('modal-comment-msg');
  msg.classList.remove('hidden');
  setTimeout(() => msg.classList.add('hidden'), 2500);
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('modal-test').classList.add('hidden');
  currentModalResultadoId = null;
}

// ── MODAL POLÍTICA DE PRIVACIDAD ─────────────
function showPrivacyModal() {
  document.getElementById('privacy-overlay').classList.remove('hidden');
  document.getElementById('privacy-modal').classList.remove('hidden');
  document.getElementById('privacy-modal').scrollTop = 0;
}

function closePrivacyModal() {
  document.getElementById('privacy-overlay').classList.add('hidden');
  document.getElementById('privacy-modal').classList.add('hidden');
}

// ── RECUPERAR CONTRASEÑA (ÁRBITRO) ───────────
async function solicitarRecuperacion() {
  const username = document.getElementById('forgot-user').value.trim();
  const msgEl    = document.getElementById('forgot-msg');
  const btn      = document.getElementById('btn-forgot');
  msgEl.classList.add('hidden');

  if (!username) {
    msgEl.className = 'msg-err'; msgEl.textContent = 'Introduce tu nombre de usuario.'; msgEl.classList.remove('hidden'); return;
  }
  if (username === ADMIN_USER) {
    msgEl.className = 'msg-err'; msgEl.textContent = 'Usuario no válido.'; msgEl.classList.remove('hidden'); return;
  }

  btn.disabled = true; btn.textContent = 'Enviando...';

  // Buscamos silenciosamente si el usuario existe (no revelamos si existe o no)
  const { data: existe } = await sb.from('arbitros').select('id, nombre').eq('username', username).eq('aprobado', true).single();
  if (existe) {
    await sb.from('solicitudes_password').insert({ username, nombre: existe.nombre, tipo: appMode || 'arbitro' });
  }

  btn.disabled = false; btn.textContent = 'Enviar solicitud';
  msgEl.className = 'msg-ok';
  msgEl.textContent = '✅ Solicitud enviada. El administrador del CBiAB te asignará una nueva contraseña en breve.';
  msgEl.classList.remove('hidden');
  document.getElementById('forgot-user').value = '';
}

// ── REPORTAR PREGUNTA (ÁRBITRO) ───────────────
function openReportModal() {
  if (!currentUser || currentUser.isAdmin) return;
  const q = testState.preguntas[testState.indice];
  document.getElementById('report-modal-sub').textContent = `Pregunta ${testState.indice + 1} de ${testState.preguntas.length}`;
  document.getElementById('report-descripcion').value = '';
  document.getElementById('report-msg').classList.add('hidden');
  document.getElementById('report-overlay').classList.remove('hidden');
  document.getElementById('report-modal').classList.remove('hidden');
}

async function submitReport() {
  if (!currentUser || currentUser.isAdmin) return;
  const descripcion = document.getElementById('report-descripcion').value.trim();
  const msgEl       = document.getElementById('report-msg');

  if (!descripcion) {
    msgEl.className = 'msg-err'; msgEl.textContent = 'Describe el problema antes de enviar.'; msgEl.classList.remove('hidden'); return;
  }

  const q = testState.preguntas[testState.indice];
  const { error } = await sb.from('reportes_preguntas').insert({
    pregunta_id: q.id,
    arbitro_id:  currentUser.id,
    descripcion,
    tipo: currentUser.tipo || 'arbitro'
  });

  if (error) {
    msgEl.className = 'msg-err'; msgEl.textContent = 'Error al enviar el reporte. Inténtalo de nuevo.'; msgEl.classList.remove('hidden'); return;
  }

  msgEl.className = 'msg-ok'; msgEl.textContent = '✅ Reporte enviado. Gracias por tu colaboración.'; msgEl.classList.remove('hidden');
  setTimeout(() => closeReportModal(), 2000);
}

function closeReportModal() {
  document.getElementById('report-overlay').classList.add('hidden');
  document.getElementById('report-modal').classList.add('hidden');
}

// ── REPORTES DE PREGUNTAS (ADMIN) ─────────────
async function loadReportes() {
  const { data } = await sb
    .from('reportes_preguntas')
    .select('*, arbitros(nombre, username)')
    .eq('revisado', false)
    .eq('tipo', currentUser.adminTipo)
    .order('fecha', { ascending: false });

  const section = document.getElementById('admin-reportes-section');
  const lista   = document.getElementById('admin-reportes-lista');
  if (!data || data.length === 0) { section.classList.add('hidden'); return; }

  document.getElementById('admin-reportes-count').textContent = data.length;
  section.classList.remove('hidden');

  lista.innerHTML = data.map(r => {
    const pregunta      = PREGUNTAS.find(p => p.id === r.pregunta_id);
    const nombreArbitro = r.arbitros?.nombre || 'Desconocido';
    const fecha         = formatDate(new Date(r.fecha));
    const textoCorto    = pregunta ? pregunta.pregunta.substring(0, 65) + (pregunta.pregunta.length > 65 ? '…' : '') : `Pregunta #${r.pregunta_id} (no encontrada)`;

    // Construir detalle completo de la pregunta
    let detalleHTML = '';
    if (pregunta) {
      const letras = ['A','B','C'];
      const opcionesHTML = pregunta.opciones.map((op, i) => {
        const esCorrecta = letras[i] === pregunta.correcta;
        return `<div class="reporte-opcion${esCorrecta ? ' reporte-opcion-ok' : ''}">
          <span class="reporte-opcion-letra">${letras[i]}</span>
          <span>${op}</span>
          ${esCorrecta ? '<span class="reporte-correcta-tag">✅ Correcta</span>' : ''}
        </div>`;
      }).join('');
      const artHTML = pregunta.articulo ? `<div class="reporte-art">📖 Artículo / Interpretación <strong>${pregunta.articulo}</strong></div>` : '';
      const obsHTML = pregunta.observacion ? `<div class="reporte-obs">💡 ${pregunta.observacion}</div>` : '';
      detalleHTML = `<div class="reporte-detalle hidden" id="detalle-${r.id}">
        <div class="reporte-pregunta-texto">${pregunta.pregunta}</div>
        ${opcionesHTML}
        ${artHTML}
        ${obsHTML}
      </div>`;
    }

    return `<div class="reporte-item-wrap" id="reporte-${r.id}">
      <div class="estado-item" style="flex-wrap:wrap;gap:8px;align-items:flex-start">
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:0.86rem;color:var(--text);margin-bottom:3px">
            ⚠️ Pregunta #${r.pregunta_id}: ${textoCorto}
          </div>
          <div style="font-size:0.8rem;color:var(--text-2);margin-bottom:4px">💬 <em>${r.descripcion}</em></div>
          <div style="font-size:0.74rem;color:var(--text-3)">Por ${nombreArbitro} · ${fecha}</div>
        </div>
        <div style="display:flex;gap:8px;flex-shrink:0;align-items:center;flex-wrap:wrap">
          ${pregunta ? `<button class="btn-ver" onclick="togglePreguntaDetalle('${r.id}')">🔍 Ver pregunta</button>` : ''}
          <button class="btn-aprobar" onclick="marcarReporteRevisado('${r.id}')">✅ Revisado</button>
        </div>
      </div>
      ${detalleHTML}
    </div>`;
  }).join('');
}

function toggleReportesList() {
  document.getElementById('admin-reportes-lista').classList.toggle('hidden');
}

function togglePreguntaDetalle(id) {
  const el = document.getElementById('detalle-' + id);
  if (!el) return;
  const btn = el.closest('.reporte-item-wrap')?.querySelector('.btn-ver');
  const isHidden = el.classList.toggle('hidden');
  if (btn) btn.textContent = isHidden ? '🔍 Ver pregunta' : '🔼 Ocultar';
}

async function marcarReporteRevisado(id) {
  await sb.from('reportes_preguntas').update({ revisado: true }).eq('id', id);
  document.getElementById('reporte-' + id)?.remove();
  const section = document.getElementById('admin-reportes-section');
  const quedan  = section.querySelectorAll('.reporte-item-wrap').length;
  if (quedan === 0) section.classList.add('hidden');
  else document.getElementById('admin-reportes-count').textContent = quedan;
}

// ── SOLICITUDES CONTRASEÑA OLVIDADA (ADMIN) ───
async function loadSolicitudesPassword() {
  const { data } = await sb
    .from('solicitudes_password')
    .select('*')
    .eq('atendida', false)
    .eq('tipo', currentUser.adminTipo)
    .order('fecha', { ascending: false });

  const section = document.getElementById('admin-forgot-section');
  const lista   = document.getElementById('admin-forgot-lista');
  if (!data || data.length === 0) { section.classList.add('hidden'); return; }

  document.getElementById('admin-forgot-count').textContent = data.length;
  section.classList.remove('hidden');

  lista.innerHTML = data.map(s => {
    const fecha = formatDate(new Date(s.fecha));
    return `<div class="estado-item solicitud-item" id="solicitud-${s.id}">
      <div style="flex:1">
        <div style="font-weight:700;font-size:0.87rem;color:var(--text)">${s.nombre || s.username}</div>
        <div style="font-size:0.75rem;color:var(--text-3)">@${s.username} · ${fecha}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-shrink:0">
        <button class="btn-ver" onclick="irAArbitro('${s.username}')">Ver árbitro</button>
        <button class="btn-aprobar" onclick="marcarSolicitudAtendida('${s.id}')">✅ Atendida</button>
      </div>
    </div>`;
  }).join('');
}

function toggleForgotList() {
  document.getElementById('admin-forgot-lista').classList.toggle('hidden');
}

async function marcarSolicitudAtendida(id) {
  await sb.from('solicitudes_password').update({ atendida: true }).eq('id', id);
  document.getElementById('solicitud-' + id)?.remove();
  const section = document.getElementById('admin-forgot-section');
  const quedan  = section.querySelectorAll('.solicitud-item').length;
  if (quedan === 0) section.classList.add('hidden');
  else document.getElementById('admin-forgot-count').textContent = quedan;
}

async function irAArbitro(username) {
  const adminData = window._adminData || {};
  const a = (adminData.arbitros || []).find(x => x.username === username);
  if (a) showAdminDetail(a.id);
}

// ── PWA: Registro del Service Worker ──────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// ── INIT ──────────────────────────────────────
loadPreguntas();
showScreen('screen-home');
