// Cyberpunk RED character sheet: data model, rendering and serialization.
// Same contract as the Shadowdark module (id, defaultSheet, normalize,
// renderSheet, read, summary) so the shared controller can drive it.

export const id = 'cyberpunk_red';

// --- STATS ---------------------------------------------------------------- //
const STATS = [
  ['int', 'INT'], ['ref', 'REF'], ['dex', 'DEX'], ['tech', 'TECH'], ['cool', 'COOL'],
  ['will', 'WILL'], ['luck', 'LUCK'], ['move', 'MOVE'], ['body', 'BODY'], ['emp', 'EMP'],
];

// --- SKILLS: [category, [ [name, statKey, hasSpec], ... ] ] ---------------- //
// English skill names (universal among CP:RED players); Russian category labels.
const SKILLS = [
  ['Внимание (Awareness)', [
    ['Concentration', 'will'], ['Conceal/Reveal Object', 'int'], ['Lip Reading', 'int'],
    ['Perception', 'int'], ['Tracking', 'int'],
  ]],
  ['Тело (Body)', [
    ['Athletics', 'dex'], ['Contortionist', 'dex'], ['Dance', 'dex'], ['Endurance', 'will'],
    ['Resist Torture/Drugs', 'will'], ['Stealth', 'dex'],
  ]],
  ['Техника (Technique)', [
    ['Air Vehicle Tech', 'tech'], ['Basic Tech', 'tech'], ['Cybertech', 'tech'], ['Demolitions', 'tech'],
    ['Electronics/Security Tech', 'tech'], ['First Aid', 'tech'], ['Forgery', 'tech'],
    ['Land Vehicle Tech', 'tech'], ['Paint/Draw/Sculpt', 'tech'], ['Paramedic', 'tech'],
    ['Photography/Film', 'tech'], ['Pick Lock', 'tech'], ['Pick Pocket', 'tech'],
    ['Sea Vehicle Tech', 'tech'], ['Weaponstech', 'tech'],
  ]],
  ['Образование (Education)', [
    ['Accounting', 'int'], ['Animal Handling', 'int'], ['Bureaucracy', 'int'], ['Business', 'int'],
    ['Composition', 'int'], ['Criminology', 'int'], ['Cryptography', 'int'], ['Deduction', 'int'],
    ['Education', 'int'], ['Gamble', 'int'], ['Language', 'int', true], ['Library Search', 'int'],
    ['Local Expert', 'int', true], ['Science', 'int', true], ['Tactics', 'int'],
    ['Wilderness Survival', 'int'],
  ]],
  ['Ближний бой (Fighting)', [
    ['Brawling', 'dex'], ['Evasion', 'dex'], ['Martial Arts', 'dex', true], ['Melee Weapon', 'dex'],
  ]],
  ['Перформанс (Performance)', [
    ['Acting', 'cool'], ['Play Instrument', 'tech', true],
  ]],
  ['Стрельба (Ranged Weapon)', [
    ['Archery', 'ref'], ['Autofire', 'ref'], ['Handgun', 'ref'], ['Heavy Weapons', 'ref'],
    ['Shoulder Arms', 'ref'],
  ]],
  ['Социальные (Social)', [
    ['Bribery', 'cool'], ['Conversation', 'emp'], ['Human Perception', 'emp'], ['Interrogation', 'cool'],
    ['Persuasion', 'cool'], ['Personal Grooming', 'cool'], ['Streetwise', 'cool'], ['Trading', 'cool'],
    ['Wardrobe & Style', 'cool'],
  ]],
  ['Управление (Control)', [
    ['Drive Land Vehicle', 'ref'], ['Pilot Air Vehicle', 'ref'], ['Pilot Sea Vehicle', 'ref'],
    ['Riding', 'ref'],
  ]],
];

// Skills that cost double IP to raise (CP:RED) — shown with an (x2) tag.
const DOUBLE_IP_SKILLS = new Set([
  'Autofire', 'Demolitions', 'Electronics/Security Tech', 'Heavy Weapons',
  'Martial Arts', 'Paramedic', 'Pilot Air Vehicle',
]);

