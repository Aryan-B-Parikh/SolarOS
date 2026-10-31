const fs = require('fs');
const c = fs.readFileSync('scripts/_journey-fixed.mjs', 'utf8');
const newC = c.replace('recorded_by: null', 'recorded_by: null, recorder: { connect: { id: "00000000-0000-0000-0000-000000000001" } }');
fs.writeFileSync('scripts/_journey-fixed.mjs', newC);
console.log('added recorder');
