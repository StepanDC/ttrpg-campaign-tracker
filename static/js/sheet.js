// Shadowdark character sheet: data model, rendering and serialization.
// One render path builds form inputs; in view mode every control is disabled,
// in edit mode they are live. read() serializes the form back into a data object.

const STATS = [
  ['str', 'СИЛ'],
  ['dex', 'ЛОВ'],
  ['con', 'ВЫН'],
  ['int', 'ИНТ'],
  ['wis', 'МДР'],
  ['cha', 'ХАР'],
];

export function defaultSheet() {
  return {
    name: '',
    portrait: '',
    ancestry: '',
    charClass: '',
    level: 1,
    title: '',
    alignment: '',
    background: '',
    deity: '',
    stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    hp: { current: 0, max: 0 },
    ac: 10,
    hitDie: 'd6',
    attacks: [],
    talents: '',
    spells: [],
    inventory: [],
    coins: { gp: 0, sp: 0, cp: 0 },
    xp: 0,
    notes: '',
  };
}

// Merge stored data over defaults so older/partial sheets still render.
export function normalize(data) {
  const d = defaultSheet();
  const src = data || {};
  return {
    ...d,
    ...src,
    stats: { ...d.stats, ...(src.stats || {}) },
    hp: { ...d.hp, ...(src.hp || {}) },
    coins: { ...d.coins, ...(src.coins || {}) },
    attacks: Array.isArray(src.attacks) ? src.attacks : [],
    spells: Array.isArray(src.spells) ? src.spells : [],
    inventory: Array.isArray(src.inventory) ? src.inventory : [],
  };
}

// System identity + left-list summary, consumed by the shared controller.
export const id = 'shadowdark';

export function summary(d) {
  const sub = [d.ancestry, d.charClass].filter(Boolean).join(' · ') || '—';
  return { name: d.name, portrait: d.portrait, sub: `${sub} · ур. ${d.level}` };
}

export function abilityMod(score) {
  return Math.floor((Number(score) - 10) / 2);
}

export function fmtMod(mod) {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

// Shadowdark gear slots: capacity = max(STR score, 10); 100 coins fill 1 slot.
export function slotCapacity(sheet) {
  return Math.max(Number(sheet.stats.str) || 0, 10);
}

export function slotsUsed(sheet) {
  const items = sheet.inventory.reduce((sum, it) => sum + (Number(it.slots) || 0), 0);
  const coins = (Number(sheet.coins.gp) || 0) + (Number(sheet.coins.sp) || 0) + (Number(sheet.coins.cp) || 0);
  return items + Math.ceil(coins / 100);
}

// ---- small DOM helpers -------------------------------------------------- //

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (v !== false && v != null) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) if (c) node.append(c);
  return node;
}

function input(name, value, { type = 'text', disabled, ...rest } = {}) {
  return el('input', {
    name,
    type,
    value: value ?? '',
    disabled,
    autocomplete: 'off',
    ...rest,
  });
}

function fieldBlock(label, control, cls = '') {
  return el('label', { class: `sf-field ${cls}` }, [el('span', { class: 'sf-label', text: label }), control]);
}

// Dice rolls stay decoupled from the dice module: the form just emits an event
// that app.js listens for and turns into a toast. Purely local, no backend.
function emitRoll(form, detail) {
  form.dispatchEvent(new CustomEvent('sd-roll', { detail, bubbles: true }));
}

// ---- rendering ---------------------------------------------------------- //

