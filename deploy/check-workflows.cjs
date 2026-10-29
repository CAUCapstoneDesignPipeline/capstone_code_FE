// Uses js-yaml from the frozen npm lockfile; no network/cloud interaction.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const yaml = require('js-yaml');
const root = '.github/workflows/';
const publish = yaml.load(fs.readFileSync(root + 'gcp-publish-image.yml', 'utf8'));
assert.deepEqual(Object.keys(publish.on), ['workflow_dispatch']);
assert.equal(publish.permissions.contents, 'read');
assert.equal(publish.jobs.publish.environment, 'image-publish');
assert.equal(publish.jobs.publish.needs, 'checks');
assert.equal(publish.jobs.checks.uses, './.github/workflows/ci.yml');
assert.match(publish.jobs.checks.if, /GCP_IMAGE_PUBLISH_ENABLED == 'true'/);
assert.match(publish.jobs.checks.if, /refs\/heads\/main/);
assert.equal(publish.jobs.publish.permissions['id-token'], 'write');
assert.equal(publish.jobs.publish.steps.find(step => step.id === 'existing').run, 'python3 deploy/gcp-image.py lookup');
const push = publish.jobs.publish.steps.find(step => step.name === 'Publish the tested image without rebuilding');
assert.equal(push.run, 'docker push "$IMAGE_TAG"');
assert.equal(push.if, "steps.existing.outputs.exists != 'true'");
assert.match(publish.jobs.publish.steps.at(-1).with.name, /run_id.*run_attempt/);
const ci = yaml.load(fs.readFileSync(root + 'ci.yml', 'utf8'));
assert.ok(ci.jobs.verify.steps.some(step => step.run?.includes('npm run typecheck') && step.run.includes('npm test')));
for (const file of fs.readdirSync(root)) {
  const workflow = yaml.load(fs.readFileSync(root + file, 'utf8'));
  for (const job of Object.values(workflow.jobs)) {
    for (const step of job.steps || []) {
      if (step.uses) assert.match(step.uses, /@[a-f0-9]{40}$/, `Unpinned action in ${file}`);
    }
  }
}
console.log('Workflow publication gates, immutable actions and rerun artifact checks passed');