// Russian labels shown as hover tooltips on the original English names.
const STAT_RU = {
  int: 'Интеллект', ref: 'Реакция', dex: 'Ловкость', tech: 'Техника', cool: 'Хладнокровие',
  will: 'Воля', luck: 'Удача', move: 'Скорость', body: 'Телосложение', emp: 'Эмпатия',
};

const SKILL_RU = {
  // Awareness
  'Concentration': 'Концентрация',
  'Conceal/Reveal Object': 'Скрыть/обнаружить предмет',
  'Lip Reading': 'Чтение по губам',
  'Perception': 'Восприятие',
  'Tracking': 'Выслеживание',
  // Body
  'Athletics': 'Атлетика',
  'Contortionist': 'Гибкость',
  'Dance': 'Танцы',
  'Endurance': 'Выносливость',
  'Resist Torture/Drugs': 'Сопротивление пыткам/наркотикам',
  'Stealth': 'Скрытность',
  // Technique
  'Air Vehicle Tech': 'Техобслуживание (авиа)',
  'Basic Tech': 'Базовые технологии',
  'Cybertech': 'Кибертех',
  'Demolitions': 'Подрывное дело',
  'Electronics/Security Tech': 'Электроника/безопасность',
  'First Aid': 'Первая помощь',
  'Forgery': 'Подделка',
  'Land Vehicle Tech': 'Техобслуживание (наземн.)',
  'Paint/Draw/Sculpt': 'Живопись/рисование',
  'Paramedic': 'Парамедицина',
  'Photography/Film': 'Фото/кино',
  'Pick Lock': 'Взлом замков',
  'Pick Pocket': 'Карманная кража',
  'Sea Vehicle Tech': 'Техобслуживание (морск.)',
  'Weaponstech': 'Оружейное дело',
  // Education
  'Accounting': 'Бухгалтерия',
  'Animal Handling': 'Обращение с животными',
  'Bureaucracy': 'Бюрократия',
  'Business': 'Бизнес',
  'Composition': 'Композиция',
  'Criminology': 'Криминология',
  'Cryptography': 'Криптография',
  'Deduction': 'Дедукция',
  'Education': 'Образование',
  'Gamble': 'Азартные игры',
  'Language': 'Язык',
  'Library Search': 'Поиск в архивах',
  'Local Expert': 'Знание местности',
  'Science': 'Наука',
  'Tactics': 'Тактика',
  'Wilderness Survival': 'Выживание в дикой природе',
  // Fighting
  'Brawling': 'Драка',
  'Evasion': 'Уклонение',
  'Martial Arts': 'Боевые искусства',
  'Melee Weapon': 'Холодное оружие',
  // Performance
  'Acting': 'Актёрское мастерство',
  'Play Instrument': 'Игра на инструменте',
  // Ranged Weapon
  'Archery': 'Стрельба из лука',
  'Autofire': 'Автоматический огонь',
  'Handgun': 'Пистолеты',
  'Heavy Weapons': 'Тяжёлое оружие',
  'Shoulder Arms': 'Длинноствольное оружие',
  // Social
  'Bribery': 'Подкуп',
  'Conversation': 'Общение',
  'Human Perception': 'Проницательность',
  'Interrogation': 'Допрос',
  'Persuasion': 'Убеждение',
  'Personal Grooming': 'Уход за собой',
  'Streetwise': 'Знание улиц',
  'Trading': 'Торговля',
  'Wardrobe & Style': 'Гардероб и стиль',
  // Control
  'Drive Land Vehicle': 'Вождение (наземн.)',
  'Pilot Air Vehicle': 'Пилотирование (авиа)',
  'Pilot Sea Vehicle': 'Пилотирование (морск.)',
  'Riding': 'Верховая езда',
};

// Skills every new character starts with at level 2.
const STARTING_SKILLS = [
  'Athletics', 'Brawling', 'Concentration', 'Conversation', 'Evasion', 'First Aid',
  'Human Perception', 'Language', 'Local Expert', 'Perception', 'Persuasion', 'Stealth',
];

