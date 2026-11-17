export class ChromeNanoStatus {
  constructor() {
    this.snapshot = { state: 'checking', progress: 0, reason: '' };
    this.listeners = new Set();
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  set(state, details = {}) {
    this.snapshot = { ...this.snapshot, state, reason: '', ...details };
    this.listeners.forEach(listener => listener());
  }
}
