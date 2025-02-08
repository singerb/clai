#!/bin/zsh

# Function to check if working tree is clean
is_tree_clean() {
    if output=$(git status --porcelain) && [ -z "$output" ]; then
        return 0
    else
        echo "Error: Working tree is not clean. Please commit or stash changes first."
        return 1
    fi
}

# Function to get current branch name
get_current_branch() {
    git branch --show-current
}

# Function to create a new edit branch from current point
# Usage: git-new-edit
git-new-edit() {
    if ! is_tree_clean; then
        return 1
    fi

    current_branch=$(get_current_branch)
    timestamp=$(date +%Y%m%d_%H%M%S)
    new_branch="${current_branch}_edit_${timestamp}"

    git checkout -b "$new_branch"
    echo "Created and switched to new branch: $new_branch"
}

# Function to check if branch name matches the edit format
is_edit_branch() {
    local branch=$1
    if [[ $branch =~ ^([^/]+)_edit_([^/]+)$ ]]; then
        return 0
    fi
    return 1
}

# Function to get parent branch from an edit branch
get_parent_branch() {
    local branch=$1
    if is_edit_branch "$branch"; then
        echo "$branch" | sed 's|_edit_.*$||'
    else
        echo ""
    fi
}

# Function to diff current edit branch against parent
# Usage: git-edit-diff
git-edit-diff() {
    if ! is_tree_clean; then
        return 1
    fi

    current_branch=$(get_current_branch)
    if ! is_edit_branch "$current_branch"; then
        echo "Error: Current branch '$current_branch' is not in the format <parent>_edit_<timestamp>"
        return 1
    fi

    parent_branch=$(get_parent_branch "$current_branch")
    if [ -z "$parent_branch" ]; then
        echo "Error: Could not determine parent branch"
        return 1
    fi

    git diff "$parent_branch"..."$current_branch"
}

# Function to merge edit branch back to parent and delete it
# Usage: git-edit-merge
git-edit-merge() {
    if ! is_tree_clean; then
        return 1
    fi

    current_branch=$(get_current_branch)
    if ! is_edit_branch "$current_branch"; then
        echo "Error: Current branch '$current_branch' is not in the format <parent>_edit_<timestamp>"
        return 1
    fi

    parent_branch=$(get_parent_branch "$current_branch")
    if [ -z "$parent_branch" ]; then
        echo "Error: Could not determine parent branch"
        return 1
    fi

    echo "Merging $current_branch into $parent_branch..."
    git checkout "$parent_branch"
    git merge --no-ff "$current_branch"

    if [ $? -eq 0 ]; then
        echo "Deleting branch $current_branch..."
        git branch -d "$current_branch"
    else
        echo "Merge failed. Branch $current_branch has not been deleted."
        return 1
    fi
}

# Aliases (add these to your .bashrc or .zshrc) geb = git edit branch
alias gebnew='git-new-edit'
alias gebdiff='git-edit-diff'
alias gebmerge='git-edit-merge'
