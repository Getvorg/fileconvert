'use strict';
const filters = document.querySelectorAll('[data-filter]');
filters.forEach(button => button.addEventListener('click', () => {
 filters.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
 let count = 0;
 document.querySelectorAll('[data-category]').forEach(card => {
  card.hidden = button.dataset.filter !== 'all' && card.dataset.category !== button.dataset.filter;
  if (!card.hidden) count++;
 });
 document.getElementById('catalog-status').textContent = document.documentElement.lang === 'ru' ? `Инструментов: ${count}` : `${count} tools`;
}));
document.querySelectorAll('.nav-group').forEach(group => {
 group.addEventListener('toggle', () => {
  if (group.open) document.querySelectorAll('.nav-group').forEach(other => { if (other !== group) other.open = false; });
 });
 group.addEventListener('keydown', event => { if (event.key === 'Escape') { group.open = false; group.querySelector('summary').focus(); } });
});
document.addEventListener('click', event => { if (!event.target.closest('.nav-group')) document.querySelectorAll('.nav-group').forEach(group => { group.open = false; }); });
