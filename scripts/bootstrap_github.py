"""Idempotently provision the documented GitHub backlog. Requires Python 3 and authenticated gh.

Run `python scripts/bootstrap_github.py --apply` only when authorized to change GitHub.
No contributor is ever assigned by this script. Credentials stay in gh's credential store.
"""

import json
import subprocess
import sys
from pathlib import Path

REPO = "MCK-D/openbracket"
OWNER = "MCK-D"
PROJECT_NUMBER = 2


def gh(*args, payload=None):
    cmd = ["gh", *args]
    if payload is not None:
        cmd += ["--input", "-"]
    result = subprocess.run(cmd, input=json.dumps(payload) if payload is not None else None,
                            text=True, encoding="utf-8", capture_output=True, check=True)
    return json.loads(result.stdout) if result.stdout.strip() else None


def api(path, payload=None, method=None):
    return gh("api", path, "--method", method or ("POST" if payload is not None else "GET"), payload=payload)


def graphql(query, **variables):
    result = gh("api", "graphql", payload={"query": query, "variables": variables})
    if result.get("errors"):
        raise RuntimeError(result["errors"])
    return result["data"]


def main():
    backlog = json.loads(Path("scripts/backlog.json").read_text())
    if "--apply" not in sys.argv:
        print(f"Plan: {len(backlog)} epics and {sum(len(e['stories']) for e in backlog)} stories. Use --apply to provision.")
        return

    labels = {"epic": "7057ff", "feature": "0e8a16", "platform": "1d76db", "bug": "d73a4a", "good first issue": "7057ff", "accessibility": "006b75"}
    labels.update({epic["area"]: "c5def5" for epic in backlog})
    for name, color in labels.items():
        gh("label", "create", name, "--repo", REPO, "--color", color, "--force")

    milestone_specs = {
        "v0.1.0 - Foundation": "2026-11-29T23:59:59Z",
        "v0.2.0 - Tournament core": "2026-12-13T23:59:59Z",
        "v0.3.0 - Predictions and live data": "2027-01-03T23:59:59Z",
        "v1.0.0 - Final demonstration": "2027-01-24T23:59:59Z",
    }
    milestones = {m["title"]: m["number"] for m in api(f"repos/{REPO}/milestones?state=all&per_page=100")}
    for title, due in milestone_specs.items():
        if title not in milestones:
            milestones[title] = api(f"repos/{REPO}/milestones", {"title": title, "due_on": due, "description": "Planned checkpoint; no contributor assigned automatically."})["number"]

    project = graphql('''query($owner:String!,$number:Int!){user(login:$owner){projectV2(number:$number){id fields(first:30){nodes{... on ProjectV2Field{id name} ... on ProjectV2SingleSelectField{id name options{id name}}}} views(first:10){nodes{id name layout}}}}}''', owner=OWNER, number=PROJECT_NUMBER)["user"]["projectV2"]
    pid = project["id"]
    repo_id = api(f"repos/{REPO}")["node_id"]
    graphql('''mutation($p:ID!,$r:ID!){linkProjectV2ToRepository(input:{projectId:$p,repositoryId:$r}){repository{id}}}''', p=pid, r=repo_id)
    graphql('''mutation($p:ID!){updateProjectV2(input:{projectId:$p,public:true,shortDescription:"Deliverable roadmap: epics, user stories and staged releases. All contributors intentionally unassigned.",readme:"Use the Delivery kanban board for daily work and Milestone roadmap table for planning. Every feature is a user story under a native parent epic. Status: Backlog → Ready → In progress → In review → Done. Pick an issue, implement acceptance criteria, open a linked reviewed PR to develop, then promote releases to main. All issues are intentionally unassigned until the team chooses ownership. Hosting activation is deferred."}){projectV2{id}}}''', p=pid)
    status = next(f for f in project["fields"]["nodes"] if f["name"] == "Status")
    colors = ["GRAY", "BLUE", "YELLOW", "PURPLE", "GREEN"]
    names = ["Backlog", "Ready", "In progress", "In review", "Done"]
    options = [{"name": name, "color": color, "description": name} for name, color in zip(names, colors)]
    existing_opts = {o["name"]: o["id"] for o in status["options"]}
    for option in options:
        if option["name"] in existing_opts:
            option["id"] = existing_opts[option["name"]]
    data = graphql('''mutation($f:ID!,$o:[ProjectV2SingleSelectFieldOptionInput!]!){updateProjectV2Field(input:{fieldId:$f,singleSelectOptions:$o}){projectV2Field{... on ProjectV2SingleSelectField{id options{id name}}}}}''', f=status["id"], o=options)
    statuses = {o["name"]: o["id"] for o in data["updateProjectV2Field"]["projectV2Field"]["options"]}
    view = project["views"]["nodes"][0]
    graphql('''mutation($v:ID!){updateProjectV2View(input:{viewId:$v,name:"Delivery kanban",layout:BOARD_LAYOUT}){projectV2View{id name layout}}}''', v=view["id"])
    if not any(v["name"] == "Milestone roadmap" for v in project["views"]["nodes"]):
        graphql('''mutation($p:ID!){createProjectV2View(input:{projectId:$p,name:"Milestone roadmap",layout:TABLE_LAYOUT}){projectV2View{id}}}''', p=pid)

    issues = {i["title"]: i for i in api(f"repos/{REPO}/issues?state=all&per_page=100") if "pull_request" not in i}
    items = graphql('''query($p:ID!){node(id:$p){... on ProjectV2{items(first:100){nodes{id content{... on Issue{id}}}}}}}''', p=pid)["node"]["items"]["nodes"]
    item_map = {i["content"]["id"]: i["id"] for i in items if i.get("content") and i["content"].get("id")}
    snapshot = []

    def ensure_issue(title, body, tags, milestone, state="Backlog"):
        issue = issues.get(title)
        if not issue:
            issue = api(f"repos/{REPO}/issues", {"title": title, "body": body, "labels": tags, "milestone": milestones[milestone], "assignees": []})
            issues[title] = issue
        node_id = issue["node_id"]
        if node_id not in item_map:
            item_map[node_id] = graphql('''mutation($p:ID!,$c:ID!){addProjectV2ItemById(input:{projectId:$p,contentId:$c}){item{id}}}''', p=pid, c=node_id)["addProjectV2ItemById"]["item"]["id"]
            graphql('''mutation($p:ID!,$i:ID!,$f:ID!,$s:String!){updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,value:{singleSelectOptionId:$s}}){projectV2Item{id}}}''', p=pid, i=item_map[node_id], f=status["id"], s=statuses[state])
        return issue

    for epic in backlog:
        title = "Epic: " + epic["epic"]
        parent = ensure_issue(title, f"## Outcome\n\nAs a project stakeholder, I want {epic['epic'].lower()}, so that the required product can be delivered and verified.\n\n## Source\n\nDeliverable manual section {epic['section']}. See docs/requirements.md.\n\n## Completion\n\nAll native sub-issues meet their acceptance criteria, independent review, CI, documentation and accessibility requirements. Contributors are intentionally unassigned.\n", ["epic", epic["area"]], epic["milestone"])
        children = []
        known_children = {i["id"] for i in api(f"repos/{REPO}/issues/{parent['number']}/sub_issues?per_page=100")}
        for index, (name, role, capability, benefit, criteria) in enumerate(epic["stories"]):
            tags = ["feature", epic["area"]]
            if "identity guide" in name or "documentation rehearsals" in name:
                tags += ["good first issue"]
            if "accessibility" in name:
                tags += ["accessibility"]
            body = f"## User story\n\nAs a {role}, I want {capability}, so that {benefit}.\n\n## Acceptance criteria\n\n" + "\n".join("- [ ] " + c.strip() + "." for c in criteria.split(";"))
            body += f"\n\n## Delivery requirements\n\n- [ ] Relevant positive, negative and permission tests pass in CI.\n- [ ] User/technical documentation and accessibility behavior are updated.\n- [ ] A linked PR is independently reviewed before merge.\n\nParent epic: #{parent['number']}. Manual: {epic['section']}.\n\nNo contributor assigned; choose ownership when implementation starts.\n"
            state = "In review" if name == "Establish the T3 application foundation" else "Backlog"
            child = ensure_issue(name, body, tags, epic["milestone"], state)
            if child["id"] not in known_children:
                api(f"repos/{REPO}/issues/{parent['number']}/sub_issues", {"sub_issue_id": child["id"]})
            children.append({"number": child["number"], "title": name, "url": child["html_url"]})
            print(f"#{child['number']} {name}", flush=True)
        snapshot.append({"epic": epic["epic"], "number": parent["number"], "url": parent["html_url"], "milestone": epic["milestone"], "stories": children})
        Path("docs/github-backlog.json").write_text(json.dumps(snapshot, indent=2) + "\n")
    print(f"Provisioned {len(snapshot)} epics with unassigned native sub-issues at https://github.com/users/{OWNER}/projects/{PROJECT_NUMBER}")


if __name__ == "__main__":
    main()
