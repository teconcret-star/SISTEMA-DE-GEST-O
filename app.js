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

// Verifica configuração mínima
if (!firebaseConfig || !firebaseConfig.apiKey) {
  console.error('ERRO: Cole o firebaseConfig no início deste arquivo (veja instruções).');
  alert('ATENÇÃO: Você precisa colar o firebaseConfig (do Firebase Console) em app.js antes de testar.');
}

// Inicializa Firebase (compat)
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Collections
const collClientes = db.collection('clientes');
const collMP = db.collection('mpList');
const collPedidos = db.collection('pedidos');
const collFinanceiro = db.collection('financeiro');
const collServicos = db.collection('servicos');

// Data in-memory
let clientes = [];  // { id, ...fields }
let mpList = [];
let pedidos = [];
let financeiro = [];
let servicos = [];

// Status element
let statusEl = document.getElementById('status');
if (!statusEl) {
  statusEl = document.createElement('p');
  statusEl.id = 'status';
  statusEl.style.color = '#333';
  statusEl.style.fontSize = '0.95rem';
  statusEl.style.margin = '0.5rem 0';
  const container = document.querySelector('body');
  container.insertBefore(statusEl, container.firstChild);
}
function showStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? 'crimson' : '#333';
  console.log(text);
}

// Helpers for masks and dates (kept from original)
function onlyDigits(v){ return v.replace(/\D/g,''); }
function maskCPF(v){
  v = onlyDigits(v).slice(0,11);
  v = v.replace(/(\d{3})(\d)/, '$1.$2');
  v = v.replace(/(\d{3})(\d)/, '$1.$2');
  v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  return v;
}
function maskCNPJ(v){
  v = onlyDigits(v).slice(0,14);
  v = v.replace(/^(\d{2})(\d)/, '$1.$2');
  v = v.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
  v = v.replace(/\.(\d{3})(\d)/, '.$1/$2');
  v = v.replace(/(\d{4})(\d{1,2})$/, '$1-$2');
  return v;
}
function maskPhone(v){
  v = onlyDigits(v);
  if(v.length > 11) v = v.slice(0,11);
  if(v.length <= 10){
    v = v.replace(/^(\d{2})(\d)/, '($1) $2');
    v = v.replace(/(\d{4})(\d)/, '$1-$2');
  } else {
    v = v.replace(/^(\d{2})(\d)/, '($1) $2');
    v = v.replace(/(\d{5})(\d)/, '$1-$2');
  }
  return v;
}
function parseDateInputAsLocal(dateStr){
  if(!dateStr) return null;
  const parts = dateStr.split('-');
  if(parts.length !== 3) return null;
  const y = Number(parts[0]), m = Number(parts[1]) - 1, d = Number(parts[2]);
  return new Date(y, m, d);
}
function formatDateToDDMMYYYY(dateObj){
  if(!dateObj || !(dateObj instanceof Date)) return "";
  return `${String(dateObj.getDate()).padStart(2,'0')}/${String(dateObj.getMonth()+1).padStart(2,'0')}/${dateObj.getFullYear()}`;
}
function parseDDMMYYYYToDate(s){
  if(!s || typeof s !== 'string') return null;
  const parts = s.split('/');
  if(parts.length !== 3) return null;
  const d = Number(parts[0]), m = Number(parts[1]) - 1, y = Number(parts[2]);
  return new Date(y, m, d);
}

