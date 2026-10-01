---
trigger: glob
globs: "**/*.ps1,**/*.psm1,**/*.psd1"
description: "PowerShell quick card: toolchain, invariants, idioms, pitfalls. Loaded when editing .ps1/.psm1/.psd1 files."
---
# PowerShell — quick card
Deep guide: `.agents/guides/languages/powershell.md` — read it before non-trivial PowerShell work (new module, concurrency, public function, perf).
Principles: `.agents/guides/principles/error-handling.md` · `.agents/guides/principles/testing-strategy.md` · `.agents/guides/principles/security.md` · `.agents/guides/principles/simplicity.md`

## Toolchain (use the project's own config first)
- Format: `Invoke-Formatter -ScriptDefinition (Get-Content -Raw <file>) -Settings ./PSScriptAnalyzerSettings.psd1` · Lint: `Invoke-ScriptAnalyzer -Path . -Recurse` · Test: `Invoke-Pester -CI` (`Should -Be`; Pester 6+ also has `Should-Be`).
- `verify.mjs --only powershell` errors `unknown stack` (no PS stack) — run the commands above directly and note it in your Worker Report.
- Check `#Requires -Version`, CI, or a manifest's `PowerShellVersion` before using 7-only syntax: Windows PowerShell 5.1 (`powershell.exe`) and PowerShell 7.x (`pwsh`) are separate runtimes.

## Invariants (MUST / NEVER — with reason → alternative)
1. NEVER assume a failed native command (`git`, `docker`, any `.exe`) throws — `$PSNativeCommandUseErrorActionPreference` defaults `$false`, so try/catch never sees a non-zero exit. Check `$LASTEXITCODE` right after the call and `throw` yourself.
2. MUST call cmdlets with `-ErrorAction Stop` (or set `$ErrorActionPreference = 'Stop'` at script top) before relying on try/catch — most cmdlet errors are non-terminating by default and a bare try/catch lets them fall through unseen.
3. NEVER build a command as one interpolated string for `Invoke-Expression`/`cmd /c` — quoting breaks on spaces/quotes and it's a code-injection hole on outside input. Call with an argument array (`& $exe @argsArray`) or splat named parameters.
4. MUST name functions `Approved-Verb + singular Noun` (`Get-Verb` lists them) — anything else fails `PSUseApprovedVerbs`/`PSUseSingularNouns` and warns on every `Import-Module`.
5. NEVER `Write-Host` or formatted text as a function's result — it breaks the pipeline, can't be captured or asserted on in a test. Emit objects (`[pscustomobject]@{...}`) and let the caller format/display.
6. NEVER lean on backtick line-continuation for a parameter list — a trailing space after it silently breaks the statement. Use a `param()` block with `[CmdletBinding()]`/`[Parameter()]`/`[Validate*]` attributes, and splatting for long argument lists.
7. NEVER hardcode or `ConvertTo-SecureString -AsPlainText` a secret — it's recoverable from memory/history/logs. Accept a `[pscredential]`, a vault reference, or an env var supplied by the caller.
8. Add `Set-StrictMode -Version Latest` to new scripts/modules — turns a silent `$null`/undefined-variable/bad-property bug into a terminating error you see immediately, not a wrong result downstream.

## Idioms & pitfalls Flash models get wrong
- PS 7-only syntax that fails to parse on Windows PowerShell 5.1: pipeline chain `&&`/`||`, ternary `?:`, null-coalescing `??`/`??=`, null-conditional `?.`/`?[]`. Don't use unless the project already requires PS 7+.
- Null-conditional needs braces — `${x}?.Prop`, never bare `$x?.Prop`: `?` is legal in a variable name, so bare form reads undefined `$x?`, silently returning `$null.Prop` (e.g. `.Count` → `0`, not the real count).
- Encoding differs by version: 5.1's `Out-File`/`>` write UTF-16LE, `Set-Content` the system codepage; PS 7+ defaults to UTF-8 no BOM — pass `-Encoding utf8` to round-trip both.
- Splat instead of stacking parameters: `$p = @{ Path = $f; Recurse = $true }; Get-ChildItem @p`. Splat an array for native args too: `$a = @('status','--short'); git @a`.
- Write `$null -eq $x`, never `$x -eq $null` — if `$x` is a collection the second form compares element-wise, not identity.
- `$LASTEXITCODE` is set only by native `.exe`s; cmdlets set `$?` (bool) instead and leave `$LASTEXITCODE` stale — don't read it after a cmdlet call.
- Backtick `` ` `` is the escape/line-continuation character, not `\`; prefer `@"…"@` here-strings or splatting over line continuation, and single quotes when nothing needs interpolation.
- A path with spaces needs its own quoting at the call operator: `& "C:\Program Files\tool.exe" --flag "value with space"` — unquoted it mis-splits. Build native args as arrays; don't rely on default re-quoting.

## Example — bad → good
```powershell
# BAD: string-built native call, no exit check, text as the "return value"
function Sync-Repo($dir) {
    iex "git -C $dir pull"
    Write-Host "done syncing $dir"
}
```
```powershell
# GOOD: array args, explicit exit-code check, an object as the result
function Sync-Repo {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Path)
    & git -C $Path pull
    if ($LASTEXITCODE -ne 0) { throw "git pull failed in '$Path' (exit $LASTEXITCODE)" }
    [pscustomobject]@{ Path = $Path; Status = 'synced' }
}
```

## Before finishing
- [ ] `Invoke-ScriptAnalyzer -Recurse` clean (project's own settings) · [ ] Pester suite passes, new behaviour has a test
- [ ] every native call checks `$LASTEXITCODE`; every cmdlet in try/catch uses `-ErrorAction Stop` (or `$ErrorActionPreference='Stop'`)
- [ ] no `Invoke-Expression`/string-built native commands, no `Write-Host` as a return value, no plaintext secrets
