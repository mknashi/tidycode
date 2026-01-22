/**
 * File Handle Storage using IndexedDB
 * Persists File System Access API file handles across page reloads
 */

const DB_NAME = 'tidycode-file-handles';
const DB_VERSION = 1;
const STORE_NAME = 'file-handles';

/**
 * Open IndexedDB database
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Create object store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // Use absolutePath as key
        db.createObjectStore(STORE_NAME, { keyPath: 'absolutePath' });
      }
    };
  });
}

/**
 * Save file handle to IndexedDB
 * @param {string} absolutePath - Normalized absolute path
 * @param {FileSystemFileHandle} fileHandle - File handle to save
 * @returns {Promise<void>}
 */
export async function saveFileHandle(absolutePath, fileHandle) {
  if (!absolutePath || !fileHandle) {
    console.warn('[FileHandleStorage] Missing absolutePath or fileHandle');
    return;
  }

  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    await new Promise((resolve, reject) => {
      const request = store.put({
        absolutePath,
        fileHandle,
        savedAt: Date.now()
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    console.log('[FileHandleStorage] Saved file handle:', absolutePath);
    db.close();
  } catch (error) {
    console.error('[FileHandleStorage] Failed to save file handle:', error);
  }
}

/**
 * Get file handle from IndexedDB
 * @param {string} absolutePath - Normalized absolute path
 * @returns {Promise<FileSystemFileHandle|null>}
 */
export async function getFileHandle(absolutePath) {
  if (!absolutePath) {
    return null;
  }

  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    const result = await new Promise((resolve, reject) => {
      const request = store.get(absolutePath);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    db.close();

    if (result?.fileHandle) {
      console.log('[FileHandleStorage] Retrieved file handle:', absolutePath);
      return result.fileHandle;
    }

    return null;
  } catch (error) {
    console.error('[FileHandleStorage] Failed to get file handle:', error);
    return null;
  }
}

/**
 * Remove file handle from IndexedDB
 * @param {string} absolutePath - Normalized absolute path
 * @returns {Promise<void>}
 */
export async function removeFileHandle(absolutePath) {
  if (!absolutePath) {
    return;
  }

  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    await new Promise((resolve, reject) => {
      const request = store.delete(absolutePath);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    console.log('[FileHandleStorage] Removed file handle:', absolutePath);
    db.close();
  } catch (error) {
    console.error('[FileHandleStorage] Failed to remove file handle:', error);
  }
}

/**
 * Get all stored file handles
 * @returns {Promise<Array<{absolutePath: string, fileHandle: FileSystemFileHandle}>>}
 */
export async function getAllFileHandles() {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    const results = await new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    db.close();
    return results || [];
  } catch (error) {
    console.error('[FileHandleStorage] Failed to get all file handles:', error);
    return [];
  }
}

/**
 * Clear all file handles from IndexedDB
 * @returns {Promise<void>}
 */
export async function clearAllFileHandles() {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    await new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    console.log('[FileHandleStorage] Cleared all file handles');
    db.close();
  } catch (error) {
    console.error('[FileHandleStorage] Failed to clear file handles:', error);
  }
}

/**
 * Check if we already have permission (without requesting)
 * @param {FileSystemFileHandle} fileHandle - File handle to check
 * @returns {Promise<boolean>}
 */
export async function hasFilePermission(fileHandle) {
  try {
    const permissionStatus = await fileHandle.queryPermission({ mode: 'read' });
    return permissionStatus === 'granted';
  } catch (error) {
    console.warn('[FileHandleStorage] Permission query failed:', error);
    return false;
  }
}

/**
 * Request permission for file handle (requires user activation)
 * @param {FileSystemFileHandle} fileHandle - File handle to check
 * @returns {Promise<boolean>}
 */
export async function requestFilePermission(fileHandle) {
  try {
    const requestStatus = await fileHandle.requestPermission({ mode: 'read' });
    return requestStatus === 'granted';
  } catch (error) {
    console.warn('[FileHandleStorage] Permission request failed:', error);
    return false;
  }
}

/**
 * Read file from file handle with permission check
 * @param {FileSystemFileHandle} fileHandle - File handle to read
 * @param {boolean} skipPermissionCheck - Skip permission check (use when called from user interaction)
 * @returns {Promise<string>} File content
 */
export async function readFileFromHandle(fileHandle, skipPermissionCheck = false) {
  // Check permission first (but don't request if not granted)
  if (!skipPermissionCheck) {
    const hasPermission = await hasFilePermission(fileHandle);

    if (!hasPermission) {
      throw new Error('Permission not granted - user interaction required');
    }
  }

  // Read the file
  const file = await fileHandle.getFile();
  const content = await file.text();

  return content;
}

/**
 * Read file with permission request (requires user activation)
 * @param {FileSystemFileHandle} fileHandle - File handle to read
 * @returns {Promise<string>} File content
 */
export async function readFileFromHandleWithPermission(fileHandle) {
  // Check if we already have permission
  let hasPermission = await hasFilePermission(fileHandle);

  // If not, request it (requires user gesture)
  if (!hasPermission) {
    hasPermission = await requestFilePermission(fileHandle);
  }

  if (!hasPermission) {
    throw new Error('Permission denied to read file');
  }

  // Read the file
  const file = await fileHandle.getFile();
  const content = await file.text();

  return content;
}
