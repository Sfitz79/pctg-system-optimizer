(() => {
  const app = document.getElementById('app');
  const groups = {
    overview: ['demo-dashboard', 'system-stats', 'system-specs', 'demo-system-scan'],
    optimiser: ['demo-optimise'],
    gaming: ['gaming-section', 'gaming-mode-result', 'advanced-actions'],
    toolkit: ['demo-modules'],
    startup: ['pro-first-run', 'startup-manager'],
    benchmark: ['demo-benchmark', 'report-section'],
    activity: ['log'],
    settings: ['settings-panel']
  };
  const descriptions = {
    overview: 'Your PC at a glance. Choose a tool when you are ready.',
    optimiser: 'Run the three-phase tune-up. Configure the included steps in Settings.',
    gaming: 'Review gaming tools and choose the changes you want to apply.',
    toolkit: 'Choose a focused tool. Your licence determines which tools can run.',
    startup: 'Pro Gaming includes startup management and hardware recommendations.',
    benchmark: 'Measure, compare and review the work completed on your PC.',
    activity: 'Progress, results and errors from your current session.',
    settings: 'Choose the phases included in One-Click Optimisation.'
  };
  const notice = document.createElement('p');
  notice.className = 'blade-empty';
  notice.textContent = 'Startup and hardware tools become available with an activated Pro Gaming licence.';
  notice.hidden = true;
  document.querySelector('.dashboard').appendChild(notice);
  window.pctgNavigate = function (blade, focus = true) {
    if (!groups[blade]) blade = 'overview';
    app.dataset.activeBlade = blade;
    Object.entries(groups).forEach(([name, ids]) => ids.forEach(id => {
      const node = document.getElementById(id);
      if (node) node.toggleAttribute('data-blade-hidden', name !== blade);
    }));
    if (blade === 'settings') document.getElementById('settings-panel').style.display = 'block';
    notice.hidden = blade !== 'startup' || document.getElementById('pro-first-run').style.display !== 'none';
    document.querySelectorAll('[data-blade]').forEach(link => {
      if (link.dataset.blade === blade) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    const link = document.querySelector(`[data-blade="${blade}"]`);
    document.getElementById('blade-title').textContent = link.textContent;
    document.getElementById('blade-description').textContent = descriptions[blade];
    if (focus) { document.getElementById('blade-title').focus({preventScroll:true}); window.scrollTo({top:0,behavior:'smooth'}); }
  };
  document.getElementById('demo-navigation').addEventListener('click', event => {
    const link = event.target.closest('[data-blade]');
    if (link) { event.preventDefault(); history.replaceState(null, '', '#' + link.dataset.blade); window.pctgNavigate(link.dataset.blade); }
  });
  window.addEventListener('hashchange', () => window.pctgNavigate(location.hash.slice(1)));
  window.pctgNavigate(location.hash.slice(1), false);
})();
