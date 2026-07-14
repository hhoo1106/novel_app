let db = null; 
let currentProjectId = null;
let saveTimer = null;
let isComposing = false; 
let sessionStartTime = Date.now(); 

const editor = document.getElementById('editor');
const titleInput = document.getElementById('project-title');
const charCount = document.getElementById('char-count');
const captionMemo = document.getElementById('caption-memo');
const manualSaveBtn = document.getElementById('manual-save-btn');

const initDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('NovelProDB', 1);
        request.onupgradeneeded = (e) => {
            db = e.target.result;
            if (!db.objectStoreNames.contains('projects')) {
                db.createObjectStore('projects', { keyPath: 'id', autoIncrement: true });
            }
        };
        request.onsuccess = (e) => { db = e.target.result; resolve(); };
        request.onerror = (e) => reject(e);
    });
};

const getEditorText = () => editor.innerText || "";
const updateCharCount = () => { charCount.textContent = getEditorText().length.toLocaleString(); };

editor.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = (e.originalEvent || e).clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
});

editor.addEventListener('compositionstart', () => { isComposing = true; });
editor.addEventListener('compositionend', () => { 
    isComposing = false; 
    triggerAutoSave(); 
});
editor.addEventListener('input', () => {
    updateCharCount();
    if (!isComposing) triggerAutoSave();
});
titleInput.addEventListener('input', triggerAutoSave);
captionMemo.addEventListener('input', triggerAutoSave);

function triggerAutoSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveProject, 3000); 
}

function saveProject() {
    if(!db) return;
    const title = titleInput.value || '無題';
    const content = getEditorText(); 
    const caption = captionMemo.value || '';
    const updatedAt = new Date().getTime();
    const store = db.transaction(['projects'], 'readwrite').objectStore('projects');

    if (currentProjectId) {
        store.get(currentProjectId).onsuccess = (e) => {
            const existing = e.target.result;
            if(!existing) return;
            const historyList = existing.history || [];
            if (existing.content !== content && !isComposing) {
                historyList.push({ content: existing.content, updatedAt: existing.updatedAt });
                if (historyList.length > 20) historyList.shift();
            }
            existing.title = title; existing.content = content; existing.caption = caption;
            existing.updatedAt = updatedAt; existing.history = historyList;
            store.put(existing);
        };
    } else {
        if(content.trim() === '') return; 
        store.add({ title, content, caption, updatedAt, history: [] }).onsuccess = (e) => {
            currentProjectId = e.target.result;
        };
    }
}

if (manualSaveBtn) {
    manualSaveBtn.onclick = () => {
        if (!db) return alert("データベースの準備ができていません．");
        saveProject();
        manualSaveBtn.textContent = '保存完了';
        manualSaveBtn.style.background = '#248a3d';
        setTimeout(() => {
            manualSaveBtn.textContent = '保存';
            manualSaveBtn.style.background = '#34c759';
        }, 2000);
    };
}

document.querySelectorAll('.pixiv-btn').forEach(btn => {
    btn.addEventListener('mousedown', (e) => {
        e.preventDefault(); 
        editor.focus();
        const text = btn.dataset.insert;
        
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const selectedText = selection.toString();
            if (selectedText && text.includes(']')) {
                document.execCommand('insertText', false, text.replace('>', `> ${selectedText}`).replace(']', `${selectedText}]`));
                triggerAutoSave(); return;
            }
        }
        document.execCommand('insertText', false, text);
        updateCharCount(); triggerAutoSave();
    });
});

document.getElementById('marker-btn').addEventListener('mousedown', (e) => {
    e.preventDefault(); editor.focus();
    document.execCommand('hiliteColor', false, '#ffeb3b');
});

