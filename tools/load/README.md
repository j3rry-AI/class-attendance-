Load test scaffold (k6)

Example k6 script (install k6 separately):

Save this as `tools/load/test.js` and run `k6 run tools/load/test.js`.

Example content:

import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  vus: 10,
  duration: '30s',
};

export default function () {
  const res = http.get('http://127.0.0.1:3000/api/security-settings');
  check(res, { 'status 200': (r) => r.status === 200 });
  sleep(1);
}

Note: k6 must be installed separately. This README is a scaffold with instructions.
