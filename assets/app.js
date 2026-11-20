/* РАЗУМ — local, dependency-free interactions. No analytics or form backend included. */
(() => {
  'use strict';

  const start = () => {
    const all = (selector, root = document) => Array.from(root.querySelectorAll(selector));
    const safeId = value => String(value).replace(/[^a-zA-Z0-9_-]/g, '-');
    const dialog = document.getElementById('site-modal');
    const modalContent = dialog?.querySelector('.modal-content');
    const cookieKey = 'razum-cookie-choice';
    const numberFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
    const calc = { quantity: 100, rate: 1200 };
    const limits = { quantity: [1, 100000], rate: [1, 1000000] };
    const pendingForms = new WeakSet();
    const drawings = new Set();
    let returnFocus = null;
    let savedOverflow = '';
    let modalSequence = 0;
    let resizeFrame = 0;
    let backdropPress = false;

    function readCookieChoice() {
      try {
        const value = localStorage.getItem(cookieKey);
        if (value === null) return null;
        const choice = JSON.parse(value);
        return { necessary: true, analytics: choice?.analytics === true };
      } catch { return null; }
    }
    let cookieChoice = readCookieChoice();

    function showCookieBanner() {
      all('.cookie-banner').forEach(banner => { banner.hidden = cookieChoice !== null; });
    }

    function saveCookieChoice(analytics) {
      cookieChoice = { necessary: true, analytics: Boolean(analytics) };
      try { localStorage.setItem(cookieKey, JSON.stringify(cookieChoice)); } catch { /* Session choice still works. */ }
      showCookieBanner();
      if (dialog?.open && dialog.dataset.modalKind === 'cookie') dialog.close();
    }

    function presentModal(fragment, opener, kind = 'content') {
      if (!dialog || !modalContent) return false;
      if (!dialog.open) {
        returnFocus = opener || document.activeElement;
        savedOverflow = document.documentElement.style.overflow;
      }
      modalContent.replaceChildren(fragment);
      dialog.dataset.modalKind = kind;
      const heading = modalContent.querySelector('[data-modal-title], .modal-title, h1, h2, h3');
      if (heading) {
        heading.id = `site-modal-title-${++modalSequence}`;
        heading.tabIndex = -1;
        dialog.setAttribute('aria-labelledby', heading.id);
        dialog.removeAttribute('aria-label');
      } else {
        dialog.removeAttribute('aria-labelledby');
        dialog.setAttribute('aria-label', opener?.getAttribute('aria-label') || opener?.textContent.trim() || 'Информация');
      }
      dialog.setAttribute('aria-modal', 'true');
      initialize(modalContent);
      if (!dialog.open) dialog.showModal();
      document.documentElement.style.overflow = 'hidden';
      document.documentElement.classList.add('modal-open');
      dialog.scrollTop = 0;
      modalContent.scrollTop = 0;
      const focusTarget = modalContent.querySelector('[autofocus], input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])') || heading || dialog.querySelector('.modal-close');
      focusTarget?.focus({ preventScroll: true });
      scheduleDrawings();
      return true;
    }

    function openTemplate(id, opener) {
      const template = document.getElementById(`overlay-${safeId(id)}`);
      return template instanceof HTMLTemplateElement && presentModal(template.content.cloneNode(true), opener);
    }

    function openCookieSettings(opener) {
      const template = document.querySelector('template[data-cookie-preferences]') || document.getElementById('overlay-3517-2106');
      let fragment;
      if (template instanceof HTMLTemplateElement) {
        fragment = template.content.cloneNode(true);
      } else {
        const fallback = document.createElement('template');
        fallback.innerHTML = '<section class="cookie-preferences"><h2>Настройки cookie</h2><p>Необходимые настройки обеспечивают работу сайта. Аналитические инструменты сейчас не подключены.</p><label><input type="checkbox" name="cookie-necessary" checked disabled> Необходимые</label><label><input type="checkbox" name="cookie-analytics"> Разрешить аналитические cookie</label><button type="button" data-cookie="save">Сохранить настройки</button></section>';
        fragment = fallback.content.cloneNode(true);
      }
      if (!presentModal(fragment, opener, 'cookie')) return false;
      const optional = modalContent.querySelector('input[name="cookie-analytics"]');
      if (optional) {
        optional.checked = cookieChoice?.analytics === true;
        if (!optional.labels?.length && !optional.hasAttribute('aria-label')) optional.setAttribute('aria-label', 'Разрешить аналитические cookie');
      }
      all('input[name="cookie-necessary"]', modalContent).forEach(input => {
        input.checked = true;
        input.disabled = true;
      });
      return true;
    }

    function formStatus(form, message) {
      let status = form.querySelector('.form-status');
      if (!status) {
        status = document.createElement('p');
        status.className = 'form-status';
        form.append(status);
      }
      status.hidden = false;
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      status.textContent = message;
    }

    async function submitForm(form) {
      if (pendingForms.has(form) || !form.reportValidity()) return;
      const endpoint = typeof window.RAZUM_CONFIG?.formEndpoint === 'string' ? window.RAZUM_CONFIG.formEndpoint.trim() : '';
      if (!endpoint) {
        formStatus(form, 'Отправка заявок пока не подключена. Свяжитесь с нами по контактам на сайте.');
        return;
      }
      const values = new FormData(form);
      const payload = {};
      ['name', 'phone', 'email', 'company', 'message'].forEach(name => { payload[name] = String(values.get(name) || '').trim(); });
      if (values.has('interest')) payload.interest = String(values.get('interest') || '').trim();
      payload.consent = form.querySelector('input[name="consent"]')?.checked === true;
      const submitters = all('button[type="submit"], button:not([type]), input[type="submit"]', form).map(button => [button, button.disabled]);
      pendingForms.add(form);
      submitters.forEach(([button]) => { button.disabled = true; });
      form.setAttribute('aria-busy', 'true');
      formStatus(form, 'Отправляем заявку…');
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        if (!response.ok) throw new Error('Request failed');
        formStatus(form, 'Заявка отправлена. Спасибо!');
        const thanksUrl = document.body.dataset.thanksUrl;
        if (thanksUrl) window.location.assign(new URL(thanksUrl, window.location.href).href);
      } catch {
        formStatus(form, 'Не удалось отправить заявку. Попробуйте позже или свяжитесь с нами по контактам на сайте.');
      } finally {
        window.clearTimeout(timeout);
        pendingForms.delete(form);
        form.removeAttribute('aria-busy');
        submitters.forEach(([button, disabled]) => { button.disabled = disabled; });
      }
    }

    function calcValue(key, value) {
      const numeric = Number(String(value).replace(/\s/g, '').replace(',', '.'));
      if (!Number.isFinite(numeric) || String(value).trim() === '') return null;
      const bounded = Math.max(limits[key][0], Math.min(limits[key][1], numeric));
      return key === 'quantity' ? Math.round(bounded) : Math.round(bounded * 100) / 100;
    }

    function updateCalculator(source) {
      all('[data-calc]').forEach(input => {
        const key = input.dataset.calc;
        if (Object.hasOwn(calc, key) && input !== source) input.value = calc[key];
      });
      const results = { hours: calc.quantity * 0.5, money: calc.quantity * 0.5 * calc.rate };
      all('[data-calc-output]').forEach(output => {
        const value = results[output.dataset.calcOutput];
        if (value !== undefined) output.textContent = numberFormat.format(value);
      });
      all('[data-calc-preset]').forEach(button => {
        const selected = Number(button.dataset.calcPreset) === calc.quantity;
        button.setAttribute('aria-pressed', String(selected));
        button.classList.toggle('is-active', selected);
      });
    }

    function changeCalculator(input, normalize = false) {
      const key = input.dataset.calc;
      if (!Object.hasOwn(calc, key)) return;
      const value = calcValue(key, input.value);
      if (value !== null) calc[key] = value;
      if (normalize) input.value = calc[key];
      updateCalculator(normalize ? null : input);
    }

    function focusCalculator(key) {
      if (!Object.hasOwn(calc, key)) return;
      const selector = `[data-calc="${key}"]`;
      const input = (dialog?.open && modalContent?.querySelector(selector)) || document.querySelector(selector);
      if (!input) return;
      if (dialog?.open && !dialog.contains(input)) {
        returnFocus = input;
        dialog.close();
      }
      input.focus({ preventScroll: true });
      input.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      if (input.type !== 'number') input.select?.();
    }

    function resizeDrawings() {
      resizeFrame = 0;
      drawings.forEach(wrapper => {
        if (!wrapper.isConnected) {
          resizeObserver?.unobserve(wrapper);
          drawings.delete(wrapper);
          return;
        }
        const canvas = wrapper.querySelector('.fixed-canvas');
        const width = Number(canvas?.dataset.designWidth || wrapper.dataset.designWidth);
        const height = Number(canvas?.dataset.designHeight || wrapper.dataset.designHeight);
        if (!(width > 0 && height > 0) || !wrapper.clientWidth) return;
        const scale = window.innerWidth <= 1247 ? Math.min(1, wrapper.clientWidth / width) : 1;
        canvas.style.transformOrigin = 'top left';
        canvas.style.transform = `scale(${scale})`;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        wrapper.style.height = `${height * scale}px`;
      });
    }
    function scheduleDrawings() {
      if (!resizeFrame) resizeFrame = requestAnimationFrame(resizeDrawings);
    }
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(scheduleDrawings) : null;

    const menuButtons = all('.menu-toggle');
    const dropdowns = new Map();
    menuButtons.forEach((button, index) => {
      const navigation = button.closest('.site-header')?.querySelector('.header-navigation');
      if (!navigation) return;
      navigation.id ||= `header-navigation-${index + 1}`;
      button.setAttribute('aria-controls', navigation.id);
      button.setAttribute('aria-expanded', 'false');
    });
    all('.nav-dropdown-button').forEach((button, index) => {
      const panel = document.getElementById(button.getAttribute('aria-controls')) || button.parentElement.querySelector('.nav-dropdown') || button.closest('.site-header')?.querySelector('.nav-dropdown');
      if (!panel) return;
      panel.id ||= `navigation-dropdown-${index + 1}`;
      button.setAttribute('aria-controls', panel.id);
      button.setAttribute('aria-expanded', 'false');
      panel.hidden = true;
      dropdowns.set(button, panel);
    });

    function closeDropdowns(except) {
      dropdowns.forEach((panel, button) => {
        if (button === except) return;
        button.setAttribute('aria-expanded', 'false');
        panel.hidden = true;
        panel.classList.remove('is-open');
      });
    }
    function closeMenus(focus = false) {
      menuButtons.forEach(button => {
        if (button.getAttribute('aria-expanded') !== 'true') return;
        button.setAttribute('aria-expanded', 'false');
        button.closest('.site-header')?.classList.remove('menu-open');
        document.getElementById(button.getAttribute('aria-controls'))?.classList.remove('is-open');
        if (focus) button.focus();
      });
      closeDropdowns();
    }

    function tabGroup(tab) {
      return tab.dataset.tabGroup || tab.closest('[data-tab-group]')?.dataset.tabGroup || 'default';
    }
    function relatedTabs(tab) {
      const root = tab.closest('.modal-content') || document;
      return all('[data-tab-target]', root).filter(item => tabGroup(item) === tabGroup(tab));
    }
    function tabPanel(tab) { return document.getElementById(tab.dataset.tabTarget.replace(/^#/, '')); }
    function selectTab(selected, focus = false) {
      relatedTabs(selected).forEach((tab, index) => {
        const panel = tabPanel(tab);
        if (!panel) return;
        const active = tab === selected;
        tab.id ||= `tab-${safeId(tabGroup(tab))}-${index}`;
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-controls', panel.id);
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', tab.id);
        panel.hidden = !active;
      });
      if (focus) selected.focus();
      scheduleDrawings();
    }

    function filterSearch(input) {
      const root = document.getElementById(input.dataset.search) || input.closest('[data-search-scope]') || document;
      const query = input.value.trim().toLocaleLowerCase('ru-RU');
      let count = 0;
      all('[data-search-item]', root).forEach(item => {
        const text = item.dataset.searchItem || item.textContent;
        item.hidden = !text.toLocaleLowerCase('ru-RU').includes(query);
        if (!item.hidden) count++;
      });
      all('[data-search-empty]', root).forEach(item => { item.hidden = count > 0; });
      all('[data-search-count]', root).forEach(item => { item.textContent = numberFormat.format(count); });
    }

    function initialize(root) {
      all('button[data-open], button[data-cookie], button[data-calc-preset], button[data-calculator-action], button[data-tab-target], button[data-modal-close], button.modal-close, button.menu-toggle, button.nav-dropdown-button', root).forEach(button => { button.type = 'button'; });
      all('.request-form input[name="consent"]', root).forEach(input => { input.required = true; });
      const interest = new URLSearchParams(window.location.search).get('interest');
      if (interest) all('.request-form select[name="interest"]', root).forEach(select => {
        if (Array.from(select.options).some(option => option.value === interest)) select.value = interest;
      });
      all('[data-calc]', root).forEach(input => {
        const key = input.dataset.calc;
        if (!Object.hasOwn(calc, key)) return;
        input.type = 'number';
        input.min = limits[key][0];
        input.max = limits[key][1];
        input.step = key === 'quantity' ? '1' : '0.01';
        input.inputMode = key === 'quantity' ? 'numeric' : 'decimal';
        if (!input.labels?.length && !input.hasAttribute('aria-label')) input.setAttribute('aria-label', key === 'quantity' ? 'Количество закупок в месяц' : 'Стоимость часа специалиста, рублей');
      });
      updateCalculator();
      all('.fixed-viewport', root).forEach(wrapper => {
        drawings.add(wrapper);
        resizeObserver?.observe(wrapper);
      });
      const initializedGroups = new Set();
      all('[data-tab-target]', root).forEach(tab => {
        const group = tabGroup(tab);
        if (initializedGroups.has(group)) return;
        initializedGroups.add(group);
        const tabs = relatedTabs(tab);
        selectTab(tabs.find(item => item.getAttribute('aria-selected') === 'true') || tabs[0]);
      });
      all('[data-search]', root).forEach(filterSearch);
      scheduleDrawings();
    }

    document.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target : event.target.parentElement;
      const cookieButton = target.closest('[data-cookie], a[href="#cookie-settings"]');
      if (cookieButton) {
        const action = cookieButton.dataset.cookie || 'settings';
        if (action === 'settings') openCookieSettings(cookieButton);
        else if (action === 'accept' || action === 'necessary') saveCookieChoice(action === 'accept');
        else if (action === 'save') saveCookieChoice(modalContent?.querySelector('[name="cookie-analytics"]')?.checked);
        event.preventDefault();
        return;
      }
      const opener = target.closest('[data-open]');
      if (opener) {
        const opened = ['3517:2106', '3517:2133'].includes(opener.dataset.open) ? openCookieSettings(opener) : openTemplate(opener.dataset.open, opener);
        if (opened) event.preventDefault();
        return;
      }
      if (target.closest('.modal-close, [data-close], [data-modal-close]') && dialog?.open) {
        event.preventDefault();
        dialog.close();
        return;
      }
      const menuButton = target.closest('.menu-toggle');
      if (menuButton) {
        const expanded = menuButton.getAttribute('aria-expanded') !== 'true';
        closeMenus();
        menuButton.setAttribute('aria-expanded', String(expanded));
        menuButton.closest('.site-header')?.classList.toggle('menu-open', expanded);
        document.getElementById(menuButton.getAttribute('aria-controls'))?.classList.toggle('is-open', expanded);
        return;
      }
      const dropdownButton = target.closest('.nav-dropdown-button');
      if (dropdownButton && dropdowns.has(dropdownButton)) {
        const expanded = dropdownButton.getAttribute('aria-expanded') !== 'true';
        closeDropdowns(dropdownButton);
        dropdownButton.setAttribute('aria-expanded', String(expanded));
        dropdowns.get(dropdownButton).hidden = !expanded;
        dropdowns.get(dropdownButton).classList.toggle('is-open', expanded);
        return;
      }
      if (!target.closest('.site-header') || target.closest('.header-navigation a[href]')) closeMenus();
      else if (![...dropdowns].some(([button, panel]) => button.contains(target) || panel.contains(target))) closeDropdowns();
      const preset = target.closest('[data-calc-preset]');
      if (preset) {
        const value = calcValue('quantity', preset.dataset.calcPreset);
        if (value !== null) calc.quantity = value;
        updateCalculator();
      }
      const calculatorAction = target.closest('[data-calculator-action]');
      if (calculatorAction) focusCalculator(calculatorAction.dataset.calculatorAction);
      const tab = target.closest('[data-tab-target]');
      if (tab) { event.preventDefault(); selectTab(tab); }
    });

    document.addEventListener('submit', event => {
      if (!event.target.matches('.request-form')) return;
      event.preventDefault();
      submitForm(event.target);
    });
    document.addEventListener('input', event => {
      if (event.target.matches('[data-calc]')) changeCalculator(event.target);
      if (event.target.matches('[data-search]')) filterSearch(event.target);
    });
    document.addEventListener('change', event => {
      if (event.target.matches('[data-calc]')) changeCalculator(event.target, true);
    });
    document.addEventListener('blur', event => {
      if (event.target.matches('[data-calc]')) changeCalculator(event.target, true);
    }, true);
    document.addEventListener('keydown', event => {
      const tab = event.target.closest?.('[data-tab-target]');
      if (tab && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
        const tabs = relatedTabs(tab);
        let index = tabs.indexOf(tab);
        if (event.key === 'Home') index = 0;
        else if (event.key === 'End') index = tabs.length - 1;
        else index = (index + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1) + tabs.length) % tabs.length;
        event.preventDefault();
        selectTab(tabs[index], true);
      }
      if (event.key !== 'Escape' || dialog?.open) return;
      const openDropdown = [...dropdowns.keys()].find(button => button.getAttribute('aria-expanded') === 'true');
      if (openDropdown) { closeDropdowns(); openDropdown.focus(); }
      else closeMenus(true);
    });

    if (dialog) {
      const outsideDialog = event => {
        const rect = dialog.getBoundingClientRect();
        return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
      };
      dialog.addEventListener('pointerdown', event => { backdropPress = event.target === dialog && outsideDialog(event); });
      dialog.addEventListener('click', event => {
        if (event.target === dialog && backdropPress && outsideDialog(event)) dialog.close();
        backdropPress = false;
      });
      dialog.addEventListener('close', () => {
        document.documentElement.style.overflow = savedOverflow;
        document.documentElement.classList.remove('modal-open');
        if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
        returnFocus = null;
        scheduleDrawings();
      });
    }

    const canonicalPath = pathname => pathname.replace(/\/index\.html?$/i, '/').replace(/\/+$/, '') || '/';
    all('a[href]').forEach(link => {
      try {
        const url = new URL(link.getAttribute('href'), window.location.href);
        if (url.origin !== location.origin || url.protocol !== location.protocol || url.hash) return;
        if (canonicalPath(url.pathname) === canonicalPath(location.pathname)) link.setAttribute('aria-current', 'page');
        else if (link.getAttribute('aria-current') === 'page') link.removeAttribute('aria-current');
      } catch { /* Keep malformed links as authored; do not intercept navigation. */ }
    });
    window.addEventListener('resize', () => {
      if (menuButtons.some(button => getComputedStyle(button).display === 'none')) closeMenus();
      scheduleDrawings();
    });
    window.addEventListener('storage', event => {
      if (event.key !== cookieKey && event.key !== null) return;
      cookieChoice = readCookieChoice();
      showCookieBanner();
      const optional = dialog?.querySelector('[name="cookie-analytics"]');
      if (optional && dialog.dataset.modalKind === 'cookie') optional.checked = cookieChoice?.analytics === true;
    });

    initialize(document);
    showCookieBanner();
    document.fonts?.ready.then(scheduleDrawings);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
