---
trigger: glob
globs: "**/*.tf,**/*.tfvars,**/*.hcl"
description: "Terraform/OpenTofu card: fmt/validate/plan commands, state and apply safety, refactoring with moved blocks, secrets, bad->good example. Loaded when editing .tf, .tfvars or .hcl files."
---
# Terraform / OpenTofu - topic card
Principles guides: `.agents/guides/principles/security.md` (secrets, least privilege) and `.agents/guides/principles/architecture.md` (module boundaries). `.hcl` also matches Terragrunt, Packer and Nomad files and `.terraform.lock.hcl`: use their own CLI, and never hand-edit the lock file.

## Toolchain (the binary the project uses: `terraform` or `tofu`; check README, CI or `required_version`)
- Format: `terraform fmt -recursive` (check only: `terraform fmt -check -recursive`).
- Validate offline: `terraform init -backend=false`, then `terraform validate`. `tflint` if configured.
- Plan (read-only, but it reads real infrastructure with the user's credentials - only with the user's OK in your brief; else skip it and write `Not run: <command> (needs the user's OK)` in your Worker Report; validation is partial, not BLOCKED): `terraform plan -out=tfplan`, then `terraform show tfplan`.
- Providers: `terraform init -upgrade` to change versions; `terraform providers lock` to add platforms to the lock file.

## Invariants (MUST / NEVER - with reason -> alternative)
1. NEVER run `terraform apply`, `destroy`, `import`, `state rm|mv|push`, `taint` or `force-unlock` - they change real infrastructure or state and can delete production resources. Instead run fmt/validate, and put the exact plan/apply command, with what you expect it to change, in your report for the user.
2. NEVER commit or print secrets: no credentials in `.tf` or `.tfvars`, no `*.tfstate`, no `.terraform/` directory in git (state holds every secret in plain text). Instead use variables marked `sensitive = true`, fed from env (`TF_VAR_<name>`) or a secret manager data source.
3. Renaming a resource, moving it into a module or switching `count` to `for_each` changes its address, and plan will destroy + recreate it. MUST add a `moved { from = ... to = ... }` block (Terraform 1.1+) and confirm the plan shows a move, not a replace.
4. Pin versions: `required_version` for the CLI, `required_providers` with a `version` constraint (`~> <major>.<minor>`), and commit `.terraform.lock.hcl` - unpinned providers change behaviour between runs.
5. Use `for_each` with stable keys for collections, not `count` - deleting one item from a `count` list shifts every later index and recreates those resources.
6. Protect stateful resources (databases, buckets, key vaults) with `lifecycle { prevent_destroy = true }` when the project does this, and never remove it just to make a plan pass.
7. Read every plan for `destroy` and `-/+` (replace) lines. Any unexpected one -> stop, find the cause (a changed ForceNew argument, a renamed address), and report it before going further.

## Pitfalls Flash models get wrong
- `terraform validate` needs `init` first; `-backend=false` avoids touching remote state.
- Legacy interpolation `"${var.x}"` is only needed inside strings. Write `var.x`.
- `depends_on` is rarely needed; references create the dependency graph. Add it only for hidden dependencies, with a comment.
- A `data` source that reads something created in the same apply fails or plans stale values. Reference the resource instead.
- Changing a ForceNew argument (name, region, engine, some network settings) replaces the resource. Check the provider docs (`/research-docs`) before editing it.
- Bringing an existing resource under management: use an `import { to = ... id = ... }` block (Terraform 1.5+) reviewed through plan, not the `terraform import` command.
- Module `source` should pin a version (`?ref=v1.2.0` for git, `version = "..."` for registry modules).
- `terraform fmt` rewrites files in place; run it before reviewing the diff.

## Example - bad -> good
```hcl
# BAD: rename without a moved block -> plan destroys and recreates the bucket
resource "aws_s3_bucket" "assets_v2" {   # was "assets"
  bucket = "acme-assets"
}
```
```hcl
# GOOD: the address change is recorded; plan shows a move, no replacement
resource "aws_s3_bucket" "assets_v2" {
  bucket = "acme-assets"
  lifecycle { prevent_destroy = true }
}
moved {
  from = aws_s3_bucket.assets
  to   = aws_s3_bucket.assets_v2
}
```

## Before finishing
- [ ] `terraform fmt -check -recursive` and `terraform validate` pass (or SKIP: CLI not installed)
- [ ] No secrets, state files or `.terraform/` added; sensitive variables marked
- [ ] Renamed or moved addresses have `moved` blocks; versions pinned
- [ ] No apply/destroy/state command run; plan/apply command and expected changes are in the report
