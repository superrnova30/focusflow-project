const fs = require('fs');
const path = 'src/screens/TasksScreen.js';
let content = fs.readFileSync(path, 'utf8');
const before = (content.match(/\\n/g) || []).length;
content = content.replace(/\\n/g, '\n');
const after = (content.match(/\\n/g) || []).length;
fs.writeFileSync(path, content, 'utf8');
console.log(`replaced ${before} literal \\n sequences, remaining ${after}`);
