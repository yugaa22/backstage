/*
 * Copyright 2022 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

function showHrTime([s, ns]: [number, number]) {
  return (s + ns / 1000_000_000).toFixed(3);
}

const start = process.hrtime();

import { createBackend } from '@backstage/backend-defaults';

console.log('IMPORT', showHrTime(process.hrtime(start)));

const backend = createBackend();

console.log('CREATE', showHrTime(process.hrtime(start)));

backend.add(import('@backstage/plugin-adr-backend'));
console.log('IMPORT plugin-adr-backend', showHrTime(process.hrtime(start)));
backend.add(import('@backstage/plugin-app-backend/alpha'));
console.log(
  'IMPORT plugin-app-backend/alpha',
  showHrTime(process.hrtime(start)),
);
backend.add(import('@backstage/plugin-azure-devops-backend'));
console.log(
  'IMPORT plugin-azure-devops-backend',
  showHrTime(process.hrtime(start)),
);
backend.add(import('@backstage/plugin-badges-backend'));
console.log('IMPORT plugin-badges-backend', showHrTime(process.hrtime(start)));
backend.add(import('@backstage/plugin-catalog-backend-module-unprocessed'));
console.log(
  'IMPORT plugin-catalog-backend-module-unprocessed',
  showHrTime(process.hrtime(start)),
);
backend.add(
  import('@backstage/plugin-catalog-backend-module-scaffolder-entity-model'),
);
console.log(
  'IMPORT plugin-catalog-backend-module-scaffolder-entity-model',
  showHrTime(process.hrtime(start)),
);
backend.add(import('@backstage/plugin-catalog-backend/alpha'));
console.log(
  'IMPORT plugin-catalog-backend/alpha',
  showHrTime(process.hrtime(start)),
);
backend.add(import('@backstage/plugin-devtools-backend'));
console.log(
  'IMPORT plugin-devtools-backend',
  showHrTime(process.hrtime(start)),
);
backend.add(import('@backstage/plugin-entity-feedback-backend'));
console.log(
  'IMPORT plugin-entity-feedback-backend',
  showHrTime(process.hrtime(start)),
);
backend.add(import('@backstage/plugin-jenkins-backend'));
console.log('IMPORT plugin-jenkins-backend', showHrTime(process.hrtime(start)));
backend.add(import('@backstage/plugin-kubernetes-backend/alpha'));
console.log(
  'IMPORT plugin-kubernetes-backend/alpha',
  showHrTime(process.hrtime(start)),
);
backend.add(import('@backstage/plugin-lighthouse-backend'));
console.log(
  'IMPORT plugin-lighthouse-backend',
  showHrTime(process.hrtime(start)),
);
backend.add(import('@backstage/plugin-linguist-backend'));
console.log(
  'IMPORT plugin-linguist-backend',
  showHrTime(process.hrtime(start)),
);
backend.add(import('@backstage/plugin-playlist-backend'));
console.log(
  'IMPORT plugin-playlist-backend',
  showHrTime(process.hrtime(start)),
);
backend.add(import('@backstage/plugin-nomad-backend'));
console.log('IMPORT plugin-nomad-backend', showHrTime(process.hrtime(start)));
backend.add(
  import('@backstage/plugin-permission-backend-module-allow-all-policy'),
);
console.log(
  'IMPORT plugin-permission-backend-module-allow-all-policy',
  showHrTime(process.hrtime(start)),
);
backend.add(import('@backstage/plugin-permission-backend/alpha'));
console.log(
  'IMPORT plugin-permission-backend/alpha',
  showHrTime(process.hrtime(start)),
);
backend.add(import('@backstage/plugin-proxy-backend/alpha'));
console.log(
  'IMPORT plugin-proxy-backend/alpha',
  showHrTime(process.hrtime(start)),
);
backend.add(import('@backstage/plugin-scaffolder-backend/alpha'));
console.log(
  'IMPORT plugin-scaffolder-backend/alpha',
  showHrTime(process.hrtime(start)),
);
backend.add(import('@backstage/plugin-search-backend-module-catalog/alpha'));
console.log(
  'IMPORT plugin-search-backend-module-catalog/alpha',
  showHrTime(process.hrtime(start)),
);
backend.add(import('@backstage/plugin-search-backend-module-explore/alpha'));
console.log(
  'IMPORT plugin-search-backend-module-explore/alpha',
  showHrTime(process.hrtime(start)),
);
backend.add(import('@backstage/plugin-search-backend-module-techdocs/alpha'));
console.log(
  'IMPORT plugin-search-backend-module-techdocs/alpha',
  showHrTime(process.hrtime(start)),
);
backend.add(
  import('@backstage/plugin-catalog-backend-module-backstage-openapi'),
);
console.log(
  'IMPORT plugin-catalog-backend-module-backstage-openapi',
  showHrTime(process.hrtime(start)),
);
backend.add(import('@backstage/plugin-search-backend/alpha'));
console.log(
  'IMPORT plugin-search-backend/alpha',
  showHrTime(process.hrtime(start)),
);
backend.add(import('@backstage/plugin-techdocs-backend/alpha'));
console.log(
  'IMPORT plugin-techdocs-backend/alpha',
  showHrTime(process.hrtime(start)),
);
backend.add(import('@backstage/plugin-todo-backend'));
console.log('IMPORT plugin-todo-backend', showHrTime(process.hrtime(start)));
backend.add(import('@backstage/plugin-sonarqube-backend'));
console.log(
  'IMPORT plugin-sonarqube-backend',
  showHrTime(process.hrtime(start)),
);

console.log('STARTING', showHrTime(process.hrtime(start)));
backend.start();
console.log('STARTED', showHrTime(process.hrtime(start)));
