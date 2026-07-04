const fs = require('fs');
const path = require('path');

function parseEnv(content) {
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const equalsIndex = line.indexOf('=');
    if (equalsIndex <= 0) continue;

    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function load() {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '.env'),
    path.resolve(__dirname, '..', '.env')
  ];

  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        const contents = fs.readFileSync(filePath, 'utf8');
        parseEnv(contents);
        return;
      }
    } catch (_) {
      // ignore read failures and continue searching
    }
  }
}

module.exports = { load };