export function defaultSheet() {
  return {
    handle: '',
    portrait: '',
    role: '',
    roleAbility: '',
    roleRank: 0,
    // lifepath
    culturalOrigin: '',
    personality: '',
    clothingStyle: '',
    hairstyle: '',
    affectation: '',
    valueMost: '',
    background: '',
    stats: {
      int: 2, ref: 2, dex: 2, tech: 2, cool: 2, will: 2,
      luck: { current: 2, max: 2 }, move: 2, body: 2, emp: { current: 2, max: 2 },
    },
    hp: { current: 0 },
    humanity: { current: 0 },
    skills: Object.fromEntries(STARTING_SKILLS.map((name) => [name, { level: 2, spec: '' }])), // name -> { level, spec }
    weapons: [],
    armor: { headSP: 0, bodySP: 0, shieldSP: 0, headPenalty: 0, bodyPenalty: 0, shieldPenalty: 0 },
    cyberware: [],
    gear: [],
    money: { eurodollars: 0, ip: 0, rep: 0 },
    critinjuries: [],
    notes: '',
  };
}

export function normalize(data) {
  const d = defaultSheet();
  const src = data || {};
  const srcStats = src.stats || {};
  const rawEmp = srcStats.emp;
  const emp = typeof rawEmp === 'object' && rawEmp !== null
    ? { ...d.stats.emp, ...rawEmp }
    : { current: Number(rawEmp) || d.stats.emp.current, max: Number(rawEmp) || d.stats.emp.max };
  return {
    ...d,
    ...src,
    stats: {
      ...d.stats,
      ...srcStats,
      luck: { ...d.stats.luck, ...(srcStats.luck || {}) },
      emp,
    },
    hp: { ...d.hp, ...(src.hp || {}) },
    humanity: { ...d.humanity, ...(src.humanity || {}) },
    armor: { ...d.armor, ...(src.armor || {}) },
    money: { ...d.money, ...(src.money || {}) },
    skills: src.skills && typeof src.skills === 'object' ? src.skills : {},
    weapons: Array.isArray(src.weapons) ? src.weapons : [],
    cyberware: Array.isArray(src.cyberware) ? src.cyberware : [],
    gear: Array.isArray(src.gear) ? src.gear : [],
    critinjuries: Array.isArray(src.critinjuries) ? src.critinjuries : [],
  };
}

export function summary(data) {
  const d = data.stats ? data : normalize(data);
  const sub = [d.role, d.roleRank ? `ранг ${d.roleRank}` : ''].filter(Boolean).join(' · ') || '—';
  return { name: d.handle, portrait: d.portrait, sub };
}

// --- derived stats -------------------------------------------------------- //
const num = (v) => Number(v) || 0;
function hpMax(body, will) { return 10 + 5 * Math.ceil((num(body) + num(will)) / 2); }

