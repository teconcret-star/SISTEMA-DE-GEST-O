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
    const desc = document.getElementById('servicoDesc').value.trim();
    const valor = parseFloat(document.getElementById('servicoValor').value) || 0;
    const parcelas = parseInt(document.getElementById('servicoParcelas').value) || 1;
    const vencimentosEls = Array.from(document.querySelectorAll('#servicoVencimentos .servico-venc'));
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

  // Pedidos
  function atualizarCustoPedido(){
    const kg = parseFloat(document.getElementById('pedidoKg').value) || 0;
    const preco = parseFloat(document.getElementById('pedidoPrecoKg').value) || 0;
    document.getElementById('pedidoCusto').value = (kg*preco).toFixed(2);
  }
  document.getElementById('pedidoKg').oninput = atualizarCustoPedido;
  document.getElementById('pedidoPrecoKg').oninput = function(){ atualizarCustoPedido(); };

  document.getElementById('btnPedido').onclick = async function(){
    const editId = document.getElementById('pedidoEditId').value || null;
    const clienteId = document.getElementById('pedidoCliente').value;
    const kg = parseFloat(document.getElementById('pedidoKg').value);
    const produto = document.getElementById('pedidoProduto').value;
    const precoKg = parseFloat(document.getElementById('pedidoPrecoKg').value);
    const custo = parseFloat(document.getElementById('pedidoCusto').value);
    const venc = document.getElementById('pedidoVenc').value;
    const dataPedidoInput = document.getElementById('pedidoData').value;
    const status = document.getElementById('pedidoStatus').value;
    if(!clienteId || isNaN(kg) || kg<=0 || isNaN(precoKg) || precoKg<=0 || isNaN(custo) || custo<=0 || !venc || !produto) {
      M.toast({html:"Preencha todos os campos do pedido!"});
      return;
    }
    const hoje = new Date();
    let vencStr = "";
    if(venc === 'avista'){
      vencStr = "À vista";
    } else {
      const days = parseInt(venc);
      const vencDate = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + days);
      vencStr = `${String(vencDate.getDate()).padStart(2,'0')}/${String(vencDate.getMonth()+1).padStart(2,'0')}/${vencDate.getFullYear()}`;
    }
    let dataPedidoStr = "";
    if(dataPedidoInput){
      const d = parseDateInputAsLocal(dataPedidoInput);
      dataPedidoStr = formatDateToDDMMYYYY(d);
    } else {
      const d = new Date();
      dataPedidoStr = formatDateToDDMMYYYY(d);
    }
    const obj = { clienteId, produto, kg, precoKg, custo, vencimento: vencStr, dataPedido: dataPedidoStr, status: status || 'Pendente', updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    try {
      if(editId){
        await collPedidos.doc(editId).set(obj, { merge: true });
        document.getElementById('pedidoEditId').value = '';
        document.getElementById('btnPedido').textContent = 'Registrar Pedido';
        document.getElementById('btnCancelarEditPedido').style.display = 'none';
        M.toast({html:"Pedido atualizado!"});
      } else {
        obj.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await collPedidos.add(obj);
        M.toast({html:"Pedido registrado!"});
      }
      // reset form
      document.getElementById('formPedidoSection').reset();
      M.updateTextFields();
      M.FormSelect.init(document.getElementById('pedidoCliente'));
      M.FormSelect.init(document.getElementById('pedidoProduto'));
      M.FormSelect.init(document.getElementById('pedidoVenc'));
      M.FormSelect.init(document.getElementById('pedidoStatus'));
    } catch(err){
      console.error('Erro ao salvar pedido:', err);
      showStatus('Erro ao salvar pedido. Veja console.', true);
    }
  };

  // Export / Import Excel (SheetJS)
  document.getElementById('btnExportExcel').onclick = function(){
    function toSheet(data, header) {
      const arr = [header];
      data.forEach(o => arr.push(header.map(h => o[h] !== undefined ? o[h] : "")));
      return XLSX.utils.aoa_to_sheet(arr);
    }
    const clientesData = clientes.map(c => ({
      nome: c.nome, docTipo: c.docTipo, doc: c.doc, tel: c.tel, email: c.email,
      cep: c.cep, endereco: c.endereco, numero: c.numero, complemento: c.complemento
    }));
    const mpData = mpList.map(m => ({ tipo: m.tipo, saldo: m.saldo, preco: m.preco, unidade: m.unidade }));
    const pedidosData = pedidos.map(p => {
      const c = clientes.find(x=>x.id === p.clienteId) || {};
      return { cliente: c.nome || "", documento: c.doc || "", produto: p.produto || "", kg: p.kg, precoKg: p.precoKg, custo: p.custo, dataPedido: p.dataPedido || "", vencimento: p.vencimento || "", status: p.status || "" };
    });
    const financeiroData = financeiro.map(f => ({ tipo: f.tipo, desc: f.desc, valor: f.valor, vencimento: f.vencimento }));
    const servicosData = servicos.map(s => {
      const c = clientes.find(x=>x.id === s.clienteId) || {};
      return { cliente: c.nome || "", documento: c.doc || "", servico: s.desc || "", valor: s.valor || 0, parcelas: s.parcelas || 1, vencimentos: (s.vencimentos || []).join(' ; ') };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, toSheet(clientesData, ["nome","docTipo","doc","tel","email","cep","endereco","numero","complemento"]), "Clientes");
    XLSX.utils.book_append_sheet(wb, toSheet(mpData, ["tipo","saldo","preco","unidade"]), "Materia_Prima");
    XLSX.utils.book_append_sheet(wb, toSheet(pedidosData, ["cliente","documento","produto","kg","precoKg","custo","dataPedido","vencimento","status"]), "Pedidos");
    XLSX.utils.book_append_sheet(wb, toSheet(financeiroData, ["tipo","desc","valor","vencimento"]), "Financeiro");
    XLSX.utils.book_append_sheet(wb, toSheet(servicosData, ["cliente","documento","servico","valor","parcelas","vencimentos"]), "Servicos");
    XLSX.writeFile(wb, "controle_pedidos_firestore.xlsx");
  };

  document.getElementById('btnImportExcel').onclick = function(){ document.getElementById('inputImportExcel').click(); }
  document.getElementById('inputImportExcel').onchange = function(e){
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = async function(evt){
      try{
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: 'array' });

        // IMPORTANT:
        // The import below will ADD documents to Firestore.
        // If you want to replace the collections, tell me to implement "clear then add".

        // Clientes
        if(wb.Sheets["Clientes"]){
          const arr = XLSX.utils.sheet_to_json(wb.Sheets["Clientes"], { header: 1 });
          const rows = arr.slice(1).map(r => ({
            nome: r[0] || "", docTipo: r[1] || "cpf", doc: r[2] || "", tel: r[3] || "",
            email: r[4] || "", cep: r[5] || "", endereco: r[6] || "", numero: r[7] || "", complemento: r[8] || ""
          }));
          // add to Firestore
          const batch = db.batch();
          for(const r of rows){
            const docRef = collClientes.doc(); // auto id
            batch.set(docRef, { ...r, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
          }
          await batch.commit();
          M.toast({html:"Clientes importados!"});
        }

        if(wb.Sheets["Materia_Prima"]){
          const arr = XLSX.utils.sheet_to_json(wb.Sheets["Materia_Prima"], { header: 1 });
          const rows = arr.slice(1).map(r => ({ tipo: r[0] || "", saldo: Number(r[1])||0, preco: Number(r[2])||0, unidade: r[3] || 'kg' }));
          const batch = db.batch();
          for(const r of rows){
            const docRef = collMP.doc();
            batch.set(docRef, { ...r, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
          }
          await batch.commit();
          M.toast({html:"MPs importadas!"});
        }

        if(wb.Sheets["Pedidos"]){
          const arr = XLSX.utils.sheet_to_json(wb.Sheets["Pedidos"], { header: 1 });
          const rows = arr.slice(1).map(r => ({
            clienteNome: r[0] || "",
            documento: r[1] || "",
            produto: r[2] || "",
            kg: Number(r[3])||0,
            precoKg: Number(r[4])||0,
            custo: Number(r[5])||0,
            dataPedido: r[6] || "",
            vencimento: r[7] || "",
            status: r[8] || "Pendente"
          }));
          // For each row try to find cliente by nome+doc; if none found, set clienteId = null
          const batch = db.batch();
          for(const r of rows){
            let clienteId = null;
            const q = await collClientes.where('nome','==',r.clienteNome).where('doc','==',r.documento).limit(1).get();
            if(!q.empty) clienteId = q.docs[0].id;
            const docRef = collPedidos.doc();
            batch.set(docRef, {
              clienteId,
              produto: r.produto, kg: r.kg, precoKg: r.precoKg, custo: r.custo,
              dataPedido: r.dataPedido, vencimento: r.vencimento, status: r.status,
              createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
          }
          await batch.commit();
          M.toast({html:"Pedidos importados!"});
        }

        if(wb.Sheets["Financeiro"]){
          const arr = XLSX.utils.sheet_to_json(wb.Sheets["Financeiro"], { header: 1 });
          const rows = arr.slice(1).map(r => ({ tipo: r[0] || "", desc: r[1] || "", valor: Number(r[2])||0, vencimento: r[3] || "" }));
          const batch = db.batch();
          for(const r of rows){
            const docRef = collFinanceiro.doc();
            batch.set(docRef, { ...r, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
          }
          await batch.commit();
          M.toast({html:"Financeiro importado!"});
        }

        if(wb.Sheets["Servicos"]){
          const arr = XLSX.utils.sheet_to_json(wb.Sheets["Servicos"], { header: 1 });
          const rows = arr.slice(1).map(r => ({
            clienteNome: r[0] || "",
            documento: r[1] || "",
            desc: r[2] || "",
            valor: Number(r[3])||0,
            parcelas: Number(r[4])||1,
            vencimentos: (r[5] || "").toString().split(' ; ').map(s=>s.trim()).filter(x=>x)
          }));
          const batch = db.batch();
          for(const r of rows){
            let clienteId = null;
            const q = await collClientes.where('nome','==',r.clienteNome).where('doc','==',r.documento).limit(1).get();
            if(!q.empty) clienteId = q.docs[0].id;
            const docRef = collServicos.doc();
            batch.set(docRef, {
              clienteId,
              desc: r.desc, valor: r.valor, parcelas: r.parcelas, vencimentos: r.vencimentos,
              createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
          }
          await batch.commit();
          M.toast({html:"Serviços importados!"});
        }

      }catch(err){
        console.error(err);
        M.toast({html:"Erro ao importar arquivo. Verifique o formato."});
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  // Filters
  function addFilter(inputId, tableId){
    const input = document.getElementById(inputId);
    if(!input) return;
    input.addEventListener('input', function(){
      const txt = this.value.toLowerCase().trim();
      const trs = document.querySelectorAll(`#${tableId} tbody tr`);
      trs.forEach(tr => {
        const text = tr.innerText.toLowerCase();
        tr.style.display = text.indexOf(txt) > -1 ? '' : 'none';
      });
    });
  }
  addFilter('filterClientes','clientesTable');
  addFilter('filterMP','mpTable');
  addFilter('filterEstoque','estoqueTable');
  addFilter('filterPedidos','pedidosTable');
  addFilter('filterFinanceiro','financeiroTable');
  addFilter('filterServicos','servicosTable');

  // Generic helpers for rendering & UI actions
  window.editarCliente = async function(id){
    const c = clientes.find(x=>x.id === id);
    if(!c) return;
    document.getElementById('clienteEditId').value = id;
    document.getElementById('clienteNome').value = c.nome || '';
    document.getElementById('clienteDocTipo').value = c.docTipo || 'cpf';
    document.getElementById('clienteDoc').value = c.doc || '';
    document.getElementById('clienteTel').value = c.tel || '';
    document.getElementById('clienteEmail').value = c.email || '';
    document.getElementById('clienteCEP').value = c.cep || '';
    document.getElementById('clienteEnd').value = c.endereco || '';
    document.getElementById('clienteNum').value = c.numero || '';
    document.getElementById('clienteComp').value = c.complemento || '';
    M.updateTextFields();
    M.FormSelect.init(document.getElementById('clienteDocTipo'));
    document.getElementById('formCliente').scrollIntoView({behavior:'smooth', block:'center'});
  };
  window.excluirCliente = async function(id){
    if(!confirm("Confirma exclusão?")) return;
    try {
      await collClientes.doc(id).delete();
      M.toast({html:'Cliente excluído!'});
    } catch(err){
      console.error('Erro excluir cliente:', err);
      showStatus('Erro ao excluir cliente. Veja console.', true);
    }
  };

  window.editarMP = async function(id){
    const mp = mpList.find(x=>x.id === id);
    if(!mp) return;
    document.getElementById('mpEditId').value = id;
    document.getElementById('mpTipo').value = mp.tipo || '';
    document.getElementById('mpQtd').value = mp.saldo;
    document.getElementById('mpPreco').value = mp.preco;
    document.getElementById('mpUnidade').value = mp.unidade;
    M.updateTextFields();
    M.FormSelect.init(document.getElementById('mpUnidade'));
    document.getElementById('btnSalvarMP').textContent = "Salvar Alteração";
    document.getElementById('btnCancelarEditMP').style.display = "";
    document.getElementById('formCadastroMP').scrollIntoView({behavior:'smooth', block:'center'});
  };
  window.excluirMP = async function(id){
    if(!confirm("Confirma exclusão?")) return;
    try {
      await collMP.doc(id).delete();
      M.toast({html:'MP excluída!'});
    } catch(err){
      console.error('Erro excluir MP:', err);
      showStatus('Erro ao excluir MP. Veja console.', true);
    }
  };
  document.getElementById('btnCancelarEditMP').onclick = function(){
    document.getElementById('mpEditId').value = '';
    document.getElementById('formCadastroMP').reset();
    document.getElementById('btnSalvarMP').textContent = "Salvar MP";
    document.getElementById('btnCancelarEditMP').style.display = "none";
  };

  window.excluirEstoque = window.excluirMP;

  window.editarPedido = function(id){
    const p = pedidos.find(x=>x.id === id);
    if(!p) return;
    document.getElementById('pedidoEditId').value = id;
    if(p.clienteId) document.getElementById('pedidoCliente').value = p.clienteId;
    else document.getElementById('pedidoCliente').selectedIndex = 0;
    document.getElementById('pedidoProduto').value = p.produto || '';
    document.getElementById('pedidoKg').value = p.kg;
    document.getElementById('pedidoPrecoKg').value = p.precoKg;
    document.getElementById('pedidoCusto').value = p.custo;
    if(p.dataPedido){
      const parts = String(p.dataPedido).split('/');
      if(parts.length===3){
        const iso = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
        document.getElementById('pedidoData').value = iso;
      } else document.getElementById('pedidoData').value = '';
    } else document.getElementById('pedidoData').value = '';
    if(p.vencimento && String(p.vencimento).toLowerCase().includes('à vista')) {
      document.getElementById('pedidoVenc').value = 'avista';
    } else {
      if(p.vencimento){
        const d = parseDDMMYYYYToDate(p.vencimento);
        if(d){
          const hoje = new Date();
          const diff = Math.round((d - new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()))/1000/60/60/24);
          if(diff === 7) document.getElementById('pedidoVenc').value = '7';
          else if(diff === 14) document.getElementById('pedidoVenc').value = '14';
          else if(diff === 21) document.getElementById('pedidoVenc').value = '21';
          else if(diff === 28) document.getElementById('pedidoVenc').value = '28';
          else document.getElementById('pedidoVenc').selectedIndex = 0;
        } else document.getElementById('pedidoVenc').selectedIndex = 0;
      } else document.getElementById('pedidoVenc').selectedIndex = 0;
    }
    document.getElementById('pedidoStatus').value = p.status || 'Pendente';
    document.getElementById('btnPedido').textContent = 'Salvar Alteração';
    document.getElementById('btnCancelarEditPedido').style.display = '';
    M.FormSelect.init(document.getElementById('pedidoCliente'));
    M.FormSelect.init(document.getElementById('pedidoProduto'));
    M.FormSelect.init(document.getElementById('pedidoVenc'));
    M.FormSelect.init(document.getElementById('pedidoStatus'));
    M.updateTextFields();
    document.getElementById('formPedidoSection').scrollIntoView({behavior:'smooth', block:'center'});
  };
  window.excluirPedido = async function(id){
    if(!confirm("Confirma exclusão?")) return;
    try {
      await collPedidos.doc(id).delete();
      M.toast({html:'Pedido excluído!'});
    } catch(err){
      console.error('Erro excluir pedido:', err);
      showStatus('Erro ao excluir pedido. Veja console.', true);
    }
  };

  window.excluirFinanceiro = async function(id){
    if(!confirm("Confirma exclusão?")) return;
    try {
      await collFinanceiro.doc(id).delete();
      calcularSaldo();
      M.toast({html:'Movimentação excluída!'});
    } catch(err){
      console.error('Erro excluir financeiro:', err);
      showStatus('Erro ao excluir financeiro. Veja console.', true);
    }
  };

  window.excluirServico = async function(id){
    if(!confirm("Confirma exclusão?")) return;
    try {
      await collServicos.doc(id).delete();
      M.toast({html:'Serviço excluído!'});
    } catch(err){
      console.error('Erro excluir serviço:', err);
      showStatus('Erro ao excluir serviço. Veja console.', true);
    }
  };

  // Render functions (use local arrays to build tables & selects)
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

  function atualizarMPCadastroUI(){
    const container = document.getElementById('mpCards');
    container.innerHTML = "";
    mpList.forEach((mp) => {
      const color = mp.unidade === 'kg' ? 'blue' : 'teal';
      container.innerHTML += `
        <div class="col s12 m6">
          <div class="card z-depth-2 ${color} lighten-4" style="padding: 12px; margin-bottom:10px;">
            <div class="card-content">
              <span class="card-title ${color}-text text-darken-4" style="font-size:1.1em;"><b>${escapeHTML(mp.tipo)}</b></span>
              <p>Saldo: <b>${mp.saldo} ${mp.unidade === 'kg' ? 'kg' : 'unidade'}</b></p>
              <p>Preço: <b>R$ ${Number(mp.preco).toFixed(2)}/${mp.unidade === 'kg' ? 'kg' : 'unidade'}</b></p>
            </div>
            <div class="card-action" data-mpid="${mp.id}">
              <button class="btn-small orange" data-action="edit" title="Editar"><span class="material-icons">edit</span></button>
              <button class="btn-small blue" data-action="inline" title="Editar inline"><span class="material-icons">edit_attributes</span></button>
              <button class="btn-small red" data-action="delete" title="Excluir"><span class="material-icons">delete</span></button>
            </div>
          </div>
        </div>
      `;
    });

    // attach actions
    document.querySelectorAll('[data-mpid]').forEach(el=>{
      const id = el.getAttribute('data-mpid');
      el.querySelector('[data-action="edit"]').onclick = ()=> editarMP(id);
      el.querySelector('[data-action="inline"]').onclick = (e)=> editRow('mpList', id, e.currentTarget);
      el.querySelector('[data-action="delete"]').onclick = ()=> excluirMP(id);
    });

    // Table
    const tbody = document.querySelector('#mpTable tbody'); tbody.innerHTML = "";
    mpList.forEach((mp) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td data-field="tipo">${escapeHTML(mp.tipo)}</td>
        <td data-field="saldo">${mp.saldo}</td>
        <td data-field="preco">${Number(mp.preco).toFixed(2)}</td>
        <td data-field="unidade">${escapeHTML(mp.unidade)}</td>
      `;
      const tdActions = document.createElement('td');
      const btnEdit = document.createElement('button'); btnEdit.className='btn-small blue small-action'; btnEdit.innerHTML='<span class="material-icons">edit</span>'; btnEdit.onclick=()=> editarMP(mp.id);
      const btnInline = document.createElement('button'); btnInline.className='btn-small teal small-action'; btnInline.innerHTML='<span class="material-icons">edit_attributes</span>'; btnInline.onclick=(e)=> editRow('mpList', mp.id, e.currentTarget);
      const btnDel = document.createElement('button'); btnDel.className='btn-small red'; btnDel.innerHTML='<span class="material-icons">delete</span>'; btnDel.onclick=()=> excluirMP(mp.id);
      tdActions.appendChild(btnEdit); tdActions.appendChild(btnInline); tdActions.appendChild(btnDel);
      tr.appendChild(tdActions);
      tbody.appendChild(tr);
    });

    atualizarMPSaldoUI();
    atualizarEstoqueUI();
    atualizarSelectMP();
  }

  function atualizarMPSaldoUI(){
    const container = document.getElementById('mpSaldo'); container.innerHTML = "";
    mpList.forEach((mp) => {
      const color = mp.unidade === 'kg' ? 'blue' : 'teal';
      container.innerHTML += `
        <div class="col s12 m6">
          <div class="card ${color} lighten-4 z-depth-1 center-align" style="padding:9px;margin-bottom:10px;">
            <span class="${color}-text text-darken-3" style="font-size:1.05em"><b>${escapeHTML(mp.tipo)}</b></span><br>
            <span style="font-size:1.1em">${mp.saldo} ${mp.unidade === 'kg' ? 'kg' : 'unidade'}</span><br>
            <span style="font-size:0.88em;">R$ ${Number(mp.preco).toFixed(2)}/${mp.unidade === 'kg' ? 'kg' : 'unidade'}</span>
          </div>
        </div>
      `;
    });
  }

  function atualizarEstoqueUI(){
    const tbody = document.querySelector('#estoqueTable tbody'); tbody.innerHTML = "";
    mpList.forEach((mp) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td data-field="tipo">${escapeHTML(mp.tipo)}</td>
        <td data-field="saldo">${mp.saldo}</td>
        <td data-field="preco">${Number(mp.preco).toFixed(2)}</td>
        <td data-field="unidade">${escapeHTML(mp.unidade)}</td>
      `;
      const tdActions = document.createElement('td');
      const btnEdit = document.createElement('button'); btnEdit.className='btn-small blue small-action'; btnEdit.innerHTML='<span class="material-icons">edit</span>'; btnEdit.onclick=()=> editarMP(mp.id);
      const btnInline = document.createElement('button'); btnInline.className='btn-small teal small-action'; btnInline.innerHTML='<span class="material-icons">edit_attributes</span>'; btnInline.onclick=(e)=> editRow('mpList', mp.id, e.currentTarget);
      const btnDel = document.createElement('button'); btnDel.className='btn-small red'; btnDel.innerHTML='<span class="material-icons">delete</span>'; btnDel.onclick=()=> excluirMP(mp.id);
      tdActions.appendChild(btnEdit); tdActions.appendChild(btnInline); tdActions.appendChild(btnDel);
      tr.appendChild(tdActions);
      tbody.appendChild(tr);
    });
  }

  function atualizarSelectMP(){
    const select = document.getElementById('nomeMP');
    select.innerHTML = '<option value="" disabled selected>Escolha a MP</option>';
    mpList.forEach(mp => {
      const opt = document.createElement('option');
      opt.value = mp.id;
      opt.text = `${mp.tipo} (${mp.unidade==='kg' ? 'kg' : 'unidade'})`;
      select.appendChild(opt);
    });
    M.FormSelect.init(select);
    atualizarLabelQtd();
  }
  function atualizarLabelQtd(){
    const select = document.getElementById('nomeMP');
    const tipoMPId = select.value;
    const mp = mpList.find(m=>m.id===tipoMPId);
    const labelEl = document.getElementById('qtdMPLab');
    labelEl.innerText = mp ? (mp.unidade==='kg' ? 'Quantidade (kg)' : 'Quantidade (unidades)') : 'Quantidade';
  }
  document.getElementById('nomeMP').onchange = atualizarLabelQtd;

  // Pedidos UI
  function atualizarPedidosUI(){
    const tbody = document.querySelector('#pedidosTable tbody'); tbody.innerHTML = "";
    pedidos.forEach((p) => {
      const c = clientes.find(x=>x.id===p.clienteId) || {};
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td data-field="cliente">${escapeHTML(c.nome || "")}</td>
        <td data-field="documento">${escapeHTML(c.doc || "")}</td>
        <td data-field="produto">${escapeHTML(p.produto || "")}</td>
        <td data-field="kg">${p.kg}</td>
        <td data-field="precoKg">${Number(p.precoKg).toFixed(2)}</td>
        <td data-field="custo">${Number(p.custo).toFixed(2)}</td>
        <td data-field="dataPedido">${escapeHTML(p.dataPedido || "")}</td>
        <td data-field="vencimento">${escapeHTML(p.vencimento || "")}</td>
        <td data-field="status">${escapeHTML(p.status || 'Pendente')}</td>
      `;
      const tdActions = document.createElement('td');
      const btnEdit = document.createElement('button'); btnEdit.className='btn-small blue small-action'; btnEdit.innerHTML='<span class="material-icons">edit</span>'; btnEdit.onclick=()=> editarPedido(p.id);
      const btnInline = document.createElement('button'); btnInline.className='btn-small teal small-action'; btnInline.innerHTML='<span class="material-icons">edit_attributes</span>'; btnInline.onclick=(e)=> editRow('pedidos', p.id, e.currentTarget);
      const btnDel = document.createElement('button'); btnDel.className='btn-small red'; btnDel.innerHTML='<span class="material-icons">delete</span>'; btnDel.onclick=()=> excluirPedido(p.id);
      tdActions.appendChild(btnEdit); tdActions.appendChild(btnInline); tdActions.appendChild(btnDel);
      tr.appendChild(tdActions);
      tbody.appendChild(tr);
    });
    calcularSaldo();
    checkVencimentosPedidos7dias();
  }

  // Financeiro UI
  function atualizarFinanceiroUI(){
    const tbody = document.querySelector('#financeiroTable tbody'); tbody.innerHTML = "";
    const hoje = new Date();
    let alerta = false;
    financeiro.forEach((mov) => {
      let aviso = "";
      if(mov.vencimento){
        const parts = mov.vencimento.split('/');
        if(parts.length===3){
          const [d,m,y] = parts;
          const venc = new Date(Number(y), Number(m)-1, Number(d));
          const diff = Math.ceil((venc - hoje)/1000/60/60/24);
          if(diff <= 7 && diff >= 0){ aviso = `<span style="color:#b71c1c;font-weight:bold">🛈 Próximo ao vencimento!</span>`; alerta = true; }
        }
      }
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td data-field="tipo">${escapeHTML(mov.tipo)}</td>
        <td data-field="desc">${escapeHTML(mov.desc)}</td>
        <td data-field="valor">${Number(mov.valor).toFixed(2)}</td>
        <td data-field="vencimento">${escapeHTML(mov.vencimento || "")}</td>
        <td>${aviso}</td>
      `;
      const tdActions = document.createElement('td');
      const btnInline = document.createElement('button'); btnInline.className='btn-small blue small-action'; btnInline.innerHTML='<span class="material-icons">edit_attributes</span>'; btnInline.onclick=(e)=> editRow('financeiro', mov.id, e.currentTarget);
      const btnDel = document.createElement('button'); btnDel.className='btn-small red'; btnDel.innerHTML='<span class="material-icons">delete</span>'; btnDel.onclick=()=> excluirFinanceiro(mov.id);
      tdActions.appendChild(btnInline); tdActions.appendChild(btnDel);
      tr.appendChild(tdActions);
      tbody.appendChild(tr);
    });
    if(alerta) M.toast({html:"Atenção: Existem pagamentos próximos ao vencimento!", displayLength:8000, classes:'red'});
  }

  // Serviços UI
  function atualizarServicosUI(){
    const tbody = document.querySelector('#servicosTable tbody'); tbody.innerHTML = "";
    servicos.forEach((s) => {
      const cliente = clientes.find(x=>x.id===s.clienteId) || {};
      const vencStr = (s.vencimentos || []).join(' ; ');
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td data-field="cliente">${escapeHTML(cliente.nome || '')}</td>
        <td data-field="desc">${escapeHTML(s.desc || '')}</td>
        <td data-field="valor">${Number(s.valor || 0).toFixed(2)}</td>
        <td data-field="parcelas">${s.parcelas || 1}</td>
        <td data-field="vencimentos">${escapeHTML(vencStr)}</td>
      `;
      const tdActions = document.createElement('td');
      const btnInline = document.createElement('button'); btnInline.className='btn-small blue small-action'; btnInline.innerHTML='<span class="material-icons">edit_attributes</span>'; btnInline.onclick=(e)=> editRow('servicos', s.id, e.currentTarget);
      const btnDel = document.createElement('button'); btnDel.className='btn-small red'; btnDel.innerHTML='<span class="material-icons">delete</span>'; btnDel.onclick=()=> excluirServico(s.id);
      tdActions.appendChild(btnInline); tdActions.appendChild(btnDel);
      tr.appendChild(tdActions);
      tbody.appendChild(tr);
    });
    checkVencimentosServicos7dias();
  }

  // SALDO
  function calcularSaldo(){
    let saldoPedidos = 0;
    pedidos.forEach(p => { const custo = Number(p && p.custo ? p.custo : 0) || 0; if(custo > 0) saldoPedidos += custo; });
    let saldoFinanceiro = 0;
    financeiro.forEach(mov => {
      const valor = Number(mov && mov.valor ? mov.valor : 0) || 0;
      if(String(mov.tipo).toLowerCase() === "entrada") saldoFinanceiro += valor;
      else if(String(mov.tipo).toLowerCase() === "saida") saldoFinanceiro -= valor;
    });
    const saldoFinal = saldoPedidos + saldoFinanceiro;
    document.getElementById('saldoAtual').value = "R$ " + saldoFinal.toFixed(2);
  }

  // Vencimentos checks
  function checkVencimentosPedidos7dias(){
    const hoje = new Date();
    const proximos = [];
    pedidos.forEach((p)=>{
      if(!p.vencimento) return;
      if(String(p.vencimento).toLowerCase().includes('à vista')) return;
      const d = parseDDMMYYYYToDate(p.vencimento);
      if(!d) return;
      const diff = Math.ceil((d - new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()))/1000/60/60/24);
      if(diff <= 7 && diff >= 0){
        const cliente = clientes.find(x=>x.id===p.clienteId) || {};
        proximos.push(`${p.produto} - ${cliente.nome || 'Cliente não identificado'} (${p.vencimento})`);
      }
    });
    if(proximos.length){
      M.toast({html: `Atenção: ${proximos.length} pedido(s) vencendo em até 7 dias.`, displayLength:8000, classes:'red'});
      console.warn('Pedidos próximos:', proximos.join('\n'));
    }
  }
  function checkVencimentosServicos7dias(){
    const hoje = new Date();
    const proximos = [];
    servicos.forEach((s)=>{
      (s.vencimentos || []).forEach(v=>{
        const d = parseDDMMYYYYToDate(v);
        if(!d) return;
        const diff = Math.ceil((d - new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()))/1000/60/60/24);
        if(diff <= 7 && diff >= 0){
          const cliente = clientes.find(x=>x.id===s.clienteId) || {};
          proximos.push(`${s.desc} - ${cliente.nome || 'Cliente'} (${v})`);
        }
      });
    });
    if(proximos.length){
      M.toast({html: `Atenção: ${proximos.length} vencimento(s) de serviços em até 7 dias.`, displayLength:8000, classes:'red'});
      console.warn('Serviços próximos:', proximos.join('\n'));
    }
  }

  // GENERIC ROW EDITOR
  window.editRow = function(collectionName, id, btn){
    const tr = btn.closest('tr');
    if(tr.classList.contains('editing-row')){
      saveRowEdits(tr, collectionName, id);
      return;
    }
    startRowEdit(tr, collectionName, id);
  };

  function startRowEdit(tr, collectionName, id){
    tr.classList.add('editing-row');
    tr._original = tr.innerHTML;
    const tds = tr.querySelectorAll('td');
    tds.forEach(td => {
      const field = td.getAttribute('data-field');
      if(!field) return;
      const val = td.innerText;
      let input;
      if(collectionName === 'clientes'){
        if(field === 'docTipo'){
          input = document.createElement('select');
          const optCpf = document.createElement('option'); optCpf.value='cpf'; optCpf.text='CPF';
          const optCnpj = document.createElement('option'); optCnpj.value='cnpj'; optCnpj.text='CNPJ';
          input.appendChild(optCpf); input.appendChild(optCnpj);
          input.value = (val.toLowerCase().indexOf('cnpj')>-1) ? 'cnpj' : 'cpf';
        } else {
          input = document.createElement('input'); input.type='text'; input.value = val;
        }
      } else if(collectionName === 'mpList'){
        if(field === 'saldo' || field === 'preco'){
          input = document.createElement('input'); input.type='number'; input.step = (field==='preco' ? '0.01' : '1'); input.value = val.replace(/[^\d\.\-]/g,'') || 0;
        } else if(field === 'unidade'){
          input = document.createElement('select');
          const o1 = document.createElement('option'); o1.value='kg'; o1.text='kg';
          const o2 = document.createElement('option'); o2.value='unidade'; o2.text='unidade';
          input.appendChild(o1); input.appendChild(o2);
          input.value = val;
        } else {
          input = document.createElement('input'); input.type='text'; input.value = val;
        }
      } else if(collectionName === 'pedidos'){
        if(field === 'kg' || field === 'precoKg' || field === 'custo'){
          input = document.createElement('input'); input.type='number'; input.step = (field==='precoKg' || field==='custo' ? '0.01' : '1'); input.value = val.replace(/[^\d\.\-]/g,'') || 0;
        } else if(field === 'cliente'){
          input = document.createElement('select');
          const placeholder = document.createElement('option'); placeholder.value=''; placeholder.text='-- Selecionar cliente --'; placeholder.disabled=true;
          input.appendChild(placeholder);
          clientes.forEach((c) => { const o = document.createElement('option'); o.value = c.id; o.text = `${c.nome} (${c.doc || ''})`; input.appendChild(o); });
          const match = clientes.find(c=>c.nome === val);
          input.value = match ? match.id : '';
        } else if(field === 'produto'){
          input = document.createElement('select');
          const opts = ["CURE FILM H","CURE FILM HC","HARDSURF H","HARDSURF HC"];
          const placeholder = document.createElement('option'); placeholder.value=''; placeholder.text='-- Selecionar produto --'; placeholder.disabled=true;
          input.appendChild(placeholder);
          opts.forEach(pn => { const o = document.createElement('option'); o.value = pn; o.text = pn; input.appendChild(o); });
          input.value = val || '';
        } else if(field === 'dataPedido' || field === 'vencimento'){
          input = document.createElement('input'); input.type='date';
          const parts = val.split('/');
          if(parts.length===3) input.value = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
        } else if(field === 'status'){
          input = document.createElement('select');
          const o1 = document.createElement('option'); o1.value='Pendente'; o1.text='Pendente';
          const o2 = document.createElement('option'); o2.value='Pago'; o2.text='Pago';
          const o3 = document.createElement('option'); o3.value='Cancelado'; o3.text='Cancelado';
          input.appendChild(o1); input.appendChild(o2); input.appendChild(o3);
          input.value = val || 'Pendente';
        } else {
          input = document.createElement('input'); input.type='text'; input.value = val;
        }
      } else if(collectionName === 'financeiro'){
        if(field === 'valor'){
          input = document.createElement('input'); input.type='number'; input.step='0.01'; input.value = val.replace(/[^\d\.\-]/g,'') || 0;
        } else if(field === 'tipo'){
          input = document.createElement('select');
          const o1 = document.createElement('option'); o1.value='entrada'; o1.text='entrada';
          const o2 = document.createElement('option'); o2.value='saida'; o2.text='saida';
          input.appendChild(o1); input.appendChild(o2);
          input.value = val.toLowerCase();
        } else {
          input = document.createElement('input'); input.type='text'; input.value = val;
        }
      } else if(collectionName === 'servicos'){
        if(field === 'cliente'){
          input = document.createElement('select');
          const placeholder = document.createElement('option'); placeholder.value=''; placeholder.text='-- Selecionar cliente --'; placeholder.disabled=true;
          input.appendChild(placeholder);
          clientes.forEach((c) => { const o = document.createElement('option'); o.value = c.id; o.text = `${c.nome} (${c.doc || ''})`; input.appendChild(o); });
          const match = clientes.find(c=>c.nome === val);
          input.value = match ? match.id : '';
        } else if(field === 'valor'){
          input = document.createElement('input'); input.type='number'; input.step='0.01'; input.value = val.replace(/[^\d\.\-]/g,'') || 0;
        } else if(field === 'parcelas'){
          input = document.createElement('input'); input.type='number'; input.value = val || 1;
        } else if(field === 'vencimentos'){
          input = document.createElement('input'); input.type='text'; input.value = val;
        } else {
          input = document.createElement('input'); input.type='text'; input.value = val;
        }
      } else {
        input = document.createElement('input'); input.type='text'; input.value = val;
      }
      td.innerHTML = '';
      td.appendChild(input);
      if(input.tagName.toLowerCase() === 'select'){
        setTimeout(()=> M.FormSelect.init(input), 0);
      }
    });

    const actionsTd = tr.querySelector('td:last-child');
    if(actionsTd){
      actionsTd._old = actionsTd.innerHTML;
      actionsTd.innerHTML = `
        <button class="btn-small green small-action" data-action="save"><span class="material-icons">save</span></button>
        <button class="btn-small grey" data-action="cancel"><span class="material-icons">close</span></button>
      `;
      actionsTd.querySelector('[data-action="save"]').onclick = () => saveRowEdits(tr, collectionName, id);
      actionsTd.querySelector('[data-action="cancel"]').onclick = () => cancelRowEdits(tr);
    }
  }

  function cancelRowEdits(tr){
    if(tr._original) tr.innerHTML = tr._original;
    tr.classList.remove('editing-row');
  }

  async function saveRowEdits(tr, collectionName, id){
    const cells = tr.querySelectorAll('td');
    const updated = {};
    cells.forEach(td => {
      const field = td.getAttribute('data-field');
      if(!field) return;
      const child = td.firstElementChild;
      if(!child) return;
      if(child.tagName.toLowerCase() === 'select'){
        updated[field] = child.value;
      } else if(child.tagName.toLowerCase() === 'input'){
        if(child.type === 'number'){
          updated[field] = child.value === '' ? 0 : Number(child.value);
        } else if(child.type === 'date'){
          const v = child.value;
          if(v){
            const d = parseDateInputAsLocal(v);
            updated[field] = formatDateToDDMMYYYY(d);
          } else updated[field] = '';
        } else {
          updated[field] = child.value;
        }
      } else {
        updated[field] = child.innerText || child.value || '';
      }
    });

    try {
      if(collectionName === 'clientes'){
        const obj = {};
        if(updated.nome !== undefined) obj.nome = String(updated.nome).trim();
        if(updated.docTipo !== undefined) obj.docTipo = (String(updated.docTipo).toLowerCase() === 'cnpj' ? 'cnpj' : 'cpf');
        if(updated.doc !== undefined) obj.doc = String(updated.doc).trim();
        if(updated.tel !== undefined) obj.tel = String(updated.tel).trim();
        if(updated.email !== undefined) obj.email = String(updated.email).trim();
        if(updated.cep !== undefined) obj.cep = String(updated.cep).trim();
        if(updated.endereco !== undefined) obj.endereco = String(updated.endereco).trim();
        if(updated.numero !== undefined) obj.numero = String(updated.numero).trim();
        if(updated.complemento !== undefined) obj.complemento = String(updated.complemento).trim();
        obj.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
        await collClientes.doc(id).set(obj, { merge: true });
        M.toast({html:'Cliente atualizado!'});
      } else if(collectionName === 'mpList'){
        const obj = {};
        if(updated.tipo !== undefined) obj.tipo = String(updated.tipo).trim();
        if(updated.saldo !== undefined) obj.saldo = Number(updated.saldo) || 0;
        if(updated.preco !== undefined) obj.preco = Number(updated.preco) || 0;
        if(updated.unidade !== undefined) obj.unidade = String(updated.unidade).trim();
        obj.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
        await collMP.doc(id).set(obj, { merge: true });
        M.toast({html:'MP atualizada!'});
      } else if(collectionName === 'pedidos'){
        const obj = {};
        if(updated.cliente !== undefined){
          obj.clienteId = String(updated.cliente);
        }
        if(updated.produto !== undefined) obj.produto = String(updated.produto).trim();
        if(updated.kg !== undefined) obj.kg = Number(updated.kg) || 0;
        if(updated.precoKg !== undefined) obj.precoKg = Number(updated.precoKg) || 0;
        if(updated.custo !== undefined) obj.custo = Number(updated.custo) || 0;
        if(updated.dataPedido !== undefined) obj.dataPedido = String(updated.dataPedido).trim();
        if(updated.vencimento !== undefined) obj.vencimento = String(updated.vencimento).trim();
        if(updated.status !== undefined) obj.status = String(updated.status).trim();
        obj.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
        await collPedidos.doc(id).set(obj, { merge: true });
        M.toast({html:'Pedido atualizado!'});
      } else if(collectionName === 'financeiro'){
        const obj = {};
        if(updated.tipo !== undefined) obj.tipo = String(updated.tipo).trim();
        if(updated.desc !== undefined) obj.desc = String(updated.desc).trim();
        if(updated.valor !== undefined) obj.valor = Number(updated.valor) || 0;
        if(updated.vencimento !== undefined) obj.vencimento = String(updated.vencimento).trim();
        obj.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
        await collFinanceiro.doc(id).set(obj, { merge: true });
        calcularSaldo();
        M.toast({html:'Financeiro atualizado!'});
      } else if(collectionName === 'servicos'){
        const obj = {};
        if(updated.cliente !== undefined) obj.clienteId = String(updated.cliente);
        if(updated.desc !== undefined) obj.desc = String(updated.desc).trim();
        if(updated.valor !== undefined) obj.valor = Number(updated.valor) || 0;
        if(updated.parcelas !== undefined) obj.parcelas = Number(updated.parcelas) || 1;
        if(updated.vencimentos !== undefined) obj.vencimentos = String(updated.vencimentos).split(';').map(s=>s.trim()).filter(x=>x);
        obj.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
        await collServicos.doc(id).set(obj, { merge: true });
        M.toast({html:'Serviço atualizado!'});
      }
    } catch(err){
      console.error('Erro ao salvar edição inline:', err);
      showStatus('Erro ao salvar edição. Veja console.', true);
    }

    tr.classList.remove('editing-row');
  }

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
