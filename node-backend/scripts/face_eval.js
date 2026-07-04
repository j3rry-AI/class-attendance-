// Simple face descriptor evaluator
// Usage: node scripts/face_eval.js path/to/pairs.json [threshold]
// pairs.json structure: { pairs: [ { a: [..128], b: [..128], same: true|false }, ... ] }

const fs = require('fs');

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-12);
}

async function main() {
  const file = process.argv[2] || 'scripts/sample_descriptors.json';
  const threshold = parseFloat(process.argv[3] || '0.6');

  if (!fs.existsSync(file)) {
    console.error('File not found:', file);
    process.exit(2);
  }

  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const pairs = data.pairs || [];

  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (const p of pairs) {
    const s = cosine(p.a, p.b);
    const predSame = s >= threshold;
    if (predSame && p.same) tp++;
    else if (predSame && !p.same) fp++;
    else if (!predSame && !p.same) tn++;
    else if (!predSame && p.same) fn++;
  }

  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : 2 * (precision * recall) / (precision + recall);

  console.log('Pairs:', pairs.length);
  console.log('TP', tp, 'FP', fp, 'TN', tn, 'FN', fn);
  console.log('Precision:', precision.toFixed(4));
  console.log('Recall:', recall.toFixed(4));
  console.log('F1:', f1.toFixed(4));
}

main().catch(err => { console.error(err); process.exit(1); });
