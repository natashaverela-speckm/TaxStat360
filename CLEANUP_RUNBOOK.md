# Phase 4 Housekeeping — Your Cleanup Runbook (copy-paste, ~8 minutes)
All read-then-delete, all reversible-safe now that PITR is on (run the two
toggles FIRST if you haven't — everything below assumes the safety net exists).

## A. Production table — remove the June-15 test fixtures (CloudShell, `~ $`)

Look first (should print the 3 fixtures):
```
aws dynamodb scan --table-name taxstat360-records --query 'Items[?contains(userId.S, `example.com`)].[userId.S, recordId.N]' --output text --no-cli-pager
```
Delete them (one at a time):
```
aws dynamodb delete-item --table-name taxstat360-records --key '{"userId":{"S":"usera20260615_153904@example.com"},"recordId":{"N":"1111111111"}}' --no-cli-pager
```
```
aws dynamodb delete-item --table-name taxstat360-records --key '{"userId":{"S":"userb20260615_153904@example.com"},"recordId":{"N":"2222222222"}}' --no-cli-pager
```
```
aws dynamodb delete-item --table-name taxstat360-records --key '{"userId":{"S":"crossdev20260615_154037@example.com"},"recordId":{"N":"3333333333"}}' --no-cli-pager
```
The developer's three mid-June records (nimrakiran…, ids 17816…/17817…):
YOUR CALL — they're that person's data. If you want them gone, tell me and
I'll print the three delete commands; if in doubt, leave them.

Verify (expect 5 rows: 4 nimrakiran-era gone→ actually 3 dev + your 2 admin
records = 5 if you kept the dev's, 2 if you removed them):
```
aws dynamodb scan --table-name taxstat360-records --query 'Items[].[userId.S, recordId.N]' --output text --no-cli-pager
```

## B. EC2 tidy-up (inside `aws ssm start-session --target i-0a137c448af0535b0`)

Archive the old backups into one folder instead of deleting (belt & braces):
```
sudo mkdir -p /home/ubuntu/archive-2026-07 && sudo mv /home/ubuntu/risk-planner-BE/app/main.py.bak* /home/ubuntu/risk-planner-BE/app/main.py.pre_cookie /home/ubuntu/archive-2026-07/ 2>/dev/null; sudo ls /home/ubuntu/archive-2026-07/
```
Remove the inert web3forms env line (opens the editor — DELETE the line
`Environment=WEB3FORMS_ACCESS_KEY=...`, keep `[Service]` only if other lines
remain under it; if it becomes empty, that's fine too — then Ctrl+X, Y, Enter):
```
sudo systemctl edit taxstat360
```
```
sudo systemctl restart taxstat360
```
```
sudo systemctl is-active taxstat360
```
(expect `active`; then one login on the site as the smoke test)

The stale second checkout (safe — the live one is /home/ubuntu/risk-planner-BE):
```
sudo rm -rf /home/ssm-user/taxstat360-api
```
The legacy pre-rename module dirs — LEAVE for now (auth.py, data_input,
freshbooks/quickbooks/wave/xero). The repo's main.py is self-contained, but
removing on-disk dirs the process *might* scan is a next-deploy task with a
rollback plan, not a tidy-up. Tracked, not urgent.

## C. Console clicks (2 minutes)
1. Amplify → TaxStat360 app → Hosting → Environment variables →
   delete `VITE_WEB3FORMS_KEY` if listed.
2. web3forms.com → deactivate the account/key whenever their site cooperates.
   Nothing depends on it anymore.

Paste outputs as you go and I'll confirm each step.
