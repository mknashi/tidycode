/**
 * Contact form widget.
 *
 *   <div data-forms-site="your-site-id"></div>
 *   <script src="https://forms.tidycode.ai/v1/widget.js" defer></script>
 *
 * Optional attributes on the div:
 *   data-forms-submit-label  button text (default "Send")
 *   data-forms-success       message shown after sending
 *   data-forms-hide-name     "true" to drop the name field
 *
 * Theme with CSS variables on the div or any parent:
 *   --tcf-accent, --tcf-border, --tcf-radius, --tcf-gap
 *
 * To keep a site's own form and styling, put the attribute on the form instead.
 * It needs a field named "message" (it can be hidden); "name" and "email" are used
 * if present, and any other named fields are included in the email:
 *
 *   <form data-forms-site="your-site-id"> ...fields and a submit button... </form>
 */
(function () {
  'use strict';

  var script = document.currentScript;
  var BASE = new URL(script.src).origin;
  var CHALLENGE_MAX_AGE_MS = 50 * 60 * 1000; // challenges expire after an hour

  var STYLE = [
    '.tcf{display:flex;flex-direction:column;gap:var(--tcf-gap,12px);font:inherit;color:inherit;max-width:560px}',
    '.tcf label{display:flex;flex-direction:column;gap:4px;font-size:.9em}',
    '.tcf input,.tcf textarea{font:inherit;color:inherit;background:transparent;border:1px solid var(--tcf-border,#c4c4c4);border-radius:var(--tcf-radius,6px);padding:8px 10px}',
    '.tcf textarea{min-height:140px;resize:vertical}',
    '.tcf input:focus,.tcf textarea:focus{outline:2px solid var(--tcf-accent,#7c3aed);outline-offset:1px}',
    '.tcf button{align-self:flex-start;font:inherit;cursor:pointer;border:0;border-radius:var(--tcf-radius,6px);padding:9px 18px;background:var(--tcf-accent,#7c3aed);color:#fff}',
    '.tcf button[disabled]{opacity:.6;cursor:default}',
    '.tcf-hp{position:absolute!important;left:-10000px!important;width:1px;height:1px;overflow:hidden}',
    '.tcf-status{font-size:.9em;min-height:1.2em;grid-column:1/-1;margin:0}',
    '.tcf-status[data-tone=error]{color:#dc2626}',
    '.tcf-optional{opacity:.65;font-weight:normal}'
  ].join('');

  var ERRORS = {
    rate_limited: 'Too many messages from your connection. Please try again later.',
    message_required: 'Please write a message.',
    message_too_long: 'Your message is too long.',
    too_many_links: 'Please include fewer links.',
    invalid_email: 'Please check your email address.',
    origin_not_allowed: 'This form is not set up for this website.',
    unknown_site: 'This form is not set up correctly.'
  };

  function injectStyle() {
    if (document.getElementById('tcf-style')) return;
    var style = document.createElement('style');
    style.id = 'tcf-style';
    style.textContent = STYLE;
    document.head.appendChild(style);
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (key === 'text') node.textContent = attrs[key];
      else node.setAttribute(key, attrs[key]);
    });
    (children || []).forEach(function (child) { node.appendChild(child); });
    return node;
  }

  function toHex(buffer) {
    return Array.prototype.map.call(new Uint8Array(buffer), function (b) {
      return ('0' + b.toString(16)).slice(-2);
    }).join('');
  }

  // Find n where sha256(salt + n) equals the challenge, hashing in batches
  async function solve(challenge) {
    var encoder = new TextEncoder();
    var batch = 1000;
    for (var start = 0; start <= challenge.maxnumber; start += batch) {
      var numbers = [];
      for (var n = start; n < start + batch && n <= challenge.maxnumber; n++) numbers.push(n);
      var hashes = await Promise.all(numbers.map(function (num) {
        return crypto.subtle.digest('SHA-256', encoder.encode(challenge.salt + num));
      }));
      for (var i = 0; i < hashes.length; i++) {
        if (toHex(hashes[i]) === challenge.challenge) return numbers[i];
      }
    }
    throw new Error('Challenge could not be solved');
  }

  async function fetchSolution(siteId) {
    var response = await fetch(BASE + '/v1/challenge?site=' + encodeURIComponent(siteId));
    if (!response.ok) {
      var body = await response.json().catch(function () { return {}; });
      throw Object.assign(new Error(body.error || 'challenge_unavailable'), { code: body.error });
    }
    var challenge = await response.json();
    var number = await solve(challenge);
    return {
      algorithm: challenge.algorithm,
      challenge: challenge.challenge,
      number: number,
      salt: challenge.salt,
      signature: challenge.signature
    };
  }

  function mount(container) {
    if (container.getAttribute('data-forms-mounted')) return;
    container.setAttribute('data-forms-mounted', 'true');

    var siteId = container.getAttribute('data-forms-site');
    var hideName = container.getAttribute('data-forms-hide-name') === 'true';
    var existingForm = container.tagName === 'FORM';
    var successText = container.getAttribute('data-forms-success') || 'Thanks! Your message was sent.';

    var honeypot = el('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off' });
    var status = el('p', { class: 'tcf-status', role: 'status', 'aria-live': 'polite' });
    var form, nameInput, emailInput, messageInput, button, submitLabel;

    function field(labelText, input, optional) {
      var label = el('label', {}, [document.createTextNode(labelText)]);
      if (optional) label.appendChild(el('span', { class: 'tcf-optional', text: ' (optional)' }));
      label.appendChild(input);
      return label;
    }

    var honeypotField = el('div', { class: 'tcf-hp', 'aria-hidden': 'true' }, [field('Leave this field empty', honeypot, false)]);

    if (existingForm) {
      form = container;
      nameInput = form.elements.namedItem('name');
      emailInput = form.elements.namedItem('email');
      messageInput = form.elements.namedItem('message');
      button = form.querySelector('button[type=submit], button:not([type]), input[type=submit]');
      if (!messageInput || !button) {
        console.error('[forms] A form with data-forms-site needs a "message" field and a submit button');
        return;
      }
      submitLabel = button.textContent;
      form.appendChild(honeypotField);
      form.appendChild(status);
    } else {
      submitLabel = container.getAttribute('data-forms-submit-label') || 'Send';
      nameInput = el('input', { type: 'text', name: 'name', maxlength: '100', autocomplete: 'name' });
      emailInput = el('input', { type: 'email', name: 'email', maxlength: '254', autocomplete: 'email' });
      messageInput = el('textarea', { name: 'message', required: 'required', maxlength: '5000' });
      button = el('button', { type: 'submit', text: submitLabel });
      form = el('form', { class: 'tcf', novalidate: 'novalidate' }, [
        hideName ? document.createTextNode('') : field('Name', nameInput, true),
        field('Email', emailInput, true),
        field('Message', messageInput, false),
        honeypotField,
        button,
        status
      ]);
      container.appendChild(form);
    }

    var pending = null; // { promise, fetchedAt }

    function prepare(force) {
      if (force || !pending || Date.now() - pending.fetchedAt > CHALLENGE_MAX_AGE_MS) {
        var promise = fetchSolution(siteId);
        // Surfaced on submit; forget a failed attempt so the next one refetches
        promise.catch(function () {
          if (pending && pending.promise === promise) pending = null;
        });
        pending = { promise: promise, fetchedAt: Date.now() };
      }
      return pending.promise;
    }

    // Start the proof of work as soon as someone begins filling in the form
    form.addEventListener('focusin', function () { prepare(false); }, { once: true });

    function setStatus(text, tone) {
      status.textContent = text;
      status.setAttribute('data-tone', tone || '');
    }

    // Fields of a site's own form beyond the standard ones, sent as extra details
    function extraFields() {
      var extras = {};
      if (!existingForm) return extras;
      Array.prototype.forEach.call(form.elements, function (input) {
        if (!input.name || input.disabled || /^(name|email|message|website)$/.test(input.name)) return;
        if (/^(submit|button|reset|file)$/.test(input.type)) return;
        if ((input.type === 'checkbox' || input.type === 'radio') && !input.checked) return;
        extras[input.name] = input.value;
      });
      return extras;
    }

    async function send(retried) {
      var solution = await prepare(false);
      var response = await fetch(BASE + '/v1/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site: siteId,
          name: nameInput && !hideName ? nameInput.value : '',
          email: emailInput ? emailInput.value : '',
          message: messageInput.value,
          meta: extraFields(),
          page: location.href,
          website: honeypot.value,
          altcha: solution
        })
      });
      var body = await response.json().catch(function () { return {}; });
      if (response.ok && body.ok) return;

      var code = body.error;
      if (!retried && code === 'too_fast') {
        // Sent before the minimum time on the form: the same solution works once it has passed
        await new Promise(function (r) { setTimeout(r, 3000); });
        return send(true);
      }
      // A fresh challenge fixes expired or reused ones
      if (!retried && (code === 'challenge_expired' || code === 'challenge_used' || code === 'challenge_failed')) {
        prepare(true);
        return send(true);
      }
      var fieldError = body.fields && body.fields[0];
      throw Object.assign(new Error(code || 'send_failed'), { code: fieldError || code });
    }

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (messageInput.value.trim().length < 2) {
        setStatus(ERRORS.message_required, 'error');
        messageInput.focus();
        return;
      }
      button.disabled = true;
      button.textContent = 'Sending…';
      setStatus('', '');
      try {
        await send(false);
        form.replaceWith(el('p', { class: 'tcf-status', role: 'status', text: successText }));
      } catch (error) {
        setStatus(ERRORS[error.code] || 'Sorry, your message could not be sent. Please try again.', 'error');
        button.disabled = false;
        button.textContent = submitLabel;
      }
    });
  }

  function init() {
    injectStyle();
    document.querySelectorAll('[data-forms-site]').forEach(mount);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
