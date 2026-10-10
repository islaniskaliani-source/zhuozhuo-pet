/* Props overlay: renders poop in screen space. */

const box = document.getElementById('props');

function makePoop(o) {
  const el = document.createElement('div');
  el.className = 'prop poop';
  el.textContent = '💩';
  el.style.left = o.x + 'px';
  el.style.top = o.y + 'px';
  el.dataset.type = 'poop';
  el.dataset.id = o.id;
  return el;
}

window.petApi.on('props', (data) => {
  box.innerHTML = '';
  for (const p of (data && data.poops) || []) box.appendChild(makePoop(p));
});

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
