/* ============================================================================
 * db.js  —  IndexedDB persistence layer
 * ----------------------------------------------------------------------------
 * Everything lives locally in the browser. No server, no accounts. Images are
 * stored as Blobs inside IndexedDB so a large wardrobe won't blow the tiny
 * localStorage quota.
 *
 * Stores:
 *   garments   : one record per clothing item (with photo blob + CV analysis)
 *   wearlog    : one record each time an outfit is worn/logged (for 3-day rule)
 *   ratings    : one record per rated outfit (feeds the RL engine)
 *   profile    : singleton-ish settings (user photo, preferences, RL weights)
 * ========================================================================== */
(function (global) {
  'use strict';

  var DB_NAME = 'stylemind';
  var DB_VERSION = 1;
  var _db = null;

  function open() {
    return new Promise(function (resolve, reject) {
      if (_db) return resolve(_db);
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('garments')) {
          var g = db.createObjectStore('garments', { keyPath: 'id' });
          g.createIndex('category', 'category', { unique: false });
        }
        if (!db.objectStoreNames.contains('wearlog')) {
          var w = db.createObjectStore('wearlog', { keyPath: 'id', autoIncrement: true });
          w.createIndex('date', 'date', { unique: false });
        }
        if (!db.objectStoreNames.contains('ratings')) {
          db.createObjectStore('ratings', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('profile')) {
          db.createObjectStore('profile', { keyPath: 'key' });
        }
      };
      req.onsuccess = function (e) { _db = e.target.result; resolve(_db); };
      req.onerror = function (e) { reject(e.target.error); };
    });
  }

  function tx(store, mode) {
    return open().then(function (db) {
      return db.transaction(store, mode).objectStore(store);
    });
  }

  function reqPromise(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  function getAll(store) {
    return tx(store, 'readonly').then(function (os) { return reqPromise(os.getAll()); });
  }
  function put(store, value) {
    return tx(store, 'readwrite').then(function (os) { return reqPromise(os.put(value)); });
  }
  function add(store, value) {
    return tx(store, 'readwrite').then(function (os) { return reqPromise(os.add(value)); });
  }
  function del(store, key) {
    return tx(store, 'readwrite').then(function (os) { return reqPromise(os.delete(key)); });
  }
  function get(store, key) {
    return tx(store, 'readonly').then(function (os) { return reqPromise(os.get(key)); });
  }
  function clear(store) {
    return tx(store, 'readwrite').then(function (os) { return reqPromise(os.clear()); });
  }

  /* ---- convenience helpers -------------------------------------------------*/

  function uid(prefix) {
    return (prefix || 'g') + '_' + Date.now().toString(36) + '_' +
      Math.random().toString(36).slice(2, 7);
  }

  var Profile = {
    get: function (key, fallback) {
      return get('profile', key).then(function (r) {
        return r ? r.value : fallback;
      });
    },
    set: function (key, value) {
      return put('profile', { key: key, value: value });
    }
  };

  global.DB = {
    open: open,
    getAll: getAll,
    get: get,
    put: put,
    add: add,
    del: del,
    clear: clear,
    uid: uid,
    Profile: Profile
  };
})(window);
