// ----------------- firebaseConfig (cole aqui os valores fornecidos pelo Firebase) -----------------
const firebaseConfig = {
  apiKey: "AIzaSyAvjmkcVOoU0pe_GU8QJfyDj07S7Pnu3CY",
  authDomain: "sistema-de-gest-7dfa5.firebaseapp.com",
  projectId: "sistema-de-gest-7dfa5",
  storageBucket: "sistema-de-gest-7dfa5.firebasestorage.app",
  messagingSenderId: "529678052090",
  appId: "1:529678052090:web:6eabdb80f055804b5d7743",
  measurementId: "G-PN2D0B6SZQ"
};
// -------------------------------------------------------------------------------------

if (!firebaseConfig || !firebaseConfig.apiKey) {
  console.error('ERRO: Cole o firebaseConfig no início deste arquivo.');
  alert('ATENÇÃO: Você precisa colar o firebaseConfig (do Firebase Console) em app.js.');
}

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const collClientes = db.collection('clientes');
const collMP = db.collection('mpList');
const collPedidos = db.collection('pedidos');
const collFinanceiro = db.collection('financeiro');
const collServicos = db.collection('servicos');
const collCadServico = db.collection('cadServico');
const collPropostas = db.collection('propostas');
const collUsers = db.collection('users');

let currentUser = null;
let listenersStarted = false;

async function hashPassword(password) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(password));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

