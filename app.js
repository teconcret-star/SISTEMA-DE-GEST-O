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

// Verifica se o usuário esqueceu de colar a configuração
if (!firebaseConfig || !firebaseConfig.apiKey || firebaseConfig.apiKey === "COLE_AQUI_SUA_apiKey") {
  console.error('ERRO: Cole o firebaseConfig no início deste arquivo (veja instruções).');
  alert('ATENÇÃO: Você precisa colar o firebaseConfig (do Firebase Console) em app.js antes de testar.');
}

// Inicialização Firebase (compat)
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const coll = db.collection('itens'); // coleção onde guardamos os dados

// Criar/garantir elemento de status para mostrar mensagens ao usuário
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

// Elementos da página (assume index.html com ids corretos)
const campo = document.getElementById('texto');
const btnSalvar = document.getElementById('btnSalvar');
const lista = document.getElementById('lista');

if (!campo || !btnSalvar || !lista) {
  console.error('ERRO: Elementos HTML não encontrados. Verifique se index.html contém #texto, #btnSalvar e #lista.');
  showStatus('Erro: elementos da página não encontrados. Veja console.', true);
}

// Escuta em tempo real (onSnapshot)
function startRealtimeListener() {
  showStatus('Conectando ao Firestore...');
  coll.orderBy('createdAt').onSnapshot(snapshot => {
    lista.innerHTML = '';
    if (snapshot.empty) {
      showStatus('Nenhum item ainda. Adicione algo para começar.');
      return;
    }
    snapshot.forEach(doc => {
      const data = doc.data();
      // obter texto da data do createdAt (pode ser timestamp do servidor ou number)
      const dateText = data.createdAt && data.createdAt.toDate
        ? data.createdAt.toDate().toLocaleString()
        : (data.createdAt ? new Date(data.createdAt).toLocaleString() : '—');
      const li = document.createElement('li');
      li.textContent = data.texto + ' — ' + dateText;
      li.style.cursor = 'pointer';
      li.title = 'Clique para apagar este item';
      li.dataset.id = doc.id;

      // clique para apagar (com confirmação)
      li.addEventListener('click', async () => {
        if (!confirm('Deseja apagar este item?')) return;
        try {
          await coll.doc(doc.id).delete();
          showStatus('Item apagado.');
        } catch (err) {
          console.error('Erro ao apagar:', err);
          showStatus('Erro ao apagar item. Veja console.', true);
        }
      });

      lista.appendChild(li);
    });
    showStatus('Conectado. Lista atualizada em tempo real.');
  }, err => {
    console.error('Erro ao ouvir Firestore:', err);
    if (err && err.code === 'permission-denied') {
      showStatus('Permissão negada. Verifique as regras do Firestore no console (modo de teste ou permitir acesso à coleção "itens").', true);
    } else {
      showStatus('Erro ao ouvir Firestore. Veja console para detalhes.', true);
    }
  });
}

// Botão salvar -> adiciona documento usando timestamp do servidor
btnSalvar.addEventListener('click', async () => {
  const texto = campo.value.trim();
  if (!texto) return alert('Digite algo antes de salvar.');
  try {
    await coll.add({
      texto,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    campo.value = '';
    showStatus('Salvo! Atualizando lista...');
  } catch (err) {
    console.error('Erro ao salvar:', err);
    if (err && err.code === 'permission-denied') {
      showStatus('Permissão negada ao tentar salvar. Verifique regras do Firestore (modo de teste ou permitir coleção "itens").', true);
    } else {
      showStatus('Erro ao salvar. Veja console.', true);
    }
  }
});

// Iniciar a escuta quando o script carregar
startRealtimeListener();