import os
import sys
import requests
import subprocess
from pathlib import Path

TOKEN = os.getenv("GITHUB_TOKEN")
if not TOKEN:
    print("Missing env var GITHUB_TOKEN", file=sys.stderr)
    sys.exit(1)

headers = {
    "Authorization": f"Bearer {TOKEN}",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}

def get_all_repos():
    url = "https://api.github.com/user/repos"
    params = {
        "visibility": "all",
        "affiliation": "owner",
        "per_page": 100,
        "page": 1,
        "sort": "full_name",
        "direction": "asc",
    }

    while True:
        r = requests.get(url, headers=headers, params=params, timeout=30)
        r.raise_for_status()
        data = r.json()
        if not data:
            break
        for repo in data:
            if not repo.get("fork", False):
                yield repo
        params["page"] += 1

def run(cmd, cwd=None):
    return subprocess.run(cmd, cwd=cwd, check=False, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

def clone_repo(repo, base_dir: Path, update_if_exists: bool = False):
    name = repo["name"]
    dest = base_dir / name

    ssh_url = repo.get("ssh_url")     # git@github.com:owner/repo.git
    https_url = repo.get("clone_url") # https://github.com/owner/repo.git

    if dest.exists():
        if update_if_exists and (dest / ".git").exists():
            print(f"[SKIP->UPDATE] {name} exists, pulling...")
            r = run(["git", "-C", str(dest), "pull", "--ff-only"])
            if r.returncode != 0:
                print(f"  pull failed: {r.stderr.strip()}")
            return
        print(f"[SKIP] {name} already exists at {dest}")
        return

    dest.parent.mkdir(parents=True, exist_ok=True)

    # 1) try SSH
    print(f"[CLONE][SSH ] {name} -> {dest}")
    r = run(["git", "clone", ssh_url, str(dest)])
    if r.returncode == 0:
        return

    print(f"  SSH failed, fallback to HTTPS. error: {r.stderr.strip()}")

    # 2) fallback HTTPS
    print(f"[CLONE][HTTP] {name} -> {dest}")
    r2 = run(["git", "clone", https_url, str(dest)])
    if r2.returncode != 0:
        print(f"  HTTPS failed: {r2.stderr.strip()}")


def main():
    # Default dir：~/Repos
    base_dir = Path(os.getenv("GITHUB_CLONE_DIR", "~/Repos")).expanduser().resolve()
    base_dir.mkdir(parents=True, exist_ok=True)

    update_if_exists = os.getenv("GITHUB_UPDATE_EXISTING", "1") in ("1", "true", "True")

    out_file = os.getenv("GITHUB_REPO_LIST_FILE", "").strip()
    fp = open(out_file, "w", encoding="utf-8") if out_file else None

    try:
        for repo in get_all_repos():
            html_url = repo["html_url"]
            https_clone = repo.get("clone_url")
            ssh_clone = repo.get("ssh_url")

            line = f"{html_url}\t{https_clone}\t{ssh_clone}"
            print(line)
            if fp:
                fp.write(line + "\n")

            clone_repo(repo, base_dir=base_dir, update_if_exists=update_if_exists)
    finally:
        if fp:
            fp.close()


if __name__ == "__main__":
    main()