// ========================================================================= //
//  Rendering
// ========================================================================= //
export function renderSheet(form, data, { editable } = {}) {
  const sheet = normalize(data);
  const dis = !editable;
  form.innerHTML = '';

  // refs gathered for live recompute
  const statInputs = {}; // key -> input (number)
  const skillRows = []; // { statKey, levelInput, totalEl }
  const derived = {}; // hpMax, swt, deathSave, humMax elements
  let cyberRows; // container to sum HL

  // ---- identity + portrait ---- //
  const portraitImg = el('img', { class: 'portrait-img', alt: '' });
  const portraitBox = el('div', { class: 'portrait-box' }, [portraitImg]);
  const setPortrait = (url) => {
    if (url) { portraitImg.src = url; portraitBox.classList.remove('empty'); }
    else { portraitImg.removeAttribute('src'); portraitBox.classList.add('empty'); }
  };
  portraitImg.addEventListener('error', () => portraitBox.classList.add('empty'));
  setPortrait(sheet.portrait);

  const idFields = el('div', { class: 'sf-grid sf-identity' }, [
    fieldBlock('Handle', input('handle', sheet.handle, { disabled: dis, placeholder: 'позывной' }), 'wide'),
    fieldBlock('Роль (Role)', input('role', sheet.role, { disabled: dis })),
    fieldBlock('Способность роли', input('roleAbility', sheet.roleAbility, { disabled: dis })),
    fieldBlock('Ранг', input('roleRank', sheet.roleRank, { type: 'number', min: 0, max: 10, disabled: dis })),
  ]);
  if (!dis) {
    const urlInput = input('portrait', sheet.portrait, { disabled: dis, placeholder: 'https://…' });
    urlInput.addEventListener('input', () => setPortrait(urlInput.value.trim()));
    idFields.append(fieldBlock('Портрет (URL)', urlInput, 'wide'));
  }
  form.append(section('Персонаж', el('div', { class: 'sf-identity-row' }, [portraitBox, idFields])));

  // ---- stats ---- //
  const statRow = el('div', { class: 'cp-stats' });
  for (const [key, label] of STATS) {
    let ctrl;
    if (key === 'luck' || key === 'emp') {
      const cur = input(`stat_${key}_current`, sheet.stats[key].current, { type: 'number', min: 0, disabled: dis, class: 'stat-score' });
      const max = input(`stat_${key}_max`, sheet.stats[key].max, { type: 'number', min: 0, disabled: dis, class: 'stat-score' });
      cur.addEventListener('input', recompute);
      max.addEventListener('input', recompute);
      ctrl = el('div', { class: 'luck-pair' }, [cur, el('span', { class: 'slash', text: '/' }), max]);
      statInputs[key] = cur;
      statInputs[`${key}Max`] = max;
    } else {
      const inp = input(`stat_${key}`, sheet.stats[key], { type: 'number', min: 0, max: 30, disabled: dis, class: 'stat-score' });
      inp.addEventListener('input', recompute);
      statInputs[key] = inp;
      ctrl = inp;
    }
    statRow.append(el('div', { class: 'stat-box' }, [el('div', { class: 'stat-name', text: label, title: STAT_RU[key] || '' }), ctrl]));
  }
  form.append(section('Характеристики', statRow));

  // ---- derived ---- //
  const mk = (label, key, hint) => {
    const v = el('div', { class: 'der-val', text: '—' });
    derived[key] = v;
    return el('div', { class: 'der-box' }, [el('div', { class: 'der-name', text: label }), v, hint ? el('div', { class: 'der-hint', text: hint }) : '']);
  };
  const hpCur = input('hp_current', sheet.hp.current, { type: 'number', disabled: dis, class: 'stat-score' });
  const humCur = input('humanity_current', sheet.humanity.current, { type: 'number', disabled: dis, class: 'stat-score' });
  const humMaxEl = el('span', { class: 'stat-score', text: '—' });
  derived.humMax = humMaxEl;
  const derRow = el('div', { class: 'cp-derived' }, [
    el('div', { class: 'der-box' }, [el('div', { class: 'der-name', text: 'HP тек.' }), hpCur]),
    mk('HP макс.', 'hpMax'),
    mk('Тяж. ранен', 'swt', 'seriously wounded'),
    mk('Спасбросок', 'deathSave'),
    el('div', { class: 'der-box' }, [
      el('div', { class: 'der-name', text: 'Humanity' }),
      el('div', { class: 'luck-pair der-pair' }, [humCur, el('span', { class: 'slash', text: '/' }), humMaxEl]),
    ]),
  ]);
  form.append(section('Производные', derRow));

  // ---- skills ---- //
  const skillsWrap = el('div', { class: 'cp-skill-cats' });
  for (const [cat, items] of SKILLS) {
    const grid = el('div', { class: 'cp-skill-grid' });
    let visible = 0;
    for (const [name, statKey, hasSpec] of items) {
      const saved = sheet.skills[name] || {};
      if (!editable && !(saved.level > 0)) continue;
      visible++;
      const row = el('div', { class: 'cp-skill-row', 'data-skill': name });
      const totalEl = el('button', { type: 'button', class: 'cp-skill-total rollable', text: '—', title: `Бросок: ${name}` });
      const lvl = input('skill_level', saved.level ?? 0, { type: 'number', min: 0, max: 10, disabled: dis, class: 'cp-skill-lvl' });
      lvl.addEventListener('input', recompute);
      const nameWrap = el('div', { class: 'cp-skill-name' }, [
        el('span', { class: 'cp-skill-label', text: DOUBLE_IP_SKILLS.has(name) ? `${name} (x2)` : name, title: SKILL_RU[name] || name }),
        el('span', { class: 'cp-skill-stat', text: statKey.toUpperCase(), title: STAT_RU[statKey] || '' }),
      ]);
      if (hasSpec) {
        const spec = input('skill_spec', saved.spec || '', { disabled: dis, placeholder: '×спец.', class: 'cp-skill-spec' });
        nameWrap.append(spec);
      }
      const rec = { statKey, levelInput: lvl, totalEl };
      totalEl.addEventListener('click', () => {
        const base = num(statInputs[statKey]?.value) + num(lvl.value);
        emitRoll(form, { label: `${name}`, explode: true, base });
      });
      skillRows.push(rec);
      row.append(nameWrap, totalEl, lvl);
      grid.append(row);
    }
    if (!editable && visible === 0) continue;
    skillsWrap.append(el('div', { class: 'cp-skill-cat' }, [el('h4', { class: 'cp-skill-cat-head', text: cat }), grid]));
  }
  const skillsSec = section('Навыки', skillsWrap);
  if (editable || skillsWrap.childElementCount > 0) form.append(skillsSec);

  // ---- combat: weapons ---- //
  const weaponsSec = dynamicList(form, 'Оружие', 'weapons', sheet.weapons, dis, [
    { key: 'name', label: 'Оружие', cls: 'grow' },
    { key: 'damage', label: 'Урон', cls: 'narrow' },
    { key: 'rof', label: 'ROF', cls: 'tiny' },
    { key: 'ammo', label: 'Патроны', cls: 'narrow' },
    { key: 'bonus', label: 'Навык', cls: 'tiny' },
  ], { roll: { modKey: 'bonus', labelKey: 'name' } });
  if (editable || sheet.weapons.length) form.append(weaponsSec);

  // ---- armor ---- //
  const armorCol = (label, spName, spVal, penName, penVal) =>
    el('div', { class: 'cp-armor-col' }, [
      fieldBlock(label, input(spName, spVal, { type: 'number', min: 0, disabled: dis })),
      input(penName, penVal, { type: 'text', disabled: dis, placeholder: 'Заметка' }),
    ]);
  const armorGrid = el('div', { class: 'cp-armor' }, [
    armorCol('Head SP', 'armor_headSP', sheet.armor.headSP, 'armor_headPenalty', sheet.armor.headPenalty),
    armorCol('Body SP', 'armor_bodySP', sheet.armor.bodySP, 'armor_bodyPenalty', sheet.armor.bodyPenalty),
    armorCol('Shield SP', 'armor_shieldSP', sheet.armor.shieldSP, 'armor_shieldPenalty', sheet.armor.shieldPenalty),
  ]);
  form.append(section('Броня', armorGrid));

  // ---- cyberware ---- //
  const cyberSec = dynamicList(form, 'Киберимпланты', 'cyberware', sheet.cyberware, dis, [
    { key: 'name', label: 'Имплант', cls: 'grow' },
    { key: 'location', label: 'Локация', cls: 'narrow' },
    { key: 'hl', label: 'HL', cls: 'tiny', type: 'number' },
    { key: 'notes', label: 'Заметки', cls: 'grow' },
  ]);
  cyberRows = cyberSec.querySelector('.sf-rows');
  cyberRows.addEventListener('input', recompute);
  if (editable || sheet.cyberware.length) form.append(cyberSec);

  // ---- gear / money / crit / notes ---- //
  const gearSec = dynamicList(form, 'Снаряжение', 'gear', sheet.gear, dis, [
    { key: 'item', label: 'Предмет', cls: 'grow' },
    { key: 'qty', label: 'Кол-во', cls: 'tiny', type: 'number' },
    { key: 'notes', label: 'Заметки', cls: 'grow' },
  ]);
  if (editable || sheet.gear.length) form.append(gearSec);

  const moneyGrid = el('div', { class: 'sf-grid' }, [
    fieldBlock('Eurodollars (€$)', input('money_eurodollars', sheet.money.eurodollars, { type: 'number', min: 0, disabled: dis })),
    fieldBlock('Improvement Points', input('money_ip', sheet.money.ip, { type: 'number', min: 0, disabled: dis })),
    fieldBlock('Reputation', input('money_rep', sheet.money.rep, { type: 'number', min: 0, disabled: dis })),
  ]);
  form.append(section('Деньги и репутация', moneyGrid));

  const critSec = dynamicList(form, 'Критические ранения', 'critinjuries', sheet.critinjuries, dis, [
    { key: 'text', label: 'Ранение', cls: 'grow' },
  ]);
  if (editable || sheet.critinjuries.length) form.append(critSec);

  const lifepath = el('div', { class: 'sf-grid' }, [
    fieldBlock('Cultural Origin', input('culturalOrigin', sheet.culturalOrigin, { disabled: dis })),
    fieldBlock('Personality', input('personality', sheet.personality, { disabled: dis })),
    fieldBlock('Clothing Style', input('clothingStyle', sheet.clothingStyle, { disabled: dis })),
    fieldBlock('Hairstyle', input('hairstyle', sheet.hairstyle, { disabled: dis })),
    fieldBlock('Affectation', input('affectation', sheet.affectation, { disabled: dis })),
    fieldBlock('Most Valued', input('valueMost', sheet.valueMost, { disabled: dis })),
  ]);
  form.append(section('Жизненный путь', lifepath));

  const notes = el('textarea', { class: 'board-notes', name: 'notes', rows: '5', placeholder: 'Заметки…' });
  notes.value = sheet.notes || '';
  notes.disabled = dis;
  form.append(section('Заметки', el('div', {}, [notes])));

  recompute();

  function recompute() {
    const body = statInputs.body?.value, will = statInputs.will?.value, empMax = num(statInputs.empMax?.value);
    const max = hpMax(body, will);
    if (derived.hpMax) derived.hpMax.textContent = max;
    if (derived.swt) derived.swt.textContent = Math.floor(max / 2);
    if (derived.deathSave) derived.deathSave.textContent = num(body);
    let hl = 0;
    if (cyberRows) for (const i of cyberRows.querySelectorAll('[name="hl_row"]')) hl += num(i.value);
    if (derived.humMax) derived.humMax.textContent = Math.max(0, empMax * 10 - hl);
    for (const r of skillRows) {
      r.totalEl.textContent = num(statInputs[r.statKey]?.value) + num(r.levelInput.value);
    }
  }
}

