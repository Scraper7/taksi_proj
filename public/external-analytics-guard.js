(function () {
  'use strict';

  var BLOCKED_PATTERNS = [
    /^https?:\/\/(?:[^/]+\.)?gtmpx\.com\/ga(?:[?#/]|$)/i,
    /[?&]xtId=[^&]*_yabrowser-/i
  ];

  function getUrl(value) {
    if (!value) return '';
    try {
      if (typeof value === 'string') return value;
      if (value.url) return String(value.url);
      return String(value);
    } catch (e) {
      return '';
    }
  }

  function isBlocked(value) {
    var url = getUrl(value);
    if (!url) return false;
    for (var i = 0; i < BLOCKED_PATTERNS.length; i += 1) {
      if (BLOCKED_PATTERNS[i].test(url)) return true;
    }
    return false;
  }

  function emptyResponse() {
    try {
      return Promise.resolve(new Response('', { status: 204, statusText: 'No Content' }));
    } catch (e) {
      return Promise.resolve({ ok: true, status: 204, text: function () { return Promise.resolve(''); }, json: function () { return Promise.resolve({}); } });
    }
  }

  try {
    if (typeof window.fetch === 'function') {
      var originalFetch = window.fetch;
      window.fetch = function (input, init) {
        if (isBlocked(input)) return emptyResponse();
        return originalFetch.apply(this, arguments);
      };
    }
  } catch (e) {}

  try {
    if (window.navigator && typeof window.navigator.sendBeacon === 'function') {
      var originalSendBeacon = window.navigator.sendBeacon.bind(window.navigator);
      window.navigator.sendBeacon = function (url, data) {
        if (isBlocked(url)) return true;
        return originalSendBeacon(url, data);
      };
    }
  } catch (e) {}

  try {
    if (typeof window.XMLHttpRequest === 'function') {
      var originalOpen = window.XMLHttpRequest.prototype.open;
      var originalSend = window.XMLHttpRequest.prototype.send;
      window.XMLHttpRequest.prototype.open = function (method, url) {
        this.__externalAnalyticsGuardBlocked = isBlocked(url);
        if (this.__externalAnalyticsGuardBlocked) return;
        return originalOpen.apply(this, arguments);
      };
      window.XMLHttpRequest.prototype.send = function () {
        if (this.__externalAnalyticsGuardBlocked) return;
        return originalSend.apply(this, arguments);
      };
    }
  } catch (e) {}

  try {
    var originalSetAttribute = window.Element && window.Element.prototype && window.Element.prototype.setAttribute;
    if (originalSetAttribute) {
      window.Element.prototype.setAttribute = function (name, value) {
        var attr = String(name || '').toLowerCase();
        if ((attr === 'src' || attr === 'href') && isBlocked(value)) return;
        return originalSetAttribute.apply(this, arguments);
      };
    }
  } catch (e) {}

  function getNodeUrl(node) {
    if (!node || node.nodeType !== 1) return '';
    try {
      return (
        (node.getAttribute && (node.getAttribute('src') || node.getAttribute('href'))) ||
        node.src ||
        node.href ||
        ''
      );
    } catch (e) {
      return '';
    }
  }

  function isBlockedNode(node) {
    return isBlocked(getNodeUrl(node));
  }

  function removeBlockedNode(node) {
    try {
      if (!node || node.nodeType !== 1) return;
      if (isBlockedNode(node)) {
        if (node.parentNode) node.parentNode.removeChild(node);
        return;
      }
      if (!node.querySelectorAll) return;
      var children = node.querySelectorAll('[src],[href]');
      for (var i = 0; i < children.length; i += 1) {
        if (isBlockedNode(children[i]) && children[i].parentNode)
          children[i].parentNode.removeChild(children[i]);
      }
    } catch (e) {}
  }

  try {
    if (window.Node && window.Node.prototype) {
      var originalAppendChild = window.Node.prototype.appendChild;
      var originalInsertBefore = window.Node.prototype.insertBefore;
      if (originalAppendChild) {
        window.Node.prototype.appendChild = function (child) {
          if (isBlockedNode(child)) return child;
          return originalAppendChild.apply(this, arguments);
        };
      }
      if (originalInsertBefore) {
        window.Node.prototype.insertBefore = function (child) {
          if (isBlockedNode(child)) return child;
          return originalInsertBefore.apply(this, arguments);
        };
      }
    }
  } catch (e) {}

  try {
    if (typeof window.MutationObserver === 'function') {
      var observer = new window.MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i += 1) {
          if (mutations[i].type === 'attributes') {
            removeBlockedNode(mutations[i].target);
            continue;
          }
          var nodes = mutations[i].addedNodes || [];
          for (var j = 0; j < nodes.length; j += 1) {
            var node = nodes[j];
            if (!node || node.nodeType !== 1) continue;
            removeBlockedNode(node);
          }
        }
      });
      observer.observe(document.documentElement || document, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'href'] });
    }
  } catch (e) {}
})();
