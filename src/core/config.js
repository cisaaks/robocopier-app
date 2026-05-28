// Config store - reads and writes config.json in the user data dir.
// Schema is the same as the PowerShell version so configs are compatible.

const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULTS = {
  defaultDestinationRoot: path.join(os.homedir(), 'Desktop', 'RoboCopier-mirrored'),
  warnFileCount: 200,
  warnSizeMB: 200,
  tasks: [],
};

class ConfigStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = this._load();
  }

  _load() {
    if (!fs.existsSync(this.filePath)) {
      const out = { ...DEFAULTS };
      this._write(out);
      return out;
    }
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      // Merge with defaults so old configs auto-upgrade
      const merged = { ...DEFAULTS, ...parsed };
      if (!Array.isArray(merged.tasks)) merged.tasks = [];
      return merged;
    } catch (e) {
      console.warn('Could not parse config.json, using defaults:', e.message);
      return { ...DEFAULTS };
    }
  }

  _write(data) {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  get()      { return this.data; }
  set(data)  { this.data = data; }
  save()     { this._write(this.data); }
}

module.exports = ConfigStore;
