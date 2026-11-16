(function (root) {
  "use strict";
  let database;
  function open() {
    if (database) return database;
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open("salon-amida", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("draws");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Storage blocked"));
    });
    return database;
  }
  async function read(key) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("draws", "readonly");
      const request = tx.objectStore("draws").get(key);
      tx.oncomplete = () => resolve(request.result || null);
      tx.onabort = tx.onerror = () => reject(tx.error || new Error("Read failed"));
    });
  }
  async function claim(key, candidate) {
    const db = await open();
    return new Promise((resolve, reject) => {
      // Serialize concurrent draws in different tabs with one read/write transaction.
      const tx = db.transaction("draws", "readwrite");
      const store = tx.objectStore("draws");
      let result;
      const request = store.get(key);
      request.onsuccess = () => {
        if (request.result) result = { record: request.result, fresh: false };
        else { store.add(candidate, key); result = { record: candidate, fresh: true }; }
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () => reject(tx.error || new Error("Save failed"));
    });
  }
  root.DrawStore = Object.freeze({ read, claim });
})(globalThis);
