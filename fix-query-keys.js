const fs = require('fs');
const glob = require('glob');

const files = glob.sync('artifacts/web-app/src/**/*.{ts,tsx}');

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;

  const hookReplacements = [
    { name: 'useGetMe', key: 'getGetMeQueryKey()' },
    { name: 'useListUsers', key: 'getListUsersQueryKey()' },
    { name: 'useListLeaveRequests', key: 'getListLeaveRequestsQueryKey()' },
    { name: 'useListTimeLogs', key: 'getListTimeLogsQueryKey()' },
    { name: 'useListShifts', key: 'getListShiftsQueryKey()' },
    { name: 'useListWorkplaces', key: 'getListWorkplacesQueryKey()' },
    { name: 'useListInvitations', key: 'getListInvitationsQueryKey()' },
  ];

  for (const hook of hookReplacements) {
    const regex = new RegExp(`${hook.name}\\(\\{ query: \\{ enabled:([^,}]+)\\s*\\} \\}\\)`, 'g');
    if (regex.test(content)) {
      content = content.replace(regex, `${hook.name}({ query: { enabled:$1, queryKey: ${hook.key} } })`);
      changed = true;
    }
  }

  // useGetCompany is special because it takes an ID
  const companyRegex = /useGetCompany\(([^,]+), \{ query: \{ enabled:([^,}]+)\s*\} \}\)/g;
  if (companyRegex.test(content)) {
    content = content.replace(companyRegex, `useGetCompany($1, { query: { enabled:$2, queryKey: getGetCompanyQueryKey($1) } })`);
    changed = true;
  }

  // Also fix imports
  if (changed) {
    const importRegex = /import \{([^}]+)\} from "@workspace\/api-client-react";/;
    const match = content.match(importRegex);
    if (match) {
      let imports = match[1];
      for (const hook of hookReplacements) {
        if (content.includes(hook.key) && !imports.includes(hook.key.split('(')[0])) {
          imports += `, ${hook.key.split('(')[0]}`;
        }
      }
      if (content.includes('getGetCompanyQueryKey') && !imports.includes('getGetCompanyQueryKey')) {
        imports += `, getGetCompanyQueryKey`;
      }
      content = content.replace(importRegex, `import {${imports}} from "@workspace/api-client-react";`);
    }
    fs.writeFileSync(file, content);
    console.log('Fixed', file);
  }
}
