// System-agnostic app controller. Both the Shadowdark and Cyberpunk RED pages
// share this: campaign join, live sync, the character list, the sheet pane, the
// campaign journal, local dice and the password dialog. The game-specific part
// (the sheet model + renderer) is injected as `sys`.
//
//   sys: { id, defaultSheet, normalize, renderSheet, read, summary(d) }
//   cfg: { lsPrefix }   // namespaces localStorage between the two pages

import { api, ApiError } from './api.js';
import { sha256Hex } from './crypto.js';
import { CampaignStream } from './sse.js';
import { rollDie, rollD10Check, showRoll, rollAndShow } from './dice.js';

const SYSTEM_PAGES = { shadowdark: '/shadowdark', cyberpunk_red: '/cyberpunk' };
const SYSTEM_NAMES = { shadowdark: 'Shadowdark', cyberpunk_red: 'Cyberpunk RED' };

export function initApp(sys, cfg) {
  const LS_LAST = `${cfg.lsPrefix}_last_campaign`;
  const LS_OWNERS = `${cfg.lsPrefix}_owners`;
  const LS_GM = `${cfg.lsPrefix}_gm`;

  // ---- persisted ownership (hashes only, fine for a friends-only app) ----- //
  const loadJSON = (k) => JSON.parse(localStorage.getItem(k) || '{}');
  const saveJSON = (k, o) => localStorage.setItem(k, JSON.stringify(o));

  const ownerHash = (cid, chId) => loadJSON(LS_OWNERS)[cid]?.[chId] || null;
  function rememberOwner(cid, chId, hash) {
    const o = loadJSON(LS_OWNERS);
    o[cid] = o[cid] || {};
    o[cid][chId] = hash;
    saveJSON(LS_OWNERS, o);
  }
  function forgetOwner(cid, chId) {
    const o = loadJSON(LS_OWNERS);
    if (o[cid]) { delete o[cid][chId]; saveJSON(LS_OWNERS, o); }
  }
  const gmHashFor = (cid) => loadJSON(LS_GM)[cid] || null;
  function rememberGm(cid, hash) { const o = loadJSON(LS_GM); o[cid] = hash; saveJSON(LS_GM, o); }
  function forgetGm(cid) { const o = loadJSON(LS_GM); delete o[cid]; saveJSON(LS_GM, o); }

  // ---- app state --------------------------------------------------------- //
  const state = {
    campaignId: null,
    characters: {},
    board: {},
    stream: null,
    // selection in the right pane:
    //   { type:'char', charId, isNew, mode, editorHash }
    //   { type:'board', mode, gmHash }
    sel: null,
  };

  // ---- element refs ------------------------------------------------------ //
  const $ = (id) => document.getElementById(id);
  const screenCampaign = $('screen-campaign');
  const screenBoard = $('screen-board');
  const campaignInput = $('campaign-input');
  const campaignError = $('campaign-error');
  const charList = $('char-list');
  const listEmpty = $('list-empty');
  const sheetEmpty = $('sheet-empty');
  const sheetWrap = $('sheet-wrap');
  const connStatus = $('conn-status');
  const sheetForm = $('sheet-form');
  const sheetError = $('sheet-error');
  const sheetBadge = $('sheet-mode-badge');
  const btnEdit = $('btn-edit');
  const btnSave = $('btn-save');
  const btnDelete = $('btn-delete');

  // ======================================================================= //
  //  Campaign join
  // ======================================================================= //
  $('btn-open').addEventListener('click', () => openCampaign(campaignInput.value.trim(), false));
  $('btn-create').addEventListener('click', () => openCampaign(campaignInput.value.trim(), true));
  campaignInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') openCampaign(campaignInput.value.trim(), false);
  });

  const SLUG_RE = /^[a-zA-Z0-9_-]+$/;

  async function openCampaign(id, create) {
    campaignError.hidden = true;
    if (!id || !SLUG_RE.test(id) || id.length > 128) {
      return showError(campaignError, 'ID кампании: буквы, цифры, дефис и подчёркивание.');
    }
    try {
      if (create) {
        const pwd = await askPassword({
          title: 'Пароль ГМ',
          desc: 'Задай пароль мастера — им правится журнал кампании (квесты, заметки). Запомни его.',
        });
        if (pwd === null) return;
        if (!pwd) return showError(campaignError, 'Пароль ГМ не может быть пустым.');
        const gmHash = await sha256Hex(pwd);
        await api.createCampaign(id, { system: sys.id, gmHash });
        rememberGm(id, gmHash);
      } else {
        const campaign = await api.getCampaign(id); // verify it exists + system
        if (campaign.system && campaign.system !== sys.id) {
          const url = SYSTEM_PAGES[campaign.system] || '/';
          campaignError.innerHTML =
            `Эта кампания — система «${SYSTEM_NAMES[campaign.system] || campaign.system}». ` +
            `Открой её на <a href="${url}">нужной странице</a>.`;
          campaignError.hidden = false;
          return;
        }
      }
    } catch (err) {
      if (create && err instanceof ApiError && err.status === 409) {
        return showError(campaignError, 'Такая кампания уже есть. Нажми «Открыть».');
      }
      if (!create && err instanceof ApiError && err.status === 404) {
        return showError(campaignError, 'Кампания не найдена. Создай новую.');
      }
      return showError(campaignError, err.message || 'Не удалось подключиться.');
    }
    await enterCampaign(id);
  }

  async function enterCampaign(id) {
    state.campaignId = id;
    localStorage.setItem(LS_LAST, id);
    $('board-campaign-id').textContent = id;
    screenCampaign.hidden = true;
    screenBoard.hidden = false;
    clearSelection();
    await refresh();
    startStream();
  }

  $('btn-leave').addEventListener('click', () => {
    stopStream();
    state.campaignId = null;
    state.characters = {};
    state.board = {};
    state.sel = null;
    localStorage.removeItem(LS_LAST);
    screenBoard.hidden = true;
    screenCampaign.hidden = false;
  });

  // ======================================================================= //
  //  Live sync
  // ======================================================================= //
  function startStream() {
    stopStream();
    state.stream = new CampaignStream(state.campaignId, {
      onStatus: setConnStatus,
      onChange: () => refresh(),
    });
    state.stream.start();
  }
  function stopStream() {
    if (state.stream) state.stream.stop();
    state.stream = null;
    setConnStatus('offline');
  }
  function setConnStatus(status) {
    const labels = { online: 'на связи', reconnecting: 'переподключение…', offline: 'офлайн' };
    connStatus.dataset.status = status;
    connStatus.querySelector('.conn-label').textContent = labels[status] || status;
  }

  async function refresh() {
    try {
      const campaign = await api.getCampaign(state.campaignId);
      state.characters = campaign.characters || {};
      state.board = campaign.board || {};
      renderList();
      if (!state.sel) return;
      if (state.sel.type === 'char' && state.sel.mode === 'view' && !state.sel.isNew) {
        const ch = state.characters[state.sel.charId];
        if (ch) sys.renderSheet(sheetForm, ch.data, { editable: false });
        else clearSelection();
      } else if (state.sel.type === 'board' && state.sel.mode === 'view') {
        renderBoard(sheetForm, state.board, false);
      }
    } catch (err) {
      console.error('refresh failed', err);
    }
  }

  // ======================================================================= //
  //  Left list (journal entry + characters)
  // ======================================================================= //
  function renderList() {
    charList.innerHTML = '';

    // Campaign journal always sits at the top.
    const bli = document.createElement('li');
    const bRow = document.createElement('button');
    bRow.className = 'char-row board-entry' + (state.sel?.type === 'board' ? ' active' : '');
    bRow.innerHTML = `
      <span class="cr-portrait empty"><span class="cr-silhouette">📓</span></span>
      <span class="cr-main">
        <span class="cr-name">Журнал кампании</span>
        <span class="cr-sub">заметки · квесты</span>
      </span>`;
    bRow.addEventListener('click', selectBoard);
    bli.append(bRow);
    charList.append(bli);

    const ids = Object.keys(state.characters);
    listEmpty.hidden = ids.length > 0;

    for (const id of ids) {
      const ch = state.characters[id];
      const s = sys.summary(sys.normalize(ch.data));
      const owned = !!ownerHash(state.campaignId, id);
      const active = state.sel?.type === 'char' && state.sel.charId === id;

      const li = document.createElement('li');
      const row = document.createElement('button');
      row.className = 'char-row' + (owned ? ' owned' : '') + (active ? ' active' : '');
      row.innerHTML = `
        <span class="cr-portrait ${s.portrait ? '' : 'empty'}">
          ${s.portrait ? `<img src="${escapeAttr(s.portrait)}" alt="" onerror="this.parentNode.classList.add('empty');this.remove()" />` : '<span class="cr-silhouette">☗</span>'}
        </span>
        <span class="cr-main">
          <span class="cr-name">${escapeHtml(s.name || 'Безымянный')}</span>
          <span class="cr-sub">${escapeHtml(s.sub || '—')}</span>
        </span>
        <span class="cr-badge" title="${owned ? 'Твой персонаж' : 'Только просмотр'}">${owned ? '✎' : '🔒'}</span>`;
      row.addEventListener('click', () => selectCharacter(id));
      li.append(row);
      charList.append(li);
    }
  }

  // ======================================================================= //
  //  Right pane: character sheets
  // ======================================================================= //
  $('btn-new-char').addEventListener('click', openNewSheet);
  $('btn-back').addEventListener('click', clearSelection);

  function showSheetPane() {
    sheetEmpty.hidden = true;
    sheetWrap.hidden = false;
    screenBoard.dataset.view = 'sheet';
    sheetError.hidden = true;
  }
  function clearSelection() {
    state.sel = null;
    sheetWrap.hidden = true;
    sheetEmpty.hidden = false;
    sheetForm.innerHTML = '';
    screenBoard.dataset.view = 'list';
    renderList();
  }
  function openNewSheet() {
    state.sel = { type: 'char', charId: null, isNew: true, mode: 'edit', editorHash: null };
    showSheetPane();
    sys.renderSheet(sheetForm, sys.defaultSheet(), { editable: true });
    setMode();
    renderList();
  }
  function selectCharacter(charId) {
    const ch = state.characters[charId];
    if (!ch) return;
    state.sel = { type: 'char', charId, isNew: false, mode: 'view', editorHash: ownerHash(state.campaignId, charId) };
    showSheetPane();
    sys.renderSheet(sheetForm, ch.data, { editable: false });
    setMode();
    renderList();
  }
  function selectBoard() {
    state.sel = { type: 'board', mode: 'view', gmHash: gmHashFor(state.campaignId) };
    showSheetPane();
    renderBoard(sheetForm, state.board, false);
    setMode();
    renderList();
  }

  function setMode() {
    const s = state.sel;
    const editing = s.mode === 'edit';
    if (s.type === 'board') {
      sheetBadge.textContent = editing ? 'Журнал — правка' : 'Журнал кампании';
    } else {
      sheetBadge.textContent = s.isNew ? 'Новый персонаж' : editing ? 'Редактирование' : 'Просмотр';
    }
    sheetBadge.className = 'badge ' + (editing ? 'editing' : 'viewing');
    btnEdit.hidden = editing;
    btnSave.hidden = !editing;
    btnDelete.hidden = !(s.type === 'char' && editing && !s.isNew);
  }

  btnEdit.addEventListener('click', enterEditMode);
  btnSave.addEventListener('click', save);
  btnDelete.addEventListener('click', deleteCharacter);

  async function enterEditMode() {
    const s = state.sel;
    if (s.type === 'board') {
      if (!s.gmHash) {
        const hash = await promptForPassword({
          title: 'Пароль ГМ',
          desc: 'Журнал правит только мастер.',
          errorText: 'Неверный пароль ГМ.',
          verify: (hash) => api.verifyBoard(state.campaignId, hash),
        });
        if (hash === null) return;
        s.gmHash = hash;
      }
      s.mode = 'edit';
      renderBoard(sheetForm, state.board, true);
      setMode();
      return;
    }
    // character
    if (!s.editorHash) {
      const hash = await promptForPassword({
        title: 'Пароль персонажа',
        desc: 'Введи пароль, заданный при создании этого персонажа.',
        errorText: 'Неверный пароль.',
        verify: (hash) => api.verifyCharacter(state.campaignId, s.charId, hash),
      });
      if (hash === null) return;
      s.editorHash = hash;
    }
    s.mode = 'edit';
    sys.renderSheet(sheetForm, state.characters[s.charId].data, { editable: true });
    setMode();
  }

  async function promptForPassword({ title, desc, errorText, verify }) {
    let error = null;
    while (true) {
      const pwd = await askPassword({ title, desc, error });
      if (pwd === null) return null;
      const hash = await sha256Hex(pwd);
      try {
        await verify(hash);
        return hash;
      } catch (err) {
        if (err instanceof ApiError && err.status === 403) {
          desc = errorText + ' Попробуй снова или нажми отмену.';
          error = errorText;
          continue;
        }
        showError(sheetError, err.message || 'Не удалось проверить пароль.');
        return null;
      }
    }
  }

  async function save() {
    const s = state.sel;
    sheetError.hidden = true;
    if (s.type === 'board') return saveBoard();

    const data = sys.read(sheetForm);
    try {
      if (s.isNew) {
        const pwd = await askPassword({
          title: 'Задай пароль',
          desc: 'Этим паролем ты потом сможешь редактировать персонажа. Запомни его.',
        });
        if (pwd === null) return;
        if (!pwd) return showError(sheetError, 'Пароль не может быть пустым.');
        const editorHash = await sha256Hex(pwd);
        const created = await api.createCharacter(state.campaignId, editorHash, data);
        rememberOwner(state.campaignId, created.id, editorHash);
        state.sel = { type: 'char', charId: created.id, isNew: false, mode: 'view', editorHash };
      } else {
        await api.updateCharacter(state.campaignId, s.charId, s.editorHash, data);
        rememberOwner(state.campaignId, s.charId, s.editorHash);
        s.mode = 'view';
      }
      await refresh();
      const ch = state.characters[state.sel.charId];
      if (ch) sys.renderSheet(sheetForm, ch.data, { editable: false });
      setMode();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        if (!s.isNew) { forgetOwner(state.campaignId, s.charId); s.editorHash = null; }
        s.mode = 'view';
        setMode();
        return showError(sheetError, 'Неверный пароль — это не твой персонаж.');
      }
      showError(sheetError, err.message || 'Не удалось сохранить.');
    }
  }

  async function saveBoard() {
    const s = state.sel;
    const board = readBoard(sheetForm);
    try {
      await api.updateBoard(state.campaignId, s.gmHash, board);
      rememberGm(state.campaignId, s.gmHash);
      s.mode = 'view';
      await refresh();
      renderBoard(sheetForm, state.board, false);
      setMode();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        forgetGm(state.campaignId);
        s.gmHash = null;
        s.mode = 'view';
        setMode();
        return showError(sheetError, 'Неверный пароль ГМ — журнал не сохранён.');
      }
      showError(sheetError, err.message || 'Не удалось сохранить журнал.');
    }
  }

  async function deleteCharacter() {
    const s = state.sel;
    if (s.type !== 'char' || s.isNew || !s.editorHash) return;
    if (!confirm('Удалить этого персонажа? Действие необратимо.')) return;
    try {
      await api.deleteCharacter(state.campaignId, s.charId, s.editorHash);
      forgetOwner(state.campaignId, s.charId);
      clearSelection();
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        return showError(sheetError, 'Неверный пароль — удалить нельзя.');
      }
      showError(sheetError, err.message || 'Не удалось удалить.');
    }
  }

  // ======================================================================= //
  //  Campaign journal renderer (system-agnostic)
  // ======================================================================= //
  function renderBoard(form, board, editable) {
    form.innerHTML = '';
    const dis = !editable;
    const b = board || {};
    const quests = Array.isArray(b.quests) ? b.quests : [];

    // Notes
    const notes = el('textarea', { class: 'board-notes', name: 'board_notes', rows: '8', placeholder: 'Общие заметки, лор, зацепки…' });
    notes.value = b.notes || '';
    notes.disabled = dis;
    form.append(sectionEl('Заметки', el('div', {}, [notes])));

    // Quests
    const rows = el('div', { class: 'sf-rows', 'data-list': 'quests' });
    const addQuest = (q = {}) => {
      const row = el('div', { class: 'sf-row quest-row' });
      const done = el('input', { type: 'checkbox', class: 'quest-done' });
      done.checked = !!q.done;
      done.disabled = dis;
      const text = el('input', { type: 'text', class: 'grow', name: 'quest_text', placeholder: 'Квест / задача' });
      text.value = q.text || '';
      text.disabled = dis;
      row.append(done, text);
      if (!dis) {
        const rm = el('button', { type: 'button', class: 'btn ghost row-del', text: '×', title: 'Удалить' });
        rm.addEventListener('click', () => row.remove());
        row.append(rm);
      }
      rows.append(row);
    };
    quests.forEach(addQuest);
    const questSec = sectionEl('Квесты', rows);
    if (!dis) {
      const add = el('button', { type: 'button', class: 'btn ghost add-row', text: '+ квест' });
      add.addEventListener('click', () => addQuest());
      questSec.append(add);
    }
    form.append(questSec);
  }

  function readBoard(form) {
    const notes = form.querySelector('[name="board_notes"]')?.value || '';
    const quests = [...form.querySelectorAll('.quest-row')].map((row) => ({
      text: row.querySelector('[name="quest_text"]').value,
      done: row.querySelector('.quest-done').checked,
    })).filter((q) => q.text.trim() !== '');
    return { notes, quests };
  }

  // ======================================================================= //
  //  Dice (local only) — tray + in-sheet rolls
  // ======================================================================= //
  const DICE = [4, 6, 8, 10, 12, 20, 100];
  const diceTray = $('dice-tray');
  for (const sides of DICE) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'die-btn';
    b.textContent = `d${sides}`;
    b.title = `Бросить d${sides}`;
    b.addEventListener('click', () => rollAndShow(sides));
    diceTray.append(b);
  }
  document.addEventListener('sd-roll', (e) => {
    const d = e.detail;
    if (d.explode) {
      const c = rollD10Check();
      const base = Number(d.base) || 0;
      showRoll({ label: d.label, sides: 10, die: c.first, extra: c.extra, sign: c.sign, crit: c.crit, mod: base, total: c.dieTotal + base });
    } else {
      const die = rollDie(d.sides);
      showRoll({ label: d.label, sides: d.sides, die, mod: d.mod, total: die + (Number(d.mod) || 0) });
    }
  });

  // ======================================================================= //
  //  Password dialog (promise-based)
  // ======================================================================= //
  const pwdOverlay = $('pwd-overlay');
  const pwdInput = $('pwd-input');
  const pwdError = $('pwd-error');
  let pwdResolve = null;

  function askPassword({ title, desc, error }) {
    $('pwd-title').textContent = title;
    $('pwd-desc').textContent = desc || '';
    pwdInput.value = '';
    pwdError.textContent = error || '';
    pwdError.hidden = !error;
    pwdOverlay.hidden = false;
    setTimeout(() => pwdInput.focus(), 50);
    return new Promise((resolve) => { pwdResolve = resolve; });
  }
  function closePassword(value) {
    pwdOverlay.hidden = true;
    const r = pwdResolve;
    pwdResolve = null;
    if (r) r(value);
  }
  $('pwd-ok').addEventListener('click', () => closePassword(pwdInput.value));
  $('pwd-cancel').addEventListener('click', () => closePassword(null));
  pwdInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') closePassword(pwdInput.value);
    if (e.key === 'Escape') closePassword(null);
  });

  // ---- helpers ----------------------------------------------------------- //
  function showError(node, msg) { node.textContent = msg; node.hidden = false; }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }
  const escapeAttr = escapeHtml;
  function el(tag, attrs = {}, kids = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'text') node.textContent = v;
      else node.setAttribute(k, v);
    }
    for (const kid of [].concat(kids)) node.append(kid);
    return node;
  }
  function sectionEl(title, body) {
    return el('section', { class: 'sf-section' }, [
      el('div', { class: 'sf-section-head' }, [el('h3', { text: title })]),
      body,
    ]);
  }

  // ---- boot -------------------------------------------------------------- //
  const last = localStorage.getItem(LS_LAST);
  if (last) {
    campaignInput.value = last;
    enterCampaign(last).catch(() => {
      screenBoard.hidden = true;
      screenCampaign.hidden = false;
    });
  }
}
