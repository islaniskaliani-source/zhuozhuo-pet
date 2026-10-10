/* Props overlay: renders poop / food in screen space. */

const box = document.getElementById('props');
let current = { poops: [], food: null };

window.petApi.on('props', (data) => {
  current = data || { poops: [], food: null };
  render();
});

function makeProp(type, o, emoji) {
  const el = document.createElement('div');
  el.className = 'prop ' + type;
  el.textContent = emoji;
  el.style.left = o.x + 'px';
  el.style.top = o.y + 'px';
  el.dataset.type = type;
  el.dataset.id = o.id;
  return el;
}

function render() {
  box.innerHTML = '';
  for (const p of current.poops) box.appendChild(makeProp('poop', p, '💩'));
  if (current.food) box.appendChild(makeProp('food', current.food, '🐟'));
}

// Hovering a prop turns this window interactive so the click lands on it.
document.addEventListener('mousemove', (e) => {
  const on = !!(e.target && e.target.closest && e.target.closest('.prop'));
  window.petApi.send('props-hover', on);
});

document.addEventListener('mousedown', (e) => {
  const el = e.target.closest && e.target.closest('.prop');
  if (el) window.petApi.send('prop-click', { type: el.dataset.type, id: +el.dataset.id });
});

// Tell main we're listening so it can push the current world state.
window.petApi.send('props-ready');
