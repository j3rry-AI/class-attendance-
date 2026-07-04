const crypto = require('crypto');

function validateRegNumber(reg_number) {
  const strict = /^[A-Z]{3}\d{6}$/i;
  const legacy1 = /^[A-Z]{3}\/\d{2}\/\d{4}$/i;
  const legacy2 = /^[A-Z]{3}\d{6}$/i;
  const legacy3 = /^\d{4}[A-Z]{2}\d{3}$/i;
  const permissive = /^[A-Z]+\/\d+$/i;
  const lecturer = /^FUTA\/STAFF\/(Dr|Professor|Prof|Mr|Mrs|Ms)\/[A-Za-z\-]+\/[A-Za-z\-\s]+$/i;

  return strict.test(reg_number) || legacy1.test(reg_number) || legacy2.test(reg_number) || legacy3.test(reg_number) || permissive.test(reg_number) || lecturer.test(reg_number);
}

function normalizeRegNumber(reg_number) {
  return reg_number.replace(/\//g, '').replace(/[-\s]/g, '').toUpperCase();
}

function hashBuffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

const DEFAULT_LIVENESS_ENTROPY_THRESHOLD = parseFloat(process.env.LIVENESS_ENTROPY_THRESHOLD || '1.2');

function analyzeImageLiveness(imageBuffer, threshold = DEFAULT_LIVENESS_ENTROPY_THRESHOLD) {
  let entropy = 0;
  const frequencies = new Array(256).fill(0);
  for (let i = 0; i < imageBuffer.length; i++) frequencies[imageBuffer[i]]++;
  for (let i = 0; i < 256; i++) {
    if (frequencies[i] > 0) {
      const p = frequencies[i] / imageBuffer.length;
      entropy -= p * Math.log2(p);
    }
  }
  return { isLikelyLive: entropy > threshold, entropy };
}

module.exports = {
  validateRegNumber,
  normalizeRegNumber,
  hashBuffer,
  hashPassword,
  analyzeImageLiveness,
  DEFAULT_LIVENESS_ENTROPY_THRESHOLD
};
