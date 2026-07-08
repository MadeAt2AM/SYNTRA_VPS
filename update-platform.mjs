import fs from 'fs';
let content = fs.readFileSync('artifacts/web-app/src/pages/platform.tsx', 'utf8');
content = content.replace(/companies\.map\(\(company\)/, 'companies.map((company: PlatformCompany)');
fs.writeFileSync('artifacts/web-app/src/pages/platform.tsx', content);
