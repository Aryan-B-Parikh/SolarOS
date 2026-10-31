const fs = require('fs');
let lines = fs.readFileSync('scripts/_progress-journey.mjs', 'utf8').split('\n');
// Find line 235 (0-indexed 234): the `  });` for checklist; insert closing `});` after it
// Actually line 235 already has `  });` which closes the data block, but `create({` needs another `});`
for (let i = 0; i < lines.length; i++) {
  // Find the `  });` that closes the checklist data block (around line 235)
  if (lines[i].trim() === '});' && lines[i-1] && lines[i-1].trim().includes('inverter_synchronized')) {
    // This is the data block close; the next line should have `console.log` but is missing `});`
    // Actually we need to insert `  });` after this line to close create()
    lines.splice(i+1, 0, '  });');
    break;
  }
}
fs.writeFileSync('scripts/_progress-journey.mjs', lines.join('\n'));
console.log('inserted closing brace');
