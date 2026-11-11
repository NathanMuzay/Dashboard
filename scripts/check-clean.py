#!/usr/bin/env python3
"""Validate a clean clone of the current sources without modifying the working git repo."""
import json
import pathlib
import shutil
import subprocess
import tempfile
import time
import urllib.request


def validate(root, work):
    source = work / 'source'
    clone = work / 'clone'
    source.mkdir()
    paths = subprocess.check_output(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=root).decode().split('\0')
    for name in set(paths):
        if not name:
            continue
        path = root / name
        if path.is_file():
            target = source / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)

    def run(args, cwd=clone):
        subprocess.run(args, cwd=cwd, check=True)

    run(['git', 'init', '-q'], source)
    run(['git', 'add', '.'], source)
    run(['git', '-c', 'user.name=Lumi validation', '-c', 'user.email=validation@lumi.local', 'commit', '-qm', 'Snapshot for clean clone validation'], source)
    run(['git', 'clone', '--quiet', '--no-hardlinks', str(source), str(clone)], work)
    shutil.copy2(clone / '.env.example', clone / '.env')
    # Explicitly isolate from the development stack and its ports/volumes.
    override = work / 'ports.yml'
    override.write_text('''services:
      frontend:
        ports: !override
          - "127.0.0.1:18080:80"
      postgres:
        ports: !reset []
      mailpit:
        ports: !reset []
    ''')
    project = work.name
    compose = ['docker', 'compose', '-p', project, '-f', str(clone / 'docker-compose.yml'), '-f', str(override)]
    try:
        run(['npm', 'ci'])
        run(['npm', 'run', 'test', '-w', 'frontend'])
        run(['npm', 'run', 'build', '-w', 'frontend'])
        run(compose + ['build'])
        run(compose + ['up', '-d', '--wait'])
        for path in ['/dashboard', '/api/health', '/about.json']:
            for attempt in range(30):
                try:
                    with urllib.request.urlopen('http://127.0.0.1:18080' + path, timeout=5) as response:
                        data = response.read()
                        assert response.status == 200
                        if path == '/about.json':
                            services = json.loads(data)['server']['services']
                            assert sum(len(service['widgets']) for service in services) == 13
                        if path == '/dashboard':
                            assert "script-src 'self'" in response.headers['Content-Security-Policy']
                    break
                except Exception:
                    if attempt == 29:
                        raise
                    time.sleep(1)
        print('Clean clone build/start/HTTP passed.', flush=True)
    finally:
        # This unique project and its volumes were created only by this script.
        subprocess.run(compose + ['down', '-v', '--remove-orphans'], cwd=clone, check=False)


if __name__ == '__main__':
    with tempfile.TemporaryDirectory(prefix='lumi-clean-') as directory:
        validate(pathlib.Path(__file__).resolve().parents[1], pathlib.Path(directory))
