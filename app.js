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

let clientes = []; let mpList = []; let pedidos = []; let financeiro = []; let servicos = [];

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
  sideMenu.querySelectorAll('li[data-target]').forEach(li=>{
    li.addEventListener('click', ()=>{
      const tgt = document.getElementById(li.dataset.target);
      if(tgt){ tgt.scrollIntoView({behavior:'smooth', block:'start'}); tgt.classList.add('highlight-target'); setTimeout(()=> tgt.classList.remove('highlight-target'), 1200); }
      closeMenu();
    });
  });

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
      else { errEl.textContent = ''; currentUser = user; sessionStorage.setItem('currentUser', JSON.stringify(user)); hideLoginOverlay(); applyRoleUI(); setupUserManagement(); startRealtimeListeners(); }
    } catch(err){ errEl.textContent = 'Erro ao fazer login. Tente novamente.'; }
    btn.disabled = false; btn.innerHTML = '<span class="material-icons left">login</span>Entrar';
  };

  document.getElementById('btnLogout').onclick = function(e){
    e.preventDefault();
    _unsubs.forEach(fn => fn()); _unsubs = [];
    currentUser = null; listenersStarted = false; sessionStorage.removeItem('currentUser');
    clientes = []; mpList = []; pedidos = []; financeiro = []; servicos = [];
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
          hideLoginOverlay(); applyRoleUI(); setupUserManagement(); startRealtimeListeners();
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
    if(!tipo || isNaN(qtd) || qtd < 0 || isNaN(preco) || preco <= 0 || !unidade) return M.toast({html:"Preencha todos os campos da MP!"});
    const obj = { tipo, saldo: qtd, preco, unidade, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    try {
      if(id){ await collMP.doc(id).set(obj, { merge: true }); document.getElementById('mpEditId').value = ''; document.getElementById('btnCancelarEditMP').style.display = 'none'; document.getElementById('btnSalvarMP').innerHTML = '<span class="material-icons left">save</span>Salvar MP'; M.toast({html:"MP atualizada!"}); }
      else { obj.createdAt = firebase.firestore.FieldValue.serverTimestamp(); await collMP.add(obj); document.getElementById('formCadastroMP').reset(); M.toast({html:"Matéria Prima salva!"}); }
      M.updateTextFields(); M.FormSelect.init(document.getElementById('mpUnidade'));
    } catch(err){ showStatus('Erro ao salvar MP.', true); }
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
    document.getElementById('formFinanceiro').scrollIntoView({behavior:'smooth', block:'start'});
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
      window.applyColumnFilters('clientesTable'); window.applyColumnFilters('mpTable'); window.applyColumnFilters('pedidosTable'); window.applyColumnFilters('financeiroTable'); window.applyColumnFilters('servicosTable');
    }
  }

  setupColumnFilters('clientesTable'); setupColumnFilters('mpTable'); setupColumnFilters('pedidosTable'); setupColumnFilters('financeiroTable'); setupColumnFilters('servicosTable');

  // ====== EDIÇÃO GLOBAL (FORMS) ======
  window.editarCliente = function(id) {
    const c = clientes.find(x => x.id === id); if(!c) return;
    document.getElementById('clienteEditId').value = c.id; document.getElementById('clienteNome').value = c.nome || ''; document.getElementById('clienteDocTipo').value = c.docTipo || 'cpf'; document.getElementById('clienteDoc').value = c.doc || ''; document.getElementById('clienteTel').value = c.tel || ''; document.getElementById('clienteEmail').value = c.email || ''; document.getElementById('clienteCEP').value = c.cep || ''; document.getElementById('clienteEnd').value = c.endereco || ''; document.getElementById('clienteNum').value = c.numero || ''; document.getElementById('clienteComp').value = c.complemento || '';
    M.updateTextFields(); M.FormSelect.init(document.getElementById('clienteDocTipo')); document.getElementById('formCliente').scrollIntoView({behavior:'smooth'});
  };

  window.editarMP = function(id) {
    const m = mpList.find(x => x.id === id); if(!m) return;
    document.getElementById('mpEditId').value = m.id; document.getElementById('mpTipo').value = m.tipo || ''; document.getElementById('mpQtd').value = m.saldo || 0; document.getElementById('mpPreco').value = m.preco || 0; document.getElementById('mpUnidade').value = m.unidade || 'kg';
    M.updateTextFields(); M.FormSelect.init(document.getElementById('mpUnidade')); document.getElementById('btnCancelarEditMP').style.display = 'inline-block'; document.getElementById('btnSalvarMP').innerHTML = '<span class="material-icons left">save</span>Atualizar'; document.getElementById('formCadastroMP').scrollIntoView({behavior:'smooth'});
  };

  window.editarPedido = function(id) {
    const p = pedidos.find(x => x.id === id); if(!p) return;
    document.getElementById('pedidoEditId').value = p.id; document.getElementById('pedidoCliente').value = p.clienteId || ''; document.getElementById('pedidoKg').value = p.kg || ''; document.getElementById('pedidoProduto').value = p.produto || ''; document.getElementById('pedidoPrecoKg').value = p.precoKg || ''; document.getElementById('pedidoCusto').value = p.custo || '';
    if(p.dataPedido){ const parts = p.dataPedido.split('/'); if(parts.length===3) document.getElementById('pedidoData').value = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`; }
    document.getElementById('pedidoStatus').value = p.status || 'Pendente';
    const hv = document.getElementById('pedidoVencDate'); const vencSel = document.getElementById('pedidoVenc');
    if(p.vencimento === 'À vista') { vencSel.value = 'avista'; if(hv) hv.value = 'avista'; } else { vencSel.value = ''; if(p.vencimento){ const vparts = p.vencimento.split('/'); if(vparts.length===3 && hv) hv.value = `${vparts[2]}-${vparts[1].padStart(2,'0')}-${vparts[0].padStart(2,'0')}`; } }
    M.updateTextFields(); M.FormSelect.init(document.querySelectorAll('#pedidoCliente, #pedidoProduto, #pedidoVenc, #pedidoStatus')); document.getElementById('btnCancelarEditPedido').style.display = 'inline-block'; document.getElementById('btnPedido').textContent = 'Atualizar Pedido'; document.getElementById('formPedidoSection').scrollIntoView({behavior:'smooth'});
  };

  // ====== RENDERIZAÇÃO DAS TABELAS UI ======
  function atualizarClientesUI(){
    const tbody = document.querySelector("#clientesTable tbody"); if(!tbody) return; tbody.innerHTML = "";
    const select = document.getElementById('pedidoCliente'); const servicoSelect = document.getElementById('servicoCliente');
    if(select) select.innerHTML = '<option value="" disabled selected>Selecione o cliente</option>'; if(servicoSelect) servicoSelect.innerHTML = '<option value="" disabled selected>Selecione o cliente</option>';
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
    });
    if(window.M) M.FormSelect.init(document.querySelectorAll('#pedidoCliente, #servicoCliente'));
    reapplyAllFilters();
    scheduleDashboardUpdate();
  }

  function atualizarMPCadastroUI(){
    const tbody = document.querySelector('#mpTable tbody'); if(!tbody) return; tbody.innerHTML = "";
    mpList.forEach((mp) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td data-field="tipo">${escapeHTML(mp.tipo)}</td><td data-field="saldo">${mp.saldo}</td><td data-field="preco">${Number(mp.preco).toFixed(2)}</td><td data-field="unidade">${escapeHTML(mp.unidade)}</td>`;
      const tdActions = document.createElement('td');
      const btnEdit = document.createElement('button'); btnEdit.className='btn-small orange small-action'; btnEdit.innerHTML='<span class="material-icons">edit</span>'; btnEdit.title='Editar Form'; btnEdit.onclick=()=> window.editarMP(mp.id);
      const btnInline = document.createElement('button'); btnInline.className='btn-small blue small-action'; btnInline.innerHTML='<span class="material-icons">edit_attributes</span>'; btnInline.title='Editar na Tabela'; btnInline.onclick=(e)=> window.editRow('mpList', mp.id, e.currentTarget);
      const btnDel = document.createElement('button'); btnDel.className='btn-small red'; btnDel.innerHTML='<span class="material-icons">delete</span>'; btnDel.title='Excluir'; btnDel.onclick=()=> window.excluirMP(mp.id);
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
      tdActions.appendChild(btnEdit); tdActions.appendChild(btnInline); tdActions.appendChild(btnDel); tr.appendChild(tdActions); tbody.appendChild(tr);
    });
    calcularSaldo(); checkVencimentosPedidos7dias(); reapplyAllFilters();
    scheduleDashboardUpdate();
  }

  // ====== LOGICA DE RESUMO DO MÊS NO CALENDÁRIO ======
  window.calcularResumoMes = function(month, year) {
    let totalEntrada = 0;
    let totalSaida = 0;
    financeiro.forEach(m => {
      let dataEvento = null;
      if(m.vencimento && typeof m.vencimento === 'string' && m.vencimento.includes('/')){ const d = parseDDMMYYYYToDate(m.vencimento); if(d) dataEvento = d; }
      if(!dataEvento && m.dataLanc && typeof m.dataLanc === 'string' && m.dataLanc.includes('/')){ const d2 = parseDDMMYYYYToDate(m.dataLanc); if(d2) dataEvento = d2; }
      
      if (dataEvento && dataEvento.getMonth() === month && dataEvento.getFullYear() === year) {
        const valor = Number(m.valor) || 0;
        if(String(m.tipo).toLowerCase() === 'entrada') totalEntrada += valor;
        else totalSaida += valor;
      }
    });
    const elEntrada = document.getElementById('somaEntradasMes');
    const elSaida = document.getElementById('somaSaidasMes');
    if(elEntrada) elEntrada.innerText = `R$ ${totalEntrada.toFixed(2).replace('.',',')}`;
    if(elSaida) elSaida.innerText = `R$ ${totalSaida.toFixed(2).replace('.',',')}`;
  };

  let financeiroCalendar = null;
  function renderFinanceiroCalendar(){
    const el = document.getElementById('financeiroCalendar');
    if(!el || !window.FullCalendar) return;
    const events = financeiro.map(m => {
      let dataEvento = null;
      if(m.vencimento && typeof m.vencimento === 'string' && m.vencimento.includes('/')){ const d = parseDDMMYYYYToDate(m.vencimento); if(d) dataEvento = d; }
      if(!dataEvento && m.dataLanc && typeof m.dataLanc === 'string' && m.dataLanc.includes('/')){ const d2 = parseDDMMYYYYToDate(m.dataLanc); if(d2) dataEvento = d2; }
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
      tdActions.appendChild(btnInline); tdActions.appendChild(btnDel); tr.appendChild(tdActions); tbody.appendChild(tr);
    });
    checkVencimentosServicos7dias(); reapplyAllFilters();
  }

  function calcularSaldo(){
    let saldoPedidos = 0; pedidos.forEach(p => { const custo = Number(p && p.custo ? p.custo : 0) || 0; if(custo > 0) saldoPedidos += custo; });
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

  // EXCLUSÕES GLOBAIS
  window.excluirCliente = async function(id){ if(confirm("Excluir cliente?")) { await collClientes.doc(id).delete(); M.toast({html:'Excluído!'}); } };
  window.excluirMP = async function(id){ if(confirm("Excluir MP?")) { await collMP.doc(id).delete(); M.toast({html:'Excluído!'}); } };
  window.excluirPedido = async function(id){ if(confirm("Excluir pedido?")) { await collPedidos.doc(id).delete(); M.toast({html:'Excluído!'}); } };
  window.excluirServico = async function(id){ if(confirm("Excluir serviço?")) { await collServicos.doc(id).delete(); M.toast({html:'Excluído!'}); } };
  window.excluirFinanceiro = async function(id){ if(!id) return; if(confirm('Tem certeza que deseja excluir esta movimentação financeira?')){ try{ await collFinanceiro.doc(id).delete(); M.toast({ html: 'Movimentação excluída!' }); calcularSaldo(); }catch(err){ showStatus('Erro ao excluir', true); } } };

  // ====== EDIÇÃO INLINE (TABELAS) ======
  window.editRow = function(collectionName, id, btn){
    const tr = btn.closest('tr'); if(tr.classList.contains('editing-row')){ saveRowEdits(tr, collectionName, id); return; } startRowEdit(tr, collectionName, id);
  };

  function startRowEdit(tr, collectionName, id){
    tr.classList.add('editing-row'); tr._original = tr.innerHTML; const tds = tr.querySelectorAll('td');
    tds.forEach(td => {
      const field = td.getAttribute('data-field'); if(!field) return; const val = td.innerText; let input;
      if(collectionName === 'clientes'){ if(field === 'docTipo'){ input = document.createElement('select'); const optCpf = document.createElement('option'); optCpf.value='cpf'; optCpf.text='CPF'; const optCnpj = document.createElement('option'); optCnpj.value='cnpj'; optCnpj.text='CNPJ'; input.appendChild(optCpf); input.appendChild(optCnpj); input.value = (val.toLowerCase().indexOf('cnpj')>-1) ? 'cnpj' : 'cpf'; } else { input = document.createElement('input'); input.type='text'; input.value = val; } } else if(collectionName === 'mpList'){ if(field === 'saldo' || field === 'preco'){ input = document.createElement('input'); input.type='number'; input.step = (field==='preco' ? '0.01' : '1'); input.value = val.replace(/[^\d\.\-]/g,'') || 0; } else if(field === 'unidade'){ input = document.createElement('select'); const o1 = document.createElement('option'); o1.value='kg'; o1.text='kg'; const o2 = document.createElement('option'); o2.value='unidade'; o2.text='unidade'; input.appendChild(o1); input.appendChild(o2); input.value = val; } else { input = document.createElement('input'); input.type='text'; input.value = val; } } else if(collectionName === 'pedidos'){ if(field === 'kg' || field === 'precoKg' || field === 'custo'){ input = document.createElement('input'); input.type='number'; input.step = (field==='precoKg' || field==='custo' ? '0.01' : '1'); input.value = val.replace(/[^\d\.\-]/g,'') || 0; } else if(field === 'cliente'){ input = document.createElement('select'); const placeholder = document.createElement('option'); placeholder.value=''; placeholder.text='-- Selecionar cliente --'; placeholder.disabled=true; input.appendChild(placeholder); clientes.forEach((c) => { const o = document.createElement('option'); o.value = c.id; o.text = `${c.nome} (${c.doc || ''})`; input.appendChild(o); }); const match = clientes.find(c=>c.nome === val); input.value = match ? match.id : ''; } else if(field === 'produto'){ input = document.createElement('select'); const opts = ["CURE FILM H","CURE FILM HC","HARDSURF H","HARDSURF HC"]; const placeholder = document.createElement('option'); placeholder.value=''; placeholder.text='-- Selecionar produto --'; placeholder.disabled=true; input.appendChild(placeholder); opts.forEach(pn => { const o = document.createElement('option'); o.value = pn; o.text = pn; input.appendChild(o); }); input.value = val || ''; } else if(field === 'dataPedido' || field === 'vencimento'){ input = document.createElement('input'); input.type='date'; const parts = val.split('/'); if(parts.length===3) input.value = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`; } else if(field === 'status'){ input = document.createElement('select'); const o1 = document.createElement('option'); o1.value='Pendente'; o1.text='Pendente'; const o2 = document.createElement('option'); o2.value='Pago'; o2.text='Pago'; const o3 = document.createElement('option'); o3.value='Cancelado'; o3.text='Cancelado'; input.appendChild(o1); input.appendChild(o2); input.appendChild(o3); input.value = val || 'Pendente'; } else { input = document.createElement('input'); input.type='text'; input.value = val; } } else if(collectionName === 'financeiro'){ if(field === 'valor'){ input = document.createElement('input'); input.type='number'; input.step='0.01'; input.value = val.replace(/[^\d\.\-]/g,'') || 0; } else if(field === 'tipo'){ input = document.createElement('select'); const o1 = document.createElement('option'); o1.value='entrada'; o1.text='Receita'; const o2 = document.createElement('option'); o2.value='saida'; o2.text='Despesa'; input.appendChild(o1); input.appendChild(o2); const raw = String(val || '').toLowerCase().trim(); if(raw === 'receita' || raw === 'entrada') input.value = 'entrada'; else if(raw === 'despesa' || raw === 'saída' || raw === 'saida') input.value = 'saida'; else input.value = 'entrada'; } else if(field === 'dataLanc' || field === 'vencimento'){ input = document.createElement('input'); input.type='date'; const parts = val.split('/'); if(parts.length===3) input.value = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`; } else { input = document.createElement('input'); input.type='text'; input.value = val; } } else if(collectionName === 'servicos'){ if(field === 'cliente'){ input = document.createElement('select'); const placeholder = document.createElement('option'); placeholder.value=''; placeholder.text='-- Selecionar cliente --'; placeholder.disabled=true; input.appendChild(placeholder); clientes.forEach((c) => { const o = document.createElement('option'); o.value = c.id; o.text = `${c.nome} (${c.doc || ''})`; input.appendChild(o); }); const match = clientes.find(c=>c.nome === val); input.value = match ? match.id : ''; } else if(field === 'valor'){ input = document.createElement('input'); input.type='number'; input.step='0.01'; input.value = val.replace(/[^\d\.\-]/g,'') || 0; } else if(field === 'parcelas'){ input = document.createElement('input'); input.type='number'; input.value = val || 1; } else if(field === 'vencimentos'){ input = document.createElement('input'); input.type='text'; input.value = val; } else { input = document.createElement('input'); input.type='text'; input.value = val; } } else { input = document.createElement('input'); input.type='text'; input.value = val; }
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
    if(typeof atualizarClientesUI === 'function') atualizarClientesUI(); if(typeof atualizarMPCadastroUI === 'function') atualizarMPCadastroUI(); if(typeof atualizarPedidosUI === 'function') atualizarPedidosUI(); if(typeof atualizarFinanceiroUI === 'function') atualizarFinanceiroUI(); if(typeof atualizarServicosUI === 'function') atualizarServicosUI();
  }

  async function saveRowEdits(tr, collectionName, id){
    const cells = tr.querySelectorAll('td'); const updated = {};
    cells.forEach(td => { const field = td.getAttribute('data-field'); if(!field) return; const child = td.firstElementChild; if(!child) return; if(child.tagName.toLowerCase() === 'select'){ updated[field] = child.value; } else if(child.tagName.toLowerCase() === 'input'){ if(child.type === 'number'){ updated[field] = child.value === '' ? 0 : Number(child.value); } else if(child.type === 'date'){ const v = child.value; if(v){ const d = parseDateInputAsLocal(v); updated[field] = formatDateToDDMMYYYY(d); } else updated[field] = ''; } else { updated[field] = child.value; } } else { updated[field] = child.innerText || child.value || ''; } });
    try {
      if(collectionName === 'clientes'){
        const obj = {}; if(updated.nome !== undefined) obj.nome = String(updated.nome).trim(); if(updated.docTipo !== undefined) obj.docTipo = (String(updated.docTipo).toLowerCase() === 'cnpj' ? 'cnpj' : 'cpf'); if(updated.doc !== undefined) obj.doc = String(updated.doc).trim(); if(updated.tel !== undefined) obj.tel = String(updated.tel).trim(); if(updated.email !== undefined) obj.email = String(updated.email).trim(); if(updated.cep !== undefined) obj.cep = String(updated.cep).trim(); if(updated.endereco !== undefined) obj.endereco = String(updated.endereco).trim(); if(updated.numero !== undefined) obj.numero = String(updated.numero).trim(); if(updated.complemento !== undefined) obj.complemento = String(updated.complemento).trim(); obj.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
        await collClientes.doc(id).set(obj, { merge: true }); M.toast({html:'Cliente atualizado!'});
      } else if(collectionName === 'mpList'){
        const obj = {}; if(updated.tipo !== undefined) obj.tipo = String(updated.tipo).trim(); if(updated.saldo !== undefined) obj.saldo = Number(updated.saldo) || 0; if(updated.preco !== undefined) obj.preco = Number(updated.preco) || 0; if(updated.unidade !== undefined) obj.unidade = String(updated.unidade).trim(); obj.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
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
    if(!window.Chart) return;

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
        const d = parseDDMMYYYYToDate(p.dataPedido);
        if(!d) return false;
        if(dtInicio && d < dtInicio) return false;
        if(dtFim && d > dtFim) return false;
      }
      return true;
    });

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
    document.getElementById('kpiVolume').textContent = pedidosFilt.reduce((s,p) => s + (Number(p.kg)||0), 0).toFixed(1).replace('.',',') + ' kg';
    document.getElementById('kpiReceita').textContent = 'R$ ' + pedidosFilt.reduce((s,p) => s + (Number(p.custo)||0), 0).toFixed(2).replace('.',',');
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
      const d = parseDDMMYYYYToDate(p.dataPedido); if(!d) return;
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

    // Chart 2: Volume por Produto (doughnut)
    const volProd = {};
    pedidosFilt.forEach(p => { const k = p.produto || 'Outros'; volProd[k] = (volProd[k]||0) + (Number(p.kg)||0); });
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

    // Chart 4: Top 5 Clientes por Volume (horizontal bar)
    const cliVol = {};
    pedidosFilt.forEach(p => {
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

    // Chart 5: Receita por Produto (bar)
    const recProd = {};
    pedidosFilt.forEach(p => { const k = p.produto || 'Outros'; recProd[k] = (recProd[k]||0) + (Number(p.custo)||0); });
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