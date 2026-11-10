// Orca - the website code that runs in your browser.

const chatEl = document.getElementById('chat');
const form = document.getElementById('composer');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send');
const fileInput = document.getElementById('file-input');
const attachmentsEl = document.getElementById('attachments');
const newChatBtn = document.getElementById('new-chat');
const welcomeHTML = document.getElementById('welcome').outerHTML;

const MAX_FILE_MB = 4;

// Where the Cloudflare Worker lives (set in config.js). Empty = same address as this page.
const API_BASE = ((window.ORCA_CONFIG && window.ORCA_CONFIG.apiUrl) || '').trim().replace(/\/+$/, '');
const API_URL = `${API_BASE}/api/chat`;
const BINARY_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];

let history = [];   // the whole conversation, sent to the server each time
let pending = [];   // files attached to the next message
let busy = false;

// ---------- Rendering ----------

function renderMarkdown(text) {
  if (window.marked && window.DOMPurify) {
    return DOMPurify.sanitize(marked.parse(text));
  }
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML.replace(/\n/g, '<br>');
}

function addCopyButtons(el) {
  el.querySelectorAll('pre').forEach((pre) => {
    const btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.type = 'button';
    btn.textContent = 'Copy';
    btn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(pre.querySelector('code')?.innerText ?? pre.innerText);
        btn.textContent = 'Copied!';
      } catch {
        btn.textContent = 'Failed';
      }
      setTimeout(() => (btn.textContent = 'Copy'), 1500);
    };
    pre.appendChild(btn);
  });
}

function addMessage(role, text, files = []) {
  document.getElementById('welcome')?.remove();
  const el = document.createElement('div');
  el.className = `msg ${role}`;

  if (role === 'assistant') {
    el.innerHTML = renderMarkdown(text);
    addCopyButtons(el);
  } else {
    el.textContent = text;
  }

  if (files.length) {
    const box = document.createElement('div');
    box.className = 'files';
    for (const f of files) {
      if (f.previewUrl) {
        const img = document.createElement('img');
        img.src = f.previewUrl;
        img.alt = f.name;
        box.appendChild(img);
      } else {
        const span = document.createElement('span');
        span.textContent = `📄 ${f.name}`;
        box.appendChild(span);
      }
    }
    el.appendChild(box);
  }

  chatEl.appendChild(el);
  chatEl.scrollTop = chatEl.scrollHeight;
  return el;
}

function showTyping() {
  const el = document.createElement('div');
  el.className = 'msg assistant typing';
  el.innerHTML = '<span></span><span></span><span></span>';
  chatEl.appendChild(el);
  chatEl.scrollTop = chatEl.scrollHeight;
  return el;
}

// ---------- File attachments ----------

function isTextFile(file) {
  if (file.type.startsWith('text/')) return true;
  if (['application/json', 'application/xml', 'application/javascript'].includes(file.type)) return true;
  return /\.(txt|md|js|ts|jsx|tsx|py|java|c|cpp|h|cs|go|rs|rb|php|html|css|json|xml|ya?ml|sql|sh|csv|lua|swift|kt)$/i.test(file.name);
}

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function addFiles(fileList) {
  for (const file of fileList) {
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      alert(`${file.name} is too big (max ${MAX_FILE_MB} MB).`);
      continue;
    }
    try {
      if (BINARY_TYPES.includes(file.type)) {
        pending.push({
          name: file.name,
          mimeType: file.type,
          data: await readAsBase64(file),
          previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
        });
      } else if (isTextFile(file)) {
        pending.push({ name: file.name, text: await file.text() });
      } else {
        alert(`Sorry, Orca can't read ${file.name} yet. Try images, PDFs, or code/text files.`);
      }
    } catch {
      alert(`Couldn't read ${file.name}.`);
    }
  }
  renderAttachments();
}

function renderAttachments() {
  attachmentsEl.innerHTML = '';
  pending.forEach((f, i) => {
    const chip = document.createElement('div');
    chip.className = 'chip';
    const label = document.createElement('span');
    label.textContent = `${f.previewUrl ? '🖼️' : '📄'} ${f.name}`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.title = 'Remove';
    remove.textContent = '×';
    remove.onclick = () => {
      pending.splice(i, 1);
      renderAttachments();
    };
    chip.append(label, remove);
    attachmentsEl.appendChild(chip);
  });
}

fileInput.addEventListener('change', () => {
  addFiles(fileInput.files);
  fileInput.value = '';
});

// Drag and drop files anywhere on the page
document.addEventListener('dragover', (e) => {
  e.preventDefault();
  document.body.classList.add('dragging');
});
document.addEventListener('dragleave', (e) => {
  if (!e.relatedTarget) document.body.classList.remove('dragging');
});
document.addEventListener('drop', (e) => {
  e.preventDefault();
  document.body.classList.remove('dragging');
  if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
});

// Paste images straight into the message box
input.addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.files || [])];
  if (files.length) {
    e.preventDefault();
    addFiles(files);
  }
});

// ---------- Sending ----------

async function send() {
  const text = input.value.trim();
  if (busy || (!text && pending.length === 0)) return;

  // Text/code files go inside the message; images & PDFs go as attachments.
  let fullText = text;
  for (const f of pending.filter((f) => f.text !== undefined)) {
    fullText += `\n\n--- File: ${f.name} ---\n\`\`\`\n${f.text}\n\`\`\``;
  }
  const binaryFiles = pending
    .filter((f) => f.data)
    .map(({ name, mimeType, data }) => ({ name, mimeType, data }));

  addMessage('user', text || '(sent files)', pending);
  history.push({ role: 'user', text: fullText, files: binaryFiles });

  input.value = '';
  autoResize();
  pending = [];
  renderAttachments();
  setBusy(true);
  const typing = showTyping();

  if (!API_BASE && location.hostname.endsWith('github.io')) {
    typing.remove();
    history.pop();
    addMessage('assistant', '⚠️ Orca isn\'t connected yet: put your Cloudflare Worker address in `config.js` (see README step 3).').classList.add('error');
    setBusy(false);
    return;
  }

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history }),
    });
    const data = await res.json().catch(() => ({ error: `Server error (${res.status})` }));
    typing.remove();

    if (!res.ok || data.error) {
      history.pop(); // forget the failed message so you can try again
      addMessage('assistant', `⚠️ ${data.error || 'Something went wrong.'}`).classList.add('error');
    } else {
      history.push({ role: 'assistant', text: data.reply });
      addMessage('assistant', data.reply);
    }
  } catch {
    typing.remove();
    history.pop();
    addMessage('assistant', '⚠️ Could not reach the server. Is it running?').classList.add('error');
  } finally {
    setBusy(false);
    input.focus();
  }
}

function setBusy(value) {
  busy = value;
  sendBtn.disabled = value;
}

function autoResize() {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 200) + 'px';
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  send();
});
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    send();
  }
});
input.addEventListener('input', autoResize);

newChatBtn.addEventListener('click', () => {
  if (busy) return;
  history = [];
  pending = [];
  renderAttachments();
  chatEl.innerHTML = welcomeHTML;
  input.focus();
});
