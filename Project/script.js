(() => {
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  // Elements
  const form = $('#taskForm');
  const titleEl = $('#title');
  const dueEl = $('#due');
  const priorityEl = $('#priority');
  const notesEl = $('#notes');

  const searchEl = $('#search');
  const statusFilterEl = $('#statusFilter');
  const priorityFilterEl = $('#priorityFilter');
  const sortEl = $('#sortBy');
  const clearCompletedBtn = $('#clearCompleted');

  const listEl = $('#taskList');
  const emptyStateEl = $('#emptyState');
  const template = $('#taskItemTemplate');

  const themeToggle = $('#themeToggle');
  const exportBtn = $('#exportBtn');
  const importInput = $('#importInput');

  // State
  let tasks = loadTasks();
  let dragSrcIndex = null;

  function loadTasks() {
    try {
      const data = localStorage.getItem('taskflow:v1');
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Failed to parse tasks', e);
      return [];
    }
  }

  function saveTasks() {
    localStorage.setItem('taskflow:v1', JSON.stringify(tasks));
  }

  // Utilities
  const nowISO = () => new Date().toISOString();
  const fmtDate = (iso) => {
    if (!iso) return 'No due date';
    const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
    if (Number.isNaN(d)) return 'No due date';
    return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
  };
  const priorityRank = (p) => ({ low: 1, medium: 2, high: 3 }[p] || 0);

  function applyFilters(list) {
    const q = searchEl.value.trim().toLowerCase();
    const status = statusFilterEl.value;
    const pf = priorityFilterEl.value;

    let out = list.filter(t => {
      const matchesQ = !q || t.title.toLowerCase().includes(q) || (t.notes || '').toLowerCase().includes(q);
      const matchesStatus = status === 'all' || (status === 'active' ? !t.completed : t.completed);
      const matchesPriority = pf === 'all' || t.priority === pf;
      return matchesQ && matchesStatus && matchesPriority;
    });

    const [key, dir] = sortEl.value.split('-'); // e.g., "created-desc"
    out.sort((a, b) => {
      let d = 0;
      switch (key) {
        case 'created': d = new Date(a.created) - new Date(b.created); break;
        case 'due': d = (a.due || '') > (b.due || '') ? 1 : (a.due || '') < (b.due || '') ? -1 : 0; break;
        case 'priority': d = priorityRank(a.priority) - priorityRank(b.priority); break;
        case 'title': d = a.title.localeCompare(b.title); break;
        default: d = a.order - b.order; // fallback to manual order
      }
      return dir === 'desc' ? -d : d;
    });

    return out;
  }

  function render() {
    const filtered = applyFilters(tasks);
    listEl.innerHTML = '';

    emptyStateEl.style.display = filtered.length ? 'none' : 'block';

    filtered.forEach(task => {
      const node = template.content.firstElementChild.cloneNode(true);
      node.dataset.id = task.id;

      // Drag & drop
      node.addEventListener('dragstart', (e) => {
        dragSrcIndex = tasks.findIndex(t => t.id === task.id);
        node.setAttribute('aria-grabbed', 'true');
        e.dataTransfer.effectAllowed = 'move';
      });
      node.addEventListener('dragend', () => node.removeAttribute('aria-grabbed'));
      node.addEventListener('dragover', (e) => e.preventDefault());
      node.addEventListener('drop', () => {
        const targetId = node.dataset.id;
        const tgtIdx = tasks.findIndex(t => t.id === targetId);
        if (dragSrcIndex != null && tgtIdx !== -1 && dragSrcIndex !== tgtIdx) {
          const [moved] = tasks.splice(dragSrcIndex, 1);
          tasks.splice(tgtIdx, 0, moved);
          // Re-number order to stabilize sorting
          tasks.forEach((t, i) => t.order = i);
          saveTasks();
          render();
        }
        dragSrcIndex = null;
      });

      const checkbox = $('.toggle', node);
      checkbox.checked = !!task.completed;
      checkbox.addEventListener('change', () => {
        task.completed = checkbox.checked;
        saveTasks(); render();
      });

      const titleInput = $('.title-input', node);
      titleInput.value = task.title;
      titleInput.classList.toggle('completed', task.completed);
      titleInput.addEventListener('input', () => {
        task.title = titleInput.value;
        saveTasks();
        // Re-render chips to update search & live text
        render();
      });

      const notesInput = $('.notes-input', node);
      notesInput.value = task.notes || '';
      notesInput.addEventListener('input', () => {
        task.notes = notesInput.value;
        saveTasks();
      });

      const prChip = $('.priority', node);
      prChip.textContent = `Priority: ${task.priority}`;
      prChip.classList.add(task.priority);

      const dueChip = $('.due', node);
      dueChip.textContent = `Due: ${fmtDate(task.due || '')}`;
      if (task.due) {
        const today = new Date(); today.setHours(0,0,0,0);
        const due = new Date(task.due + (task.due.length === 10 ? 'T00:00:00' : ''));
        if (!task.completed && due < today) {
          dueChip.textContent += ' ⚠ overdue';
          dueChip.style.borderColor = 'var(--danger)';
        }
      }

      const created = $('.created', node);
      created.textContent = `Created: ${fmtDate(task.created)}`;

      $('.delete', node).addEventListener('click', () => {
        tasks = tasks.filter(t => t.id !== task.id);
        // Re-number order
        tasks.forEach((t, i) => t.order = i);
        saveTasks(); render();
      });

      listEl.appendChild(node);
    });
  }

  // Form submission
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = titleEl.value.trim();
    if (!title) {
      titleEl.focus();
      return;
    }
    const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
    const created = nowISO();
    const due = (dueEl.value || '').trim();
    const priority = priorityEl.value;
    const notes = (notesEl.value || '').trim();

    const task = { id, title, created, due, priority, notes, completed: false, order: tasks.length };
    tasks.push(task);
    saveTasks();
    form.reset();
    render();
    titleEl.focus();
  });

  clearCompletedBtn.addEventListener('click', () => {
    tasks = tasks.filter(t => !t.completed);
    tasks.forEach((t, i) => t.order = i);
    saveTasks(); render();
  });

  // Import/Export
  exportBtn.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.download = `taskflow-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
  });

  importInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error('Invalid format');
      // Basic sanitize
      tasks = data.map((t, i) => ({
        id: t.id || String(Date.now() + Math.random()),
        title: String(t.title || '').slice(0, 300),
        created: t.created || nowISO(),
        due: t.due || '',
        priority: ['low','medium','high'].includes(t.priority) ? t.priority : 'medium',
        notes: String(t.notes || '').slice(0, 2000),
        completed: !!t.completed,
        order: Number.isFinite(t.order) ? t.order : i
      }));
      saveTasks(); render();
      importInput.value = '';
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
  });

  // Theme
  const root = document.documentElement;
  const storedTheme = localStorage.getItem('taskflow:theme');
  if (storedTheme === 'light') root.classList.add('light');

  themeToggle.addEventListener('click', () => {
    root.classList.toggle('light');
    localStorage.setItem('taskflow:theme', root.classList.contains('light') ? 'light' : 'dark');
  });

  // Filters re-render
  [searchEl, statusFilterEl, priorityFilterEl, sortEl].forEach(el => {
    el.addEventListener('input', render);
    el.addEventListener('change', render);
  });

  // Initial render
  render();

  // Quality-of-life: Enter in title focuses notes if Shift not pressed
  titleEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      notesEl.focus();
    }
  });
})();
