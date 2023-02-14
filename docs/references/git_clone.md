# git_clone

Clones a git repository into the barbe output directory

---

### Example usage

#### Cloning a repository and deploying it with anyfront

```hcl
git_clone "pocketbase_repo" {
    uri = "https://github.com/pocketbase/site"
}

anyfront "site" {
    platform = "aws"
    app_dir = git_clone.pocketbase_repo.dir
    //...
}
```

---

### Argument reference

`uri`: (Required, string) The url of the repository to clone

---

### Accessing attributes

`git_clone.{name}.dir` points to the directory where the repository was cloned
