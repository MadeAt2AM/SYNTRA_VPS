const fs = require('fs');

// 1. register.tsx
let register = fs.readFileSync('artifacts/web-app/src/pages/register.tsx', 'utf8');
register = register.replace(/err\.error \|\|/g, 'err.data?.error ||');
fs.writeFileSync('artifacts/web-app/src/pages/register.tsx', register);

// 2. schedule.tsx
let schedule = fs.readFileSync('artifacts/web-app/src/pages/schedule.tsx', 'utf8');
schedule = schedule.replace(/const handleStatusChange = \(id: number, status: 'draft' \| 'published' \| 'cancelled'\) => \{[\s\S]*?updateShift\.mutate\(\{ id, data: \{ status \} \}\)/, 
`const handleStatusChange = (shift: any, status: 'draft' | 'published' | 'cancelled') => {
    updateShift.mutate({ id: shift.id, data: { status, startTime: shift.startTime, endTime: shift.endTime, employeeId: shift.employeeId, workplaceId: shift.workplaceId, role: shift.role } })`);
fs.writeFileSync('artifacts/web-app/src/pages/schedule.tsx', schedule);

// 3. settings.tsx
let settings = fs.readFileSync('artifacts/web-app/src/pages/settings.tsx', 'utf8');
settings = settings.replace(/query: \{ enabled: !!user && !!user\.companyId && user\.role === 'admin' \} \n/, `query: { enabled: !!user && !!user.companyId && user.role === 'admin', queryKey: ['/api/companies', user?.companyId || 0] } \n`);
fs.writeFileSync('artifacts/web-app/src/pages/settings.tsx', settings);

// 4. time-logs.tsx
let timeLogs = fs.readFileSync('artifacts/web-app/src/pages/time-logs.tsx', 'utf8');
timeLogs = timeLogs.replace(/clockOut\.mutate\(\{ data:/, `if (!activeLog) return; clockOut.mutate({ id: activeLog.id, data:`);
fs.writeFileSync('artifacts/web-app/src/pages/time-logs.tsx', timeLogs);

// 5. platform.tsx imports
let platform = fs.readFileSync('artifacts/web-app/src/pages/platform.tsx', 'utf8');
if (!platform.includes('import type { PlatformCompany }')) {
  platform = platform.replace(/import \{ Building, Users, Activity, Plus \} from "lucide-react";/, `import { Building, Users, Activity, Plus } from "lucide-react";\nimport type { PlatformCompany } from "@/lib/platform-api";`);
}
fs.writeFileSync('artifacts/web-app/src/pages/platform.tsx', platform);

