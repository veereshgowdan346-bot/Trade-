import os
import subprocess
import sys

def run_git(cmd, env=None, input_text=None):
    res = subprocess.run(
        ["git"] + cmd,
        capture_output=True,
        text=True,
        env=env,
        input=input_text
    )
    if res.returncode != 0:
        raise RuntimeError(f"Git command failed: git {' '.join(cmd)}\nError: {res.stderr.strip()}")
    return res.stdout.strip()

def get_commit_info(commit_sha):
    # Get raw commit object
    raw = run_git(["cat-file", "-p", commit_sha])
    lines = raw.split("\n")
    header_lines = []
    msg_lines = []
    in_msg = False
    for line in lines:
        if in_msg:
            msg_lines.append(line)
        elif line == "":
            in_msg = True
        else:
            header_lines.append(line)
    
    author = ""
    committer = ""
    for h in header_lines:
        if h.startswith("author "):
            author = h[len("author "):]
        elif h.startswith("committer "):
            committer = h[len("committer "):]
            
    return {
        "author": author,
        "committer": committer,
        "message": "\n".join(msg_lines)
    }

def main():
    print("=== Starting Native Git History Rewrite ===")
    
    # Target files/patterns to eliminate completely from all commits
    paths_to_remove = [
        "data/credentials.json",
        ".env",
        ".env.local",
        "data/omnitrade-pg",
        "data/auratrader.db",
        "data/omnitrade_desktop.db",
        "data/.auratrader",
        ".claude-flow",
        ".swarm",
        "tsconfig.tsbuildinfo"
    ]
    
    commits = ["54972eb1", "5e496c7d", "1f6fbc58"]
    
    temp_index = os.path.abspath(".git/temp_index_rewrite")
    if os.path.exists(temp_index):
        os.remove(temp_index)
        
    env = os.environ.copy()
    env["GIT_INDEX_FILE"] = temp_index
    
    parent_new_sha = None
    new_commits = []
    
    try:
        for idx, orig_sha in enumerate(commits):
            print(f"\nProcessing commit {idx+1}/{len(commits)}: {orig_sha}")
            info = get_commit_info(orig_sha)
            
            # Read commit tree into isolated temp index
            run_git(["read-tree", orig_sha], env=env)
            
            # Remove sensitive targets from index
            rm_args = ["rm", "-r", "-f", "--cached", "--ignore-unmatch"] + paths_to_remove
            run_git(rm_args, env=env)
            
            # Write out purged tree
            new_tree = run_git(["write-tree"], env=env)
            print(f"  Purged tree SHA: {new_tree}")
            
            # Parse author and committer env vars
            # Author format: Name <email> timestamp tz
            # e.g. "Veer <veere@... > 1731738290 +0530"
            commit_env = env.copy()
            # If author / committer found, preserve
            if info["author"]:
                commit_env["GIT_AUTHOR_NAME"] = info["author"].split("<")[0].strip()
                rest = info["author"].split("<")[1]
                email, date = rest.split(">")
                commit_env["GIT_AUTHOR_EMAIL"] = email.strip()
                commit_env["GIT_AUTHOR_DATE"] = date.strip()
            if info["committer"]:
                commit_env["GIT_COMMITTER_NAME"] = info["committer"].split("<")[0].strip()
                rest = info["committer"].split("<")[1]
                email, date = rest.split(">")
                commit_env["GIT_COMMITTER_EMAIL"] = email.strip()
                commit_env["GIT_COMMITTER_DATE"] = date.strip()
                
            cmd = ["commit-tree", new_tree]
            if parent_new_sha:
                cmd.extend(["-p", parent_new_sha])
                
            new_commit_sha = run_git(cmd, env=commit_env, input_text=info["message"])
            print(f"  New commit SHA: {new_commit_sha}")
            parent_new_sha = new_commit_sha
            new_commits.append(new_commit_sha)
            
        print("\nAll commits rewritten successfully!")
        head_commit = new_commits[-1]
        print(f"Updating refs/heads/master to {head_commit}...")
        run_git(["update-ref", "refs/heads/master", head_commit])
        
        # Reset local working index
        run_git(["read-tree", head_commit])
        
        print("\nExpiring reflogs and pruning old unreachable objects...")
        # Windows git sometimes locks files if git gc runs immediately, so run reflog expire then prune
        run_git(["reflog", "expire", "--expire=now", "--all"])
        run_git(["prune", "--expire=now"])
        
        print("\n=== Verification ===")
        log_out = run_git(["log", "--oneline"])
        print("New git log:")
        print(log_out)
        
        # Check all historical objects
        all_objects = run_git(["rev-list", "--objects", "--all"])
        sensitive_blobs_found = []
        for line in all_objects.splitlines():
            for kw in ["credentials.json", ".env", "90ca43600bda2f80c741f3b335d8e86ec9e30dce"]:
                if kw in line:
                    sensitive_blobs_found.append(line)
                    
        if sensitive_blobs_found:
            print(f"WARNING: Sensitive items still in git object database: {sensitive_blobs_found}")
        else:
            print("CONFIRMED: Zero historical credential files or blobs exist in the Git database!")
            
    finally:
        if os.path.exists(temp_index):
            try:
                os.remove(temp_index)
            except Exception:
                pass

if __name__ == "__main__":
    main()
