
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
    if (image.dataset.full) {
      fullSize(image).then(original => {
        if (original && picture.open && returnFocus === button) fullImage.src = original.src;
      });
    }
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

  const slideHeader = presentation.querySelector('.festival-header');
  const desktopSlides = window.matchMedia('(min-width: 901px), (min-width: 741px) and (orientation: landscape) and (hover: hover) and (pointer: fine)');
  let fitRequest = 0;

  function fitSlide() {
    if (presentation.hidden) return;
    const page = pages.find(item => !item.hidden);
    if (!page || page.id === 'guide') return;
    if (!desktopSlides.matches) {
      delete page.dataset.fit;
      for (const name of ['zoom', 'width', 'min-height']) page.style.removeProperty(name);
      return;
    }

    // Measure the real header, fonts and wrapped text in this particular window.
    // At a smaller scale give the grid more layout width so both columns still fill the screen.
    const viewport = document.documentElement;
    const height = Math.max(1, viewport.clientHeight - slideHeader.getBoundingClientRect().height);
    const width = viewport.clientWidth;
    page.dataset.fit = '';
    function apply(scale) {
      page.style.zoom = String(scale);
      page.style.width = (width / scale) + 'px';
      page.style.minHeight = (Math.max(0,height - 0.75) / scale) + 'px';
      return page.getBoundingClientRect().height <= height + 0.1;
    }
    if (apply(1)) return;
    let low = Math.min(0.95, height / page.getBoundingClientRect().height);
    let high = 1;
    while (!apply(low) && low > 0.125) low /= 2;
    for (let step = 0; step < 8; step++) {
      const trial = (low + high) / 2;
      if (apply(trial)) low = trial;
      else high = trial;
    }
    apply(low);
  }

  function scheduleFit() {
    if (fitRequest) return;
    fitRequest = requestAnimationFrame(() => {fitRequest = 0; fitSlide();});
  }
  window.addEventListener('resize', scheduleFit);
  if (window.ResizeObserver) new ResizeObserver(scheduleFit).observe(slideHeader);
  if (document.fonts) {
    document.fonts.ready.then(scheduleFit);
    document.fonts.addEventListener('loadingdone', scheduleFit);
  }
  presentation.addEventListener('load', e => {
    if (e.target.tagName === 'IMG' && e.target.closest('.festival-panel:not([hidden])')) scheduleFit();
  }, true);

  // The inline preview stays visible throughout the high-resolution download.
  const originals = new Map();
  function fullSize(image) {
    const url = image.dataset.full;
    if (!originals.has(url)) {
      const bitmap = new Image();
      bitmap.src = url;
      originals.set(url, bitmap.decode().then(() => bitmap).catch(() => {
        originals.delete(url);
        return null;
      }));
    }
    return originals.get(url);
  }
  function upgradeImages(scope) {
    const images = [...scope.querySelectorAll('img[data-full]')];
    const shown = images.filter(image => !image.closest('figure')?.hidden);
    function upgrade(image) {
      return fullSize(image).then(bitmap => {
        if (bitmap && image.src !== bitmap.src) image.src = bitmap.src;
      });
    }
    Promise.all(shown.map(upgrade)).then(() => {
      if (!scope.hidden) images.filter(image => !shown.includes(image)).forEach(upgrade);
    });
  }

  // Decode slide-sized frames in advance, including the frames still hidden in a carousel.
  function warmGallery(scope) {
    for (const image of scope.querySelectorAll('.zoom-img img')) {
      if (image.dataset.warmed || !image.src) continue;
      image.dataset.warmed = '1';
      if (image.decode) image.decode().catch(() => {delete image.dataset.warmed;});
    }
  }
  if (window.requestIdleCallback) requestIdleCallback(() => warmGallery(presentation), {timeout:800});
  else setTimeout(() => warmGallery(presentation), 0);

  function showPage(scroll) {
    const id = location.hash.slice(1);
    const index = pages.findIndex(page => page.id === id);
    const active = Math.max(index, 0);
    for (const [i, page] of pages.entries()) {
      page.hidden = i !== active;
    }
    for (const link of links) {
      if (link.hash === '#' + pages[active].id) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    fitSlide();
    warmGallery(pages[active]);
    upgradeImages(pages[active]);
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