// ========================================================================= //
//  Serialization
// ========================================================================= //
export function read(form) {
  const v = (name) => form.querySelector(`[name="${name}"]`)?.value ?? '';
  const n = (name) => Number(v(name)) || 0;

  const skills = {};
  for (const row of form.querySelectorAll('.cp-skill-row')) {
    const name = row.getAttribute('data-skill');
    const level = Number(row.querySelector('[name="skill_level"]').value) || 0;
    const spec = row.querySelector('[name="skill_spec"]')?.value || '';
    if (level > 0 || spec) skills[name] = { level, spec };
  }

  const rows = (list, cols) =>
    [...form.querySelectorAll(`[data-list="${list}"] .sf-row`)].map((row) => {
      const inputs = row.querySelectorAll('input');
      const o = {};
      cols.forEach((c, i) => { o[c] = inputs[i] ? inputs[i].value : ''; });
      return o;
    }).filter((o) => Object.values(o).some((x) => String(x).trim() !== ''));

  return {
    handle: v('handle'),
    portrait: v('portrait'),
    role: v('role'),
    roleAbility: v('roleAbility'),
    roleRank: n('roleRank'),
    culturalOrigin: v('culturalOrigin'),
    personality: v('personality'),
    clothingStyle: v('clothingStyle'),
    hairstyle: v('hairstyle'),
    affectation: v('affectation'),
    valueMost: v('valueMost'),
    background: v('background'),
    stats: {
      int: n('stat_int'), ref: n('stat_ref'), dex: n('stat_dex'), tech: n('stat_tech'),
      cool: n('stat_cool'), will: n('stat_will'),
      luck: { current: n('stat_luck_current'), max: n('stat_luck_max') },
      move: n('stat_move'), body: n('stat_body'),
      emp: { current: n('stat_emp_current'), max: n('stat_emp_max') },
    },
    hp: { current: n('hp_current') },
    humanity: { current: n('humanity_current') },
    skills,
    weapons: rows('weapons', ['name', 'damage', 'rof', 'ammo', 'bonus']),
    armor: {
      headSP: n('armor_headSP'), bodySP: n('armor_bodySP'), shieldSP: n('armor_shieldSP'),
      headPenalty: v('armor_headPenalty'), bodyPenalty: v('armor_bodyPenalty'), shieldPenalty: v('armor_shieldPenalty'),
    },
    cyberware: rows('cyberware', ['name', 'location', 'hl', 'notes']),
    gear: rows('gear', ['item', 'qty', 'notes']),
    money: { eurodollars: n('money_eurodollars'), ip: n('money_ip'), rep: n('money_rep') },
    critinjuries: rows('critinjuries', ['text']),
    notes: v('notes'),
  };
}

