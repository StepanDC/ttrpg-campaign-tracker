// Local dice — purely client-side, never touches the backend or other players.

export function rollDie(sides) {
  return 1 + Math.floor(Math.random() * sides);
}

// Roll a d20 with a modifier; returns the breakdown for display.
export function rollD20(mod = 0) {
  const die = rollDie(20);
  return { die, mod: Number(mod) || 0, total: die + (Number(mod) || 0), sides: 20 };
}

// Cyberpunk RED check die: a d10 that "explodes" up on a natural 10 (roll again,
// add) and down on a natural 1 (roll again, subtract). One extra die only.
export function rollD10Check() {
  const first = rollDie(10);
  if (first === 10) {
    const extra = rollDie(10);
    return { first, extra, sign: 1, dieTotal: first + extra, crit: 'up' };
  }
  if (first === 1) {
    const extra = rollDie(10);
    return { first, extra, sign: -1, dieTotal: first - extra, crit: 'down' };
  }
  return { first, extra: 0, sign: 0, dieTotal: first, crit: null };
}

const toast = () => document.getElementById('dice-toast');
let hideTimer = null;

// Show a roll result. Accepts both the simple dN+mod shape and the exploding
// d10 shape (extra/sign/crit set).
export function showRoll({ label, die, sides, mod = 0, total, extra = 0, sign = 0, crit = null }) {
  const node = toast();
  if (!node) return;
  const m = Number(mod) || 0;
  const isUp = crit === 'up' || (sides === 20 && die === 20);
  const isDown = crit === 'down' || (sides === 20 && die === 1);

  // Build the breakdown: "d10: 10 +6 (взрыв) + 14"
  let bd = `d${sides}: <b>${die}</b>`;
  if (sign > 0) bd += ` +${extra} <span class="dt-crit">взрыв</span>`;
  if (sign < 0) bd += ` −${extra} <span class="dt-crit">провал</span>`;
  if (m) bd += ` ${m >= 0 ? '+' : '−'} ${Math.abs(m)}`;
  if (crit === null && sides === 20 && die === 20) bd += ' · крит!';
  if (crit === null && sides === 20 && die === 1) bd += ' · провал';

  node.className = 'dice-toast' + (isUp ? ' crit' : isDown ? ' fumble' : '');
  node.innerHTML = `
    <div class="dt-label">${escapeHtml(label || `d${sides}`)}</div>
    <div class="dt-total">${total}</div>
    <div class="dt-breakdown">${bd}</div>`;
  node.hidden = false;
  node.classList.remove('show');
  void node.offsetWidth;
  node.classList.add('show');

  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    node.classList.remove('show');
    setTimeout(() => (node.hidden = true), 250);
  }, 2800);
}

// Convenience for the dice tray buttons (plain die, no modifier).
export function rollAndShow(sides) {
  const die = rollDie(sides);
  showRoll({ label: `d${sides}`, die, sides, mod: 0, total: die });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