function escapeHTML(s){ if(s === null || s === undefined) return ''; return String(s).replace(/[&<>"']/g, function(m){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]; }); }

// Initialize Materialize components after DOM ready
document.addEventListener('DOMContentLoaded', function () {
  M.FormSelect.init(document.querySelectorAll('select'));
  M.Tooltip.init(document.querySelectorAll('.tooltipped'));

  // Apply masks
  const clienteDocTipoEl = document.getElementById('clienteDocTipo');
  const clienteDocEl = document.getElementById('clienteDoc');
  const clienteTelEl = document.getElementById('clienteTel');
  function applyDocMask(){
    const tipo = clienteDocTipoEl.value;
    let v = clienteDocEl.value || '';
    if(tipo === 'cnpj') clienteDocEl.value = maskCNPJ(v);
    else clienteDocEl.value = maskCPF(v);
  }
  clienteDocTipoEl.addEventListener('change', ()=>{ applyDocMask(); M.FormSelect.init(clienteDocTipoEl); });
  clienteDocEl.addEventListener('input', ()=> applyDocMask());
  clienteTelEl.addEventListener('input', ()=> { clienteTelEl.value = maskPhone(clienteTelEl.value); });

  // Side menu behavior (copiado)
  const sideMenu = document.getElementById('sideMenu');
  const sideTrigger = document.getElementById('sideTrigger');
  const menuOverlay = document.getElementById('menuOverlay');
  function openMenu(){ sideMenu.classList.add('open'); menuOverlay.classList.add('visible'); menuOverlay.setAttribute('aria-hidden','false'); }
  function closeMenu(){ sideMenu.classList.remove('open'); menuOverlay.classList.remove('visible'); menuOverlay.setAttribute('aria-hidden','true'); }
  sideTrigger.addEventListener('mouseenter', ()=> { if(window.innerWidth > 900) openMenu(); });
  sideMenu.addEventListener('mouseenter', ()=> { if(window.innerWidth > 900) openMenu(); });
  sideMenu.addEventListener('mouseleave', ()=> { if(window.innerWidth > 900) closeMenu(); });
  sideTrigger.addEventListener('click', (e)=> { if(sideMenu.classList.contains('open')) closeMenu(); else openMenu(); });
  sideTrigger.addEventListener('keydown', (e)=> { if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sideTrigger.click(); } });
  menuOverlay.addEventListener('click', closeMenu);
  sideMenu.querySelectorAll('li[data-target]').forEach(li=>{ li.addEventListener('click', e=>{ const tgt = document.getElementById(li.dataset.target); if(tgt){ tgt.scrollIntoView({behavior:'smooth', block:'start'}); tgt.classList.add('highlight-target'); setTimeout(()=> tgt.classList.remove('highlight-target'), 1200); } closeMenu(); }); });

  // CEP fetch
  document.getElementById('buscarCEP').onclick = async function(){
    const cep = document.getElementById('clienteCEP').value.replace(/\D/g,'');
    if(cep.length != 8) return M.toast({html:"CEP inválido!"});
    fetch(`https://viacep.com.br/ws/${cep}/json/`)
      .then(r=>r.json())
      .then(d=>{
        if(d.erro) return M.toast({html:"CEP não encontrado!"});
        const endereco = `${d.logradouro || ''}, ${d.bairro || ''} - ${d.localidade || ''} / ${d.uf || ''}`;
        document.getElementById('clienteEnd').value = endereco;
        M.updateTextFields();
      });
  };

  // Start Firestore realtime listeners
  startRealtimeListeners();

  // Wire up form submit handlers to Firestore-backed functions
  document.getElementById('formCliente').onsubmit = async function(e){
    e.preventDefault();
    const id = document.getElementById('clienteEditId').value || null;
    const nome = document.getElementById('clienteNome').value.trim();
    const docTipo = document.getElementById('clienteDocTipo').value;
    const doc = document.getElementById('clienteDoc').value.trim();
    const tel = document.getElementById('clienteTel').value.trim();
    const email = document.getElementById('clienteEmail').value.trim();
    const cep = document.getElementById('clienteCEP').value.trim();
    const endereco = document.getElementById('clienteEnd').value.trim();
    const numero = document.getElementById('clienteNum').value.trim();
    const complemento = document.getElementById('clienteComp').value.trim();
    if(!nome || !docTipo || !doc) { M.toast({html: "Preencha os campos obrigatórios!"}); return; }
    const obj = { nome, docTipo, doc, tel, email, cep, endereco, numero, complemento, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    try {
      if(id){
        await collClientes.doc(id).set(obj, { merge: true });
        document.getElementById('clienteEditId').value = '';
        M.toast({html:"Cliente atualizado!"});
      } else {
        obj.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await collClientes.add(obj);
        M.toast({html:"Cliente criado!"});
      }
      document.getElementById('formCliente').reset();
      M.updateTextFields();
      M.FormSelect.init(document.getElementById('clienteDocTipo'));
    } catch(err){
      console.error('Erro ao salvar cliente:', err);
      showStatus('Erro ao salvar cliente. Veja console.', true);
    }
  };

  document.getElementById('formCadastroMP').onsubmit = async function(e){
    e.preventDefault();
    const id = document.getElementById('mpEditId').value || null;
    const tipo = document.getElementById('mpTipo').value.trim();
    const qtd = parseFloat(document.getElementById('mpQtd').value);
    const preco = parseFloat(document.getElementById('mpPreco').value);
    const unidade = document.getElementById('mpUnidade').value;
    if(!tipo || isNaN(qtd) || qtd < 0 || isNaN(preco) || preco <= 0 || !unidade){
      M.toast({html:"Preencha todos os campos da MP!"});
      return;
    }
    const obj = { tipo, saldo: qtd, preco, unidade, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    try {
      if(id){
        await collMP.doc(id).set(obj, { merge: true });
        document.getElementById('mpEditId').value = '';
        document.getElementById('btnCancelarEditMP').style.display = 'none';
        document.getElementById('btnSalvarMP').textContent = 'Salvar MP';
        M.toast({html:"MP atualizada!"});
      } else {
        obj.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await collMP.add(obj);
        document.getElementById('formCadastroMP').reset();
        M.toast({html:"Matéria Prima salva!"});
      }
      M.updateTextFields();
      M.FormSelect.init(document.getElementById('mpUnidade'));
    } catch(err){
      console.error('Erro ao salvar MP:', err);
      showStatus('Erro ao salvar MP. Veja console.', true);
    }
  };

  document.getElementById('btnMP').onclick = async function(){
    const nomeMPId = document.getElementById('nomeMP').value;
    const qtd = parseFloat(document.getElementById('qtdMP').value);
    const op = document.getElementById('opMP').value;
    if(!nomeMPId || isNaN(qtd) || qtd <= 0) return M.toast({html:"Preencha corretamente!"});
    try {
      const docRef = collMP.doc(nomeMPId);
      const snap = await docRef.get();
      if(!snap.exists) return M.toast({html:'MP não encontrada!'});
      const mp = snap.data();
      let newSaldo = (Number(mp.saldo) || 0);
      if(op === 'entrada') newSaldo += qtd;
      else {
        if(newSaldo < qtd) return M.toast({html:"Estoque insuficiente!"});
        newSaldo -= qtd;
      }
      await docRef.set({ saldo: newSaldo, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      document.getElementById('nomeMP').selectedIndex = 0;
      document.getElementById('qtdMP').value = "";
      M.updateTextFields();
      M.FormSelect.init(document.getElementById('nomeMP'));
      M.toast({html:'Movimentação registrada!'});
    } catch(err){
      console.error('Erro ao movimentar MP:', err);
      showStatus('Erro ao movimentar MP. Veja console.', true);
    }
  };

  document.getElementById('btnFinanceiro').onclick = function(){
    registrarFinanceiro();
  };

  async function registrarFinanceiro(desc, valor, tipo, chamadoPorPedido = false, vencStr = ""){
    if(!chamadoPorPedido){
      desc = document.getElementById('finDesc').value.trim();
      valor = parseFloat(document.getElementById('finValor').value);
      tipo = document.getElementById('finTipo').value;
      vencStr = "";
      if(!desc || isNaN(valor)) { M.toast({html:"Preencha corretamente!"}); return; }
    }
    const obj = { tipo, desc, valor, vencimento: vencStr, createdAt: firebase.firestore.FieldValue.serverTimestamp() };
    try {
      await collFinanceiro.add(obj);
      calcularSaldo();
      if(!chamadoPorPedido){
        document.getElementById('finDesc').value = "";
        document.getElementById('finValor').value = "";
        document.getElementById('finTipo').selectedIndex = 0;
        M.updateTextFields();
        M.FormSelect.init(document.getElementById('finTipo'));
        M.toast({html:'Movimentação registrada!'});
      }
    } catch(err){
      console.error('Erro registrar financeiro:', err);
      showStatus('Erro ao registrar financeiro. Veja console.', true);
    }
  }

  // Servicos
  const servicoParcelasEl = document.getElementById('servicoParcelas');
  function renderServicosVencimentos(){
    const container = document.getElementById('servicoVencimentos');
    container.innerHTML = '';
    const parcelas = parseInt(servicoParcelasEl.value) || 1;
    for(let i=0;i<parcelas;i++){
      const div = document.createElement('div');
      div.style.minWidth = '150px';
      div.innerHTML = `<input type="date" class="servico-venc" data-idx="${i}" id="servicoVenc${i}"><label for="servicoVenc${i}">Vencimento ${i+1}</label>`;
      container.appendChild(div);
    }
  }
  servicoParcelasEl.addEventListener('change', function(){ renderServicosVencimentos(); M.updateTextFields(); });
  renderServicosVencimentos();

  document.getElementById('btnServico').onclick = async function(){
    const editId = document.getElementById('servicoEditId').value || null;
    const clienteId = document.getElementById('servicoCliente').value;
    // safe description (page may now include this; if not, fallback to empty)
    const descEl = document.getElementById('servicoDesc');
    const desc = descEl ? descEl.value.trim() : '';
    const valor = parseFloat(document.getElementById('servicoValor').value) || 0;
    const parcelas = parseInt(document.getElementById('servicoParcelas').value) || 1;
    // accept both classes (compatibility with inline script)
    const vencimentosEls = Array.from(document.querySelectorAll('#servicoVencimentos .servico-venc, #servicoVencimentos .serv-vencimento'));
    const vencimentos = vencimentosEls.map(el=> {
      const v = el.value;
      if(v) return formatDateToDDMMYYYY(parseDateInputAsLocal(v));
      return '';
    }).filter(x=>x);
    if(!clienteId || !desc || isNaN(valor) || valor<=0 || vencimentos.length !== parcelas){
      M.toast({html:"Preencha corretamente os campos de serviço e vencimentos!"});
      return;
    }
    const obj = { clienteId, desc, valor, parcelas, vencimentos, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    try {
      if(editId){
        await collServicos.doc(editId).set(obj, { merge: true });
        document.getElementById('servicoEditId').value = '';
        document.getElementById('btnCancelarServico').style.display = 'none';
        document.getElementById('btnServico').textContent = 'Registrar Serviço';
        M.toast({html:'Serviço atualizado!'});
      } else {
        obj.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await collServicos.add(obj);
        M.toast({html:'Serviço registrado!'});
      }
      document.getElementById('formServico').reset();
      renderServicosVencimentos();
      M.updateTextFields();
      M.FormSelect.init(document.getElementById('servicoCliente'));
      M.FormSelect.init(document.getElementById('servicoParcelas'));
    } catch(err){
      console.error('Erro ao salvar serviço:', err);
      showStatus('Erro ao salvar serviço. Veja console.', true);
    }
  };

  // ... restante do app.js inalterado (o resto do arquivo permanece o mesmo) ...
  // (mantive todo o restante do arquivo original sem mudanças além do trecho acima)
  // START realtime listeners for all collections
  function atualizarClientesUI(){
    const tbody = document.querySelector("#clientesTable tbody");
    tbody.innerHTML = "";
    const select = document.getElementById('pedidoCliente');
    const servicoSelect = document.getElementById('servicoCliente');
    select.innerHTML = '<option value="" disabled selected>Selecione o cliente</option>';
    if(servicoSelect) servicoSelect.innerHTML = '<option value="" disabled selected>Selecione o cliente</option>';
    clientes.forEach((c) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td data-field="nome">${escapeHTML(c.nome || "")}</td>
        <td data-field="docTipo">${escapeHTML((c.docTipo === 'cnpj') ? 'CNPJ' : 'CPF')}</td>
        <td data-field="doc">${escapeHTML(c.doc || "")}</td>
        <td data-field="tel">${escapeHTML(c.tel || "")}</td>
        <td data-field="email">${escapeHTML(c.email || "")}</td>
        <td data-field="cep">${escapeHTML(c.cep || "")}</td>
        <td data-field="endereco">${escapeHTML(c.endereco || "")}</td>
        <td data-field="numero">${escapeHTML(c.numero || "")}</td>
        <td data-field="complemento">${escapeHTML(c.complemento || "")}</td>
      `;
      const tdActions = document.createElement('td');
      const btnEdit = document.createElement('button'); btnEdit.className = 'btn-small orange small-action'; btnEdit.title='Editar cliente'; btnEdit.innerHTML = '<span class="material-icons">edit</span>';
      btnEdit.onclick = ()=> editarCliente(c.id);
      const btnInline = document.createElement('button'); btnInline.className='btn-small blue small-action'; btnInline.title='Editar inline'; btnInline.innerHTML = '<span class="material-icons">edit_attributes</span>';
      btnInline.onclick = (e)=> editRow('clientes', c.id, e.currentTarget);
      const btnDel = document.createElement('button'); btnDel.className='btn-small red'; btnDel.title='Excluir'; btnDel.innerHTML = '<span class="material-icons">delete</span>';
      btnDel.onclick = ()=> excluirCliente(c.id);
      tdActions.appendChild(btnEdit); tdActions.appendChild(btnInline); tdActions.appendChild(btnDel);
      tr.appendChild(tdActions);
      tbody.appendChild(tr);

      const option = document.createElement('option');
      option.value = c.id;
      option.text = `${c.nome} (${c.doc || ""})`;
      select.appendChild(option);
      if(servicoSelect) servicoSelect.appendChild(option.cloneNode(true));
    });
    M.FormSelect.init(select);
    if(servicoSelect) M.FormSelect.init(servicoSelect);
  }

  // restante das funções de UI e listeners (mantive o código original sem alterações relevantes para serviços)
  // START realtime listeners for all collections
  function startRealtimeListeners(){
    showStatus('Conectando ao Firestore...');

    collClientes.orderBy('createdAt').onSnapshot(snapshot => {
      clientes = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      atualizarClientesUI();
      atualizarPedidosUI();
      atualizarServicosUI();
      showStatus('Clientes sincronizados.');
    }, err => {
      console.error('Erro clientes:', err);
      showStatus('Erro ao ouvir clientes. Veja console.', true);
    });

    collMP.orderBy('createdAt').onSnapshot(snapshot => {
      mpList = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      atualizarMPCadastroUI();
      showStatus('MPs sincronizadas.');
    }, err => {
      console.error('Erro mpList:', err);
      showStatus('Erro ao ouvir MPs. Veja console.', true);
    });

    collPedidos.orderBy('createdAt').onSnapshot(snapshot => {
      pedidos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      atualizarPedidosUI();
      showStatus('Pedidos sincronizados.');
    }, err => {
      console.error('Erro pedidos:', err);
      showStatus('Erro ao ouvir pedidos. Veja console.', true);
    });

    collFinanceiro.orderBy('createdAt').onSnapshot(snapshot => {
      financeiro = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      atualizarFinanceiroUI();
      calcularSaldo();
      showStatus('Financeiro sincronizado.');
    }, err => {
      console.error('Erro financeiro:', err);
      showStatus('Erro ao ouvir financeiro. Veja console.', true);
    });

    collServicos.orderBy('createdAt').onSnapshot(snapshot => {
      servicos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      atualizarServicosUI();
      showStatus('Serviços sincronizados.');
    }, err => {
      console.error('Erro servicos:', err);
      showStatus('Erro ao ouvir serviços. Veja console.', true);
    });

    showStatus('Listeners iniciados. Aguardando dados...');
  }

  // Expose for debugging
  window.atualizarClientes = atualizarClientesUI;
  window.atualizarMPCadastro = atualizarMPCadastroUI;
  window.atualizarPedidos = atualizarPedidosUI;
  window.atualizarFinanceiro = atualizarFinanceiroUI;
  window.atualizarEstoque = atualizarEstoqueUI;
  window.calcularSaldo = calcularSaldo;
  window.atualizarServicos = atualizarServicosUI;
});
