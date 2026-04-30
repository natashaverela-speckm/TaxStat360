#!/bin/sh
# pre-push hook: block direct pushes to master.
#
# Install:
#   cp scripts/pre-push-master-block.sh .git/hooks/pre-push
#   chmod +x .git/hooks/pre-push
#
# Override (genuine emergencies only):
#   git push --no-verify

protected_branch='master'

while read local_ref local_sha remote_ref remote_sha; do
    if [ "$remote_ref" = "refs/heads/$protected_branch" ]; then
        echo ""
        echo "⛔  Direct push to '$protected_branch' blocked by pre-push hook."
        echo ""
        echo "Use a pull request instead:"
        echo "    git checkout -b <feature-branch>"
        echo "    git push -u origin <feature-branch>"
        echo "    # then open PR on github.com"
        echo ""
        echo "Override (genuine emergencies only):"
        echo "    git push --no-verify"
        echo ""
        exit 1
    fi
done

exit 0
