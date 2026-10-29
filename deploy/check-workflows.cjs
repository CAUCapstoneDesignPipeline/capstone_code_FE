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
const deploy = yaml.load(fs.readFileSync(root + 'gcp-deploy.yml', 'utf8'));
assert.deepEqual(Object.keys(deploy.on), ['workflow_dispatch']);
assert.match(deploy.jobs.deploy.if, /GCP_DEPLOY_ENABLED == 'true'/);
assert.match(deploy.jobs.deploy.if, /refs\/heads\/main/);
assert.match(deploy.jobs.deploy.uses, /^CAUCapstoneDesignPipeline\/capstone_code_BE\/\.github\/workflows\/gcp-deploy-reusable\.yml@[a-f0-9]{40}$/);
assert.equal(deploy.jobs.deploy.with.deploy_tool_sha, deploy.jobs.deploy.uses.split('@')[1]);
assert.equal(deploy.jobs.deploy.with.component, 'web');
assert.equal(deploy.jobs.deploy.permissions['id-token'], 'write');
const inputs = ['operation','component','source_sha','image_digest','manifest_path','expected_release','operation_id','deploy_tool_sha'];
assert.deepEqual(Object.keys(deploy.jobs.deploy.with).sort(), inputs.sort());
for(const input of Object.keys(deploy.on.workflow_dispatch.inputs)) {
  assert.equal(deploy.on.workflow_dispatch.inputs[input].required, true);
  assert.equal(deploy.jobs.deploy.with[input], '${{ inputs.' + input + ' }}');
}
assert.deepEqual(deploy.on.workflow_dispatch.inputs.operation.options, ['deploy','rollback']);
// Optional local integration check against the actual immutable BE commit, never a branch tip.
if (process.env.BE_REPO_PATH) {
  const { execFileSync } = require('node:child_process');
  const commit = deploy.jobs.deploy.with.deploy_tool_sha;
  const source = execFileSync('git', ['-C',process.env.BE_REPO_PATH,'show',commit + ':.github/workflows/gcp-deploy-reusable.yml'], {encoding:'utf8'});
  const reusable = yaml.load(source);
  assert.deepEqual(Object.keys(reusable.on.workflow_call.inputs).sort(), inputs.sort());
  for(const input of inputs) {
    assert.equal(reusable.on.workflow_call.inputs[input].type, 'string');
    assert.equal(reusable.on.workflow_call.inputs[input].required, true);
  }
  assert.equal(reusable.jobs.deploy.environment, 'production');
  assert.ok(reusable.jobs.deploy.steps.some(step => step.with?.path === 'reviewed-release' && step.with?.ref === '${{ vars.GCP_RELEASE_MANIFEST_SHA }}'));
  assert.ok(reusable.jobs.deploy.steps.some(step => step.with?.repository === 'CAUCapstoneDesignPipeline/capstone_code_BE' && step.with?.ref === '${{ inputs.deploy_tool_sha }}'));
  assert.deepEqual(Object.keys(reusable.on.workflow_call.outputs).sort(), ['operation_id','release_id']);
}
console.log('Workflow publication gates, immutable actions, caller pin/interface and rerun artifact checks passed');