async function seedAdmin() {
  try {
    const snap = await collUsers.where('username', '==', 'admin').get();
    if (snap.empty) {
      const hash = await hashPassword('password2026');
      await collUsers.add({ username: 'admin', passwordHash: hash, role: 'admin', createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    }
  } catch(e) { console.warn('Aviso ao inicializar admin:', e); }
}

async function doLogin(username, password) {
  const hash = await hashPassword(password);
  const snap = await collUsers.where('username', '==', username).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  if (doc.data().passwordHash !== hash) return null;
  return { id: doc.id, username: doc.data().username, role: doc.data().role };
}

let clientes = []; let mpList = []; let pedidos = []; let financeiro = []; let servicos = []; let propostas = []; let cadServicos = [];

let statusEl = document.getElementById('status');
if (!statusEl) {
  statusEl = document.createElement('p');
  statusEl.id = 'status'; statusEl.style.color = '#333'; statusEl.style.fontSize = '0.95rem'; statusEl.style.margin = '0.5rem 0';
  const container = document.querySelector('body');
  container.insertBefore(statusEl, container.firstChild);
}
function showStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? 'crimson' : '#333';
  console.log(text);
}

// Helpers
function onlyDigits(v){ return v.replace(/\D/g,''); }
function maskCPF(v){ v = onlyDigits(v).slice(0,11); v = v.replace(/(\d{3})(\d)/, '$1.$2'); v = v.replace(/(\d{3})(\d)/, '$1.$2'); v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2'); return v; }
function maskCNPJ(v){ v = onlyDigits(v).slice(0,14); v = v.replace(/^(\d{2})(\d)/, '$1.$2'); v = v.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3'); v = v.replace(/\.(\d{3})(\d)/, '.$1/$2'); v = v.replace(/(\d{4})(\d{1,2})$/, '$1-$2'); return v; }
function maskPhone(v){ v = onlyDigits(v); if(v.length > 11) v = v.slice(0,11); if(v.length <= 10){ v = v.replace(/^(\d{2})(\d)/, '($1) $2'); v = v.replace(/(\d{4})(\d)/, '$1-$2'); } else { v = v.replace(/^(\d{2})(\d)/, '($1) $2'); v = v.replace(/(\d{5})(\d)/, '$1-$2'); } return v; }
function parseDateInputAsLocal(dateStr){ if(!dateStr) return null; const parts = dateStr.split('-'); if(parts.length !== 3) return null; return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])); }
function formatDateToDDMMYYYY(dateObj){ if(!dateObj || !(dateObj instanceof Date)) return ""; return `${String(dateObj.getDate()).padStart(2,'0')}/${String(dateObj.getMonth()+1).padStart(2,'0')}/${dateObj.getFullYear()}`; }
function parseDDMMYYYYToDate(s){ if(!s || typeof s !== 'string') return null; const parts = s.split('/'); if(parts.length !== 3) return null; return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0])); }
function formatDateToISO(dateObj){ if(!dateObj || !(dateObj instanceof Date)) return ""; return `${dateObj.getFullYear()}-${String(dateObj.getMonth()+1).padStart(2,'0')}-${String(dateObj.getDate()).padStart(2,'0')}`; }
function formatCurrencyBR(v){ const n = Number(v) || 0; return n.toFixed(2).replace('.', ','); }
function escapeHTML(s){ if(s === null || s === undefined) return ''; return String(s).replace(/[&<>"']/g, function(m){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]; }); }

document.addEventListener('DOMContentLoaded', function () {
  M.FormSelect.init(document.querySelectorAll('select'));
  M.Tooltip.init(document.querySelectorAll('.tooltipped'));

  const _dashCharts = {};
  let _dashTimer = null;

  const clienteDocTipoEl = document.getElementById('clienteDocTipo');
  const clienteDocEl = document.getElementById('clienteDoc');
  const clienteTelEl = document.getElementById('clienteTel');
  function applyDocMask(){ const tipo = clienteDocTipoEl.value; let v = clienteDocEl.value || ''; clienteDocEl.value = (tipo === 'cnpj') ? maskCNPJ(v) : maskCPF(v); }
  clienteDocTipoEl.addEventListener('change', ()=>{ applyDocMask(); M.FormSelect.init(clienteDocTipoEl); });
  clienteDocEl.addEventListener('input', ()=> applyDocMask());
  clienteTelEl.addEventListener('input', ()=> { clienteTelEl.value = maskPhone(clienteTelEl.value); });

  const sideMenu = document.getElementById('sideMenu');
  const sideTrigger = document.getElementById('sideTrigger');
  const menuOverlay = document.getElementById('menuOverlay');
  function openMenu(){ sideMenu.classList.add('open'); menuOverlay.classList.add('visible'); }
  function closeMenu(){ sideMenu.classList.remove('open'); menuOverlay.classList.remove('visible'); }
  sideTrigger.addEventListener('click', ()=> { if(sideMenu.classList.contains('open')) closeMenu(); else openMenu(); });
  menuOverlay.addEventListener('click', closeMenu);

  const TARGET_TO_TAB = {
    'sectionDashboard': 'sectionDashboard',
    'formCliente': 'tab-clientes',
    'formCadastroMP': 'tab-produtos',
    'formCadastroServico': 'tab-cadservico',
    'formPedidoSection': 'tab-pedidos',
    'pedidosTable': 'tab-pedidos',
    'formServico': 'tab-servico',
    'sectionPropostas': 'sectionPropostas',
    'financeiroTable': 'tab-financeiro',
    'sectionUsuarios': 'sectionUsuarios',
  };

  const TAB_TITLES = {
    'sectionDashboard': 'Dashboard',
    'tab-clientes': 'Cadastro de Cliente',
    'tab-produtos': 'Cadastro de Produto (MP)',
    'tab-cadservico': 'Cadastro de Serviço',
    'tab-pedidos': 'Pedidos',
    'tab-servico': 'Prestação de Serviço',
    'sectionPropostas': 'Proposta Comercial',
    'tab-financeiro': 'Financeiro',
    'sectionUsuarios': 'Gestão de Usuários',
  };
  const DEFAULT_WINDOW_TITLE = 'Janela';

  const dashboardTab = document.getElementById('sectionDashboard');
  const pageTabs = Array.from(document.querySelectorAll('.page-tab'));
  const windowTabs = pageTabs.filter(tab => tab.id !== 'sectionDashboard');
  const containerEl = document.querySelector('.container');
  const dashboardIndex = containerEl && dashboardTab ? Array.from(containerEl.children).indexOf(dashboardTab) : -1;

  const sectionWindowHost = document.createElement('div');
  sectionWindowHost.id = 'sectionWindowHost';
  sectionWindowHost.className = 'section-window-host';

  const sectionWindow = document.createElement('section');
  sectionWindow.id = 'sectionWindow';
  sectionWindow.className = 'section-window';
  sectionWindow.hidden = true;

  const sectionWindowHeader = document.createElement('div');
  sectionWindowHeader.className = 'section-window__header';

  const sectionWindowTitle = document.createElement('strong');
  sectionWindowTitle.id = 'sectionWindowTitle';
  sectionWindowTitle.className = 'section-window__title';
  sectionWindowTitle.textContent = DEFAULT_WINDOW_TITLE;

  const sectionWindowActions = document.createElement('div');
  sectionWindowActions.className = 'section-window__actions';

  const btnWindowMaximize = document.createElement('button');
  btnWindowMaximize.type = 'button';
  btnWindowMaximize.id = 'btnWindowMaximize';
  btnWindowMaximize.className = 'section-window__control';
  btnWindowMaximize.title = 'Maximizar janela';
  btnWindowMaximize.setAttribute('aria-label', 'Maximizar janela');
  btnWindowMaximize.innerHTML = '<span class="material-icons">open_in_full</span>';

  const btnWindowClose = document.createElement('button');
  btnWindowClose.type = 'button';
  btnWindowClose.id = 'btnWindowClose';
  btnWindowClose.className = 'section-window__control';
  btnWindowClose.title = 'Fechar janela';
  btnWindowClose.setAttribute('aria-label', 'Fechar janela');
  btnWindowClose.innerHTML = '<span class="material-icons">close</span>';

  const sectionWindowBody = document.createElement('div');
  sectionWindowBody.id = 'sectionWindowBody';
  sectionWindowBody.className = 'section-window__body';

  sectionWindowActions.appendChild(btnWindowMaximize);
  sectionWindowActions.appendChild(btnWindowClose);
  sectionWindowHeader.appendChild(sectionWindowTitle);
  sectionWindowHeader.appendChild(sectionWindowActions);
  sectionWindow.appendChild(sectionWindowHeader);
  sectionWindow.appendChild(sectionWindowBody);
  sectionWindowHost.appendChild(sectionWindow);

  if(containerEl){
    if(dashboardIndex >= 0 && containerEl.children[dashboardIndex + 1]){
      containerEl.insertBefore(sectionWindowHost, containerEl.children[dashboardIndex + 1]);
    } else {
      containerEl.appendChild(sectionWindowHost);
    }
  }

  windowTabs.forEach(tab => sectionWindowBody.appendChild(tab));

  let currentWindowTabId = null;

  function setMenuActive(tabId){
    document.querySelectorAll('#sideMenu li[data-target]').forEach(li => {
      const liTab = TARGET_TO_TAB[li.dataset.target] || li.dataset.target;
      li.classList.toggle('menu-active', liTab === tabId);
    });
  }

  function closeSectionWindow(options = {}){
    const { keepMenuState = false } = options;
    if(currentWindowTabId){
      const currentTab = document.getElementById(currentWindowTabId);
      if(currentTab) currentTab.classList.remove('active');
    }
    currentWindowTabId = null;
    sectionWindow.hidden = true;
    sectionWindow.classList.remove('section-window--maximized');
    btnWindowMaximize.innerHTML = '<span class="material-icons">open_in_full</span>';
    btnWindowMaximize.title = 'Maximizar janela';
    btnWindowMaximize.setAttribute('aria-label', 'Maximizar janela');
    sectionWindowTitle.textContent = DEFAULT_WINDOW_TITLE;
    if(dashboardTab) dashboardTab.classList.add('active');
    if(!keepMenuState) setMenuActive('sectionDashboard');
  }

  function toggleSectionWindowMaximize(){
    const maximized = sectionWindow.classList.toggle('section-window--maximized');
    btnWindowMaximize.innerHTML = `<span class="material-icons">${maximized ? 'close_fullscreen' : 'open_in_full'}</span>`;
    btnWindowMaximize.title = maximized ? 'Restaurar janela' : 'Maximizar janela';
    btnWindowMaximize.setAttribute('aria-label', maximized ? 'Restaurar janela' : 'Maximizar janela');
  }

  function showTab(tabId){
    if(tabId === 'sectionDashboard'){
      closeSectionWindow({ keepMenuState: true });
      if(dashboardTab) dashboardTab.classList.add('active');
      setMenuActive('sectionDashboard');
      window.scrollTo(0, 0);
      return true;
    }

    const tab = document.getElementById(tabId);
    if(!tab) return false;

    if(currentWindowTabId && currentWindowTabId !== tabId){
      M.toast({ html: 'Feche a janela atual antes de abrir outra seção.' });
      return false;
    }

    if(dashboardTab) dashboardTab.classList.add('active');
    windowTabs.forEach(el => { if(el.id !== tabId) el.classList.remove('active'); });
    tab.classList.add('active');
    currentWindowTabId = tabId;
    sectionWindowTitle.textContent = TAB_TITLES[tabId] || DEFAULT_WINDOW_TITLE;
    sectionWindow.hidden = false;
    setMenuActive(tabId);
    window.scrollTo(0, 0);
    return true;
  }

  sideMenu.querySelectorAll('li[data-target]').forEach(li=>{
    li.addEventListener('click', ()=>{
      const tabId = TARGET_TO_TAB[li.dataset.target] || li.dataset.target;
      if(showTab(tabId)) closeMenu();
    });
  });

  btnWindowClose.addEventListener('click', () => closeSectionWindow());
  btnWindowMaximize.addEventListener('click', toggleSectionWindowMaximize);

  document.getElementById('buscarCEP').onclick = async function(){
    const cep = document.getElementById('clienteCEP').value.replace(/\D/g,'');
    if(cep.length != 8) return M.toast({html:"CEP inválido!"});
    fetch(`https://viacep.com.br/ws/${cep}/json/`).then(r=>r.json()).then(d=>{
      if(d.erro) return M.toast({html:"CEP não encontrado!"});
      document.getElementById('clienteEnd').value = `${d.logradouro || ''}, ${d.bairro || ''} - ${d.localidade || ''} / ${d.uf || ''}`;
      M.updateTextFields();
    });
  };

  // ====== AUTH SETUP ======
  function hideLoginOverlay(){ const o = document.getElementById('loginOverlay'); if(o) o.classList.add('hidden'); }
  function showLoginOverlay(){ const o = document.getElementById('loginOverlay'); if(o) o.classList.remove('hidden'); const u = document.getElementById('loginUsername'); if(u) u.value=''; const p = document.getElementById('loginPassword'); if(p) p.value=''; const err = document.getElementById('loginError'); if(err) err.textContent=''; }
  function applyRoleUI(){ const isAdmin = currentUser && currentUser.role === 'admin'; const sU = document.getElementById('sectionUsuarios'); if(sU) sU.style.display = isAdmin ? '' : 'none'; const mU = document.getElementById('menuUsuarios'); if(mU) mU.style.display = isAdmin ? '' : 'none'; const ni = document.getElementById('navUserInfo'); if(ni && currentUser){ ni.textContent = `${currentUser.username} (${isAdmin ? 'Admin' : 'Usuário'})`; ni.style.display = ''; } const bl = document.getElementById('btnLogout'); if(bl) bl.style.display = ''; }

  document.getElementById('formLogin').onsubmit = async function(e){
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errEl = document.getElementById('loginError');
    const btn = document.getElementById('btnLogin');
    if(!username || !password){ errEl.textContent = 'Preencha usuário e senha!'; return; }
    btn.disabled = true; btn.innerHTML = 'Aguarde...';
    try {
      const user = await doLogin(username, password);
      if(!user){ errEl.textContent = 'Usuário ou senha inválidos!'; }
      else { errEl.textContent = ''; currentUser = user; sessionStorage.setItem('currentUser', JSON.stringify(user)); hideLoginOverlay(); applyRoleUI(); setupUserManagement(); startRealtimeListeners(); showTab('sectionDashboard'); }
    } catch(err){ errEl.textContent = 'Erro ao fazer login. Tente novamente.'; }
    btn.disabled = false; btn.innerHTML = '<span class="material-icons left">login</span>Entrar';
  };

  document.getElementById('btnLogout').onclick = function(e){
    e.preventDefault();
    _unsubs.forEach(fn => fn()); _unsubs = [];
    currentUser = null; listenersStarted = false; sessionStorage.removeItem('currentUser');
    clientes = []; mpList = []; pedidos = []; financeiro = []; servicos = []; propostas = []; cadServicos = [];
    document.getElementById('sectionUsuarios').style.display = 'none';
    document.getElementById('menuUsuarios').style.display = 'none';
    document.getElementById('navUserInfo').style.display = 'none';
    document.getElementById('btnLogout').style.display = 'none';
    showLoginOverlay();
  };

  seedAdmin();
  (async () => {
    const _savedUser = sessionStorage.getItem('currentUser');
    if(_savedUser){
      try {
        const parsed = JSON.parse(_savedUser);
        const userDoc = await collUsers.doc(parsed.id).get();
        if(userDoc.exists && userDoc.data().username === parsed.username){
          currentUser = { id: userDoc.id, username: userDoc.data().username, role: userDoc.data().role };
          sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
          hideLoginOverlay(); applyRoleUI(); setupUserManagement(); startRealtimeListeners(); showTab('sectionDashboard');
        } else {
          sessionStorage.removeItem('currentUser');
        }
      } catch(e){ sessionStorage.removeItem('currentUser'); }
    }
  })();
  document.getElementById('formCliente').onsubmit = async function(e){
    e.preventDefault();
    const id = document.getElementById('clienteEditId').value || null;
    const nome = document.getElementById('clienteNome').value.trim();
    const docTipo = document.getElementById('clienteDocTipo').value;
    const doc = document.getElementById('clienteDoc').value.trim();
    if(!nome || !docTipo || !doc) return M.toast({html: "Preencha os campos obrigatórios!"});
    const obj = { nome, docTipo, doc, tel: document.getElementById('clienteTel').value.trim(), email: document.getElementById('clienteEmail').value.trim(), cep: document.getElementById('clienteCEP').value.trim(), endereco: document.getElementById('clienteEnd').value.trim(), numero: document.getElementById('clienteNum').value.trim(), complemento: document.getElementById('clienteComp').value.trim(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    try {
      if(id){ await collClientes.doc(id).set(obj, { merge: true }); document.getElementById('clienteEditId').value = ''; M.toast({html:"Cliente atualizado!"}); }
      else { obj.createdAt = firebase.firestore.FieldValue.serverTimestamp(); await collClientes.add(obj); M.toast({html:"Cliente criado!"}); }
      document.getElementById('formCliente').reset(); M.updateTextFields(); M.FormSelect.init(document.getElementById('clienteDocTipo'));
    } catch(err){ showStatus('Erro ao salvar cliente.', true); }
  };

  document.getElementById('formCadastroMP').onsubmit = async function(e){
    e.preventDefault();
    const id = document.getElementById('mpEditId').value || null;
    const tipo = document.getElementById('mpTipo').value.trim();
    const qtd = parseFloat(document.getElementById('mpQtd').value);
    const preco = parseFloat(document.getElementById('mpPreco').value);
    const unidade = document.getElementById('mpUnidade').value;
    const embalagem = document.getElementById('mpEmbalagem').value.trim();
    if(!tipo || isNaN(qtd) || qtd < 0 || isNaN(preco) || preco <= 0 || !unidade) return M.toast({html:"Preencha todos os campos da MP!"});
    const obj = { tipo, saldo: qtd, preco, unidade, embalagem, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    try {
      if(id){ await collMP.doc(id).set(obj, { merge: true }); document.getElementById('mpEditId').value = ''; document.getElementById('btnCancelarEditMP').style.display = 'none'; document.getElementById('btnSalvarMP').innerHTML = '<span class="material-icons left">save</span>Salvar MP'; M.toast({html:"MP atualizada!"}); }
      else { obj.createdAt = firebase.firestore.FieldValue.serverTimestamp(); await collMP.add(obj); document.getElementById('formCadastroMP').reset(); M.toast({html:"Matéria Prima salva!"}); }
      M.updateTextFields(); M.FormSelect.init(document.getElementById('mpUnidade'));
    } catch(err){ showStatus('Erro ao salvar MP.', true); }
  };

  document.getElementById('formCadastroServico').onsubmit = async function(e){
    e.preventDefault();
    const id = document.getElementById('cadServicoEditId').value || null;
    const tipo = document.getElementById('cadServicoTipo').value.trim();
    const valor = parseFloat(document.getElementById('cadServicoValor').value);
    const unidade = document.getElementById('cadServicoUnidade').value.trim();
    if(!tipo || isNaN(valor) || valor <= 0 || !unidade) return M.toast({html:"Preencha todos os campos do serviço!"});
    const obj = { tipo, valor, unidade, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    try {
      if(id){ await collCadServico.doc(id).set(obj, { merge: true }); document.getElementById('cadServicoEditId').value = ''; document.getElementById('btnCancelarEditCadServico').style.display = 'none'; document.getElementById('btnSalvarCadServico').innerHTML = '<span class="material-icons left">save</span>Salvar Serviço'; M.toast({html:"Serviço atualizado!"}); }
      else { obj.createdAt = firebase.firestore.FieldValue.serverTimestamp(); await collCadServico.add(obj); document.getElementById('formCadastroServico').reset(); M.updateTextFields(); M.toast({html:"Serviço cadastrado!"}); }
    } catch(err){ showStatus('Erro ao salvar serviço.', true); }
  };

  document.getElementById('btnCancelarEditCadServico').onclick = function(){
    document.getElementById('cadServicoEditId').value = ''; document.getElementById('formCadastroServico').reset(); document.getElementById('btnCancelarEditCadServico').style.display = 'none'; document.getElementById('btnSalvarCadServico').innerHTML = '<span class="material-icons left">save</span>Salvar Serviço'; M.updateTextFields();
  };

  const btnFin = document.getElementById('btnFinanceiro');
  if(btnFin){ btnFin.addEventListener('click', function(e){ e.preventDefault(); registrarFinanceiro(); }); }

  const btnCancelarFin = document.getElementById('btnCancelarFinanceiro');
  if(btnCancelarFin){ btnCancelarFin.addEventListener('click', function(){ document.getElementById('finEditId').value = ''; document.getElementById('finDesc').value = ''; document.getElementById('finValor').value = ''; if(document.getElementById('finObs')) document.getElementById('finObs').value = ''; if(document.getElementById('finDataLanc')) document.getElementById('finDataLanc').value = ''; document.getElementById('finTipo').selectedIndex = 0; document.getElementById('btnFinanceiro').textContent = 'Registrar Movimentação'; btnCancelarFin.style.display = 'none'; M.updateTextFields(); M.FormSelect.init(document.getElementById('finTipo')); }); }

  function abrirFinanceiroParaEdicao(id){
    const mov = financeiro.find(m => m.id === id); if(!mov) return;
    document.getElementById('finEditId').value = id;
    document.getElementById('finDesc').value = mov.desc || '';
    document.getElementById('finValor').value = mov.valor || '';
    if(document.getElementById('finObs')) document.getElementById('finObs').value = mov.obs || '';
    if(document.getElementById('finDataLanc') && mov.dataLanc){ const parts = mov.dataLanc.split('/'); if(parts.length===3) document.getElementById('finDataLanc').value = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`; }
    const tipoEl = document.getElementById('finTipo'); const tipoInst = M.FormSelect.getInstance(tipoEl); if(tipoInst) tipoInst.destroy(); tipoEl.value = (String(mov.tipo).toLowerCase() === 'saida') ? 'saida' : 'entrada'; M.FormSelect.init(tipoEl);
    document.getElementById('btnFinanceiro').textContent = 'Salvar Alterações';
    document.getElementById('btnCancelarFinanceiro').style.display = 'inline-block';
    M.updateTextFields();
    showTab('tab-financeiro');
  }

  async function registrarFinanceiro(desc, valor, tipo, chamadoPorPedido = false, vencStr = ""){
    let dataLanc = ""; let obs = "";
    if(!chamadoPorPedido){
      const editId = document.getElementById('finEditId')?.value || null;
      desc = document.getElementById('finDesc').value.trim();
      valor = parseFloat(document.getElementById('finValor').value);
      tipo = document.getElementById('finTipo').value;
      obs = (document.getElementById('finObs')?.value || '').trim();
      const finDataRaw = document.getElementById('finDataLanc')?.value || "";
      dataLanc = finDataRaw ? formatDateToDDMMYYYY(parseDateInputAsLocal(finDataRaw)) : formatDateToDDMMYYYY(new Date());
      vencStr = "";
      if(!desc || isNaN(valor)) { M.toast({html:"Preencha corretamente descrição e valor!"}); return; }
      try {
        if(editId){
          await collFinanceiro.doc(editId).set({ tipo, desc, valor, dataLanc, obs, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
          calcularSaldo();
          document.getElementById('finEditId').value = '';
          document.getElementById('btnFinanceiro').textContent = 'Registrar Movimentação';
          document.getElementById('btnCancelarFinanceiro').style.display = 'none';
          M.toast({html:'Movimentação atualizada!'});
        } else {
          await collFinanceiro.add({ tipo, desc, valor, dataLanc, obs, vencimento: vencStr, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
          calcularSaldo();
          M.toast({html:'Movimentação registrada!'});
        }
        document.getElementById('finDesc').value = ""; document.getElementById('finValor').value = "";
        if(document.getElementById('finObs')) document.getElementById('finObs').value = "";
        if(document.getElementById('finDataLanc')) document.getElementById('finDataLanc').value = "";
        document.getElementById('finTipo').selectedIndex = 0;
        M.updateTextFields(); M.FormSelect.init(document.getElementById('finTipo'));
      } catch(err){ console.error(err); showStatus('Erro ao registrar financeiro.', true); }
      return;
    } else {
      dataLanc = formatDateToDDMMYYYY(new Date());
    }
    const obj = { tipo, desc, valor, dataLanc, obs, vencimento: vencStr, createdAt: firebase.firestore.FieldValue.serverTimestamp() };
    try {
      await collFinanceiro.add(obj);
      calcularSaldo();
    } catch(err){ console.error(err); showStatus('Erro ao registrar financeiro.', true); }
  }

  const servicoParcelasEl = document.getElementById('servicoParcelas');
  function renderServicosVencimentos(){
    const container = document.getElementById('servicoVencimentos'); container.innerHTML = '';
    const parcelas = parseInt(servicoParcelasEl.value) || 1;
    for(let i=0;i<parcelas;i++){ const div = document.createElement('div'); div.style.minWidth = '150px'; div.innerHTML = `<input type="date" class="servico-venc" data-idx="${i}" id="servicoVenc${i}"><label for="servicoVenc${i}">Vencimento ${i+1}</label>`; container.appendChild(div); }
  }
  servicoParcelasEl.addEventListener('change', function(){ renderServicosVencimentos(); M.updateTextFields(); });
  renderServicosVencimentos();

  let propostaItens = [];
  let propostaTipo = 'produto';
  let propostaItemCounter = 0;
  function gerarIdItemProposta(){
    propostaItemCounter += 1;
    return `proposta-item-${propostaItemCounter}`;
  }
  function gerarNumeroProposta(){
    const now = new Date();
    return `PROP-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
  }
  function getClienteEnderecoFormatado(cliente){
    if(!cliente) return '';
    return [
      cliente.endereco || '',
      cliente.numero ? `Nº ${cliente.numero}` : '',
      cliente.complemento || '',
      cliente.cep ? `CEP ${cliente.cep}` : ''
    ].filter(Boolean).join(' • ');
  }
  function preencherResumoClienteProposta(clienteId){
    const cliente = clientes.find(x => x.id === clienteId) || null;
    document.getElementById('propostaClienteNome').textContent = cliente ? (cliente.nome || '—') : 'Selecione um cliente';
    document.getElementById('propostaClienteDoc').textContent = cliente ? (cliente.doc || '—') : '—';
    document.getElementById('propostaClienteTel').textContent = cliente ? (cliente.tel || '—') : '—';
    document.getElementById('propostaClienteEmail').textContent = cliente ? (cliente.email || '—') : '—';
    document.getElementById('propostaClienteEndereco').textContent = cliente ? (getClienteEnderecoFormatado(cliente) || '—') : '—';
  }
  function criarSnapshotCliente(clienteId){
    const cliente = clientes.find(x => x.id === clienteId) || {};
    return {
      nome: cliente.nome || '',
      doc: cliente.doc || '',
      tel: cliente.tel || '',
      email: cliente.email || '',
      endereco: cliente.endereco || '',
      numero: cliente.numero || '',
      complemento: cliente.complemento || '',
      cep: cliente.cep || ''
    };
  }
  function normalizarItemProposta(item = {}, index = 0){
    const mp = mpList.find(x => x.id === item.mpId) || {};
    const precoBase = Number(item.precoBase !== undefined ? item.precoBase : (mp.preco || 0)) || 0;
    const quantidade = Number(item.quantidade !== undefined ? item.quantidade : (item.qtd || 0)) || 0;
    const precoUnitarioRaw = item.precoUnitario !== undefined ? item.precoUnitario : (item.preco || item.precoBase || mp.preco || 0);
    const precoUnitario = Number(precoUnitarioRaw) || 0;
    return {
      id: item.id || gerarIdItemProposta(),
      mpId: item.mpId || '',
      descricao: item.descricao || item.tipo || mp.tipo || '',
      unidade: item.unidade || mp.unidade || '',
      precoBase,
      quantidade,
      precoUnitario,
      total: Number(item.total) || (quantidade * precoUnitario)
    };
  }
  function normalizarItemPropostaServico(item = {}, index = 0){
    const svc = cadServicos.find(x => x.id === item.cadServicoId) || {};
    const precoBase = Number(item.precoBase !== undefined ? item.precoBase : (svc.valor || 0)) || 0;
    const quantidade = Number(item.quantidade !== undefined ? item.quantidade : (item.qtd || 0)) || 0;
    const precoUnitarioRaw = item.precoUnitario !== undefined ? item.precoUnitario : (item.precoBase || svc.valor || 0);
    const precoUnitario = Number(precoUnitarioRaw) || 0;
    return {
      id: item.id || gerarIdItemProposta(),
      cadServicoId: item.cadServicoId || '',
      descricao: item.descricao || svc.tipo || '',
      unidade: item.unidade || svc.unidade || '',
      precoBase,
      quantidade,
      precoUnitario,
      total: Number(item.total) || (quantidade * precoUnitario)
    };
  }
  function atualizarBotoesTipoProposta(){
    const btnProd = document.getElementById('btnTipoProduto');
    const btnServ = document.getElementById('btnTipoServico');
    if(!btnProd || !btnServ) return;
    if(propostaTipo === 'servico'){
      btnProd.className = 'btn grey btn-small';
      btnServ.className = 'btn blue btn-small';
    } else {
      btnProd.className = 'btn blue btn-small';
      btnServ.className = 'btn grey btn-small';
    }
    const hint = document.getElementById('propostaItensHint');
    if(hint) hint.textContent = propostaTipo === 'servico'
      ? 'Selecione serviços cadastrados, ajuste quantidade e preço unitário manualmente.'
      : 'Selecione MPs cadastradas, ajuste quantidade e preço unitário manualmente.';
    const th = document.getElementById('propostaThItem');
    if(th) th.textContent = propostaTipo === 'servico' ? 'Item / Serviço' : 'Item / MP';
    const tipoEl = document.getElementById('propostaTipo');
    if(tipoEl) tipoEl.value = propostaTipo;
  }
  function sincronizarItensPropostaComCadastro(){
    if(propostaTipo === 'servico') return;
    propostaItens = propostaItens.map((item, index) => {
      const mp = mpList.find(x => x.id === item.mpId);
      if(!mp) return normalizarItemProposta(item, index);
      return normalizarItemProposta({
        ...item,
        descricao: mp.tipo || item.descricao,
        unidade: mp.unidade || item.unidade,
        precoBase: Number(mp.preco || 0),
        precoUnitario: Number(item.precoUnitario || 0) > 0 ? item.precoUnitario : Number(mp.preco || 0)
      }, index);
    });
  }
  function atualizarTotaisProposta(){
    let subtotal = 0;
    propostaItens = propostaItens.map((item, index) => {
      const normalizado = propostaTipo === 'servico' ? normalizarItemPropostaServico(item, index) : normalizarItemProposta(item, index);
      normalizado.total = (Number(normalizado.quantidade) || 0) * (Number(normalizado.precoUnitario) || 0);
      subtotal += normalizado.total;
      return normalizado;
    });
    const subtotalEl = document.getElementById('propostaSubtotal');
    const totalEl = document.getElementById('propostaTotal');
    const subtotalDisplay = document.getElementById('propostaSubtotalDisplay');
    const totalDisplay = document.getElementById('propostaTotalDisplay');
    if(subtotalEl) subtotalEl.value = subtotal.toFixed(2);
    if(totalEl) totalEl.value = subtotal.toFixed(2);
    if(subtotalDisplay) subtotalDisplay.textContent = `R$ ${formatCurrencyBR(subtotal)}`;
    if(totalDisplay) totalDisplay.textContent = `R$ ${formatCurrencyBR(subtotal)}`;
    return subtotal;
  }
  function renderTabelaItensProposta(){
    const tbody = document.querySelector('#propostaItensTable tbody');
    if(!tbody) return;
    tbody.querySelectorAll('select').forEach(sel => {
      try {
        const inst = window.M && M.FormSelect.getInstance(sel);
        if(inst) inst.destroy();
      } catch(e) { console.warn('FormSelect destroy error', e); }
    });
    tbody.innerHTML = '';
    if(!propostaItens.length){
      const trEmpty = document.createElement('tr');
      trEmpty.innerHTML = '<td colspan="8" style="text-align:center;color:#55697d;">Nenhum item adicionado. Use o botão "Adicionar item".</td>';
      tbody.appendChild(trEmpty);
      atualizarTotaisProposta();
      return;
    }
    const isServico = propostaTipo === 'servico';
    propostaItens.forEach((item, index) => {
      const tr = document.createElement('tr');
      const dropdownHtml = isServico
        ? `<select class="proposta-item-mp" data-index="${index}">
            <option value="" ${!item.cadServicoId ? 'selected' : ''} disabled>Selecione o serviço</option>
            ${cadServicos.map(s => `<option value="${escapeHTML(s.id)}" ${item.cadServicoId === s.id ? 'selected' : ''}>${escapeHTML(s.tipo || '')}</option>`).join('')}
           </select>`
        : `<select class="proposta-item-mp" data-index="${index}">
            <option value="" ${!item.mpId ? 'selected' : ''} disabled>Selecione a MP</option>
            ${mpList.map(mp => `<option value="${escapeHTML(mp.id)}" ${item.mpId === mp.id ? 'selected' : ''}>${escapeHTML(mp.tipo || '')}</option>`).join('')}
           </select>`;
      tr.innerHTML = `
        <td>${dropdownHtml}</td>
        <td><input type="text" class="proposta-item-descricao" data-index="${index}" value="${escapeHTML(item.descricao || '')}" readonly></td>
        <td><input type="text" class="proposta-item-unidade" data-index="${index}" value="${escapeHTML(item.unidade || '')}" readonly></td>
        <td><input type="number" class="proposta-item-preco-base" data-index="${index}" value="${Number(item.precoBase || 0).toFixed(2)}" step="0.01" min="0" readonly></td>
        <td><input type="number" class="proposta-item-quantidade" data-index="${index}" value="${Number(item.quantidade || 0)}" step="0.01" min="0"></td>
        <td><input type="number" class="proposta-item-preco-unitario" data-index="${index}" value="${Number(item.precoUnitario || 0).toFixed(2)}" step="0.01" min="0"></td>
        <td class="proposal-line-total">R$ ${formatCurrencyBR(item.total || 0)}</td>
        <td class="proposal-col-actions"><button type="button" class="btn-small red proposta-item-remover" data-index="${index}" title="Remover item"><span class="material-icons">delete</span></button></td>
      `;
      tbody.appendChild(tr);
    });
    const selects = tbody.querySelectorAll('select');
    if(selects.length && window.M) M.FormSelect.init(selects);
    tbody.querySelectorAll('.proposta-item-mp').forEach(select => {
      select.addEventListener('change', (e) => {
        const index = Number(e.target.dataset.index);
        const itemAtual = propostaItens[index] || {};
        if(propostaTipo === 'servico'){
          const svc = cadServicos.find(x => x.id === e.target.value) || {};
          propostaItens[index] = normalizarItemPropostaServico({
            ...itemAtual,
            cadServicoId: svc.id || '',
            descricao: svc.tipo || '',
            unidade: svc.unidade || '',
            precoBase: Number(svc.valor || 0),
            quantidade: Number(itemAtual.quantidade || 0) > 0 ? itemAtual.quantidade : 1,
            precoUnitario: Number(itemAtual.precoUnitario || 0) > 0 ? itemAtual.precoUnitario : Number(svc.valor || 0)
          }, index);
        } else {
          const mp = mpList.find(x => x.id === e.target.value) || {};
          propostaItens[index] = normalizarItemProposta({
            ...itemAtual,
            mpId: mp.id || '',
            descricao: mp.tipo || '',
            unidade: mp.unidade || '',
            precoBase: Number(mp.preco || 0),
            quantidade: Number(itemAtual.quantidade || 0) > 0 ? itemAtual.quantidade : 1,
            precoUnitario: Number(itemAtual.precoUnitario || 0) > 0 ? itemAtual.precoUnitario : Number(mp.preco || 0)
          }, index);
        }
        renderTabelaItensProposta();
      });
    });
    tbody.querySelectorAll('.proposta-item-quantidade, .proposta-item-preco-unitario').forEach(input => {
      input.addEventListener('input', (e) => {
        const index = Number(e.target.dataset.index);
        const campo = e.target.classList.contains('proposta-item-quantidade') ? 'quantidade' : 'precoUnitario';
        propostaItens[index][campo] = Number(e.target.value) || 0;
        atualizarTotaisProposta();
        const totalCell = e.target.closest('tr').querySelector('.proposal-line-total');
        if(totalCell) totalCell.textContent = `R$ ${formatCurrencyBR(propostaItens[index].total || 0)}`;
      });
    });
    tbody.querySelectorAll('.proposta-item-remover').forEach(btn => {
      btn.addEventListener('click', (e) => {
        propostaItens.splice(Number(e.currentTarget.dataset.index), 1);
        renderTabelaItensProposta();
      });
    });
    atualizarTotaisProposta();
  }
  function adicionarItemProposta(){
    const novo = propostaTipo === 'servico'
      ? normalizarItemPropostaServico({ quantidade: 1, precoUnitario: 0 }, propostaItens.length)
      : normalizarItemProposta({ quantidade: 1, precoUnitario: 0 }, propostaItens.length);
    propostaItens.push(novo);
    renderTabelaItensProposta();
  }
  function resetFormProposta(){
    document.getElementById('propostaEditId').value = '';
    document.getElementById('formProposta').reset();
    document.getElementById('propostaTitulo').value = 'Proposta Comercial';
    document.getElementById('propostaCondicaoFrete').value = 'Frete a combinar.';
    document.getElementById('propostaCondicaoPagamento').value = 'Boleto 7 e 28 dias.';
    document.getElementById('propostaValidade').value = 30;
    document.getElementById('propostaAssinatura').value = 'Fernando S. da Silva';
    document.getElementById('propostaNumero').value = gerarNumeroProposta();
    const dataEl = document.getElementById('propostaData');
    if(dataEl) dataEl.value = formatDateToISO(new Date());
    const dadosBancariosEl = document.getElementById('propostaDadosBancarios');
    if(dadosBancariosEl) dadosBancariosEl.value = `NOME: CXPTEC ENGENHARIA\nESPEC.TECNOLOGIA DO CONCRETO;\nCNPJ: 61.785.230/0001-06 (PIX)`;
    propostaTipo = 'produto';
    atualizarBotoesTipoProposta();
    propostaItens = [normalizarItemProposta({ quantidade: 1, precoUnitario: 0 }, 0)];
    preencherResumoClienteProposta('');
    renderTabelaItensProposta();
    M.updateTextFields();
    const _pcInst = M.FormSelect.getInstance(document.getElementById('propostaCliente'));
    if(_pcInst) _pcInst.destroy();
    M.FormSelect.init(document.getElementById('propostaCliente'));
  }

  resetFormProposta();
  document.getElementById('propostaCliente').addEventListener('change', (e) => preencherResumoClienteProposta(e.target.value));
  document.getElementById('btnAdicionarItemProposta').addEventListener('click', adicionarItemProposta);
  document.getElementById('btnTipoProduto').addEventListener('click', function(){
    if(propostaTipo === 'produto') return;
    const temItens = propostaItens.some(item => item.cadServicoId || item.mpId);
    if(temItens && !confirm('Ao trocar para Produto, os itens atuais serão removidos. Continuar?')) return;
    propostaTipo = 'produto';
    atualizarBotoesTipoProposta();
    propostaItens = [normalizarItemProposta({ quantidade: 1, precoUnitario: 0 }, 0)];
    renderTabelaItensProposta();
  });
  document.getElementById('btnTipoServico').addEventListener('click', function(){
    if(propostaTipo === 'servico') return;
    const temItens = propostaItens.some(item => item.cadServicoId || item.mpId);
    if(temItens && !confirm('Ao trocar para Serviço, os itens atuais serão removidos. Continuar?')) return;
    propostaTipo = 'servico';
    atualizarBotoesTipoProposta();
    propostaItens = [normalizarItemPropostaServico({ quantidade: 1, precoUnitario: 0 }, 0)];
    renderTabelaItensProposta();
  });

  // ====== CONFIGURAÇÕES DA EMPRESA ======
  (function initEmpresaConfig(){
    const DEFAULT_EMPRESA = { nome: 'CXPTEC ENGENHARIA', cnpj: '61.785.230/0001-06', endereco: '', cidade: '', cep: '' };
    function loadEmpresaConfig(){
      try{ return JSON.parse(localStorage.getItem('proposta_empresa') || 'null') || DEFAULT_EMPRESA; }catch(e){ return DEFAULT_EMPRESA; }
    }
    function saveEmpresaConfig(data){ localStorage.setItem('proposta_empresa', JSON.stringify(data)); }
    function renderLogoPreview(){
      const preview = document.getElementById('empresaLogoPreview'); if(!preview) return;
      const logo = localStorage.getItem('proposta_logo');
      preview.innerHTML = logo ? `<img src="${logo}" style="max-height:70px;max-width:200px;border:1px solid #ccc;padding:4px;" alt="Logo">` : '<span style="color:#999;font-size:12px;">Nenhum logo cadastrado</span>';
    }
    const cfg = loadEmpresaConfig();
    const flds = ['Nome','CNPJ','Endereco','Cidade','CEP'];
    flds.forEach(f => { const el = document.getElementById('empresa'+f); if(el) el.value = cfg[f.toLowerCase() === 'cnpj' ? 'cnpj' : f.toLowerCase() === 'endereco' ? 'endereco' : f.toLowerCase() === 'cidade' ? 'cidade' : f.toLowerCase() === 'cep' ? 'cep' : 'nome'] || ''; });
    renderLogoPreview();
    const btnSalvar = document.getElementById('btnSalvarEmpresaConfig');
    if(btnSalvar) btnSalvar.onclick = function(){
      saveEmpresaConfig({
        nome: (document.getElementById('empresaNome')||{}).value || '',
        cnpj: (document.getElementById('empresaCNPJ')||{}).value || '',
        endereco: (document.getElementById('empresaEndereco')||{}).value || '',
        cidade: (document.getElementById('empresaCidade')||{}).value || '',
        cep: (document.getElementById('empresaCEP')||{}).value || ''
      });
      M.toast({html:'Configurações da empresa salvas!', classes:'green'});
    };
    const inputLogo = document.getElementById('empresaLogoInput');
    if(inputLogo) inputLogo.onchange = function(e){
      const file = e.target.files && e.target.files[0]; if(!file) return;
      const reader = new FileReader();
      reader.onload = function(ev){ localStorage.setItem('proposta_logo', ev.target.result); renderLogoPreview(); M.toast({html:'Logo salvo!', classes:'green'}); };
      reader.readAsDataURL(file);
    };
    const btnRemoverLogo = document.getElementById('btnRemoverLogo');
    if(btnRemoverLogo) btnRemoverLogo.onclick = function(){ localStorage.removeItem('proposta_logo'); renderLogoPreview(); M.toast({html:'Logo removido.'}); };
  })();



  const btnSalvarProposta = document.getElementById('btnSalvarProposta');
  if(btnSalvarProposta){
    btnSalvarProposta.onclick = async function(){
      const editId = document.getElementById('propostaEditId').value || null;
      const clienteId = document.getElementById('propostaCliente').value;
      const dataRaw = document.getElementById('propostaData').value;
      if(!clienteId) return M.toast({html:'Selecione o cliente da proposta!'});
      const isServico = propostaTipo === 'servico';
      const itensValidos = isServico
        ? propostaItens.map((item, index) => normalizarItemPropostaServico(item, index)).filter(item => item.cadServicoId && item.quantidade > 0 && item.precoUnitario >= 0)
        : propostaItens.map((item, index) => normalizarItemProposta(item, index)).filter(item => item.mpId && item.quantidade > 0 && item.precoUnitario >= 0);
      if(!itensValidos.length) return M.toast({html: isServico ? 'Adicione ao menos um serviço com quantidade informada para salvar a proposta.' : 'Adicione ao menos um item/MP com quantidade informada para salvar a proposta.'});
      propostaItens = itensValidos;
      const total = atualizarTotaisProposta();
      if(total <= 0) return M.toast({html:'Defina preços e quantidades maiores que zero para gerar o total da proposta.'});
      const dataProposta = dataRaw ? formatDateToDDMMYYYY(parseDateInputAsLocal(dataRaw)) : formatDateToDDMMYYYY(new Date());
      const itensSalvar = isServico
        ? itensValidos.map((item, index) => {
            const normalizado = normalizarItemPropostaServico(item, index);
            return { id: normalizado.id, cadServicoId: normalizado.cadServicoId, descricao: normalizado.descricao, unidade: normalizado.unidade, precoBase: Number(normalizado.precoBase || 0), quantidade: Number(normalizado.quantidade || 0), precoUnitario: Number(normalizado.precoUnitario || 0), total: Number(normalizado.total || 0) };
          })
        : itensValidos.map((item, index) => {
            const mp = mpList.find(x => x.id === item.mpId) || {};
            const normalizado = normalizarItemProposta({ ...item, descricao: mp.tipo || item.descricao, unidade: mp.unidade || item.unidade, precoBase: Number(mp.preco || item.precoBase || 0) }, index);
            return { id: normalizado.id, mpId: normalizado.mpId, descricao: normalizado.descricao, unidade: normalizado.unidade, precoBase: Number(normalizado.precoBase || 0), quantidade: Number(normalizado.quantidade || 0), precoUnitario: Number(normalizado.precoUnitario || 0), total: Number(normalizado.total || 0) };
          });
      const obj = {
        clienteId,
        tipo: propostaTipo,
        numero: (document.getElementById('propostaNumero').value || gerarNumeroProposta()).trim(),
        data: dataProposta,
        subtotal: total,
        total,
        titulo: (document.getElementById('propostaTitulo').value || 'Proposta Comercial').trim(),
        clienteSnapshot: criarSnapshotCliente(clienteId),
        itens: itensSalvar,
        condicaoFrete: (document.getElementById('propostaCondicaoFrete').value || '').trim(),
        condicaoPagamento: (document.getElementById('propostaCondicaoPagamento').value || '').trim(),
        validadeDias: Number(document.getElementById('propostaValidade').value) || 30,
        dadosBancarios: (document.getElementById('propostaDadosBancarios').value || '').trim(),
        observacoes: (document.getElementById('propostaObservacoes').value || '').trim(),
        assinatura: (document.getElementById('propostaAssinatura').value || '').trim(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      try {
        if(editId){ await collPropostas.doc(editId).set(obj, { merge: true }); M.toast({html:'Proposta atualizada!'}); }
        else { obj.createdAt = firebase.firestore.FieldValue.serverTimestamp(); await collPropostas.add(obj); M.toast({html:'Proposta salva!'}); }
        resetFormProposta();
      } catch(err){ showStatus('Erro ao salvar proposta.', true); }
    };
  }

  document.getElementById('btnServico').onclick = async function(){
    const editId = document.getElementById('servicoEditId').value || null; const clienteId = document.getElementById('servicoCliente').value;
    const desc = document.getElementById('servicoDesc').value.trim(); const valor = parseFloat(document.getElementById('servicoValor').value) || 0;
    const parcelas = parseInt(document.getElementById('servicoParcelas').value) || 1;
    const vencimentos = Array.from(document.querySelectorAll('#servicoVencimentos .servico-venc')).map(el=> el.value ? formatDateToDDMMYYYY(parseDateInputAsLocal(el.value)) : '').filter(x=>x);
    if(!clienteId || !desc || isNaN(valor) || valor<=0 || vencimentos.length !== parcelas) return M.toast({html:"Preencha os campos de serviço e vencimentos!"});
    const obj = { clienteId, desc, valor, parcelas, vencimentos, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    try {
      if(editId){ await collServicos.doc(editId).set(obj, { merge: true }); document.getElementById('servicoEditId').value = ''; document.getElementById('btnCancelarServico').style.display = 'none'; document.getElementById('btnServico').textContent = 'Registrar Serviço'; M.toast({html:'Serviço atualizado!'}); }
      else { obj.createdAt = firebase.firestore.FieldValue.serverTimestamp(); await collServicos.add(obj); M.toast({html:'Serviço registrado!'}); }
      document.getElementById('formServico').reset(); renderServicosVencimentos(); M.updateTextFields(); M.FormSelect.init(document.querySelectorAll('#servicoCliente, #servicoParcelas'));
    } catch(err){ showStatus('Erro ao salvar serviço.', true); }
  };

  function atualizarCustoPedido(){ const kg = parseFloat(document.getElementById('pedidoKg').value) || 0; const preco = parseFloat(document.getElementById('pedidoPrecoKg').value) || 0; document.getElementById('pedidoCusto').value = (kg*preco).toFixed(2); }
  document.getElementById('pedidoKg').oninput = atualizarCustoPedido; document.getElementById('pedidoPrecoKg').oninput = atualizarCustoPedido;

  const btnCancelarEditPedidoEl = document.getElementById('btnCancelarEditPedido');
  if(btnCancelarEditPedidoEl){
    btnCancelarEditPedidoEl.onclick = function(){
      document.getElementById('pedidoEditId').value = ''; document.getElementById('formPedidoSection').reset(); document.getElementById('pedidoVencDate').value = '';
      document.getElementById('btnPedido').textContent = 'Registrar Pedido'; document.getElementById('btnCancelarEditPedido').style.display = 'none';
      if(window.M) { M.updateTextFields(); M.FormSelect.init(document.querySelectorAll('#pedidoCliente, #pedidoProduto, #pedidoVenc, #pedidoStatus')); }
    };
  }

  document.getElementById('btnPedido').onclick = async function(){
    const editId = document.getElementById('pedidoEditId').value || null; const clienteId = document.getElementById('pedidoCliente').value;
    const kg = parseFloat(document.getElementById('pedidoKg').value); const produto = document.getElementById('pedidoProduto').value;
    const precoKg = parseFloat(document.getElementById('pedidoPrecoKg').value); const custo = parseFloat(document.getElementById('pedidoCusto').value);
    const dataPedidoInput = document.getElementById('pedidoData').value; const status = document.getElementById('pedidoStatus').value;
    if(!clienteId || isNaN(kg) || kg<=0 || isNaN(precoKg) || precoKg<=0 || isNaN(custo) || custo<=0 || !produto) return M.toast({html:"Preencha os campos do pedido!"});
    const hoje = new Date(); let vencStr = ""; const hiddenVencEl = document.getElementById('pedidoVencDate');
    if(hiddenVencEl && hiddenVencEl.value){ const hv = hiddenVencEl.value.trim(); if(hv==='') vencStr=''; else if(hv.toLowerCase()==='à vista'||hv.toLowerCase()==='avista') vencStr='À vista'; else { const parts = hv.split('-'); if(parts.length===3) vencStr = formatDateToDDMMYYYY(new Date(Number(parts[0]), Number(parts[1])-1, Number(parts[2]))); else vencStr=''; } }
    else { const vencSelected = document.getElementById('pedidoVenc').value; if(vencSelected==='avista') vencStr='À vista'; else { const days = parseInt(vencSelected); if(!isNaN(days)){ const v = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + days); vencStr = `${String(v.getDate()).padStart(2,'0')}/${String(v.getMonth()+1).padStart(2,'0')}/${v.getFullYear()}`; } else vencStr=""; } }
    let dataPedidoStr = dataPedidoInput ? formatDateToDDMMYYYY(parseDateInputAsLocal(dataPedidoInput)) : formatDateToDDMMYYYY(new Date());
    const obj = { clienteId, produto, kg, precoKg, custo, vencimento: vencStr, dataPedido: dataPedidoStr, status: status || 'Pendente', updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    try {
      if(editId){ await collPedidos.doc(editId).set(obj, { merge: true }); document.getElementById('pedidoEditId').value = ''; document.getElementById('btnPedido').textContent = 'Registrar Pedido'; document.getElementById('btnCancelarEditPedido').style.display = 'none'; M.toast({html:"Pedido atualizado!"}); }
      else { obj.createdAt = firebase.firestore.FieldValue.serverTimestamp(); await collPedidos.add(obj); M.toast({html:"Pedido registrado!"}); }
      document.getElementById('formPedidoSection').reset(); document.getElementById('pedidoVencDate').value = ''; M.updateTextFields(); M.FormSelect.init(document.querySelectorAll('#pedidoCliente, #pedidoProduto, #pedidoVenc, #pedidoStatus'));
    } catch(err){ showStatus('Erro ao salvar pedido.', true); }
  };

  // ====== EXPORT / IMPORT ======
  document.getElementById('btnExportExcel').onclick = function(){
    function toSheet(data, header) { const arr = [header]; data.forEach(o => arr.push(header.map(h => o[h] !== undefined ? o[h] : ""))); return XLSX.utils.aoa_to_sheet(arr); }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, toSheet(clientes.map(c => ({nome: c.nome, docTipo: c.docTipo, doc: c.doc, tel: c.tel, email: c.email, cep: c.cep, endereco: c.endereco, numero: c.numero, complemento: c.complemento})), ["nome","docTipo","doc","tel","email","cep","endereco","numero","complemento"]), "Clientes");
    XLSX.utils.book_append_sheet(wb, toSheet(mpList.map(m => ({ tipo: m.tipo, saldo: m.saldo, preco: m.preco, unidade: m.unidade })), ["tipo","saldo","preco","unidade"]), "Materia_Prima");
    XLSX.utils.book_append_sheet(wb, toSheet(pedidos.map(p => { const c = clientes.find(x=>x.id === p.clienteId) || {}; return { cliente: c.nome || "", documento: c.doc || "", produto: p.produto || "", kg: p.kg, precoKg: p.precoKg, custo: p.custo, dataPedido: p.dataPedido || "", vencimento: p.vencimento || "", status: p.status || "" }; }), ["cliente","documento","produto","kg","precoKg","custo","dataPedido","vencimento","status"]), "Pedidos");
    XLSX.utils.book_append_sheet(wb, toSheet(financeiro.map(f => ({ tipo: f.tipo, desc: f.desc, valor: f.valor, vencimento: f.vencimento })), ["tipo","desc","valor","vencimento"]), "Financeiro");
    XLSX.utils.book_append_sheet(wb, toSheet(servicos.map(s => { const c = clientes.find(x=>x.id === s.clienteId) || {}; return { cliente: c.nome || "", documento: c.doc || "", servico: s.desc || "", valor: s.valor || 0, parcelas: s.parcelas || 1, vencimentos: (s.vencimentos || []).join(' ; ') }; }), ["cliente","documento","servico","valor","parcelas","vencimentos"]), "Servicos");
    XLSX.utils.book_append_sheet(wb, toSheet(propostas.map(p => { const c = clientes.find(x=>x.id === p.clienteId) || {}; return { numero: p.numero || "", data: p.data || "", cliente: (p.clienteSnapshot && p.clienteSnapshot.nome) || c.nome || "", documento: (p.clienteSnapshot && p.clienteSnapshot.doc) || c.doc || "", itens: Array.isArray(p.itens) ? p.itens.length : 0, total: p.total || 0, titulo: p.titulo || "", condicaoFrete: p.condicaoFrete || "", condicaoPagamento: p.condicaoPagamento || "", validadeDias: p.validadeDias || 30 }; }), ["numero","data","cliente","documento","itens","total","titulo","condicaoFrete","condicaoPagamento","validadeDias"]), "Propostas");
    XLSX.writeFile(wb, "controle_pedidos_firestore.xlsx");
  };

  document.getElementById('btnImportExcel').onclick = function(){ document.getElementById('inputImportExcel').click(); }
  document.getElementById('inputImportExcel').onchange = function(e){
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = async function(evt){
      try{
        const data = new Uint8Array(evt.target.result); const wb = XLSX.read(data, { type: 'array' });
        if(wb.Sheets["Clientes"]){
          const arr = XLSX.utils.sheet_to_json(wb.Sheets["Clientes"], { header: 1 });
          const rows = arr.slice(1).map(r => ({ nome: r[0] || "", docTipo: r[1] || "cpf", doc: r[2] || "", tel: r[3] || "", email: r[4] || "", cep: r[5] || "", endereco: r[6] || "", numero: r[7] || "", complemento: r[8] || "" }));
          const batch = db.batch(); rows.forEach(r => batch.set(collClientes.doc(), { ...r, createdAt: firebase.firestore.FieldValue.serverTimestamp() })); await batch.commit(); M.toast({html:"Clientes importados!"});
        }
      }catch(err){ M.toast({html:"Erro ao importar arquivo. Verifique o formato."}); }
    };
    reader.readAsArrayBuffer(file); e.target.value = "";
  };

  // ====== FILTROS E PESQUISAS ======
  function setupColumnFilters(tableId){
    const table = document.getElementById(tableId); if(!table) return;
    const scrollTable = table.closest('.scroll-table'); if(!scrollTable) return;
    if(scrollTable.dataset.hasFilterBar) return;
    const thead = table.querySelector('thead'); if(!thead) return;
    const headerRow = thead.querySelector('tr'); if(!headerRow) return;
    const headers = Array.from(headerRow.querySelectorAll('th'));

    const filterBar = document.createElement('div');
    filterBar.className = 'table-filter-bar';
    filterBar.dataset.tableId = tableId;

    // Global search item
    const globalItem = document.createElement('div');
    globalItem.className = 'filter-col-item filter-global-item';
    const globalLabel = document.createElement('span');
    globalLabel.className = 'filter-col-label';
    globalLabel.innerHTML = '<span class="material-icons" style="font-size:14px;vertical-align:middle;">search</span> Busca Geral';
    const globalInput = document.createElement('input');
    globalInput.type = 'text';
    globalInput.className = 'col-global-input';
    globalInput.placeholder = 'Pesquisar em todas as colunas...';
    globalInput.addEventListener('input', function(){ window.applyColumnFilters(tableId); });
    globalItem.appendChild(globalLabel);
    globalItem.appendChild(globalInput);
    filterBar.appendChild(globalItem);

    // Per-column filter items
    headers.forEach((th, idx) => {
      if(th.hasAttribute('data-no-filter')) return; // skip columns marked as no-filter
      const wrapper = document.createElement('div');
      wrapper.className = 'filter-col-item';
      const lbl = document.createElement('span');
      lbl.className = 'filter-col-label';
      lbl.textContent = th.textContent.trim();
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'col-filter-input';
      input.placeholder = 'filtrar...';
      input.dataset.colIndex = String(idx);
      input.addEventListener('input', function(){ window.applyColumnFilters(tableId); });
      wrapper.appendChild(lbl);
      wrapper.appendChild(input);
      filterBar.appendChild(wrapper);
    });

    scrollTable.parentNode.insertBefore(filterBar, scrollTable);
    scrollTable.dataset.hasFilterBar = '1';
  }

  window.applyColumnFilters = function(tableId){
    const table = document.getElementById(tableId); if(!table) return;
    const filterBar = document.querySelector(`.table-filter-bar[data-table-id="${tableId}"]`);
    let globalFilter = '';
    let colFilters = [];
    if(filterBar){
      const gi = filterBar.querySelector('.col-global-input');
      if(gi) globalFilter = (gi.value || '').toLowerCase().trim();
      colFilters = Array.from(filterBar.querySelectorAll('.col-filter-input')).map(inp => ({ idx: Number(inp.dataset.colIndex), value: (inp.value || '').toLowerCase().trim() }));
    }
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
      let visible = true;
      if(globalFilter && row.innerText.toLowerCase().indexOf(globalFilter) === -1){ visible = false; }
      if(visible){
        for(const f of colFilters){
          if(!f.value) continue;
          const cell = row.children[f.idx];
          if(!(cell ? cell.innerText : '').toLowerCase().includes(f.value)){ visible = false; break; }
        }
      }
      row.style.display = visible ? '' : 'none';
    });
  };

  function reapplyAllFilters(){
    if(typeof window.applyColumnFilters === 'function'){
      window.applyColumnFilters('clientesTable'); window.applyColumnFilters('mpTable'); window.applyColumnFilters('pedidosTable'); window.applyColumnFilters('financeiroTable'); window.applyColumnFilters('servicosTable'); window.applyColumnFilters('propostasTable'); window.applyColumnFilters('cadServicosTable');
    }
  }

  setupColumnFilters('clientesTable'); setupColumnFilters('mpTable'); setupColumnFilters('pedidosTable'); setupColumnFilters('financeiroTable'); setupColumnFilters('servicosTable'); setupColumnFilters('propostasTable'); setupColumnFilters('cadServicosTable');

  // ====== EDIÇÃO GLOBAL (FORMS) ======
  window.editarCliente = function(id) {
    const c = clientes.find(x => x.id === id); if(!c) return;
    document.getElementById('clienteEditId').value = c.id; document.getElementById('clienteNome').value = c.nome || ''; document.getElementById('clienteDocTipo').value = c.docTipo || 'cpf'; document.getElementById('clienteDoc').value = c.doc || ''; document.getElementById('clienteTel').value = c.tel || ''; document.getElementById('clienteEmail').value = c.email || ''; document.getElementById('clienteCEP').value = c.cep || ''; document.getElementById('clienteEnd').value = c.endereco || ''; document.getElementById('clienteNum').value = c.numero || ''; document.getElementById('clienteComp').value = c.complemento || '';
    M.updateTextFields(); M.FormSelect.init(document.getElementById('clienteDocTipo')); showTab('tab-clientes');
  };

  window.editarMP = function(id) {
    const m = mpList.find(x => x.id === id); if(!m) return;
    document.getElementById('mpEditId').value = m.id; document.getElementById('mpTipo').value = m.tipo || ''; document.getElementById('mpQtd').value = m.saldo || 0; document.getElementById('mpPreco').value = m.preco || 0; document.getElementById('mpUnidade').value = m.unidade || 'kg'; document.getElementById('mpEmbalagem').value = m.embalagem || '';
    M.updateTextFields(); M.FormSelect.init(document.getElementById('mpUnidade')); document.getElementById('btnCancelarEditMP').style.display = 'inline-block'; document.getElementById('btnSalvarMP').innerHTML = '<span class="material-icons left">save</span>Atualizar'; showTab('tab-produtos');
  };

  window.editarCadServico = function(id) {
    const s = cadServicos.find(x => x.id === id); if(!s) return;
    document.getElementById('cadServicoEditId').value = s.id; document.getElementById('cadServicoTipo').value = s.tipo || ''; document.getElementById('cadServicoValor').value = s.valor || ''; document.getElementById('cadServicoUnidade').value = s.unidade || '';
    M.updateTextFields(); document.getElementById('btnCancelarEditCadServico').style.display = 'inline-flex'; document.getElementById('btnSalvarCadServico').innerHTML = '<span class="material-icons left">save</span>Atualizar'; showTab('tab-cadservico');
  };

  window.editarPedido = function(id) {
    const p = pedidos.find(x => x.id === id); if(!p) return;
    document.getElementById('pedidoEditId').value = p.id; document.getElementById('pedidoCliente').value = p.clienteId || ''; document.getElementById('pedidoKg').value = p.kg || ''; document.getElementById('pedidoProduto').value = p.produto || ''; document.getElementById('pedidoPrecoKg').value = p.precoKg || ''; document.getElementById('pedidoCusto').value = p.custo || '';
    if(p.dataPedido){ const parts = p.dataPedido.split('/'); if(parts.length===3) document.getElementById('pedidoData').value = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`; }
    document.getElementById('pedidoStatus').value = p.status || 'Pendente';
    const hv = document.getElementById('pedidoVencDate'); const vencSel = document.getElementById('pedidoVenc');
    if(p.vencimento === 'À vista') { vencSel.value = 'avista'; if(hv) hv.value = 'avista'; } else { vencSel.value = ''; if(p.vencimento){ const vparts = p.vencimento.split('/'); if(vparts.length===3 && hv) hv.value = `${vparts[2]}-${vparts[1].padStart(2,'0')}-${vparts[0].padStart(2,'0')}`; } }
    M.updateTextFields(); M.FormSelect.init(document.querySelectorAll('#pedidoCliente, #pedidoProduto, #pedidoVenc, #pedidoStatus')); document.getElementById('btnCancelarEditPedido').style.display = 'inline-block'; document.getElementById('btnPedido').textContent = 'Atualizar Pedido'; showTab('tab-pedidos');
  };

  // ====== RENDERIZAÇÃO DAS TABELAS UI ======
  function atualizarClientesUI(){
    const tbody = document.querySelector("#clientesTable tbody"); if(!tbody) return; tbody.innerHTML = "";
    const select = document.getElementById('pedidoCliente'); const servicoSelect = document.getElementById('servicoCliente'); const propostaSelect = document.getElementById('propostaCliente');
    const currentPedido = select ? select.value : '';
    const currentServico = servicoSelect ? servicoSelect.value : '';
    const currentProposta = propostaSelect ? propostaSelect.value : '';
    if(select) select.innerHTML = '<option value="" disabled selected>Selecione o cliente</option>'; if(servicoSelect) servicoSelect.innerHTML = '<option value="" disabled selected>Selecione o cliente</option>'; if(propostaSelect) propostaSelect.innerHTML = '<option value="" disabled selected>Selecione o cliente</option>';
    clientes.forEach((c) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td data-field="nome">${escapeHTML(c.nome || "")}</td><td data-field="docTipo">${escapeHTML((c.docTipo === 'cnpj') ? 'CNPJ' : 'CPF')}</td><td data-field="doc">${escapeHTML(c.doc || "")}</td><td data-field="tel">${escapeHTML(c.tel || "")}</td><td data-field="email">${escapeHTML(c.email || "")}</td><td data-field="cep">${escapeHTML(c.cep || "")}</td><td data-field="endereco">${escapeHTML(c.endereco || "")}</td><td data-field="numero">${escapeHTML(c.numero || "")}</td><td data-field="complemento">${escapeHTML(c.complemento || "")}</td>`;
      const tdActions = document.createElement('td');
      const btnEdit = document.createElement('button'); btnEdit.className = 'btn-small orange small-action'; btnEdit.title='Editar cliente'; btnEdit.innerHTML = '<span class="material-icons">edit</span>'; btnEdit.onclick = ()=> window.editarCliente(c.id);
      const btnInline = document.createElement('button'); btnInline.className='btn-small blue small-action'; btnInline.title='Editar na Tabela'; btnInline.innerHTML = '<span class="material-icons">edit_attributes</span>'; btnInline.onclick = (e)=> window.editRow('clientes', c.id, e.currentTarget);
      const btnDel = document.createElement('button'); btnDel.className='btn-small red'; btnDel.title='Excluir'; btnDel.innerHTML = '<span class="material-icons">delete</span>'; btnDel.onclick = ()=> window.excluirCliente(c.id);
      tdActions.appendChild(btnEdit); tdActions.appendChild(btnInline); tdActions.appendChild(btnDel); tr.appendChild(tdActions); tbody.appendChild(tr);
      if(select){ const option = document.createElement('option'); option.value = c.id; option.text = `${c.nome} (${c.doc || ""})`; select.appendChild(option); }
      if(servicoSelect){ const option2 = document.createElement('option'); option2.value = c.id; option2.text = `${c.nome} (${c.doc || ""})`; servicoSelect.appendChild(option2); }
      if(propostaSelect){ const option3 = document.createElement('option'); option3.value = c.id; option3.text = `${c.nome} (${c.doc || ""})`; propostaSelect.appendChild(option3); }
    });
    if(select && currentPedido) select.value = currentPedido;
    if(servicoSelect && currentServico) servicoSelect.value = currentServico;
    if(propostaSelect && currentProposta) propostaSelect.value = currentProposta;
    if(window.M){
      [select, servicoSelect, propostaSelect].forEach(sel => {
        if(!sel) return;
        try { const inst = M.FormSelect.getInstance(sel); if(inst) inst.destroy(); } catch(e) {}
      });
      M.FormSelect.init(document.querySelectorAll('#pedidoCliente, #servicoCliente, #propostaCliente'));
    }
    preencherResumoClienteProposta(currentProposta || '');
    reapplyAllFilters();
    scheduleDashboardUpdate();
  }

  function atualizarMPCadastroUI(){
    const tbody = document.querySelector('#mpTable tbody'); if(!tbody) return; tbody.innerHTML = "";
    mpList.forEach((mp) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td data-field="tipo">${escapeHTML(mp.tipo)}</td><td data-field="saldo">${mp.saldo}</td><td data-field="preco">${Number(mp.preco).toFixed(2)}</td><td data-field="unidade">${escapeHTML(mp.unidade)}</td><td data-field="embalagem">${escapeHTML(mp.embalagem || '')}</td>`;
      const tdActions = document.createElement('td');
      const btnEdit = document.createElement('button'); btnEdit.className='btn-small orange small-action'; btnEdit.innerHTML='<span class="material-icons">edit</span>'; btnEdit.title='Editar Form'; btnEdit.onclick=()=> window.editarMP(mp.id);
      const btnInline = document.createElement('button'); btnInline.className='btn-small blue small-action'; btnInline.innerHTML='<span class="material-icons">edit_attributes</span>'; btnInline.title='Editar na Tabela'; btnInline.onclick=(e)=> window.editRow('mpList', mp.id, e.currentTarget);
      const btnDel = document.createElement('button'); btnDel.className='btn-small red'; btnDel.innerHTML='<span class="material-icons">delete</span>'; btnDel.title='Excluir'; btnDel.onclick=()=> window.excluirMP(mp.id);
      tdActions.appendChild(btnEdit); tdActions.appendChild(btnInline); tdActions.appendChild(btnDel); tr.appendChild(tdActions); tbody.appendChild(tr);
    });
    sincronizarItensPropostaComCadastro();
    renderTabelaItensProposta();
    reapplyAllFilters();
  }

  function atualizarCadServicosUI(){
    const tbody = document.querySelector('#cadServicosTable tbody'); if(!tbody) return; tbody.innerHTML = "";
    cadServicos.forEach((s) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td data-field="tipo">${escapeHTML(s.tipo || '')}</td><td data-field="valor">${Number(s.valor || 0).toFixed(2)}</td><td data-field="unidade">${escapeHTML(s.unidade || '')}</td>`;
      const tdActions = document.createElement('td');
      const btnEdit = document.createElement('button'); btnEdit.className='btn-small orange small-action'; btnEdit.innerHTML='<span class="material-icons">edit</span>'; btnEdit.title='Editar'; btnEdit.onclick=()=> window.editarCadServico(s.id);
      const btnInline = document.createElement('button'); btnInline.className='btn-small blue small-action'; btnInline.innerHTML='<span class="material-icons">edit_attributes</span>'; btnInline.title='Editar na Tabela'; btnInline.onclick=(e)=> window.editRow('cadServico', s.id, e.currentTarget);
      const btnDel = document.createElement('button'); btnDel.className='btn-small red'; btnDel.innerHTML='<span class="material-icons">delete</span>'; btnDel.title='Excluir'; btnDel.onclick=()=> window.excluirCadServico(s.id);
      tdActions.appendChild(btnEdit); tdActions.appendChild(btnInline); tdActions.appendChild(btnDel); tr.appendChild(tdActions); tbody.appendChild(tr);
    });
    reapplyAllFilters();
  }

  function atualizarPedidosUI(){
    const tbody = document.querySelector('#pedidosTable tbody'); if(!tbody) return; tbody.innerHTML = "";
    pedidos.forEach((p) => {
      const c = clientes.find(x=>x.id===p.clienteId) || {};
      const tr = document.createElement('tr');
      tr.innerHTML = `<td data-field="cliente">${escapeHTML(c.nome || "")}</td><td data-field="documento">${escapeHTML(c.doc || "")}</td><td data-field="produto">${escapeHTML(p.produto || "")}</td><td data-field="kg">${p.kg}</td><td data-field="precoKg">${Number(p.precoKg).toFixed(2)}</td><td data-field="custo">${Number(p.custo).toFixed(2)}</td><td data-field="dataPedido">${escapeHTML(p.dataPedido || "")}</td><td data-field="vencimento">${escapeHTML(p.vencimento || "")}</td><td data-field="status">${escapeHTML(p.status || 'Pendente')}</td>`;
      const tdActions = document.createElement('td');
      const btnEdit = document.createElement('button'); btnEdit.className='btn-small orange small-action'; btnEdit.innerHTML='<span class="material-icons">edit</span>'; btnEdit.onclick=()=> window.editarPedido(p.id);
      const btnInline = document.createElement('button'); btnInline.className='btn-small blue small-action'; btnInline.innerHTML='<span class="material-icons">edit_attributes</span>'; btnInline.onclick=(e)=> window.editRow('pedidos', p.id, e.currentTarget);
      const btnDel = document.createElement('button'); btnDel.className='btn-small red'; btnDel.innerHTML='<span class="material-icons">delete</span>'; btnDel.onclick=()=> window.excluirPedido(p.id);
      const btnWA = document.createElement('button'); btnWA.className='btn-small green small-action'; btnWA.innerHTML='<span class="material-icons">whatsapp</span>'; btnWA.title='Notificar via WhatsApp'; btnWA.onclick=()=>{ const msg = `Olá ${c.nome || 'cliente'}! Passamos para lembrá-lo(a) que o pagamento do pedido *${p.produto || ''}* no valor de *R$ ${Number(p.custo||0).toFixed(2)}* vence em *${p.vencimento || 'data não definida'}*. Qualquer dúvida, estamos à disposição.\n\n— HL Souza`; enviarWhatsAppVencimento(c.tel, msg); };
      tdActions.appendChild(btnEdit); tdActions.appendChild(btnInline); tdActions.appendChild(btnWA); tdActions.appendChild(btnDel); tr.appendChild(tdActions); tbody.appendChild(tr);
    });
    calcularSaldo(); checkVencimentosPedidos7dias(); checkVencimentosPedidos2dias(); reapplyAllFilters();
    scheduleDashboardUpdate();
  }

  // ====== LOGICA DE RESUMO DO MÊS NO CALENDÁRIO ======
  const brlCurrencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  function formatCurrencyBRL(value){
    return brlCurrencyFormatter.format(Number(value) || 0);
  }

  function getFinanceiroEventDate(mov){
    let dataEvento = null;
    if(mov.vencimento && typeof mov.vencimento === 'string' && mov.vencimento.includes('/')){ const d = parseDDMMYYYYToDate(mov.vencimento); if(d) dataEvento = d; }
    if(!dataEvento && mov.dataLanc && typeof mov.dataLanc === 'string' && mov.dataLanc.includes('/')){ const d2 = parseDDMMYYYYToDate(mov.dataLanc); if(d2) dataEvento = d2; }
    if(!dataEvento && mov.createdAt){
      if(typeof mov.createdAt.toDate === 'function'){ const d3 = mov.createdAt.toDate(); if(d3 instanceof Date && !isNaN(d3.getTime())) dataEvento = d3; }
      else if(mov.createdAt instanceof Date && !isNaN(mov.createdAt.getTime())) dataEvento = mov.createdAt;
      else if(typeof mov.createdAt === 'string'){ const d4 = new Date(mov.createdAt); if(!isNaN(d4.getTime())) dataEvento = d4; }
    }
    return dataEvento;
  }

  window.calcularResumoMes = function(month, year) {
    let totalEntrada = 0;
    let totalSaida = 0;
    let saldoMesAnterior = 0;
    financeiro.forEach(m => {
      const dataEvento = getFinanceiroEventDate(m);
      
      if (!dataEvento) return;
      const valor = Number(m.valor) || 0;
      const isEntrada = String(m.tipo).toLowerCase() === 'entrada';
      const mesEvento = dataEvento.getMonth();
      const anoEvento = dataEvento.getFullYear();

      if (mesEvento === month && anoEvento === year) {
        if(isEntrada) totalEntrada += valor;
        else totalSaida += valor;
      } else if (anoEvento < year || (anoEvento === year && mesEvento < month)) {
        saldoMesAnterior += isEntrada ? valor : -valor;
      }
    });
    const saldoCaixaMes = saldoMesAnterior + (totalEntrada - totalSaida);
    const elEntrada = document.getElementById('somaEntradasMes');
    const elSaida = document.getElementById('somaSaidasMes');
    const elCaixa = document.getElementById('saldoCaixaMes');
    if(elEntrada) elEntrada.innerText = formatCurrencyBRL(totalEntrada);
    if(elSaida) elSaida.innerText = formatCurrencyBRL(totalSaida);
    if(elCaixa) elCaixa.innerText = formatCurrencyBRL(saldoCaixaMes);
  };

  let financeiroCalendar = null;
  function renderFinanceiroCalendar(){
    const el = document.getElementById('financeiroCalendar');
    if(!el || !window.FullCalendar) return;
    const events = financeiro.map(m => {
      const dataEvento = getFinanceiroEventDate(m);
      if(!dataEvento) return null;
      const isEntrada = String(m.tipo).toLowerCase() === 'entrada';
      return { id: m.id, title: `${isEntrada ? 'Receita' : 'Despesa'} • ${m.desc || ''} • R$ ${Number(m.valor || 0).toFixed(2)}`, start: `${dataEvento.getFullYear()}-${String(dataEvento.getMonth()+1).padStart(2,'0')}-${String(dataEvento.getDate()).padStart(2,'0')}`, allDay: true, backgroundColor: isEntrada ? '#2e7d32' : '#c62828', borderColor: isEntrada ? '#2e7d32' : '#c62828', textColor: '#fff', extendedProps: { dataLanc: m.dataLanc || '', vencimento: m.vencimento || '', obs: m.obs || '' } };
    }).filter(Boolean);

    if(!financeiroCalendar){
      financeiroCalendar = new FullCalendar.Calendar(el, {
        initialView: 'dayGridMonth', locale: 'pt-br', height: 'auto',
        headerToolbar: { left:'prev,next today', center:'title', right:'dayGridMonth,listMonth' },
        events,
        eventClick: function(info){ abrirFinanceiroParaEdicao(info.event.id); },
        eventDidMount: function(info){ info.el.title = 'Clique para editar'; info.el.style.cursor = 'pointer'; },
        datesSet: function(info) {
          // O getMonth() no currentStart retorna exatamente o mês que está sendo visto
          const d = info.view.currentStart;
          window.calcularResumoMes(d.getMonth(), d.getFullYear());
        }
      });
      financeiroCalendar.render();
    } else {
      financeiroCalendar.removeAllEvents(); events.forEach(ev => financeiroCalendar.addEvent(ev));
      const d = financeiroCalendar.getDate();
      window.calcularResumoMes(d.getMonth(), d.getFullYear());
    }
  }

  function atualizarFinanceiroUI(){
    const tbody = document.querySelector('#financeiroTable tbody'); if(!tbody) return; tbody.innerHTML = "";
    const hoje = new Date(); let alerta = false;
    financeiro.forEach((mov) => {
      let aviso = "";
      if(String(mov.tipo).toLowerCase() === 'saida' && mov.vencimento){ const parts = mov.vencimento.split('/'); if(parts.length===3){ const venc = new Date(Number(parts[2]), Number(parts[1])-1, Number(parts[0])); const diff = Math.ceil((venc - hoje)/1000/60/60/24); if(diff <= 7 && diff >= 0){ aviso = `<span style="color:#b71c1c;font-weight:bold">🛈 Despesa próxima!</span>`; alerta = true; } } }
      const tr = document.createElement('tr');
      tr.innerHTML = `<td data-field="tipo">${String(mov.tipo).toLowerCase() === 'entrada' ? 'Receita' : 'Despesa'}</td><td data-field="desc">${escapeHTML(mov.desc)}</td><td data-field="valor">${Number(mov.valor).toFixed(2)}</td><td data-field="dataLanc">${escapeHTML(mov.dataLanc || "")}</td><td data-field="vencimento">${escapeHTML(mov.vencimento || "")}</td><td data-field="obs">${escapeHTML(mov.obs || "")}</td><td>${aviso}</td>`;
      const tdActions = document.createElement('td');
      const btnInline = document.createElement('button'); btnInline.className='btn-small blue small-action'; btnInline.innerHTML='<span class="material-icons">edit_attributes</span>'; btnInline.onclick=(e)=> window.editRow('financeiro', mov.id, e.currentTarget);
      const btnDel = document.createElement('button'); btnDel.className='btn-small red'; btnDel.innerHTML='<span class="material-icons">delete</span>'; btnDel.onclick=()=> window.excluirFinanceiro(mov.id);
      tdActions.appendChild(btnInline); tdActions.appendChild(btnDel); tr.appendChild(tdActions); tbody.appendChild(tr);
    });
    if(alerta) M.toast({html:"Atenção: Existem despesas próximas ao vencimento!", displayLength:8000, classes:'red'});
    
    setTimeout(() => { renderFinanceiroCalendar(); }, 150);
    reapplyAllFilters();
    scheduleDashboardUpdate();
  }

  function atualizarServicosUI(){
    const tbody = document.querySelector('#servicosTable tbody'); if(!tbody) return; tbody.innerHTML = "";
    servicos.forEach((s) => {
      const cliente = clientes.find(x=>x.id===s.clienteId) || {}; const vencStr = (s.vencimentos || []).join(' ; ');
      const tr = document.createElement('tr');
      tr.innerHTML = `<td data-field="cliente">${escapeHTML(cliente.nome || '')}</td><td data-field="desc">${escapeHTML(s.desc || '')}</td><td data-field="valor">${Number(s.valor || 0).toFixed(2)}</td><td data-field="parcelas">${s.parcelas || 1}</td><td data-field="vencimentos">${escapeHTML(vencStr)}</td>`;
      const tdActions = document.createElement('td');
      const btnInline = document.createElement('button'); btnInline.className='btn-small blue small-action'; btnInline.innerHTML='<span class="material-icons">edit_attributes</span>'; btnInline.onclick=(e)=> window.editRow('servicos', s.id, e.currentTarget);
      const btnDel = document.createElement('button'); btnDel.className='btn-small red'; btnDel.innerHTML='<span class="material-icons">delete</span>'; btnDel.onclick=()=> window.excluirServico(s.id);
      const btnWA = document.createElement('button'); btnWA.className='btn-small green small-action'; btnWA.innerHTML='<span class="material-icons">whatsapp</span>'; btnWA.title='Notificar via WhatsApp'; btnWA.onclick=()=>{ const vencTxt = (s.vencimentos || []).join(', ') || 'data não definida'; const msg = `Olá ${cliente.nome || 'cliente'}! Passamos para lembrá-lo(a) que o pagamento do serviço *${s.desc || ''}* no valor de *R$ ${Number(s.valor||0).toFixed(2)}* (${s.parcelas||1}x) possui vencimento em *${vencTxt}*. Qualquer dúvida, estamos à disposição.\n\n— HL Souza`; enviarWhatsAppVencimento(cliente.tel, msg); };
      tdActions.appendChild(btnInline); tdActions.appendChild(btnWA); tdActions.appendChild(btnDel); tr.appendChild(tdActions); tbody.appendChild(tr);
    });
    checkVencimentosServicos7dias(); reapplyAllFilters();
  }

  function getEmpresaConfig(){
    try{ return JSON.parse(localStorage.getItem('proposta_empresa') || 'null') || {}; }catch(e){ return {}; }
  }
  function renderPropostaHTML(proposta, cliente){
    const clienteDados = proposta.clienteSnapshot || cliente || {};
    const enderecoCliente = getClienteEnderecoFormatado(clienteDados);
    const validade = Number(proposta.validadeDias) || 30;
    const itens = Array.isArray(proposta.itens) ? proposta.itens.map((item, index) => normalizarItemProposta(item, index)) : [];
    const subtotal = Number(proposta.subtotal || proposta.total || 0) || 0;
    const total = Number(proposta.total || proposta.subtotal || 0) || 0;
    const dadosBancariosHtml = escapeHTML(proposta.dadosBancarios || '').replace(/\n/g, '<br>');
    const observacoesHtml = escapeHTML(proposta.observacoes || '').replace(/\n/g, '<br>');
    const empresa = getEmpresaConfig();
    const empresaNome = empresa.nome || 'CXPTEC ENGENHARIA';
    const empresaCNPJ = empresa.cnpj || '61.785.230/0001-06';
    const empresaEndereco = empresa.endereco || '';
    const empresaCidade = empresa.cidade || '';
    const empresaCEP = empresa.cep || '';
    const logoDataUrl = localStorage.getItem('proposta_logo') || '';
    const itensRows = itens.length ? itens.map((item) => `
      <tr>
        <td>${escapeHTML(item.descricao || '')}</td>
        <td>${escapeHTML(item.unidade || '')}</td>
        <td>${Number(item.quantidade || 0).toFixed(2).replace('.', ',')}</td>
        <td>R$ ${formatCurrencyBR(item.precoUnitario || 0)}</td>
        <td>R$ ${formatCurrencyBR(item.total || 0)}</td>
      </tr>
    `).join('') : '<tr><td colspan="5" style="text-align:center;color:#667;">Nenhum item informado.</td></tr>';
    return `<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="UTF-8">
  <title>Proposta Comercial</title>
  <style>
    *{box-sizing:border-box;}
    body{font-family:Arial,sans-serif;padding:22px 28px;color:#1d1d1d;background:#fff;font-size:12px;}
    table{width:100%;border-collapse:collapse;margin-bottom:12px;}
    th,td{border:1px solid #d0d8e0;padding:6px 10px;vertical-align:top;font-size:12px;}
    th{background:#f5f8fb;text-align:left;color:#28415a;}
    h2,h3{margin:0;}
    .btn-print{margin-bottom:12px;padding:7px 14px;cursor:pointer;border:1px solid #9fb3c7;background:#edf3f9;font-size:12px;}
    .proposal-shell{max-width:900px;margin:0 auto;}
    .proposal-topbar{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;}
    .proposal-logo-area{min-width:140px;max-width:190px;}
    .proposal-logo-area img{max-width:180px;max-height:75px;object-fit:contain;}
    .proposal-company-info{text-align:right;font-size:10.5px;line-height:1.65;color:#1d1d1d;}
    .proposal-company-name{font-weight:700;font-size:10.5px;}
    .proposal-divider{border:none;border-top:1px solid #aaa;margin:10px 0;}
    .proposal-title-block{text-align:center;font-size:13px;font-weight:700;margin:12px 0 14px;}
    .proposal-client-block{border-left:3px solid #333;padding:2px 0 2px 12px;margin-bottom:14px;font-size:12px;}
    .proposal-client-label{font-weight:700;margin-bottom:3px;}
    .proposal-meta-row{display:flex;gap:28px;font-size:11px;margin-bottom:14px;color:#444;}
    .proposal-section-title{font-size:11.5px;color:#1d3b58;margin:0 0 7px 0;text-transform:uppercase;letter-spacing:.5px;font-weight:700;}
    .proposal-summary{width:280px;margin-left:auto;}
    .proposal-summary td{font-weight:700;}
    .proposal-summary .highlight{font-size:13px;color:#12314b;background:#f4f8fc;}
    .proposal-notes,.proposal-bank,.proposal-signature{border:1px solid #d8e0e8;padding:10px 12px;background:#fff;margin-top:10px;}
    .proposal-signature{display:flex;justify-content:space-between;gap:20px;align-items:flex-end;}
    .muted{color:#627487;}
    @media print{.btn-print{display:none;}body{padding:12px 18px;}}
  </style>
</head>
<body>
  <div class="proposal-shell">
    <button class="btn-print" onclick="window.print()">Imprimir proposta</button>

    <div class="proposal-topbar">
      <div class="proposal-logo-area">${logoDataUrl ? `<img src="${logoDataUrl}" alt="Logo da empresa">` : ''}</div>
      <div class="proposal-company-info">
        <div class="proposal-company-name">${escapeHTML(empresaNome)}</div>
        <div>${escapeHTML(empresaCNPJ)}</div>
        ${empresaEndereco ? `<div>${escapeHTML(empresaEndereco)}</div>` : ''}
        ${empresaNome && empresaEndereco ? `<div>${escapeHTML(empresaNome)}</div>` : ''}
        ${empresaCidade ? `<div>${escapeHTML(empresaCidade)}</div>` : ''}
        ${empresaCEP ? `<div>${escapeHTML(empresaCEP)}</div>` : ''}
      </div>
    </div>

    <hr class="proposal-divider">

    <div class="proposal-title-block">${escapeHTML(proposta.titulo || 'Proposta Comercial')} Nº ${escapeHTML(proposta.numero || '—')}</div>

    <div class="proposal-client-block">
      <div class="proposal-client-label">Para</div>
      <div>${escapeHTML(clienteDados.nome || '')}</div>
      ${clienteDados.doc ? `<div>${escapeHTML(clienteDados.doc)}</div>` : ''}
      ${clienteDados.tel ? `<div>${escapeHTML(clienteDados.tel)}</div>` : ''}
      ${enderecoCliente ? `<div>${escapeHTML(enderecoCliente)}</div>` : ''}
    </div>

    <div class="proposal-meta-row">
      <span><strong>Data:</strong> ${escapeHTML(proposta.data || '—')}</span>
      <span><strong>Validade:</strong> ${validade} dias</span>
      <span><strong>Pagamento:</strong> ${escapeHTML(proposta.condicaoPagamento || '—')}</span>
      <span><strong>Frete:</strong> ${escapeHTML(proposta.condicaoFrete || '—')}</span>
    </div>

    <h3 class="proposal-section-title">Itens da proposta</h3>
    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th>Unidade</th>
          <th>Quantidade</th>
          <th>Preço unitário</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>${itensRows}</tbody>
    </table>

    <table class="proposal-summary">
      <tr><td>Subtotal</td><td>R$ ${formatCurrencyBR(subtotal)}</td></tr>
      <tr><td>Total geral</td><td class="highlight">R$ ${formatCurrencyBR(total)}</td></tr>
    </table>

    <div class="proposal-bank">
      <h3 class="proposal-section-title">Dados bancários</h3>
      <p>${dadosBancariosHtml}</p>
    </div>
    ${proposta.observacoes ? `<div class="proposal-notes"><h3 class="proposal-section-title">Observações</h3><p>${observacoesHtml}</p></div>` : ''}
    <div class="proposal-signature">
      <div>
        <h3 class="proposal-section-title">Atenciosamente</h3>
        <p>${escapeHTML(proposta.assinatura || '')}</p>
      </div>
      <div class="muted" style="font-size:11px;">Proposta gerada em ${escapeHTML(proposta.data || '')}.</div>
    </div>
  </div>
</body>
</html>`;
  }

  function atualizarPropostasUI(){
    const tbody = document.querySelector('#propostasTable tbody'); if(!tbody) return; tbody.innerHTML = "";
    propostas.forEach((p) => {
      const c = clientes.find(x => x.id === p.clienteId) || {};
      const itensCount = Array.isArray(p.itens) ? p.itens.length : 0;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${escapeHTML(p.numero || '')}</td><td>${escapeHTML(p.data || '')}</td><td>${escapeHTML((p.clienteSnapshot && p.clienteSnapshot.nome) || c.nome || '')}</td><td>${p.tipo === 'servico' ? 'Serviço' : 'Produto'}</td><td>${itensCount}</td><td>R$ ${formatCurrencyBR(p.total || 0)}</td><td>${escapeHTML(p.condicaoPagamento || '')}</td>`;
      const tdActions = document.createElement('td');
      const btnEdit = document.createElement('button'); btnEdit.className='btn-small orange small-action'; btnEdit.title='Editar proposta'; btnEdit.innerHTML='<span class="material-icons">edit</span>'; btnEdit.onclick=()=> window.editarProposta(p.id);
      const btnView = document.createElement('button'); btnView.className='btn-small blue small-action'; btnView.title='Visualizar/Imprimir'; btnView.innerHTML='<span class="material-icons">visibility</span>'; btnView.onclick=()=> window.visualizarProposta(p.id);
      const btnDel = document.createElement('button'); btnDel.className='btn-small red'; btnDel.title='Excluir'; btnDel.innerHTML='<span class="material-icons">delete</span>'; btnDel.onclick=()=> window.excluirProposta(p.id);
      tdActions.appendChild(btnEdit); tdActions.appendChild(btnView); tdActions.appendChild(btnDel); tr.appendChild(tdActions); tbody.appendChild(tr);
    });
    reapplyAllFilters();
  }

  window.editarProposta = function(id){
    const p = propostas.find(x => x.id === id); if(!p) return;
    document.getElementById('propostaEditId').value = p.id;
    document.getElementById('propostaCliente').value = p.clienteId || '';
    document.getElementById('propostaData').value = p.data ? (() => { const parts = String(p.data).split('/'); return (parts.length===3) ? `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}` : formatDateToISO(new Date()); })() : formatDateToISO(new Date());
    document.getElementById('propostaNumero').value = p.numero || gerarNumeroProposta();
    document.getElementById('propostaTitulo').value = p.titulo || 'Proposta Comercial';
    document.getElementById('propostaCondicaoFrete').value = p.condicaoFrete || '';
    document.getElementById('propostaCondicaoPagamento').value = p.condicaoPagamento || '';
    document.getElementById('propostaValidade').value = Number(p.validadeDias || 30);
    document.getElementById('propostaSubtotal').value = Number(p.subtotal || p.total || 0).toFixed(2);
    document.getElementById('propostaTotal').value = Number(p.total || 0).toFixed(2);
    document.getElementById('propostaDadosBancarios').value = p.dadosBancarios || '';
    document.getElementById('propostaObservacoes').value = p.observacoes || '';
    document.getElementById('propostaAssinatura').value = p.assinatura || '';
    propostaTipo = p.tipo === 'servico' ? 'servico' : 'produto';
    atualizarBotoesTipoProposta();
    const normalizarItem = propostaTipo === 'servico' ? normalizarItemPropostaServico : normalizarItemProposta;
    propostaItens = Array.isArray(p.itens) && p.itens.length ? p.itens.map((item, index) => normalizarItem(item, index)) : [normalizarItem({ quantidade: 1, precoUnitario: 0 }, 0)];
    preencherResumoClienteProposta(p.clienteId || '');
    renderTabelaItensProposta();
    M.updateTextFields();
    const _pcInst2 = M.FormSelect.getInstance(document.getElementById('propostaCliente'));
    if(_pcInst2) _pcInst2.destroy();
    M.FormSelect.init(document.getElementById('propostaCliente'));
    showTab('sectionPropostas');
  };

  window.visualizarProposta = function(id){
    const proposta = propostas.find(x => x.id === id); if(!proposta) return;
    const cliente = clientes.find(x => x.id === proposta.clienteId) || {};
    const popup = window.open('', '_blank');
    if(!popup){ M.toast({html:'Permita pop-up para visualizar a proposta.', classes:'red'}); return; }
    popup.document.open();
    popup.document.write(renderPropostaHTML(proposta, cliente));
    popup.document.close();
  };

  function calcularSaldo(){
    let saldoPedidos = 0; pedidos.forEach(p => { if(String(p && p.status).toLowerCase() === 'cancelado') return; const custo = Number(p && p.custo ? p.custo : 0) || 0; if(custo > 0) saldoPedidos += custo; });
    let saldoFinanceiro = 0; financeiro.forEach(mov => { const valor = Number(mov && mov.valor ? mov.valor : 0) || 0; if(String(mov.tipo).toLowerCase() === "entrada") saldoFinanceiro += valor; else if(String(mov.tipo).toLowerCase() === "saida") saldoFinanceiro -= valor; });
    const saldoFinal = saldoPedidos + saldoFinanceiro; const saldoEl = document.getElementById('saldoAtual'); if(saldoEl) saldoEl.value = "R$ " + saldoFinal.toFixed(2);
  }

  function checkVencimentosPedidos7dias(){
    const hoje = new Date(); const proximos = [];
    pedidos.forEach((p)=>{ if(!p.vencimento) return; if(String(p.vencimento).toLowerCase().includes('à vista')) return; const d = parseDDMMYYYYToDate(p.vencimento); if(!d) return; const diff = Math.ceil((d - new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()))/1000/60/60/24); if(diff <= 7 && diff >= 0){ const cliente = clientes.find(x=>x.id===p.clienteId) || {}; proximos.push(`${p.produto} - ${cliente.nome || 'Cliente não identificado'} (${p.vencimento})`); } });
    if(proximos.length) M.toast({html: `Atenção: ${proximos.length} pedido(s) vencendo em até 7 dias.`, displayLength:8000, classes:'red'});
  }

  function checkVencimentosServicos7dias(){
    const hoje = new Date(); const proximos = [];
    servicos.forEach((s)=>{ (s.vencimentos || []).forEach(v=>{ const d = parseDDMMYYYYToDate(v); if(!d) return; const diff = Math.ceil((d - new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()))/1000/60/60/24); if(diff <= 7 && diff >= 0){ const cliente = clientes.find(x=>x.id===s.clienteId) || {}; proximos.push(`${s.desc} - ${cliente.nome || 'Cliente'} (${v})`); } }); });
    if(proximos.length) M.toast({html: `Atenção: ${proximos.length} vencimento(s) de serviços em até 7 dias.`, displayLength:8000, classes:'red'});
  }

  // ====== LEMBRETE AUTOMÁTICO 2 DIAS ANTES DO VENCIMENTO ======
  function checkVencimentosPedidos2dias(){
    const hoje = new Date();
    const hoje0 = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    const matches = [];
    pedidos.forEach(p => {
      if(!p.vencimento || String(p.vencimento).toLowerCase().includes('à vista')) return;
      const status = String(p.status || '').toLowerCase();
      if(status === 'cancelado' || status === 'pago') return;
      const d = parseDDMMYYYYToDate(p.vencimento);
      if(!d) return;
      const diff = Math.ceil((d - hoje0) / 1000 / 60 / 60 / 24);
      if(diff === 2){
        const cliente = clientes.find(x => x.id === p.clienteId) || {};
        matches.push({ pedido: p, cliente });
      }
    });

    const banner = document.getElementById('vencimento2diasBanner');
    if(!banner) return;

    if(matches.length === 0){ banner.style.display = 'none'; return; }

    const assinatura = '— HL Souza';
    const itensHtml = matches.map(({ pedido: p, cliente: c }) => {
      const tel = onlyDigits(c.tel || '');
      const phone = tel ? (tel.startsWith('55') ? tel : '55' + tel) : '';
      const msg = `Olá ${c.nome || 'cliente'}! Passamos para lembrá-lo(a) que o pagamento do pedido *${p.produto || ''}* no valor de *R$ ${Number(p.custo||0).toFixed(2)}* vence em *${p.vencimento}* (em 2 dias). Qualquer dúvida, estamos à disposição.\n\n${assinatura}`;
      const url = tel ? `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(msg)}` : '';
      return `<li style="margin:4px 0;">
        <strong>${escapeHTML(c.nome || 'Cliente')}</strong> — ${escapeHTML(p.produto || '')} — R$ ${Number(p.custo||0).toFixed(2)} — Venc: <strong>${escapeHTML(p.vencimento)}</strong>
        ${tel ? `<a href="${escapeHTML(url)}" target="_blank" rel="noopener" class="btn-small green" style="margin-left:8px;vertical-align:middle;"><span class="material-icons" style="font-size:16px;vertical-align:middle;">whatsapp</span> Enviar</a>` : '<span style="color:#b71c1c;font-size:12px;margin-left:8px;">(sem telefone)</span>'}
      </li>`;
    }).join('');

    banner.style.display = '';
    banner.innerHTML = `<div style="background:linear-gradient(#fff3e0,#ffe0b2);border:2px solid #e65100;padding:12px 16px;margin-bottom:10px;border-radius:4px;">
      <strong style="color:#bf360c;font-size:15px;">🔔 ${matches.length} pedido(s) vencem em 2 dias — Envie os lembretes!</strong>
      <ul style="margin:8px 0 0 0;padding-left:20px;">${itensHtml}</ul>
    </div>`;
  }

  // ====== CLIENTES SEM COMPRA HÁ 2 SEMANAS ======
  function dispararLembretesSemCompra(){
    const hoje = new Date();
    const hoje0 = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    const limitDate = new Date(hoje0);
    limitDate.setDate(limitDate.getDate() - 7);

    const qualificados = [];
    clientes.forEach(c => {
      const clientePedidos = pedidos.filter(p => p.clienteId === c.id && String(p.status || '').toLowerCase() !== 'cancelado');
      if(clientePedidos.length === 0){
        qualificados.push({ cliente: c, lastPurchase: null, diasSemCompra: null });
        return;
      }
      let lastDate = null;
      clientePedidos.forEach(p => {
        const d = parseDDMMYYYYToDate(p.dataPedido);
        if(d && (!lastDate || d > lastDate)) lastDate = d;
      });
      if(!lastDate || lastDate <= limitDate){
        const dias = lastDate ? Math.ceil((hoje0 - lastDate) / 1000 / 60 / 60 / 24) : null;
        qualificados.push({ cliente: c, lastPurchase: lastDate, diasSemCompra: dias });
      }
    });

    const panel = document.getElementById('clientesSemCompraBanner');
    if(!panel) return;

    if(qualificados.length === 0){
      panel.style.display = '';
      panel.innerHTML = `<div style="background:linear-gradient(#e8f5e9,#c8e6c9);border:1px solid #81c784;padding:12px 16px;margin-bottom:10px;border-radius:4px;">✅ Todos os clientes realizaram compras nos últimos 14 dias.</div>`;
      return;
    }

    const assinatura = '— HL Souza';
    const itensHtml = qualificados.map(({ cliente: c, diasSemCompra }) => {
      const tel = onlyDigits(c.tel || '');
      const phone = tel ? (tel.startsWith('55') ? tel : '55' + tel) : '';
      const diasStr = diasSemCompra ? `${diasSemCompra} dias sem compra` : 'nunca comprou';
      const msg = `Olá ${c.nome || 'cliente'}! Sentimos a sua falta! Faz algum tempo que não recebemos o seu pedido. Que tal aproveitar e fazer uma compra hoje? Estamos à sua disposição!\n\n${assinatura}`;
      const url = tel ? `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(msg)}` : '';
      return `<li data-url="${escapeHTML(url)}" data-nome="${escapeHTML(c.nome || '')}" style="margin:4px 0;">
        <strong>${escapeHTML(c.nome || 'Cliente')}</strong> <span style="color:#7f6000;font-size:12px;">(${escapeHTML(diasStr)})</span>
        ${tel ? `<a href="${escapeHTML(url)}" target="_blank" rel="noopener" class="btn-small green" style="margin-left:8px;vertical-align:middle;"><span class="material-icons" style="font-size:16px;vertical-align:middle;">whatsapp</span> Enviar</a>` : '<span style="color:#b71c1c;font-size:12px;margin-left:8px;">(sem telefone)</span>'}
      </li>`;
    }).join('');

    panel.style.display = '';
    panel.innerHTML = `<div style="background:linear-gradient(#fff3e0,#ffe0b2);border:2px solid #e65100;padding:12px 16px;margin-bottom:10px;border-radius:4px;">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <strong style="color:#bf360c;font-size:15px;">🛒 ${qualificados.length} cliente(s) sem compra há mais de 7 dias</strong>
        <button id="btnDispararTodos" class="btn-small orange" style="margin-left:auto;"><span class="material-icons left" style="font-size:16px;">send</span>Disparar para Todos</button>
      </div>
      <ul id="listaSemCompra" style="margin:8px 0 0 0;padding-left:20px;">${itensHtml}</ul>
    </div>`;

    document.getElementById('btnDispararTodos').onclick = function(){
      const links = panel.querySelectorAll('#listaSemCompra li[data-url]');
      const urls = [];
      links.forEach(li => {
        const url = li.getAttribute('data-url');
        if(url) urls.push(url);
      });
      if(urls.length === 0){ M.toast({html:'Nenhum cliente com telefone cadastrado.', classes:'red'}); return; }
      const confirmar = confirm(`Deseja enviar mensagem via WhatsApp para ${urls.length} cliente(s) simultaneamente?`);
      if(!confirmar) return;
      urls.forEach(url => { window.open(url, '_blank'); });
      M.toast({html:`WhatsApp aberto para ${urls.length} cliente(s). Verifique bloqueio de pop-ups.`, displayLength:6000});
    };
  }

  // ====== WHATSAPP NOTIFICAÇÃO DE VENCIMENTO ======
  function enviarWhatsAppVencimento(telefone, mensagem) {
    const digits = onlyDigits(telefone || '');
    if (!digits) { M.toast({html:'Cliente sem telefone cadastrado.', classes:'red'}); return; }
    const phone = digits.startsWith('55') ? digits : '55' + digits;
    const url = 'https://api.whatsapp.com/send?phone=' + phone + '&text=' + encodeURIComponent(mensagem);
    window.open(url, '_blank');
  }

  const btnClientesSemCompra = document.getElementById('btnClientesSemCompra');
  if(btnClientesSemCompra) btnClientesSemCompra.addEventListener('click', function(){ dispararLembretesSemCompra(); });

  // EXCLUSÕES GLOBAIS
  window.excluirCliente = async function(id){ if(confirm("Excluir cliente?")) { await collClientes.doc(id).delete(); M.toast({html:'Excluído!'}); } };
  window.excluirMP = async function(id){ if(confirm("Excluir MP?")) { await collMP.doc(id).delete(); M.toast({html:'Excluído!'}); } };
  window.excluirPedido = async function(id){ if(confirm("Excluir pedido?")) { await collPedidos.doc(id).delete(); M.toast({html:'Excluído!'}); } };
  window.excluirServico = async function(id){ if(confirm("Excluir serviço?")) { await collServicos.doc(id).delete(); M.toast({html:'Excluído!'}); } };
  window.excluirCadServico = async function(id){ if(confirm("Excluir serviço cadastrado?")) { await collCadServico.doc(id).delete(); M.toast({html:'Excluído!'}); } };
  window.excluirProposta = async function(id){ if(confirm("Excluir proposta?")) { await collPropostas.doc(id).delete(); M.toast({html:'Excluído!'}); } };
  window.excluirFinanceiro = async function(id){ if(!id) return; if(confirm('Tem certeza que deseja excluir esta movimentação financeira?')){ try{ await collFinanceiro.doc(id).delete(); M.toast({ html: 'Movimentação excluída!' }); calcularSaldo(); }catch(err){ showStatus('Erro ao excluir', true); } } };

  // ====== EDIÇÃO INLINE (TABELAS) ======
  window.editRow = function(collectionName, id, btn){
    const tr = btn.closest('tr'); if(tr.classList.contains('editing-row')){ saveRowEdits(tr, collectionName, id); return; } startRowEdit(tr, collectionName, id);
  };

  function startRowEdit(tr, collectionName, id){
    tr.classList.add('editing-row'); tr._original = tr.innerHTML; const tds = tr.querySelectorAll('td');
    tds.forEach(td => {
      const field = td.getAttribute('data-field'); if(!field) return; const val = td.innerText; let input;
      if(collectionName === 'clientes'){ if(field === 'docTipo'){ input = document.createElement('select'); const optCpf = document.createElement('option'); optCpf.value='cpf'; optCpf.text='CPF'; const optCnpj = document.createElement('option'); optCnpj.value='cnpj'; optCnpj.text='CNPJ'; input.appendChild(optCpf); input.appendChild(optCnpj); input.value = (val.toLowerCase().indexOf('cnpj')>-1) ? 'cnpj' : 'cpf'; } else { input = document.createElement('input'); input.type='text'; input.value = val; } } else if(collectionName === 'mpList'){ if(field === 'saldo' || field === 'preco'){ input = document.createElement('input'); input.type='number'; input.step = (field==='preco' ? '0.01' : '1'); input.value = val.replace(/[^\d\.\-]/g,'') || 0; } else if(field === 'unidade'){ input = document.createElement('select'); const o1 = document.createElement('option'); o1.value='kg'; o1.text='kg'; const o2 = document.createElement('option'); o2.value='unidade'; o2.text='unidade'; input.appendChild(o1); input.appendChild(o2); input.value = val; } else { input = document.createElement('input'); input.type='text'; input.value = val; } } else if(collectionName === 'pedidos'){ if(field === 'kg' || field === 'precoKg' || field === 'custo'){ input = document.createElement('input'); input.type='number'; input.step = (field==='precoKg' || field==='custo' ? '0.01' : '1'); input.value = val.replace(/[^\d\.\-]/g,'') || 0; } else if(field === 'cliente'){ input = document.createElement('select'); const placeholder = document.createElement('option'); placeholder.value=''; placeholder.text='-- Selecionar cliente --'; placeholder.disabled=true; input.appendChild(placeholder); clientes.forEach((c) => { const o = document.createElement('option'); o.value = c.id; o.text = `${c.nome} (${c.doc || ''})`; input.appendChild(o); }); const match = clientes.find(c=>c.nome === val); input.value = match ? match.id : ''; } else if(field === 'produto'){ input = document.createElement('select'); const opts = ["CURE FILM H","CURE FILM HC","HARDSURF H","HARDSURF HC"]; const placeholder = document.createElement('option'); placeholder.value=''; placeholder.text='-- Selecionar produto --'; placeholder.disabled=true; input.appendChild(placeholder); opts.forEach(pn => { const o = document.createElement('option'); o.value = pn; o.text = pn; input.appendChild(o); }); input.value = val || ''; } else if(field === 'dataPedido' || field === 'vencimento'){ input = document.createElement('input'); input.type='date'; const parts = val.split('/'); if(parts.length===3) input.value = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`; } else if(field === 'status'){ input = document.createElement('select'); const o1 = document.createElement('option'); o1.value='Pendente'; o1.text='Pendente'; const o2 = document.createElement('option'); o2.value='Pago'; o2.text='Pago'; const o3 = document.createElement('option'); o3.value='Cancelado'; o3.text='Cancelado'; input.appendChild(o1); input.appendChild(o2); input.appendChild(o3); input.value = val || 'Pendente'; } else { input = document.createElement('input'); input.type='text'; input.value = val; } } else if(collectionName === 'financeiro'){ if(field === 'valor'){ input = document.createElement('input'); input.type='number'; input.step='0.01'; input.value = val.replace(/[^\d\.\-]/g,'') || 0; } else if(field === 'tipo'){ input = document.createElement('select'); const o1 = document.createElement('option'); o1.value='entrada'; o1.text='Receita'; const o2 = document.createElement('option'); o2.value='saida'; o2.text='Despesa'; input.appendChild(o1); input.appendChild(o2); const raw = String(val || '').toLowerCase().trim(); if(raw === 'receita' || raw === 'entrada') input.value = 'entrada'; else if(raw === 'despesa' || raw === 'saída' || raw === 'saida') input.value = 'saida'; else input.value = 'entrada'; } else if(field === 'dataLanc' || field === 'vencimento'){ input = document.createElement('input'); input.type='date'; const parts = val.split('/'); if(parts.length===3) input.value = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`; } else { input = document.createElement('input'); input.type='text'; input.value = val; } } else if(collectionName === 'servicos'){ if(field === 'cliente'){ input = document.createElement('select'); const placeholder = document.createElement('option'); placeholder.value=''; placeholder.text='-- Selecionar cliente --'; placeholder.disabled=true; input.appendChild(placeholder); clientes.forEach((c) => { const o = document.createElement('option'); o.value = c.id; o.text = `${c.nome} (${c.doc || ''})`; input.appendChild(o); }); const match = clientes.find(c=>c.nome === val); input.value = match ? match.id : ''; } else if(field === 'valor'){ input = document.createElement('input'); input.type='number'; input.step='0.01'; input.value = val.replace(/[^\d\.\-]/g,'') || 0; } else if(field === 'parcelas'){ input = document.createElement('input'); input.type='number'; input.value = val || 1; } else if(field === 'vencimentos'){ input = document.createElement('input'); input.type='text'; input.value = val; } else { input = document.createElement('input'); input.type='text'; input.value = val; } } else if(collectionName === 'cadServico'){ if(field === 'valor'){ input = document.createElement('input'); input.type='number'; input.step='0.01'; input.value = val.replace(/[^\d\.\-]/g,'') || 0; } else { input = document.createElement('input'); input.type='text'; input.value = val; } } else { input = document.createElement('input'); input.type='text'; input.value = val; }
      td.innerHTML = ''; if(input.tagName.toLowerCase() === 'select'){ input.classList.add('browser-default'); } td.appendChild(input);
    });
    const actionsTd = tr.querySelector('td:last-child');
    if(actionsTd){
      actionsTd._old = actionsTd.innerHTML;
      actionsTd.innerHTML = `<button class="btn-small green small-action" data-action="save" title="Salvar"><span class="material-icons">save</span></button><button class="btn-small grey" data-action="cancel" title="Cancelar"><span class="material-icons">close</span></button>`;
      actionsTd.querySelector('[data-action="save"]').onclick = () => saveRowEdits(tr, collectionName, id);
      actionsTd.querySelector('[data-action="cancel"]').onclick = () => cancelRowEdits(tr);
    }
  }

  function cancelRowEdits(tr){
    tr.classList.remove('editing-row');
    if(typeof atualizarClientesUI === 'function') atualizarClientesUI(); if(typeof atualizarMPCadastroUI === 'function') atualizarMPCadastroUI(); if(typeof atualizarPedidosUI === 'function') atualizarPedidosUI(); if(typeof atualizarFinanceiroUI === 'function') atualizarFinanceiroUI(); if(typeof atualizarServicosUI === 'function') atualizarServicosUI(); if(typeof atualizarCadServicosUI === 'function') atualizarCadServicosUI(); if(typeof atualizarPropostasUI === 'function') atualizarPropostasUI();
  }

  async function saveRowEdits(tr, collectionName, id){
    const cells = tr.querySelectorAll('td'); const updated = {};
    cells.forEach(td => { const field = td.getAttribute('data-field'); if(!field) return; const child = td.firstElementChild; if(!child) return; if(child.tagName.toLowerCase() === 'select'){ updated[field] = child.value; } else if(child.tagName.toLowerCase() === 'input'){ if(child.type === 'number'){ updated[field] = child.value === '' ? 0 : Number(child.value); } else if(child.type === 'date'){ const v = child.value; if(v){ const d = parseDateInputAsLocal(v); updated[field] = formatDateToDDMMYYYY(d); } else updated[field] = ''; } else { updated[field] = child.value; } } else { updated[field] = child.innerText || child.value || ''; } });
    try {
      if(collectionName === 'clientes'){
        const obj = {}; if(updated.nome !== undefined) obj.nome = String(updated.nome).trim(); if(updated.docTipo !== undefined) obj.docTipo = (String(updated.docTipo).toLowerCase() === 'cnpj' ? 'cnpj' : 'cpf'); if(updated.doc !== undefined) obj.doc = String(updated.doc).trim(); if(updated.tel !== undefined) obj.tel = String(updated.tel).trim(); if(updated.email !== undefined) obj.email = String(updated.email).trim(); if(updated.cep !== undefined) obj.cep = String(updated.cep).trim(); if(updated.endereco !== undefined) obj.endereco = String(updated.endereco).trim(); if(updated.numero !== undefined) obj.numero = String(updated.numero).trim(); if(updated.complemento !== undefined) obj.complemento = String(updated.complemento).trim(); obj.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
        await collClientes.doc(id).set(obj, { merge: true }); M.toast({html:'Cliente atualizado!'});
      } else if(collectionName === 'mpList'){
        const obj = {}; if(updated.tipo !== undefined) obj.tipo = String(updated.tipo).trim(); if(updated.saldo !== undefined) obj.saldo = Number(updated.saldo) || 0; if(updated.preco !== undefined) obj.preco = Number(updated.preco) || 0; if(updated.unidade !== undefined) obj.unidade = String(updated.unidade).trim(); if(updated.embalagem !== undefined) obj.embalagem = String(updated.embalagem).trim(); obj.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
        await collMP.doc(id).set(obj, { merge: true }); M.toast({html:'MP atualizada!'});
      } else if(collectionName === 'pedidos'){
        const obj = {}; if(updated.cliente !== undefined) obj.clienteId = String(updated.cliente); if(updated.produto !== undefined) obj.produto = String(updated.produto).trim(); if(updated.kg !== undefined) obj.kg = Number(updated.kg) || 0; if(updated.precoKg !== undefined) obj.precoKg = Number(updated.precoKg) || 0; if(updated.custo !== undefined) obj.custo = Number(updated.custo) || 0; if(updated.dataPedido !== undefined) obj.dataPedido = String(updated.dataPedido).trim(); if(updated.vencimento !== undefined) obj.vencimento = String(updated.vencimento).trim(); if(updated.status !== undefined) obj.status = String(updated.status).trim(); obj.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
        await collPedidos.doc(id).set(obj, { merge: true }); M.toast({html:'Pedido atualizado!'});
      } else if(collectionName === 'financeiro'){
        const obj = {}; if(updated.tipo !== undefined){ const t = String(updated.tipo).trim().toLowerCase(); obj.tipo = (t === 'saida' || t === 'despesa' || t === 'saída') ? 'saida' : 'entrada'; } if(updated.desc !== undefined) obj.desc = String(updated.desc).trim(); if(updated.valor !== undefined){ const v = Number(updated.valor); obj.valor = Number.isFinite(v) ? v : 0; } if(updated.dataLanc !== undefined) obj.dataLanc = String(updated.dataLanc).trim(); if(updated.vencimento !== undefined) obj.vencimento = String(updated.vencimento).trim(); if(updated.obs !== undefined) obj.obs = String(updated.obs).trim(); obj.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
        await collFinanceiro.doc(id).set(obj, { merge: true }); calcularSaldo(); M.toast({html:'Financeiro atualizado!'});
      } else if(collectionName === 'servicos'){
        const obj = {}; if(updated.cliente !== undefined) obj.clienteId = String(updated.cliente); if(updated.desc !== undefined) obj.desc = String(updated.desc).trim(); if(updated.valor !== undefined) obj.valor = Number(updated.valor) || 0; if(updated.parcelas !== undefined) obj.parcelas = Number(updated.parcelas) || 1; if(updated.vencimentos !== undefined) obj.vencimentos = String(updated.vencimentos).split(';').map(s=>s.trim()).filter(x=>x); obj.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
        await collServicos.doc(id).set(obj, { merge: true }); M.toast({html:'Serviço atualizado!'});
      } else if(collectionName === 'cadServico'){
        const obj = {}; if(updated.tipo !== undefined) obj.tipo = String(updated.tipo).trim(); if(updated.valor !== undefined) obj.valor = Number(updated.valor) || 0; if(updated.unidade !== undefined) obj.unidade = String(updated.unidade).trim(); obj.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
        await collCadServico.doc(id).set(obj, { merge: true }); M.toast({html:'Serviço atualizado!'});
      }
    } catch(err){ showStatus('Erro ao salvar edição.', true); }
    tr.classList.remove('editing-row');
  }

  // ====== DASHBOARD ======
  function destroyDashCharts(){
    Object.keys(_dashCharts).forEach(k => {
      if(_dashCharts[k]){ _dashCharts[k].destroy(); _dashCharts[k] = null; }
    });
  }

  function renderDashboard(){
    if(!window.Chart){ setTimeout(() => renderDashboard(), 600); return; }

    const dataInicio = document.getElementById('dashDataInicio').value;
    const dataFim = document.getElementById('dashDataFim').value;
    const prodFiltro = document.getElementById('dashProduto').value;
    const statusFiltro = document.getElementById('dashStatus').value;

    const dtInicio = dataInicio ? parseDateInputAsLocal(dataInicio) : null;
    let dtFim = null;
    if(dataFim){ dtFim = parseDateInputAsLocal(dataFim); if(dtFim) dtFim.setHours(23,59,59,999); }

    // Filter pedidos
    const pedidosFilt = pedidos.filter(p => {
      if(prodFiltro && p.produto !== prodFiltro) return false;
      if(statusFiltro && p.status !== statusFiltro) return false;
      if(dtInicio || dtFim){
        let d = null;
        if(p.vencimento && String(p.vencimento).toLowerCase().includes('vista')){
          d = parseDDMMYYYYToDate(p.dataPedido);
        } else if(p.vencimento && typeof p.vencimento === 'string' && p.vencimento.includes('/')){
          d = parseDDMMYYYYToDate(p.vencimento);
        } else {
          d = parseDDMMYYYYToDate(p.dataPedido);
        }
        if(!d) return false;
        if(dtInicio && d < dtInicio) return false;
        if(dtFim && d > dtFim) return false;
      }
      return true;
    });

    // Pedidos activos (excluindo Cancelado) para receita e volume
    const pedidosAtivos = pedidosFilt.filter(p => String(p.status).toLowerCase() !== 'cancelado');

    // Filter financeiro
    const financFilt = financeiro.filter(m => {
      if(!(dtInicio || dtFim)) return true;
      let d = m.dataLanc ? parseDDMMYYYYToDate(m.dataLanc) : null;
      if(!d && m.vencimento) d = parseDDMMYYYYToDate(m.vencimento);
      if(!d) return true;
      if(dtInicio && d < dtInicio) return false;
      if(dtFim && d > dtFim) return false;
      return true;
    });

    // KPIs
    const totalEntradas = financFilt.filter(m => String(m.tipo).toLowerCase() === 'entrada').reduce((s,m) => s + (Number(m.valor)||0), 0);
    const totalSaidas   = financFilt.filter(m => String(m.tipo).toLowerCase() === 'saida').reduce((s,m) => s + (Number(m.valor)||0), 0);
    const saldoFin = totalEntradas - totalSaidas;

    document.getElementById('kpiClientes').textContent = clientes.length;
    document.getElementById('kpiPedidos').textContent = pedidosFilt.length;
    document.getElementById('kpiVolume').textContent = pedidosAtivos.reduce((s,p) => s + (Number(p.kg)||0), 0).toFixed(1).replace('.',',') + ' kg';
    document.getElementById('kpiReceita').textContent = 'R$ ' + pedidosAtivos.reduce((s,p) => s + (Number(p.custo)||0), 0).toFixed(2).replace('.',',');
    document.getElementById('kpiDespesa').textContent = 'R$ ' + totalSaidas.toFixed(2).replace('.',',');
    document.getElementById('kpiSaldo').textContent = (saldoFin < 0 ? '-' : '') + 'R$ ' + Math.abs(saldoFin).toFixed(2).replace('.',',');
    const kpiSaldoCard = document.getElementById('kpiSaldoCard');
    kpiSaldoCard.classList.remove('dash-kpi-green','dash-kpi-red');
    kpiSaldoCard.classList.add(saldoFin >= 0 ? 'dash-kpi-green' : 'dash-kpi-red');

    destroyDashCharts();

    const chartOpts = { responsive: true, maintainAspectRatio: true };

    // Chart 1: Pedidos por Mês (bar)
    const pedMes = {};
    pedidosFilt.forEach(p => {
      let d = null;
      if(p.vencimento && String(p.vencimento).toLowerCase().includes('vista')){
        d = parseDDMMYYYYToDate(p.dataPedido);
      } else if(p.vencimento && typeof p.vencimento === 'string' && p.vencimento.includes('/')){
        d = parseDDMMYYYYToDate(p.vencimento);
      } else {
        d = parseDDMMYYYYToDate(p.dataPedido);
      }
      if(!d) return;
      const k = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
      pedMes[k] = (pedMes[k]||0) + 1;
    });
    const pedMesKeys = Object.keys(pedMes).sort();
    _dashCharts.pedidosMes = new Chart(document.getElementById('chartPedidosMes'), {
      type: 'bar',
      data: {
        labels: pedMesKeys.map(k => { const [y,m] = k.split('-'); return m+'/'+y; }),
        datasets: [{ label: 'Pedidos', data: pedMesKeys.map(k => pedMes[k]), backgroundColor: '#318fce', borderColor: '#2779b0', borderWidth: 1 }]
      },
      options: { ...chartOpts, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    });

    // Chart 2: Volume por Produto (doughnut) — apenas pedidos ativos
    const volProd = {};
    pedidosAtivos.forEach(p => { const k = p.produto || 'Outros'; volProd[k] = (volProd[k]||0) + (Number(p.kg)||0); });
    const prodKeys = Object.keys(volProd);
    _dashCharts.produtos = new Chart(document.getElementById('chartProdutos'), {
      type: 'doughnut',
      data: {
        labels: prodKeys,
        datasets: [{ data: prodKeys.map(k => volProd[k]), backgroundColor: ['#318fce','#47a647','#e6890f','#d23b3b','#9c27b0','#00838f'] }]
      },
      options: { ...chartOpts }
    });

    // Chart 3: Entradas × Saídas por Mês (bar)
    const entMes = {}; const saiMes = {};
    financFilt.forEach(m => {
      let d = m.dataLanc ? parseDDMMYYYYToDate(m.dataLanc) : null;
      if(!d && m.vencimento) d = parseDDMMYYYYToDate(m.vencimento);
      if(!d) return;
      const k = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
      const v = Number(m.valor)||0;
      if(String(m.tipo).toLowerCase()==='entrada') entMes[k] = (entMes[k]||0)+v;
      else saiMes[k] = (saiMes[k]||0)+v;
    });
    const finMesKeys = [...new Set([...Object.keys(entMes), ...Object.keys(saiMes)])].sort();
    _dashCharts.financeiro = new Chart(document.getElementById('chartFinanceiro'), {
      type: 'bar',
      data: {
        labels: finMesKeys.map(k => { const [y,m] = k.split('-'); return m+'/'+y; }),
        datasets: [
          { label: 'Entradas', data: finMesKeys.map(k => entMes[k]||0), backgroundColor: '#47a647', borderColor: '#3b8e3b', borderWidth: 1 },
          { label: 'Saídas',   data: finMesKeys.map(k => saiMes[k]||0), backgroundColor: '#d23b3b', borderColor: '#b52f2f', borderWidth: 1 }
        ]
      },
      options: { ...chartOpts, scales: { y: { beginAtZero: true } } }
    });

    // Chart 4: Top 5 Clientes por Volume (horizontal bar) — apenas pedidos ativos
    const cliVol = {};
    pedidosAtivos.forEach(p => {
      const c = clientes.find(x => x.id === p.clienteId) || {};
      const n = c.nome || 'Desconhecido';
      cliVol[n] = (cliVol[n]||0) + (Number(p.kg)||0);
    });
    const top5 = Object.entries(cliVol).sort((a,b) => b[1]-a[1]).slice(0,5);
    _dashCharts.topClientes = new Chart(document.getElementById('chartTopClientes'), {
      type: 'bar',
      data: {
        labels: top5.map(x => x[0]),
        datasets: [{ label: 'Volume (kg)', data: top5.map(x => x[1]), backgroundColor: '#9c27b0', borderColor: '#7b1fa2', borderWidth: 1 }]
      },
      options: { ...chartOpts, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } }
    });

    // Chart 5: Receita por Produto (bar) — apenas pedidos ativos
    const recProd = {};
    pedidosAtivos.forEach(p => { const k = p.produto || 'Outros'; recProd[k] = (recProd[k]||0) + (Number(p.custo)||0); });
    const recProdKeys = Object.keys(recProd);
    _dashCharts.receitaProduto = new Chart(document.getElementById('chartReceitaProduto'), {
      type: 'bar',
      data: {
        labels: recProdKeys,
        datasets: [{ label: 'R$', data: recProdKeys.map(k => recProd[k]), backgroundColor: ['#318fce','#47a647','#e6890f','#d23b3b'], borderWidth: 1 }]
      },
      options: { ...chartOpts, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });

    // Chart 6: Status dos Pedidos (pie)
    const statCount = {};
    pedidosFilt.forEach(p => { const s = p.status || 'Pendente'; statCount[s] = (statCount[s]||0)+1; });
    const statKeys = Object.keys(statCount);
    _dashCharts.statusPedidos = new Chart(document.getElementById('chartStatusPedidos'), {
      type: 'pie',
      data: {
        labels: statKeys,
        datasets: [{ data: statKeys.map(k => statCount[k]), backgroundColor: ['#e6890f','#47a647','#d23b3b'] }]
      },
      options: { ...chartOpts }
    });
  }

  function scheduleDashboardUpdate(){
    if(_dashTimer) clearTimeout(_dashTimer);
    _dashTimer = setTimeout(() => { renderDashboard(); }, 400);
  }

  document.getElementById('btnAplicarDash').addEventListener('click', () => renderDashboard());
  document.getElementById('btnLimparDash').addEventListener('click', () => {
    document.getElementById('dashDataInicio').value = '';
    document.getElementById('dashDataFim').value = '';
    const selProd = document.getElementById('dashProduto');
    const selStat = document.getElementById('dashStatus');
    selProd.selectedIndex = 0; M.FormSelect.init(selProd);
    selStat.selectedIndex = 0; M.FormSelect.init(selStat);
    M.updateTextFields();
    renderDashboard();
  });

  // Re-render dashboard on menu click
  const dashMenuLi = document.querySelector('#sideMenu li[data-target="sectionDashboard"]');
  if(dashMenuLi) dashMenuLi.addEventListener('click', () => renderDashboard());

  // Re-render charts when window is resized (handles orientation changes and browser resize)
  let _resizeTimer = null;
  window.addEventListener('resize', () => {
    if(_resizeTimer) clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => { renderDashboard(); }, 300);
  });

  // ====== START ======
  let _unsubs = [];
  function startRealtimeListeners(){
    if(listenersStarted) return; listenersStarted = true;
    showStatus('Conectando ao Firestore...');
    _unsubs.push(collClientes.orderBy('createdAt').onSnapshot(snapshot => { clientes = snapshot.docs.map(d => ({ id: d.id, ...d.data() })); atualizarClientesUI(); atualizarPedidosUI(); atualizarServicosUI(); showStatus('Clientes sincronizados.'); }, err => showStatus('Erro ao ouvir clientes.', true)));
    _unsubs.push(collMP.orderBy('createdAt').onSnapshot(snapshot => { mpList = snapshot.docs.map(d => ({ id: d.id, ...d.data() })); atualizarMPCadastroUI(); showStatus('MPs sincronizadas.'); }, err => showStatus('Erro ao ouvir MPs.', true)));
    _unsubs.push(collPedidos.orderBy('createdAt').onSnapshot(snapshot => { pedidos = snapshot.docs.map(d => ({ id: d.id, ...d.data() })); atualizarPedidosUI(); showStatus('Pedidos sincronizados.'); }, err => showStatus('Erro ao ouvir pedidos.', true)));
    _unsubs.push(collFinanceiro.orderBy('createdAt').onSnapshot(snapshot => { financeiro = snapshot.docs.map(d => ({ id: d.id, ...d.data() })); atualizarFinanceiroUI(); calcularSaldo(); showStatus('Financeiro sincronizado.'); }, err => showStatus('Erro ao ouvir financeiro.', true)));
    _unsubs.push(collServicos.orderBy('createdAt').onSnapshot(snapshot => { servicos = snapshot.docs.map(d => ({ id: d.id, ...d.data() })); atualizarServicosUI(); showStatus('Serviços sincronizados.'); }, err => showStatus('Erro ao ouvir serviços.', true)));
    _unsubs.push(collCadServico.orderBy('createdAt').onSnapshot(snapshot => { cadServicos = snapshot.docs.map(d => ({ id: d.id, ...d.data() })); atualizarCadServicosUI(); showStatus('Serviços cadastrados sincronizados.'); }, err => showStatus('Erro ao ouvir serviços cadastrados.', true)));
    _unsubs.push(collPropostas.orderBy('createdAt').onSnapshot(snapshot => { propostas = snapshot.docs.map(d => ({ id: d.id, ...d.data() })); atualizarPropostasUI(); showStatus('Propostas sincronizadas.'); }, err => showStatus('Erro ao ouvir propostas.', true)));
  }

  // ====== GESTÃO DE USUÁRIOS ======
  function setupUserManagement(){
    const form = document.getElementById('formUsuario'); if(!form) return;
    form.onsubmit = async function(e){
      e.preventDefault();
      const username = document.getElementById('usuarioNome').value.trim();
      const password = document.getElementById('usuarioSenha').value;
      const role = document.getElementById('usuarioPerfil').value;
      if(!username || !password) return M.toast({html:'Preencha usuário e senha!'});
      try {
        const snap = await collUsers.where('username','==',username).get();
        if(!snap.empty) return M.toast({html:'Usuário já existe!'});
        const hash = await hashPassword(password);
        await collUsers.add({ username, passwordHash: hash, role, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
        form.reset(); M.updateTextFields(); M.FormSelect.init(document.getElementById('usuarioPerfil'));
        M.toast({html:'Usuário criado!'}); renderUsuariosUI();
      } catch(err){ showStatus('Erro ao salvar usuário.', true); }
    };
    M.FormSelect.init(document.getElementById('usuarioPerfil'));
    renderUsuariosUI();
  }

  async function renderUsuariosUI(){
    const tbody = document.querySelector('#usuariosTable tbody'); if(!tbody) return; tbody.innerHTML='';
    try {
      const snap = await collUsers.get();
      snap.docs.forEach(doc => {
        const data = doc.data();
        const tr = document.createElement('tr');
        let createdStr = '';
        if(data.createdAt && data.createdAt.toDate){ createdStr = data.createdAt.toDate().toLocaleDateString('pt-BR'); }
        tr.innerHTML = `<td>${escapeHTML(data.username||'')}</td><td>${escapeHTML(data.role==='admin'?'Administrador':'Usuário')}</td><td>${escapeHTML(createdStr)}</td>`;
        const tdAct = document.createElement('td');
        if(currentUser && doc.id !== currentUser.id){
          const btnDel = document.createElement('button'); btnDel.className='btn-small red'; btnDel.title='Excluir usuário'; btnDel.innerHTML='<span class="material-icons">delete</span>';
          btnDel.onclick = async()=>{ if(confirm(`Excluir usuário "${data.username}"?`)){ try{ await collUsers.doc(doc.id).delete(); M.toast({html:'Usuário excluído!'}); renderUsuariosUI(); }catch(e){ showStatus('Erro ao excluir usuário.', true); } } };
          tdAct.appendChild(btnDel);
        }
        tr.appendChild(tdAct); tbody.appendChild(tr);
      });
    } catch(e){ console.error('Erro ao listar usuários:', e); }
  }

});