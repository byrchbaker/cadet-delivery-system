// Apply the saved theme before first paint to avoid a flash.
(function () {
  try {
    var t = localStorage.getItem('cds-theme') || '';
    var m = localStorage.getItem('cds-mode') || 'system';
    var dark = m === 'dark' || (m === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var el = document.documentElement;
    if (t) el.setAttribute('data-theme', t);
    el.setAttribute('data-mode', dark ? 'dark' : 'light');
  } catch (e) {}
})();
