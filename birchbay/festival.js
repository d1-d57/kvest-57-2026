
(() => {
  const presentation = document.getElementById('cc');
  const nav = presentation.querySelector('.festival-nav');
  const links = [...nav.querySelectorAll('a')];
  const pages = [...presentation.querySelectorAll('.festival-panel')];
  const picture = document.getElementById('picture');
  const fullImage = picture.querySelector('.picture-full');
  const fullControls = picture.querySelector('.picture-controls');
  let returnFocus = null;
  let openGallery = null;

  function enlarge(button) {
    const image = button.querySelector('img');
    returnFocus = button;
    openGallery = button.closest('.scene-gallery');
    fullImage.src = image.currentSrc || image.src;
    fullImage.alt = image.alt;
    fullControls.hidden = !openGallery;
    if (openGallery) fullControls.querySelector('output').value = openGallery.querySelector('output').value;
    if (!picture.open) picture.showModal();
  }

  function turn(gallery, step) {
    const frames = Array.from(gallery.children).filter(node => node.tagName === 'FIGURE');
    const current = frames.findIndex(frame => !frame.hidden);
    const next = (current + step + frames.length) % frames.length;
    frames[current].hidden = true;
    frames[next].hidden = false;
    frames[next].querySelector('img').loading = 'eager';
    gallery.querySelector('output').value = (next + 1) + ' / ' + frames.length;
    if (picture.open && openGallery === gallery) enlarge(frames[next].querySelector('.zoom-img'));
  }

  for (const button of presentation.querySelectorAll('.zoom-img')) {
    button.addEventListener('click', () => enlarge(button));
  }
  for (const gallery of presentation.querySelectorAll('.scene-gallery')) {
    for (const button of gallery.querySelectorAll('.scene-buttons button')) {
      button.addEventListener('click', () => turn(gallery, Number(button.dataset.step)));
    }
  }
  for (const button of fullControls.querySelectorAll('button')) {
    button.addEventListener('click', () => turn(openGallery, Number(button.dataset.step)));
  }
  picture.querySelector('.picture-close').addEventListener('click', () => picture.close());
  picture.addEventListener('keydown', event => {
    if (!openGallery || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    turn(openGallery, event.key === 'ArrowLeft' ? -1 : 1);
  });
  picture.addEventListener('close', () => {
    fullImage.removeAttribute('src');
    openGallery = null;
    if (returnFocus && returnFocus.getClientRects().length) returnFocus.focus({preventScroll:true});
    returnFocus = null;
  });

  function showPage(scroll) {
    const id = location.hash.slice(1);
    const index = pages.findIndex(page => page.id === id);
    const active = Math.max(index, 0);
    for (const [i, page] of pages.entries()) {
      page.hidden = i !== active;
      if (i === active) for (const img of page.querySelectorAll('figure:not([hidden]) img')) img.loading = 'eager';
      if (i === active) links[i].setAttribute('aria-current', 'page');
      else links[i].removeAttribute('aria-current');
    }
    if (scroll) requestAnimationFrame(() => window.scrollTo(0, 0));
  }

  const statusWrap = document.querySelector('.catalog-note');
  const statusButton = statusWrap.querySelector('button');
  const statusText = statusWrap.querySelector('.note-text');
  let pinned = false;
  function displayStatus(visible) {
    statusText.hidden = !visible;
    statusButton.setAttribute('aria-expanded', String(visible));
  }
  statusWrap.addEventListener('pointerenter', e => {if (e.pointerType === 'mouse') displayStatus(true);});
  statusWrap.addEventListener('pointerleave', () => {if (!pinned) displayStatus(false);});
  statusButton.addEventListener('focus', () => displayStatus(true));
  statusButton.addEventListener('click', () => {pinned = !pinned; displayStatus(pinned);});
  statusButton.addEventListener('blur', () => {pinned = false; displayStatus(false);});
  statusButton.addEventListener('keydown', e => {if (e.key === 'Escape') {pinned = false; displayStatus(false);}});
  document.addEventListener('pointerdown', e => {if (!statusWrap.contains(e.target)) {pinned = false; displayStatus(false);}});

  nav.addEventListener('keydown', event => {
    const offset = {ArrowLeft: -1, ArrowRight: 1}[event.key];
    const index = links.indexOf(event.target);
    if (offset === undefined || index < 0) return;
    event.preventDefault();
    const next = links[(index + offset + links.length) % links.length];
    next.focus();
    if (location.hash !== next.hash) location.hash = next.hash;
  });
  window.addEventListener('hashchange', () => {
    if (picture.open) picture.close();
    showPage(true);
  });
  showPage(!!location.hash);
})();
