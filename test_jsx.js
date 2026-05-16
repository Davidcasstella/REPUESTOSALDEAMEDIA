const fs = require('fs');

const code = fs.readFileSync('frontend/src/pages/KnowledgeBasePage.jsx', 'utf8');

// A very naive dive tag counter just to see if divs align.
let count = 0;
let lineNum = 1;
for (let line of code.split('\n')) {
    const openings = (line.match(/<div/g) || []).length;
    const closings = (line.match(/<\/div>/g) || []).length;
    count += openings;
    count -= closings;
    if (openings > 0 || closings > 0) {
        console.log(`Line ${lineNum}: ${line.trim()} | Open: ${openings}, Close: ${closings}, Total: ${count}`);
    }
    lineNum++;
}
console.log('Final div count:', count);