export function renderSheet(form, rawData, { editable }) {
  const sheet = normalize(rawData);
  form.innerHTML = '';
  const dis = !editable;

  // Identity ------------------------------------------------------------- //
  const portraitImg = el('img', { class: 'portrait-img', alt: 'Портрет' });
  const portraitBox = el('div', { class: 'portrait-box' }, [portraitImg]);
  const setPortrait = (url) => {
    if (url) {
      portraitImg.src = url;
      portraitBox.classList.remove('empty');
    } else {
      portraitImg.removeAttribute('src');
      portraitBox.classList.add('empty');
    }
  };
  portraitImg.addEventListener('error', () => portraitBox.classList.add('broken'));
  portraitImg.addEventListener('load', () => portraitBox.classList.remove('broken'));
  setPortrait(sheet.portrait);

  const idFields = el('div', { class: 'sf-grid sf-identity' }, [
    fieldBlock('Имя', input('name', sheet.name, { disabled: dis, placeholder: 'Безымянный' }), 'wide'),
    fieldBlock('Предок', input('ancestry', sheet.ancestry, { disabled: dis })),
    fieldBlock('Класс', input('charClass', sheet.charClass, { disabled: dis })),
    fieldBlock('Уровень', input('level', sheet.level, { type: 'number', min: 0, disabled: dis })),
    fieldBlock('Титул', input('title', sheet.title, { disabled: dis })),
    fieldBlock('Мировоззрение', input('alignment', sheet.alignment, { disabled: dis })),
    fieldBlock('Происхождение', input('background', sheet.background, { disabled: dis })),
    fieldBlock('Божество', input('deity', sheet.deity, { disabled: dis })),
  ]);
  if (!dis) {
    const urlInput = input('portrait', sheet.portrait, { disabled: dis, placeholder: 'https://…' });
    urlInput.addEventListener('input', () => setPortrait(urlInput.value.trim()));
    idFields.append(fieldBlock('Портрет (URL)', urlInput, 'wide'));
  }
  form.append(section('Персонаж', el('div', { class: 'sf-identity-row' }, [portraitBox, idFields])));

  // Stats ---------------------------------------------------------------- //
  const statRow = el('div', { class: 'sf-stats' });
  for (const [key, label] of STATS) {
    const score = sheet.stats[key];
    const scoreInput = input(`stat_${key}`, score, { type: 'number', min: 0, max: 30, disabled: dis, class: 'stat-score' });
    // The modifier doubles as a d20 roll button (always available, even in view mode).
    const modBadge = el('button', {
      type: 'button',
      class: 'stat-mod rollable',
      text: fmtMod(abilityMod(score)),
      title: `Бросить d20 ${label}`,
    });
    modBadge.addEventListener('click', () => {
      emitRoll(form, { label: `${label} d20`, sides: 20, mod: abilityMod(scoreInput.value) });
    });
    scoreInput.addEventListener('input', () => {
      modBadge.textContent = fmtMod(abilityMod(scoreInput.value));
      if (key === 'str') updateSlots(form);
    });
    statRow.append(
      el('div', { class: 'stat-box' }, [
        el('div', { class: 'stat-name', text: label }),
        scoreInput,
        modBadge,
      ]),
    );
  }
  form.append(section('Характеристики', statRow));

  // Combat --------------------------------------------------------------- //
  const combat = el('div', { class: 'sf-grid sf-combat' }, [
    fieldBlock('Хиты (тек.)', input('hp_current', sheet.hp.current, { type: 'number', disabled: dis })),
    fieldBlock('Хиты (макс.)', input('hp_max', sheet.hp.max, { type: 'number', disabled: dis })),
    fieldBlock('КД', input('ac', sheet.ac, { type: 'number', disabled: dis })),
    fieldBlock('Кость хитов', input('hitDie', sheet.hitDie, { disabled: dis, placeholder: 'd6' })),
    fieldBlock('Опыт (XP)', input('xp', sheet.xp, { type: 'number', min: 0, disabled: dis })),
  ]);
  form.append(section('Бой', combat));

  // Attacks (dynamic) ---------------------------------------------------- //
  form.append(
    dynamicList(
      form,
      'Атаки',
      'attacks',
      sheet.attacks,
      dis,
      [
        { key: 'name', label: 'Оружие', cls: 'grow' },
        { key: 'bonus', label: 'Бонус', cls: 'narrow' },
        { key: 'damage', label: 'Урон', cls: 'narrow' },
      ],
      { roll: { modKey: 'bonus', labelKey: 'name' } },
    ),
  );

  // Talents -------------------------------------------------------------- //
  const talents = el('textarea', {
    name: 'talents',
    rows: 4,
    disabled: dis,
    placeholder: 'Таланты, способности класса и предка…',
  });
  talents.value = sheet.talents || '';
  form.append(section('Таланты и способности', talents));

  // Spells (dynamic) ----------------------------------------------------- //
  form.append(
    dynamicList(form, 'Заклинания', 'spells', sheet.spells, dis, [
      { key: 'tier', label: 'Круг', cls: 'narrow' },
      { key: 'name', label: 'Заклинание', cls: 'grow' },
    ]),
  );

  // Inventory (dynamic) + slot meter ------------------------------------- //
  const invSection = dynamicList(form, 'Инвентарь', 'inventory', sheet.inventory, dis, [
    { key: 'name', label: 'Предмет', cls: 'grow' },
    { key: 'slots', label: 'Слоты', cls: 'narrow', type: 'number' },
  ]);
  const slotMeter = el('div', { class: 'slot-meter', id: 'slot-meter' });
  invSection.querySelector('.sf-section-head').append(slotMeter);
  form.append(invSection);

  // Coins ---------------------------------------------------------------- //
  const coins = el('div', { class: 'sf-grid sf-coins' }, [
    fieldBlock('Золото (GP)', input('gp', sheet.coins.gp, { type: 'number', min: 0, disabled: dis })),
    fieldBlock('Серебро (SP)', input('sp', sheet.coins.sp, { type: 'number', min: 0, disabled: dis })),
    fieldBlock('Медь (CP)', input('cp', sheet.coins.cp, { type: 'number', min: 0, disabled: dis })),
  ]);
  form.append(section('Монеты', coins));

  // Notes ---------------------------------------------------------------- //
  const notes = el('textarea', { name: 'notes', rows: 3, disabled: dis, placeholder: 'Заметки…' });
  notes.value = sheet.notes || '';
  form.append(section('Заметки', notes));

  // Re-flow the slot meter whenever anything that affects it could change.
  form.addEventListener('input', () => updateSlots(form));
  updateSlots(form);
}