document.getElementById('menu-btn').onclick = () => {
    if(!db) return alert("データベースを準備しています．一瞬待ってから再度タップしてください．");
    const list = document.getElementById('project-list'); list.innerHTML = '';
    const navMode = document.getElementById('nav-mode-select').value;
    
    db.transaction(['projects'], 'readonly').objectStore('projects').getAll().onsuccess = (e) => {
        e.target.result.sort((a, b) => b.updatedAt - a.updatedAt).forEach(proj => {
            const li = document.createElement('li');
            const mainBtn = document.createElement('button');
            mainBtn.className = 'list-item'; 
            mainBtn.innerHTML = `<strong>${proj.title}</strong> <span>${(proj.content || '').length}字 ▽</span>`;
            
            const subList = document.createElement('ul'); subList.style.display = 'none';

            mainBtn.onclick = () => {
                subList.style.display = subList.style.display === 'none' ? 'block' : 'none';
            };
            li.appendChild(mainBtn);

            const allLi = document.createElement('li');
            const allBtn = document.createElement('button');
            allBtn.className = 'list-item sub-item';
            allBtn.style.fontWeight = 'bold';
            allBtn.textContent = '➔ この作品を開く（全文ロード）';
            allBtn.onclick = () => {
                currentProjectId = proj.id; titleInput.value = proj.title; 
                editor.innerText = proj.content; captionMemo.value = proj.caption || '';
                updateCharCount(); document.getElementById('project-modal').classList.add('hidden');
            };
            subList.appendChild(allLi).appendChild(allBtn);

            const text = proj.content || '';
            let regex = navMode === 'chapter' ? /\[chapter:(.*?)\]/g : /\[newpage\]/g;
            let match; let pageCount = 1;

            while ((match = regex.exec(text)) !== null) {
                const subBtn = document.createElement('button'); subBtn.className = 'list-item sub-item';
                let label = navMode === 'chapter' ? match[1] : `${pageCount}ページ (${text.substring(match.index + 9, match.index + 20)}...)`;
                const targetIndex = match.index;
                
                subBtn.textContent = label;
                subBtn.onclick = () => {
                    currentProjectId = proj.id; titleInput.value = proj.title; 
                    editor.innerText = proj.content; captionMemo.value = proj.caption || '';
                    updateCharCount(); document.getElementById('project-modal').classList.add('hidden');
                    setTimeout(() => jumpToIndex(targetIndex), 100);
                };
                subList.appendChild(subBtn); pageCount++;
            }
            li.appendChild(subList); list.appendChild(li);
        });
    };
    document.getElementById('project-modal').classList.remove('hidden');
};

const jumpToIndex = (index) => {
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
    let node; let currentLength = 0;
    while (node = walker.nextNode()) {
        if (currentLength + node.nodeValue.length > index) {
            const range = document.createRange();
            range.setStart(node, index - currentLength); range.collapse(true);
            const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
            const rect = range.getBoundingClientRect();
            if (rect) editor.scrollTo({ top: editor.scrollTop + rect.top - 100, behavior: 'smooth' });
            return;
        }
        currentLength += node.nodeValue.length;
    }
};

document.getElementById('close-project-btn').onclick = () => document.getElementById('project-modal').classList.add('hidden');
document.getElementById('new-project-btn').onclick = () => {
    saveProject(); 
    currentProjectId = null; titleInput.value = ''; editor.innerText = ''; captionMemo.value = '';
    updateCharCount(); document.getElementById('project-modal').classList.add('hidden');
};

document.getElementById('char-count-wrap').onclick = () => {
    const text = getEditorText();
    const withoutSpaces = text.replace(/[\s\n ]/g, '').length;
    const html = `
        <p><strong>総文字数：</strong> ${text.length.toLocaleString()} 字</p>
        <p><strong>空白・改行除く：</strong> ${withoutSpaces.toLocaleString()} 字</p>
        <hr style="margin:10px 0; border:0; border-top:1px solid var(--border-color);">
        <p><strong>本日の執筆時間：</strong> ${Math.floor((Date.now() - sessionStartTime) / 60000)} 分</p>
    `;
    document.getElementById('stats-content').innerHTML = html;
    document.getElementById('stats-modal').classList.remove('hidden');
};
document.getElementById('close-stats-btn').onclick = () => document.getElementById('stats-modal').classList.add('hidden');

