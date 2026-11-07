'use strict';
const filters = document.querySelectorAll('[data-filter]');
filters.forEach(button => button.addEventListener('click', () => {
 filters.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
 let count = 0;
 document.querySelectorAll('[data-category]').forEach(card => {
  card.hidden = button.dataset.filter !== 'all' && card.dataset.category !== button.dataset.filter;
  if (!card.hidden) count++;
 });
 document.getElementById('catalog-status').textContent = FileI18n.t(`${count} tools`, `Инструментов: ${count}`);
}));
document.querySelectorAll('.nav-group').forEach(group => {
 group.addEventListener('toggle', () => {
  if (group.open) document.querySelectorAll('.nav-group').forEach(other => { if (other !== group) other.open = false; });
 });
 group.addEventListener('keydown', event => { if (event.key === 'Escape') { group.open = false; group.querySelector('summary').focus(); } });
});
document.addEventListener('click', event => { if (!event.target.closest('.nav-group')) document.querySelectorAll('.nav-group').forEach(group => { group.open = false; }); });

// Language links work without JavaScript; dismiss the menu after outside clicks/Escape.
const languagePicker=document.querySelector('.language-picker');
document.addEventListener('click',event=>{if(languagePicker&&!languagePicker.contains(event.target))languagePicker.open=false;});
languagePicker?.addEventListener('keydown',event=>{if(event.key==='Escape'){languagePicker.open=false;languagePicker.querySelector('summary').focus();}});
