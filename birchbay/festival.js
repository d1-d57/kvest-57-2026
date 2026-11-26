
(() => {
  const presentation = document.getElementById('cc');
  const nav = presentation.querySelector('.festival-nav');
  const links = [...nav.querySelectorAll('a')];
  const pages = [...presentation.querySelectorAll('.festival-panel')];
  const slideHeader = presentation.querySelector('.festival-header');
  const desktopSlides = window.matchMedia('(min-width: 901px), (min-width: 741px) and (orientation: landscape) and (hover: hover) and (pointer: fine)');
  let fitRequest = 0;

  function fitSlide() {
    if (presentation.hidden) return;
    const page = pages.find(item => !item.hidden);
    if (!page || page.id === 'guide') return;
    if (!desktopSlides.matches || (page.id === 'format' && window.matchMedia('(max-width:960px) and (max-height:500px)').matches)) {
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
  function showPage(scroll) {
    const id = location.hash.slice(1);
    const target = document.getElementById(id);
    const zone = target?.matches('#festival-stations .school-place') ? target : null;
    const requested = target?.closest('.festival-panel')?.id;
    const index = pages.findIndex(page => page.id === requested);
    for (const place of presentation.querySelectorAll('.school-place')) {
      place.toggleAttribute('data-selected', place === zone);
    }
    const active = Math.max(index, 0);
    for (const [i, page] of pages.entries()) {
      page.hidden = i !== active;
    }
    for (const link of links) {
      if (link.hash === '#' + pages[active].id) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    fitSlide();
    if (scroll) requestAnimationFrame(() => {
      if (zone) zone.focus({preventScroll:true});
      if (!desktopSlides.matches && (zone || id === 'school')) target.scrollIntoView({block:'start'});
      else window.scrollTo(0, 0);
    });
  }

  presentation.addEventListener('toggle', event => {
    if (event.target.tagName === 'DETAILS') scheduleFit();
  }, true);

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
  // Measure in viewport pixels. The cards sit outside the scaled slide.
  let exampleButton = null;
  let exampleCard = null;
  function positionExample() {
    if (!exampleCard || !exampleCard.matches(':popover-open')) return;
    const anchor = exampleButton.getBoundingClientRect();
    const width = document.documentElement.clientWidth;
    const height = document.documentElement.clientHeight;
    if (anchor.bottom < 0 || anchor.top > height) {
      exampleCard.hidePopover();
      return;
    }
    const below = height - anchor.bottom - 16;
    const above = anchor.top - 16;
    exampleCard.style.maxHeight = '';
    const openAbove = exampleCard.offsetHeight > below && above > below;
    exampleCard.style.maxHeight = Math.max(60, openAbove ? above : below) + 'px';
    const left = Math.min(anchor.right - exampleCard.offsetWidth, width - exampleCard.offsetWidth - 8);
    const top = openAbove ? anchor.top - exampleCard.offsetHeight - 6 : anchor.bottom + 6;
    exampleCard.style.left = Math.max(8, left) + 'px';
    exampleCard.style.top = Math.max(8, Math.min(top, height - exampleCard.offsetHeight - 8)) + 'px';
  }
  let hoverExample = null;
  let closePreviewTimer = 0;
  function cancelPreviewClose() {
    clearTimeout(closePreviewTimer);
  }
  function leavePreview(card, event) {
    if (event.pointerType !== 'mouse' || card !== hoverExample) return;
    cancelPreviewClose();
    closePreviewTimer = setTimeout(() => {
      if (card === hoverExample) card.hidePopover();
    }, 220);
  }
  for (const button of document.querySelectorAll('.mechanic-trigger')) {
    const card = document.getElementById(button.getAttribute('popovertarget'));
    button.addEventListener('pointerenter', event => {
      if (event.pointerType !== 'mouse') return;
      if (exampleCard && exampleCard !== hoverExample) return;
      cancelPreviewClose();
      if (exampleCard === card) return;
      if (hoverExample) hoverExample.hidePopover();
      hoverExample = card;
      // A pointer preview must leave the reader's keyboard focus and scroll position alone.
      const autofocus = card.hasAttribute('autofocus');
      card.removeAttribute('autofocus');
      card.showPopover({source:button});
      if (autofocus) card.setAttribute('autofocus', '');
      positionExample();
    });
    button.addEventListener('pointerleave', event => leavePreview(card, event));
    card.addEventListener('pointerenter', () => {
      if (hoverExample === card) cancelPreviewClose();
    });
    card.addEventListener('pointerleave', event => leavePreview(card, event));
    button.addEventListener('click', event => {
      if (card !== hoverExample) return;
      // The native toggle would close an already visible mouse preview.
      event.preventDefault();
      cancelPreviewClose();
      hoverExample = null;
      if (event.detail === 0) card.focus({preventScroll:true});
      else button.focus({preventScroll:true});
    });
    card.addEventListener('keydown', event => {
      if (event.key === 'Escape') button.focus({preventScroll:true});
    });
    card.addEventListener('beforetoggle', event => {
      const opening = event.newState === 'open';
      button.setAttribute('aria-expanded', String(opening));
      if (opening) {
        exampleButton = button;
        exampleCard = card;
        requestAnimationFrame(positionExample);
      } else {
        if (card === hoverExample) {
          cancelPreviewClose();
          hoverExample = null;
        }
        if (card === exampleCard) {
          exampleButton = null;
          exampleCard = null;
        }
      }
    });
  }
  window.addEventListener('scroll', positionExample, {passive:true});
  window.addEventListener('resize', positionExample);
  window.addEventListener('hashchange', () => exampleCard?.hidePopover());

  const zoneList = document.querySelector('#school .zone-list');
  const zoneCard = document.getElementById('zone-directory-note');
  const zoneBody = zoneCard.querySelector('.zone-card-inner');
  const zoneClose = zoneCard.querySelector('.zone-close');
  let zoneButton = null;

  function positionZoneCard() {
    if (!zoneButton || !zoneCard.matches(':popover-open')) return;
    const list = zoneList.getBoundingClientRect();
    const anchor = zoneButton.getBoundingClientRect();
    const width = document.documentElement.clientWidth;
    const height = document.documentElement.clientHeight;
    if (anchor.bottom < 0 || anchor.top > height) { zoneCard.hidePopover(); return; }
    const below = height - anchor.bottom - 14;
    const above = anchor.top - 14;
    const cardWidth = Math.min(435, list.width, width - 16);
    const left = Math.max(8, Math.min(anchor.left, width - cardWidth - 8));
    zoneCard.style.width = cardWidth + 'px';
    zoneCard.style.left = left + 'px';
    const style = getComputedStyle(zoneCard);
    const inset = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) +
      parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    const ideal = Math.min(400,inset + Math.max(zoneBody.scrollHeight,zoneClose.offsetHeight));
    const flip = below < ideal && above > below;
    const available = Math.max(100, Math.min(400,flip ? above : below));
    const total = Math.min(ideal,available);
    zoneCard.style.height = total + 'px';
    zoneBody.style.maxHeight = (total - inset) + 'px';
    const top = flip ? anchor.top - zoneCard.offsetHeight - 5 : anchor.bottom + 5;
    zoneCard.style.top = Math.max(8,Math.min(top,height-zoneCard.offsetHeight-8)) + 'px';
  }
  zoneList.addEventListener('click', event => {
    const button = event.target.closest('.zone-trigger');
    if (!button) return;
    event.preventDefault();
    if (zoneButton === button) {
      zoneCard.hidePopover();
      button.focus({preventScroll:true});
      return;
    }
    zoneButton?.setAttribute('aria-expanded','false');
    zoneButton = button;
    zoneButton.setAttribute('aria-expanded','true');
    zoneCard.setAttribute('aria-label',button.textContent.trim());
    zoneBody.replaceChildren();
    for (const id of button.dataset.places.split(' ')) {
      const source = document.getElementById(id);
      if (!source?.matches('#festival-stations .school-place')) continue;
      const section = document.createElement('article');
      for (const item of source.children) section.append(item.cloneNode(true));
      for (const copy of section.querySelectorAll('[id]')) copy.removeAttribute('id');
      zoneBody.append(section);
    }
    if (!zoneCard.matches(':popover-open')) zoneCard.showPopover({source:button});
    positionZoneCard();
    zoneBody.scrollTop = 0;
    zoneClose.focus({preventScroll:true});
  });
  function dismissZoneCard() {
    const button = zoneButton;
    zoneCard.hidePopover();
    button?.focus({preventScroll:true});
  }
  zoneClose.addEventListener('click',dismissZoneCard);
  zoneCard.addEventListener('keydown',event => {
    if (event.key === 'Escape') { event.preventDefault(); dismissZoneCard(); }
  });
  zoneCard.addEventListener('beforetoggle',event => {
    if (event.newState === 'closed') {
      zoneButton?.setAttribute('aria-expanded','false');
      zoneButton = null;
    }
  });
  window.addEventListener('resize',positionZoneCard);
  window.addEventListener('scroll',positionZoneCard,{passive:true});
  window.addEventListener('hashchange', () => {
    if (zoneCard.matches(':popover-open')) zoneCard.hidePopover();
  });


  nav.addEventListener('keydown', changeSection);
  document.addEventListener('keydown', event => {
    if (!nav.contains(event.target)) changeSection(event);
  });

  function changeSection(event) {
    if (zoneCard.matches(':popover-open')) return;
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.target.isContentEditable || event.target.closest?.('input, textarea, select')) return;
    if (exampleCard && exampleCard !== hoverExample) return;
    if (document.querySelector('dialog[open]')) return;
    const step = {ArrowLeft: -1, ArrowRight: 1}[event.key];
    if (!step) return;
    const focused = links.indexOf(event.target);
    const active = focused >= 0 ? focused : links.findIndex(link => link.hasAttribute('aria-current'));
    if (active < 0) return;
    event.preventDefault();
    const next = links[(active + step + links.length) % links.length];
    next.focus({preventScroll:true});
    location.hash = next.hash;
  }
  window.addEventListener('hashchange', () => showPage(true));
  showPage(!!location.hash);
})();