document.getElementById('history-btn').onclick = () => {
    if(!db) return alert("準備中です．一瞬待ってから再度お試しください．");
    const list = document.getElementById('history-list'); list.innerHTML = '';
    if (!currentProjectId) return alert("まだ作品が保存されていません．本文を入力して自動保存されるのを待つか、タイトルを入力してください．");
    
    db.transaction(['projects'], 'readonly').objectStore('projects').get(currentProjectId).onsuccess = (e) => {
        const result = e.target.result;
        if(!result) return;
        const history = result.history || [];
        if (history.length === 0) return list.innerHTML = '<li style="padding:15px;">履歴がありません．</li>';
        [...history].reverse().forEach(hist => {
            const date = new Date(hist.updatedAt).toLocaleString();
            const btn = document.createElement('button'); btn.className = 'list-item'; btn.textContent = `${date} のデータ`;
            btn.onclick = () => {
                if(confirm("この状態に復元しますか？")) { editor.innerText = hist.content; document.getElementById('history-modal').classList.add('hidden'); triggerAutoSave(); }
            };
            const li = document.createElement('li'); li.appendChild(btn); list.appendChild(li);
        });
    };
    document.getElementById('history-modal').classList.remove('hidden');
};
document.getElementById('close-history-btn').onclick = () => document.getElementById('history-modal').classList.add('hidden');

document.getElementById('settings-btn').onclick = () => document.getElementById('settings-modal').classList.remove('hidden');
document.getElementById('close-settings-btn').onclick = () => document.getElementById('settings-modal').classList.add('hidden');
document.getElementById('theme-select').onchange = (e) => { 
    e.target.value === 'dark' ? document.body.classList.add('dark-mode') : document.body.classList.remove('dark-mode'); 
    localStorage.setItem('theme', e.target.value); 
};

document.getElementById('backup-btn').onclick = () => {
    if(!db) return;
    db.transaction(['projects'], 'readonly').objectStore('projects').getAll().onsuccess = (e) => {
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(e.target.result)], { type: 'application/json' }));
        const d = new Date(); a.download = `memo_backup_${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}.json`; a.click();
    };
};
document.getElementById('restore-btn').onclick = () => document.getElementById('restore-file-input').click();
document.getElementById('restore-file-input').onchange = (e) => {
    if(!db) return;
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const projects = JSON.parse(ev.target.result); const store = db.transaction(['projects'], 'readwrite').objectStore('projects');
            projects.forEach(proj => { delete proj.id; store.add(proj); });
            alert("復元完了しました．「一覧（☰）」から確認してください．");
        } catch { alert("正しいファイルを選択してください．"); }
    };
    reader.readAsText(file); e.target.value = '';
};

if (window.visualViewport) {
    const adjustViewport = () => {
        document.body.style.height = `${window.visualViewport.height}px`; window.scrollTo(0, 0);
        const activeElement = document.activeElement;
        if (window.visualViewport.height < window.innerHeight * 0.8) {
            document.body.classList.add('keyboard-open'); 
            if (activeElement && activeElement.id === 'editor') document.body.classList.add('editor-focused');
            else document.body.classList.remove('editor-focused');
        } else {
            document.body.classList.remove('keyboard-open'); document.body.classList.remove('editor-focused');
        }
    };
    window.visualViewport.addEventListener('resize', adjustViewport);
    window.visualViewport.addEventListener('scroll', adjustViewport);
    adjustViewport();
}

window.addEventListener('DOMContentLoaded', async () => { 
    await initDB(); 
    const theme = localStorage.getItem('theme') || 'light';
    document.getElementById('theme-select').value = theme;
    if(theme === 'dark') document.body.classList.add('dark-mode');
});