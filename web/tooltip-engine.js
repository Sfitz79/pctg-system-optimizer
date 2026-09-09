(function() {
  const tipEl = document.createElement('div');
  tipEl.className = 'tooltip';
  document.body.appendChild(tipEl);

  let activeEl = null;

  function showTip(el, key) {
    const text = window.tooltips && tooltips[key];
    if (!text) return;
    tipEl.textContent = text;
    tipEl.classList.add('show');
    activeEl = el;
    positionTip(el);
  }

  function positionTip(el) {
    const rect = el.getBoundingClientRect();
    tipEl.style.left = rect.left + rect.width / 2 + 'px';
    tipEl.style.top = rect.top - 12 + 'px';
    tipEl.style.transform = 'translateX(-50%) translateY(-100%)';
  }

  function hideTip() {
    tipEl.classList.remove('show');
    activeEl = null;
  }

  document.addEventListener('mouseover', e => {
    const el = e.target.closest('[data-tip]');
    if (el) {
      showTip(el, el.dataset.tip);
    } else if (activeEl) {
      hideTip();
    }
  });

  document.addEventListener('scroll', () => {
    if (activeEl) positionTip(activeEl);
  }, { passive: true });
})();