function section(heading, body) {
  const sec = el('section', { class: 'sf-section' });
  const head = el('div', { class: 'sf-section-head' }, [el('h3', { text: heading })]);
  sec.append(head, body);
  return sec;
}

function dynamicList(form, heading, name, rows, disabled, cols, opts = {}) {
  const sec = section(heading, el('div', { class: 'sf-rows', 'data-list': name }));
  const container = sec.querySelector('.sf-rows');

  const addRow = (values = {}) => {
    const row = el('div', { class: 'sf-row' });
    const byKey = {};
    for (const col of cols) {
      const ctrl = input(`${col.key}_row`, values[col.key] ?? '', {
        type: col.type || 'text',
        disabled,
        placeholder: col.label,
        class: col.cls,
      });
      byKey[col.key] = ctrl;
      row.append(ctrl);
    }
    // Optional d20 roll for the row (e.g. attack to-hit). Always available.
    if (opts.roll) {
      const roll = el('button', { type: 'button', class: 'btn ghost row-roll', text: '🎲', title: 'Бросок d20' });
      roll.addEventListener('click', () => {
        const mod = Number(byKey[opts.roll.modKey]?.value) || 0;
        const labelText = byKey[opts.roll.labelKey]?.value || heading;
        emitRoll(form, { label: `${labelText} (атака)`, sides: 20, mod });
      });
      row.append(roll);
    }
    if (!disabled) {
      const rm = el('button', { type: 'button', class: 'btn ghost row-del', text: '×', title: 'Удалить строку' });
      rm.addEventListener('click', () => {
        row.remove();
        updateSlots(form);
      });
      row.append(rm);
    }
    container.append(row);
  };

  rows.forEach((r) => addRow(r));

  if (!disabled) {
    const add = el('button', { type: 'button', class: 'btn small add-row', text: '+ строка' });
    add.addEventListener('click', () => addRow());
    sec.querySelector('.sf-section-head').append(add);
  }
  // Stash column meta so read() knows how to serialize this list.
  container._cols = cols;
  return sec;
}

function updateSlots(form) {
  const meter = form.querySelector('#slot-meter');
  if (!meter) return;
  const data = read(form);
  const used = slotsUsed(data);
  const cap = slotCapacity(data);
  meter.textContent = `Слоты: ${used} / ${cap}`;
  meter.classList.toggle('over', used > cap);
}

// ---- serialization ------------------------------------------------------ //

export function read(form) {
  const v = (n) => form.querySelector(`[name="${n}"]`)?.value ?? '';
  const num = (n) => Number(v(n)) || 0;

  const lists = {};
  form.querySelectorAll('.sf-rows').forEach((c) => {
    const cols = c._cols || [];
    lists[c.dataset.list] = [...c.querySelectorAll('.sf-row')].map((row) => {
      const inputs = row.querySelectorAll('input');
      const obj = {};
      cols.forEach((col, i) => {
        const raw = inputs[i]?.value ?? '';
        obj[col.key] = col.type === 'number' ? Number(raw) || 0 : raw;
      });
      return obj;
    });
  });

  return {
    name: v('name'),
    portrait: v('portrait'),
    ancestry: v('ancestry'),
    charClass: v('charClass'),
    level: num('level'),
    title: v('title'),
    alignment: v('alignment'),
    background: v('background'),
    deity: v('deity'),
    stats: {
      str: num('stat_str'),
      dex: num('stat_dex'),
      con: num('stat_con'),
      int: num('stat_int'),
      wis: num('stat_wis'),
      cha: num('stat_cha'),
    },
    hp: { current: num('hp_current'), max: num('hp_max') },
    ac: num('ac'),
    hitDie: v('hitDie'),
    attacks: lists.attacks || [],
    talents: v('talents'),
    spells: lists.spells || [],
    inventory: lists.inventory || [],
    coins: { gp: num('gp'), sp: num('sp'), cp: num('cp') },
    xp: num('xp'),
    notes: v('notes'),
  };
}
