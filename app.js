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
  console.error('ERRO: Cole o firebaseConfig no início deste arquivo (veja instruções).');
  alert('ATENÇÃO: Você precisa colar o firebaseConfig (do Firebase Console) em app.js antes de testar.');
}

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const collClientes = db.collection('clientes');
const collMP = db.collection('mpList');
const collPedidos = db.collection('pedidos');
const collFinanceiro = db.collection('financeiro');
const collServicos = db.collection('servicos');

let clientes = [];
let mpList = [];
let pedidos = [];
let financeiro = [];
let servicos = [];

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

// Helpers
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
function escapeHTML(s){
  if(s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, function(m){
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m];
  });
}

document.addEventListener('DOMContentLoaded', function () {
  M.FormSelect.init(document.querySelectorAll('select'));
  M.Tooltip.init(document.querySelectorAll('.tooltipped'));

  // Masks
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

  // Side menu
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
      if(tgt){
        tgt.scrollIntoView({behavior:'smooth', block:'start'});
        tgt.classList.add('highlight-target');
        setTimeout(()=> tgt.classList.remove('highlight-target'), 1200);
      }
      closeMenu();
    });
  });

  // CEP
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

  startRealtimeListeners();

  // Cliente Form
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
      showStatus('Erro ao salvar cliente.', true);
    }
  };

  // MP Form
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
        document.getElementById('btnSalvarMP').innerHTML = '<span class="material-icons left">save</span>Salvar MP';
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
      showStatus('Erro ao salvar MP.', true);
    }
  };

  // Financeiro Form
  document.getElementById('btnFinanceiro').onclick = function(){ registrarFinanceiro(); };

  async function registrarFinanceiro(desc, valor, tipo, chamadoPorPedido = false, vencStr = ""){
    let dataLanc = "";
    let obs = "";

    if(!chamadoPorPedido){
      desc = document.getElementById('finDesc').value.trim();
      valor = parseFloat(document.getElementById('finValor').value);
      tipo = document.getElementById('finTipo').value;
      obs = (document.getElementById('finObs')?.value || '').trim();

      const finDataRaw = document.getElementById('finDataLanc')?.value || "";
      dataLanc = finDataRaw ? formatDateToDDMMYYYY(parseDateInputAsLocal(finDataRaw)) : formatDateToDDMMYYYY(new Date());

      vencStr = "";
      if(!desc || isNaN(valor)) { M.toast({html:"Preencha corretamente!"}); return; }
    } else {
      dataLanc = formatDateToDDMMYYYY(new Date());
    }

    const obj = { tipo, desc, valor, dataLanc, obs, vencimento: vencStr, createdAt: firebase.firestore.FieldValue.serverTimestamp() };
    try {
      await collFinanceiro.add(obj);
      calcularSaldo();
      if(!chamadoPorPedido){
        document.getElementById('finDesc').value = "";
        document.getElementById('finValor').value = "";
        if(document.getElementById('finObs')) document.getElementById('finObs').value = "";
        if(document.getElementById('finDataLanc')) document.getElementById('finDataLanc').value = "";
        document.getElementById('finTipo').selectedIndex = 0;
        M.updateTextFields();
        M.FormSelect.init(document.getElementById('finTipo'));
        M.toast({html:'Movimentação registrada!'});
      }
    } catch(err){
      console.error('Erro registrar financeiro:', err);
      showStatus('Erro ao registrar financeiro.', true);
    }
  }

  // Serviços Form
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
      showStatus('Erro ao salvar serviço.', true);
    }
  };

  // Pedidos Form
  function atualizarCustoPedido(){
    const kg = parseFloat(document.getElementById('pedidoKg').value) || 0;
    const preco = parseFloat(document.getElementById('pedidoPrecoKg').value) || 0;
    document.getElementById('pedidoCusto').value = (kg*preco).toFixed(2);
  }
  document.getElementById('pedidoKg').oninput = atualizarCustoPedido;
  document.getElementById('pedidoPrecoKg').oninput = function(){ atualizarCustoPedido(); };

  const btnCancelarEditPedidoEl = document.getElementById('btnCancelarEditPedido');
  if(btnCancelarEditPedidoEl){
    btnCancelarEditPedidoEl.onclick = function(){
      document.getElementById('pedidoEditId').value = '';
      document.getElementById('formPedidoSection').reset();
      const hiddenVenc = document.getElementById('pedidoVencDate');
      if(hiddenVenc) hiddenVenc.value = '';
      document.getElementById('btnPedido').textContent = 'Registrar Pedido';
      document.getElementById('btnCancelarEditPedido').style.display = 'none';
      M.updateTextFields && M.updateTextFields();
      M.FormSelect && M.FormSelect.init(document.getElementById('pedidoCliente'));
      M.FormSelect && M.FormSelect.init(document.getElementById('pedidoProduto'));
      M.FormSelect && M.FormSelect.init(document.getElementById('pedidoVenc'));
      M.FormSelect && M.FormSelect.init(document.getElementById('pedidoStatus'));
    };
  }

  document.getElementById('btnPedido').onclick = async function(){
    const editId = document.getElementById('pedidoEditId').value || null;
    const clienteId = document.getElementById('pedidoCliente').value;
    const kg = parseFloat(document.getElementById('pedidoKg').value);
    const produto = document.getElementById('pedidoProduto').value;
    const precoKg = parseFloat(document.getElementById('pedidoPrecoKg').value);
    const custo = parseFloat(document.getElementById('pedidoCusto').value);
    const dataPedidoInput = document.getElementById('pedidoData').value;
    const status = document.getElementById('pedidoStatus').value;
    if(!clienteId || isNaN(kg) || kg<=0 || isNaN(precoKg) || precoKg<=0 || isNaN(custo) || custo<=0 || !produto) {
      M.toast({html:"Preencha todos os campos do pedido!"});
      return;
    }
    const hoje = new Date();

    let vencStr = "";
    const hiddenVencEl = document.getElementById('pedidoVencDate');
    if(hiddenVencEl && hiddenVencEl.value){
      const hv = String(hiddenVencEl.value).trim();
      if(hv === '' ){
        vencStr = '';
      } else if(hv.toLowerCase() === 'à vista' || hv.toLowerCase() === 'avista' ){
        vencStr = "À vista";
      } else {
        const parts = hv.split('-');
        if(parts.length === 3){
          const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
          vencStr = formatDateToDDMMYYYY(d);
        } else {
          vencStr = '';
        }
      }
    } else {
      const vencSelected = document.getElementById('pedidoVenc').value;
      if(vencSelected === 'avista'){
        vencStr = "À vista";
      } else {
        const days = parseInt(vencSelected);
        if(!isNaN(days)){
          const vencDate = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + days);
          vencStr = `${String(vencDate.getDate()).padStart(2,'0')}/${String(vencDate.getMonth()+1).padStart(2,'0')}/${vencDate.getFullYear()}`;
        } else vencStr = "";
      }
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
      document.getElementById('formPedidoSection').reset();
      const hiddenV = document.getElementById('pedidoVencDate');
      if(hiddenV) hiddenV.value = '';
      M.updateTextFields();
      M.FormSelect.init(document.getElementById('pedidoCliente'));
      M.FormSelect.init(document.getElementById('pedidoProduto'));
      M.FormSelect.init(document.getElementById('pedidoVenc'));
      M.FormSelect.init(document.getElementById('pedidoStatus'));
    } catch(err){
      console.error('Erro ao salvar pedido:', err);
      showStatus('Erro ao salvar pedido.', true);
    }
  };

  // Export/Import Excel
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

        if(wb.Sheets["Clientes"]){
          const arr = XLSX.utils.sheet_to_json(wb.Sheets["Clientes"], { header: 1 });
          const rows = arr.slice(1).map(r => ({
            nome: r[0] || "", docTipo: r[1] || "cpf", doc: r[2] || "", tel: r[3] || "",
            email: r[4] || "", cep: r[5] || "", endereco: r[6] || "", numero: r[7] || "", complemento: r[8] || ""
          }));
          const batch = db.batch();
          for(const r of rows){
            const docRef = collClientes.doc();
            batch.set(docRef, { ...r, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
          }
          await batch.commit();
          M.toast({html:"Clientes importados!"});
        }
      }catch(err){
        console.error(err);
        M.toast({html:"Erro ao importar arquivo. Verifique o formato."});
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };


  // ================= FILTROS E PESQUISAS =================
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

  function setupColumnFilters(tableId){
    const table = document.getElementById(tableId);
    if(!table) return;
    const thead = table.querySelector('thead');
    if(!thead) return;
    if(thead.querySelector('.col-filter-row')) return;
  
    const headerRow = thead.querySelector('tr');
    if(!headerRow) return;
  
    const filterRow = document.createElement('tr');
    filterRow.className = 'col-filter-row';
  
    const headers = Array.from(headerRow.querySelectorAll('th'));
    headers.forEach((th, idx) => {
      const fth = document.createElement('th');
      const isActionsCol = (idx === headers.length - 1);
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'col-filter-input';
      input.placeholder = isActionsCol ? '' : 'filtrar...';
      input.dataset.colIndex = String(idx);
      input.addEventListener('input', function(){
        applyColumnFilters(tableId);
      });
      fth.appendChild(input);
      filterRow.appendChild(fth);
    });
  
    thead.appendChild(filterRow);
  }
  
  window.applyColumnFilters = function(tableId){
    const table = document.getElementById(tableId);
    if(!table) return;
  
    const filters = Array.from(table.querySelectorAll('.col-filter-row .col-filter-input'))
      .map(inp => ({
        idx: Number(inp.dataset.colIndex),
        value: (inp.value || '').toLowerCase().trim()
      }));
  
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
      let visible = true;
      for(const f of filters){
        if(!f.value) continue;
        const cell = row.children[f.idx];
        const txt = (cell ? cell.innerText : '').toLowerCase();
        if(!txt.includes(f.value)){
          visible = false;
          break;
        }
      }
      row.style.display = visible ? '' : 'none';
    });
  };

  function reapplyAllFilters(){
    if(typeof window.applyColumnFilters === 'function'){
      window.applyColumnFilters('clientesTable');
      window.applyColumnFilters('mpTable');
      window.applyColumnFilters('pedidosTable');
      window.applyColumnFilters('financeiroTable');
      window.applyColumnFilters('servicosTable');
    }
  }

  addFilter('filterClientes','clientesTable');
  addFilter('filterMP','mpTable');
  addFilter('filterPedidos','pedidosTable');
  addFilter('filterFinanceiro','financeiroTable');
  addFilter('filterServicos','servicosTable');

  setupColumnFilters('clientesTable');
  setupColumnFilters('mpTable');
  setupColumnFilters('pedidosTable');
  setupColumnFilters('financeiroTable');
  setupColumnFilters('servicosTable');
  // ========================================================


  // Funções Globais de Edição no Form (As que estavam faltando!)
  window.editarCliente = function(id) {
    const c = clientes.find(x => x.id === id);
    if(!c) return;
    document.getElementById('clienteEditId').value = c.id;
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
    document.getElementById('formCliente').scrollIntoView({behavior:'smooth'});
  };

  window.editarMP = function(id) {
    const m = mpList.find(x => x.id === id);
    if(!m) return;
    document.getElementById('mpEditId').value = m.id;
    document.getElementById('mpTipo').value = m.tipo || '';
    document.getElementById('mpQtd').value = m.saldo || 0;
    document.getElementById('mpPreco').value = m.preco || 0;
    document.getElementById('mpUnidade').value = m.unidade || 'kg';
    M.updateTextFields();
    M.FormSelect.init(document.getElementById('mpUnidade'));
    document.getElementById('btnCancelarEditMP').style.display = 'inline-block';
    document.getElementById('btnSalvarMP').innerHTML = '<span class="material-icons left">save</span>Atualizar';
    document.getElementById('formCadastroMP').scrollIntoView({behavior:'smooth'});
  };

  window.editarPedido = function(id) {
    const p = pedidos.find(x => x.id === id);
    if(!p) return;
    document.getElementById('pedidoEditId').value = p.id;
    document.getElementById('pedidoCliente').value = p.clienteId || '';
    document.getElementById('pedidoKg').value = p.kg || '';
    document.getElementById('pedidoProduto').value = p.produto || '';
    document.getElementById('pedidoPrecoKg').value = p.precoKg || '';
    document.getElementById('pedidoCusto').value = p.custo || '';
    
    if(p.dataPedido){
      const parts = p.dataPedido.split('/');
      if(parts.length===3) document.getElementById('pedidoData').value = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
    }
    document.getElementById('pedidoStatus').value = p.status || 'Pendente';

    // Vencimento logic
    const hv = document.getElementById('pedidoVencDate');
    const vencSel = document.getElementById('pedidoVenc');
    if(p.vencimento === 'À vista') {
      vencSel.value = 'avista';
      if(hv) hv.value = 'avista';
    } else {
      vencSel.value = '';
      if(p.vencimento){
        const vparts = p.vencimento.split('/');
        if(vparts.length===3 && hv) hv.value = `${vparts[2]}-${vparts[1].padStart(2,'0')}-${vparts[0].padStart(2,'0')}`;
      }
    }

    M.updateTextFields();
    M.FormSelect.init(document.querySelectorAll('#pedidoCliente, #pedidoProduto, #pedidoVenc, #pedidoStatus'));
    document.getElementById('btnCancelarEditPedido').style.display = 'inline-block';
    document.getElementById('btnPedido').textContent = 'Atualizar Pedido';
    document.getElementById('formPedidoSection').scrollIntoView({behavior:'smooth'});
  };

  // UI tables
  function atualizarClientesUI(){
    const tbody = document.querySelector("#clientesTable tbody");
    if(!tbody) return;
    tbody.innerHTML = "";
    const select = document.getElementById('pedidoCliente');
    const servicoSelect = document.getElementById('servicoCliente');
    if(select) select.innerHTML = '<option value="" disabled selected>Selecione o cliente</option>';
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
      btnEdit.onclick = ()=> window.editarCliente(c.id);

      const btnInline = document.createElement('button'); btnInline.className='btn-small blue small-action'; btnInline.title='Editar na Tabela'; btnInline.innerHTML = '<span class="material-icons">edit_attributes</span>';
      btnInline.onclick = (e)=> window.editRow('clientes', c.id, e.currentTarget);
      
      const btnDel = document.createElement('button'); btnDel.className='btn-small red'; btnDel.title='Excluir'; btnDel.innerHTML = '<span class="material-icons">delete</span>';
      btnDel.onclick = ()=> window.excluirCliente(c.id);
      
      tdActions.appendChild(btnEdit);
      tdActions.appendChild(btnInline); 
      tdActions.appendChild(btnDel);
      tr.appendChild(tdActions);
      tbody.appendChild(tr);

      if(select){
        const option = document.createElement('option');
        option.value = c.id;
        option.text = `${c.nome} (${c.doc || ""})`;
        select.appendChild(option);
      }
      if(servicoSelect){
        const option2 = document.createElement('option');
        option2.value = c.id;
        option2.text = `${c.nome} (${c.doc || ""})`;
        servicoSelect.appendChild(option2);
      }
    });
    if(window.M) M.FormSelect.init(document.querySelectorAll('#pedidoCliente, #servicoCliente'));
    reapplyAllFilters();
  }

  function atualizarMPCadastroUI(){
    const tbody = document.querySelector('#mpTable tbody'); 
    if(!tbody) return;
    tbody.innerHTML = "";
    mpList.forEach((mp) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td data-field="tipo">${escapeHTML(mp.tipo)}</td>
        <td data-field="saldo">${mp.saldo}</td>
        <td data-field="preco">${Number(mp.preco).toFixed(2)}</td>
        <td data-field="unidade">${escapeHTML(mp.unidade)}</td>
      `;
      const tdActions = document.createElement('td');
      
      const btnEdit = document.createElement('button'); btnEdit.className='btn-small orange small-action'; btnEdit.innerHTML='<span class="material-icons">edit</span>'; btnEdit.title='Editar Form'; btnEdit.onclick=()=> window.editarMP(mp.id);
      
      const btnInline = document.createElement('button'); btnInline.className='btn-small blue small-action'; btnInline.innerHTML='<span class="material-icons">edit_attributes</span>'; btnInline.title='Editar na Tabela'; btnInline.onclick=(e)=> window.editRow('mpList', mp.id, e.currentTarget);
      
      const btnDel = document.createElement('button'); btnDel.className='btn-small red'; btnDel.innerHTML='<span class="material-icons">delete</span>'; btnDel.title='Excluir'; btnDel.onclick=()=> window.excluirMP(mp.id);
      
      tdActions.appendChild(btnEdit);
      tdActions.appendChild(btnInline); 
      tdActions.appendChild(btnDel);
      tr.appendChild(tdActions);
      tbody.appendChild(tr);
    });
    reapplyAllFilters();
  }

  function atualizarPedidosUI(){
    const tbody = document.querySelector('#pedidosTable tbody'); 
    if(!tbody) return;
    tbody.innerHTML = "";
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
      
      const btnEdit = document.createElement('button'); btnEdit.className='btn-small orange small-action'; btnEdit.innerHTML='<span class="material-icons">edit</span>'; btnEdit.onclick=()=> window.editarPedido(p.id);
      
      const btnInline = document.createElement('button'); btnInline.className='btn-small blue small-action'; btnInline.innerHTML='<span class="material-icons">edit_attributes</span>'; btnInline.onclick=(e)=> window.editRow('pedidos', p.id, e.currentTarget);
      
      const btnDel = document.createElement('button'); btnDel.className='btn-small red'; btnDel.innerHTML='<span class="material-icons">delete</span>'; btnDel.onclick=()=> window.excluirPedido(p.id);
      
      tdActions.appendChild(btnEdit);
      tdActions.appendChild(btnInline); 
      tdActions.appendChild(btnDel);
      tr.appendChild(tdActions);
      tbody.appendChild(tr);
    });
    calcularSaldo();
    checkVencimentosPedidos7dias();
    reapplyAllFilters();
  }

  // Exclusões GLOBAIS atreladas no escopo window
  window.excluirCliente = async function(id){
    if(confirm("Excluir cliente?")) { await collClientes.doc(id).delete(); M.toast({html:'Excluído!'}); }
  };
  window.excluirMP = async function(id){
    if(confirm("Excluir MP?")) { await collMP.doc(id).delete(); M.toast({html:'Excluído!'}); }
  };
  window.excluirPedido = async function(id){
    if(confirm("Excluir pedido?")) { await collPedidos.doc(id).delete(); M.toast({html:'Excluído!'}); }
  };
  window.excluirServico = async function(id){
    if(confirm("Excluir serviço?")) { await collServicos.doc(id).delete(); M.toast({html:'Excluído!'}); }
  };
  window.excluirFinanceiro = async function(id){
    if(!id) return;
    if(confirm('Tem certeza que deseja excluir esta movimentação financeira?')){
      try{
        await collFinanceiro.doc(id).delete();
        M.toast({ html: 'Movimentação excluída!' });
        calcularSaldo();
      }catch(err){ showStatus('Erro ao excluir', true); }
    }
  };

  // Inline editor
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
          const o1 = document.createElement('option'); o1.value='entrada'; o1.text='Receita';
          const o2 = document.createElement('option'); o2.value='saida'; o2.text='Despesa';
          input.appendChild(o1); input.appendChild(o2);

          const raw = String(val || '').toLowerCase().trim();
          if(raw === 'receita' || raw === 'entrada') input.value = 'entrada';
          else if(raw === 'despesa' || raw === 'saída' || raw === 'saida') input.value = 'saida';
          else input.value = 'entrada';
        } else if(field === 'dataLanc' || field === 'vencimento'){
          input = document.createElement('input'); input.type='date';
          const parts = val.split('/');
          if(parts.length===3) input.value = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
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
        setTimeout(()=> { if(window.M) M.FormSelect.init(input); }, 0);
      }
    });

    const actionsTd = tr.querySelector('td:last-child');
    if(actionsTd){
      actionsTd._old = actionsTd.innerHTML;
      actionsTd.innerHTML = `
        <button class="btn-small green small-action" data-action="save" title="Salvar"><span class="material-icons">save</span></button>
        <button class="btn-small grey" data-action="cancel" title="Cancelar"><span class="material-icons">close</span></button>
      `;
      actionsTd.querySelector('[data-action="save"]').onclick = () => saveRowEdits(tr, collectionName, id);
      actionsTd.querySelector('[data-action="cancel"]').onclick = () => cancelRowEdits(tr);
    }
  }

  function cancelRowEdits(tr){
    tr.classList.remove('editing-row');
    // Para recriar perfeitamente sem bugar, nós só reconstruimos a tabela correspondente
    if(typeof atualizarClientesUI === 'function') atualizarClientesUI();
    if(typeof atualizarMPCadastroUI === 'function') atualizarMPCadastroUI();
    if(typeof atualizarPedidosUI === 'function') atualizarPedidosUI();
    if(typeof atualizarFinanceiroUI === 'function') atualizarFinanceiroUI();
    if(typeof atualizarServicosUI === 'function') atualizarServicosUI();
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
        if(updated.cliente !== undefined) obj.clienteId = String(updated.cliente);
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
        if(updated.tipo !== undefined){
          const t = String(updated.tipo).trim().toLowerCase();
          obj.tipo = (t === 'saida' || t === 'despesa' || t === 'saída') ? 'saida' : 'entrada';
        }
        if(updated.desc !== undefined) obj.desc = String(updated.desc).trim();
        if(updated.valor !== undefined){
          const v = Number(updated.valor);
          obj.valor = Number.isFinite(v) ? v : 0;
        }
        if(updated.dataLanc !== undefined) obj.dataLanc = String(updated.dataLanc).trim();
        if(updated.vencimento !== undefined) obj.vencimento = String(updated.vencimento).trim();
        if(updated.obs !== undefined) obj.obs = String(updated.obs).trim();
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
      showStatus('Erro ao salvar edição.', true);
    }

    // Só pra garantir a desmarcação da classe
    tr.classList.remove('editing-row');
  }

  function startRealtimeListeners(){
    showStatus('Conectando ao Firestore...');

    collClientes.orderBy('createdAt').onSnapshot(snapshot => {
      clientes = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      atualizarClientesUI();
      atualizarPedidosUI();
      atualizarServicosUI();
      showStatus('Clientes sincronizados.');
    }, err => showStatus('Erro ao ouvir clientes.', true));

    collMP.orderBy('createdAt').onSnapshot(snapshot => {
      mpList = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      atualizarMPCadastroUI();
      showStatus('MPs sincronizadas.');
    }, err => showStatus('Erro ao ouvir MPs.', true));

    collPedidos.orderBy('createdAt').onSnapshot(snapshot => {
      pedidos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      atualizarPedidosUI();
      showStatus('Pedidos sincronizados.');
    }, err => showStatus('Erro ao ouvir pedidos.', true));

    collFinanceiro.orderBy('createdAt').onSnapshot(snapshot => {
      financeiro = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      atualizarFinanceiroUI();
      calcularSaldo();
      showStatus('Financeiro sincronizado.');
    }, err => showStatus('Erro ao ouvir financeiro.', true));

    collServicos.orderBy('createdAt').onSnapshot(snapshot => {
      servicos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      atualizarServicosUI();
      showStatus('Serviços sincronizados.');
    }, err => showStatus('Erro ao ouvir serviços.', true));
  }

});