// ========================================================================= //
//  DOM helpers (local to this module)
// ========================================================================= //
function el(tag, attrs = {}, kids = []) {
  const node = document.createElement(tag);
  for (const [k, val] of Object.entries(attrs)) {
    if (k === 'text') node.textContent = val;
    else if (val !== '' && val != null) node.setAttribute(k, val);
  }
  for (const kid of [].concat(kids)) if (kid) node.append(kid);
  return node;
}

function input(name, value, opts = {}) {
  const node = el('input', { type: opts.type || 'text', name, class: opts.class || '', placeholder: opts.placeholder || '' });
  if (opts.min != null) node.min = opts.min;
  if (opts.max != null) node.max = opts.max;
  node.value = value ?? '';
  node.disabled = !!opts.disabled;
  return node;
}

function fieldBlock(label, control, cls = '') {
  return el('label', { class: `sf-field ${cls}` }, [el('span', { class: 'sf-label', text: label }), control]);
}

function section(title, body) {
  return el('section', { class: 'sf-section' }, [
    el('div', { class: 'sf-section-head' }, [el('h3', { text: title })]),
    body,
  ]);
}

function emitRoll(form, detail) {
  form.dispatchEvent(new CustomEvent('sd-roll', { detail, bubbles: true }));
}

function dynamicList(form, heading, name, rows, disabled, cols, opts = {}) {
  const container = el('div', { class: 'sf-rows', 'data-list': name });
  const sec = section(heading, container);

  const addRow = (values = {}) => {
    const row = el('div', { class: 'sf-row' });
    const byKey = {};
    for (const col of cols) {
      const ctrl = input(`${col.key}_row`, values[col.key] ?? '', {
        type: col.type || 'text', disabled, placeholder: col.label, class: col.cls,
      });
      byKey[col.key] = ctrl;
      row.append(ctrl);
    }
    if (opts.roll) {
      const roll = el('button', { type: 'button', class: 'btn ghost row-roll', text: '🎲', title: 'Бросок d10' });
      roll.addEventListener('click', () => {
        emitRoll(form, { label: `${byKey[opts.roll.labelKey]?.value || heading} (атака)`, explode: true, base: Number(byKey[opts.roll.modKey]?.value) || 0 });
      });
      row.append(roll);
    }
    if (!disabled) {
      const rm = el('button', { type: 'button', class: 'btn ghost row-del', text: '×', title: 'Удалить строку' });
      rm.addEventListener('click', () => { row.remove(); });
      row.append(rm);
    }
    container.append(row);
  };

  (rows || []).forEach(addRow);
  if (!disabled) {
    const add = el('button', { type: 'button', class: 'btn ghost add-row', text: `+ ${heading.toLowerCase()}` });
    add.addEventListener('click', () => addRow());
    sec.append(add);
  }
  return sec;
}
