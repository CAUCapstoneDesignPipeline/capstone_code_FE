import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
import urllib.error

spec = importlib.util.spec_from_file_location('gcp_image', Path(__file__).parents[1] / 'gcp-image.py')
image = importlib.util.module_from_spec(spec)
spec.loader.exec_module(image)
SHA = 'a' * 40
DIGEST = 'sha256:' + 'b' * 64


class PublicationTest(unittest.TestCase):
    def setUp(self):
        self.env = {
            'GITHUB_REPOSITORY': image.REPOSITORY, 'GITHUB_REPOSITORY_ID': image.REPOSITORY_ID,
            'GITHUB_REPOSITORY_OWNER_ID': image.OWNER_ID, 'GITHUB_REF': 'refs/heads/main',
            'GITHUB_EVENT_NAME': 'workflow_dispatch', 'GCP_IMAGE_PUBLISH_ENABLED': 'true',
            'GITHUB_WORKFLOW_REF': image.REPOSITORY + '/.github/workflows/gcp-publish-image.yml@refs/heads/main',
            'GITHUB_SHA': SHA, 'GCP_PROJECT_ID': 'fixture-project', 'GCP_PROJECT_NUMBER': '123456789',
            'GCP_REGION': 'asia-northeast3', 'AR_REPOSITORY': 'capstone-web',
            'GCP_WIF_PROVIDER': 'projects/123456789/locations/global/workloadIdentityPools/github/providers/github',
            'GCP_IMAGE_SERVICE_ACCOUNT': 'web-publisher@fixture-project.iam.gserviceaccount.com',
        }

    def test_canonical_manual_main_build(self):
        self.assertEqual(image.configuration(self.env)['tag'],
                         'asia-northeast3-docker.pkg.dev/fixture-project/capstone-web/web:sha-' + SHA)

    def test_wrong_repo_ref_workflow_fork_or_gate_is_rejected(self):
        for key, value in {
            'GITHUB_REPOSITORY': 'attacker/capstone_code_FE', 'GITHUB_REPOSITORY_ID': '123',
            'GITHUB_REPOSITORY_OWNER_ID': '123', 'GITHUB_REF': 'refs/heads/develop',
            'GITHUB_EVENT_NAME': 'pull_request', 'GCP_IMAGE_PUBLISH_ENABLED': '',
            'GITHUB_WORKFLOW_REF': image.REPOSITORY + '/.github/workflows/evil.yml@refs/heads/main',
            'GITHUB_SHA': 'main', 'GCP_PROJECT_ID': 'https://bad', 'GCP_PROJECT_NUMBER': '',
            'GCP_REGION': 'us-central1', 'AR_REPOSITORY': 'capstone-be',
            'GCP_WIF_PROVIDER': 'projects/999/locations/global/workloadIdentityPools/github/providers/github',
            'GCP_IMAGE_SERVICE_ACCOUNT': 'web-publisher@other-project.iam.gserviceaccount.com',
        }.items():
            with self.subTest(key=key), self.assertRaises(ValueError):
                image.configuration(dict(self.env, **{key: value}))

    def test_existing_tag_is_returned_as_immutable_digest(self):
        config = image.configuration(self.env)
        def opener(request, timeout):
            self.assertEqual(timeout, 30)
            self.assertEqual(request.headers['Authorization'], 'Bearer synthetic')
            name = request.full_url.removeprefix('https://artifactregistry.googleapis.com/v1/')
            return io.BytesIO(json.dumps({'name': name, 'version': name.split('/tags/')[0] + '/versions/' + DIGEST}).encode())
        self.assertEqual(image.lookup_tag(config, 'synthetic', opener), DIGEST)

    def test_only_not_found_permits_publish(self):
        for code in (404, 401, 403, 429, 500):
            def opener(request, timeout):
                raise urllib.error.HTTPError(request.full_url, code, 'synthetic', {}, None)
            if code == 404:
                self.assertIsNone(image.lookup_tag(image.configuration(self.env), 'synthetic', opener))
            else:
                with self.assertRaises(ValueError):
                    image.lookup_tag(image.configuration(self.env), 'synthetic', opener)

    def test_mismatched_registry_response_rejected(self):
        for value in ({'name': 'other', 'version': DIGEST}, {}, {'name': 'other', 'version': 'latest'}):
            with self.assertRaises(ValueError):
                image.lookup_tag(image.configuration(self.env), 'synthetic',
                                 lambda request, timeout: io.BytesIO(json.dumps(value).encode()))

    def test_rerun_source_platform_and_nonroot_binding(self):
        config = image.configuration(self.env)
        inspection = [{'Architecture': 'amd64', 'Os': 'linux', 'Config': {'User': '101:101', 'Labels': {
            'org.opencontainers.image.source': 'https://github.com/' + image.REPOSITORY,
            'org.opencontainers.image.revision': SHA}}}]
        self.assertEqual(image.metadata(config, DIGEST, inspection)['sourceSha'], SHA)
        for key, value in [('Architecture', 'arm64'), ('Os', 'windows')]:
            invalid = json.loads(json.dumps(inspection)); invalid[0][key] = value
            with self.assertRaises(ValueError): image.metadata(config, DIGEST, invalid)
        for value in ('', 'root', '0', '0:0', '0:101', 'root:101'):
            invalid = json.loads(json.dumps(inspection)); invalid[0]['Config']['User'] = value
            with self.assertRaises(ValueError): image.metadata(config, DIGEST, invalid)
        inspection[0]['Config']['Labels']['org.opencontainers.image.revision'] = 'c' * 40
        with self.assertRaises(ValueError): image.metadata(config, DIGEST, inspection)

    def test_bundle_rejects_private_material_without_printing_it(self):
        with tempfile.TemporaryDirectory() as directory:
            bundle = Path(directory) / 'main.js'
            bundle.write_text('const api="/api";')
            image.scan_bundle(directory)
            for value in ('AI_SERVICE_TOKEN', 'https://ai.internal:8443/', '-----BEGIN PRIVATE KEY-----'):
                bundle.write_text(value)
                with self.assertRaises(ValueError): image.scan_bundle(directory)


if __name__ == '__main__':
    unittest.main()
