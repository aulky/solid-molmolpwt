# PowerShell — engineering guide
> Scope: Windows PowerShell 5.1 and PowerShell 7.x (`pwsh`), scripts (`.ps1`) and modules (`.psm1`/`.psd1`). Quick card: `.agents/rules/lang-powershell.md`.
> Last verified: 2026-09 — code samples run on installed PowerShell 7.6.6 (`$PSVersionTable`); Microsoft Learn `about_Preference_Variables`/`Try_Catch_Finally`/`Functions_Advanced_Parameters`/`Splatting`/`Parsing` (powershell-7.6, updated 2026-06/07); GitHub releases (7.6.6, 2026-09-08); PSGallery (PSScriptAnalyzer 1.25.0, 2026-03; Pester 6.2.0, 2026-09 — 5.x still widely required; this machine's bundled Pester is 3.4.0, see §2).

## 1. Mental model / philosophy
- PowerShell is an **object pipeline**, not text like POSIX shell: cmdlets emit .NET objects with properties, not lines to grep/cut. Filter and shape on properties (`Get-Process | Where-Object CPU -gt 100`), never by parsing formatted text.
- Two runtimes share the name: **Windows PowerShell 5.1** (`powershell.exe`, .NET Framework, ships with Windows, maintenance mode) vs **PowerShell 7.x** (`pwsh`, cross-platform, where new development happens). Confirm which one a script targets before using exclusive syntax (§3, §9).
- Functions and cmdlets are one alphabet: an "advanced function" (`[CmdletBinding()]` + `param()`) behaves like a compiled cmdlet — same parameter binding, pipeline support, `-WhatIf`/`-Confirm`, error semantics. Write anything beyond a few lines this way, not as top-to-bottom procedural code.
- Three error categories coexist and weak models conflate them: **terminating** (stop the pipeline, catchable by try/catch), **non-terminating** (a cmdlet reports one and keeps going — NOT caught by a bare try/catch), and **native command failures** (a failed `.exe` throws nothing at all by default) — see §4, the most common "try/catch didn't catch it" bug.
- Naming is a contract, not style: `Verb-Noun` (`Get-Verb` lists approved verbs) is enforced by PSScriptAnalyzer and a warning on every `Import-Module` — deviate only for a private, non-exported helper.

## 2. Project structure & tooling
Typical module/script layout:
```text
MyModule/
  MyModule.psd1         # manifest: version, exported members, dependencies
  MyModule.psm1         # root module: dot-sources Public/Private
  Public/
    Get-Widget.ps1       # one exported function per file
  Private/
    ConvertTo-Widget.ps1 # internal helper
  Tests/
    Get-Widget.Tests.ps1 # Pester tests
PSScriptAnalyzerSettings.psd1
```
- A manifest declares `FunctionsToExport`/`CmdletsToExport`/`AliasesToExport` explicitly (never `'*'`) — wildcard export makes every private helper part of the public surface and slows `Import-Module`.
- Pin the target runtime instead of guessing: `#Requires -Version 7.0` refuses to run the file on an older version; a manifest's `PowerShellVersion` key does the same for `Import-Module`. `#Requires -Modules PSScriptAnalyzer, Pester` documents dev-time deps without adding a runtime one.

Toolchain — install once per machine, run on every change:

| Task | Command | Notes |
|---|---|---|
| Install linter | `Install-Module -Name PSScriptAnalyzer -Scope CurrentUser` | Gallery 1.25.0 (2026-03); check installed version first. |
| Lint | `Invoke-ScriptAnalyzer -Path . -Recurse -Settings ./PSScriptAnalyzerSettings.psd1` | No `-Settings` falls back to defaults; `-Fix` auto-corrects a subset. |
| Format (check) | `Invoke-Formatter -ScriptDefinition (Get-Content -Raw file.ps1) -Settings ./PSScriptAnalyzerSettings.psd1` | Same engine/settings as the linter — no separate formatter. |
| Install test framework | `Install-Module -Name Pester -MinimumVersion 5.0 -Force -SkipPublisherCheck -Scope CurrentUser` | Windows often exposes only an ancient bundled Pester until you do this. |
| Assertions | classic `Should -Be` (default) or newer `Should-Be` (Pester 6+) | Both work side by side — §5. |
| Test | `Invoke-Pester -CI -Path ./Tests -Output Detailed` | `-CI` gives a non-zero exit on failure, NUnit/JUnit-style output. |
| Everything | *(none)* | No PowerShell stack in `verify.mjs` (`--only powershell` → `unknown stack`) — run the above directly, note the gap in your Worker Report. |
| Syntax check | `[Parser]::ParseFile(...)` below | Parses without executing — fast pre-flight, catches typos not logic bugs. |

```powershell
$errors = $null; $tokens = $null
[System.Management.Automation.Language.Parser]::ParseFile('file.ps1', [ref]$tokens, [ref]$errors) | Out-Null
if ($errors.Count) { $errors }   # verified: empty array on a syntactically valid file
```
- **Verified pitfall, this machine**: `Get-Module -ListAvailable Pester` returned only **3.4.0**, Windows' bundled Pester, whose `Should Be` (no leading `-`) predates Pester 5's `Should -Be`. Run `Import-Module Pester -MinimumVersion 5.0` first, or `Invoke-Pester` may resolve the wrong major version.
- CI order: `Invoke-ScriptAnalyzer` (fail the build on `-Severity Error`) before `Invoke-Pester` — both run in seconds per module.

## 3. Core idioms
**`param()` blocks with validation** replace manual argument checking (verified: rejects out-of-range/empty input before the body runs):
```powershell
function New-Report {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory, ValueFromPipeline)]
        [ValidateNotNullOrEmpty()]
        [string]$Name,

        [ValidateRange(1, 100)]
        [int]$Count = 10,

        [ValidateSet('csv', 'json')]
        [string]$Format = 'json'
    )
    process {
        [pscustomobject]@{ Name = $Name; Count = $Count; Format = $Format }
    }
}
'alice', 'bob' | New-Report -Count 5
```
- `[CmdletBinding()]` turns a function into an "advanced function": common parameters (`-Verbose`, `-ErrorAction`, `-WhatIf` with `SupportsShouldProcess`), automatic pipeline binding, `$PSCmdlet` access.
- `ValueFromPipeline`/`ValueFromPipelineByPropertyName` accept piped input; `process {}` runs once per item (`begin`/`end` run once each, before/after the stream).
- `Validate*` attributes (`ValidateNotNullOrEmpty`, `ValidateRange`, `ValidateSet`, `ValidatePattern`, `ValidateScript`) reject bad input before the body runs — cheaper and clearer than an `if` at the top.

**Splatting** passes a hashtable (or an array, for positional/native args) as parameters instead of one long line (verified):
```powershell
$params = @{ Path = $env:TEMP; ErrorAction = 'Stop' }
Get-ChildItem @params

$gitArgs = @('log', '--oneline', '-n', '5')
git @gitArgs
```
Splatting isn't optional style — past ~3 parameters, or when the set is built conditionally (`if ($Force) { $params.Force = $true }`), it's the only readable alternative to backtick continuation.

**Objects in the pipeline, not text**:
```powershell
Get-Process |
    Where-Object { $_.WorkingSet64 -gt 200MB } |
    Sort-Object WorkingSet64 -Descending |
    Select-Object -First 5 Name, Id, @{ Name = 'MB'; Expression = { [math]::Round($_.WorkingSet64/1MB) } }
```
`@{ Name=...; Expression=... }` is a calculated property (verified) — the idiom for deriving a display/sort column without mutating the source object.

**Everything is an expression** — `if`/`switch`/`foreach` evaluates to its unassigned output, capturable directly: `$level = switch ($code) { { $_ -lt 300 } { 'ok' }; { $_ -lt 500 } { 'client-error' }; default { 'server-error' } }` (verified: `'client-error'` for `$code = 404`).

**PS 7-only conveniences** — never on Windows PowerShell 5.1; confirm the target runtime first (§9):
```powershell
$result = (Test-Path $path) ? 'exists' : 'missing'  # ternary, 7.0+
$name   = $user.Name ?? 'anonymous'                 # null-coalescing, 7.0+
$config.Database ??= @{}                            # null-coalescing assignment, 7.1+
$len    = ${items}?.Count                           # null-conditional, 7.1+ — braces required, see trap below
Test-Path $path && Write-Output 'found' || Write-Output 'not found'   # pipeline chain, 7.0+
```
Verified trap: `Test-Path $path ? 'exists' : 'missing'` (no parens) parses `?`/`'exists'`/`:`/`'missing'` as extra positional args and throws `A positional parameter cannot be found that accepts argument '?'` — `$result` is never assigned. Parenthesize the condition when it's itself a command call: `(Test-Path $path) ? ... : ...`.

Second verified trap, worse because it's silent: bare `$items?.Count` neither throws nor errors — `?` is legal inside a variable name, so the parser reads `items?` itself as the (undefined, `$null`) variable name and applies `.Count` to that `$null`, which happens to return `0`. It quietly gives the wrong number instead of failing. Braces are mandatory for `?.`/`?[]`: `${items}?.Count` (verified: `0` bare vs `3` braced, on a 3-element array) — about_Operators' own examples never show the bare form.

**Modules**: one exported function per `Public/Verb-Noun.ps1`; export via the manifest's `FunctionsToExport` (fast, static), not `Export-ModuleMember -Function *` (slower, silently re-exports anything added later). Avoid module-scope mutable state (`$script:cache`) unless deliberately stateful — prefer returning objects the caller holds.

## 4. Error handling
Two independent axes, both verified live on 7.6.6.

**Cmdlet errors — terminating vs non-terminating.** Most cmdlet errors are non-terminating: written to the error stream, execution continues, so a bare `try { Get-Item bad-path } catch { ... }` never runs the catch:
```powershell
try {
    Get-Item -Path 'C:\does\not\exist'   # writes a non-terminating error, then continues
    'no throw'                           # verified: this line DOES run
} catch {
    'caught'                             # verified: this does NOT run
}
```
Force it to terminate — per call (preferred, scoped) or for the whole script:
```powershell
try {
    Get-Item -Path 'C:\does\not\exist' -ErrorAction Stop
} catch {
    "caught: $($_.Exception.Message)"    # verified: this DOES run
}
# or, deliberately, for the whole script:
$ErrorActionPreference = 'Stop'
```
Prefer `-ErrorAction Stop` per call over the global setting where practical — the global form also turns other cmdlets' warnings/errors terminating, which can surprise later code in the same scope.

**Native command failures are a third category.** A failed `.exe` (`git`, `docker`, `node`, …) raises no PowerShell error by default: `$PSNativeCommandUseErrorActionPreference` defaults `$false` (added 7.3, current per docs), so try/catch never sees it:
```powershell
try {
    & cmd /c "exit 7"
    "no exception — LASTEXITCODE=$LASTEXITCODE"   # verified: this DOES run
} catch {
    "caught native"                                # verified: this does NOT run
}
```
Check `$LASTEXITCODE` immediately after every native call and throw yourself:
```powershell
& git push
if ($LASTEXITCODE -ne 0) { throw "git push failed (exit $LASTEXITCODE)" }
```
`$LASTEXITCODE` is set only by native executables; a cmdlet/function sets `$?` (bool) instead and leaves `$LASTEXITCODE` stale — never read it after a cmdlet call.

**try/catch/finally** — catch specific exception types before a generic `catch`, most specific first:
```powershell
try {
    Invoke-RestMethod -Uri $url -ErrorAction Stop
} catch [System.Net.WebException] {
    Write-Warning "network error: $_"
} catch {
    throw   # re-throw what you didn't anticipate — don't swallow it
} finally {
    $client.Dispose()
}
```
`$_` (or `$PSItem`) inside `catch` is an `ErrorRecord`: `$_.Exception.Message`, `$_.InvocationInfo.ScriptLineNumber`, `$_.Exception.InnerException` for a wrapped exception's root cause.

**`Set-StrictMode -Version Latest`** turns silent bugs into immediate terminating errors: an unset variable, a non-existent property, or a method called with the wrong argument count all throw instead of returning `$null`/nothing (verified: reading an unset variable under strict mode throws). Add it to every new script/module; add it to an existing one only as a deliberate, tested change.

**Where to draw the line**: validate untrusted input at the boundary with `Validate*`; let unexpected errors propagate instead of wrapping every call "just in case" — a script that dies loudly beats one limping on under `$ErrorActionPreference = 'SilentlyContinue'`.

## 5. Testing
**Pester 5/6** is the standard framework: `Describe`/`Context`/`It`, `Should -Be` assertions (the leading `-` distinguishes 5+ from legacy Pester 3/4 `Should Be` — §2). Pester 6 also ships type-aware `Should-*` assertions (`Should-Be`, `Should-Throw`); classic `Should -Be` still works by default (a project can disable it via `Should.DisableV5 = $true`):
```powershell
# Get-Widget.Tests.ps1
BeforeAll {
    . "$PSScriptRoot/../Public/Get-Widget.ps1"
}

Describe 'Get-Widget' {
    Context 'valid input' {
        It 'returns a widget with the given name' {
            $result = Get-Widget -Name 'sprocket'
            $result.Name | Should -Be 'sprocket'
        }
    }
    Context 'invalid input' {
        It 'throws for an empty name' {
            { Get-Widget -Name '' } | Should -Throw
        }
    }
}
```
- `BeforeAll`/`BeforeEach`/`AfterEach`/`AfterAll` mirror other xUnit-style frameworks; `BeforeAll` runs once per `Describe`/`Context`, `BeforeEach` before every `It`.
- Mock external dependencies (native commands, cmdlets, network calls) with `Mock`, assert calls with `Should -Invoke`:
```powershell
Mock -CommandName Invoke-RestMethod -MockWith { @{ status = 'ok' } }
$r = Get-RemoteStatus
$r.status | Should -Be 'ok'
Should -Invoke Invoke-RestMethod -Times 1 -Exactly
```
- `-CI` sets a non-zero exit code on any failure and emits structured (NUnit/JUnit) output for a pipeline.
- Test error paths too (`{ ... } | Should -Throw -ExceptionType ([System.ArgumentException])`), not just the happy path — a function only exercised with valid input surprises its first real caller.
- Keep `Mock` scoped to what you don't control (I/O, native commands, `Get-Date`) — mocking your own pure logic is a sign it should be its own directly-tested function.

## 6. Performance
- `+=` on an array copies the whole array every iteration (quadratic overall) — beyond a handful of items, let the pipeline collect once, or use a typed `List[T]`:
```powershell
# slow: quadratic
$results = @()
foreach ($item in $items) { $results += Process-Item $item }

# fast: pipeline collects once (verified: same output, one allocation)
$results = foreach ($item in $items) { Process-Item $item }
# or, for repeated in-loop appends:
$list = [System.Collections.Generic.List[object]]::new()
foreach ($item in $items) { $list.Add((Process-Item $item)) }
```
- `Where-Object`/`ForEach-Object` scriptblocks carry per-item call overhead; member-syntax (`Where-Object CPU -gt 100`) is a bit faster, and a `foreach` *statement* or `.Where()`/`.ForEach()` array methods (verified) beat both on large collections — reach for them once profiling shows the pipeline is the bottleneck.
- Avoid re-running expensive discovery (`Get-ChildItem -Recurse`, a remote call) inside a loop — compute once, reuse it.
- `Measure-Command { <script> }` gives quick A/B timing; script a repeated comparison rather than eyeballing one run.
- `Import-Module` scans `$env:PSModulePath` and resolves `RequiredModules` on every session start — a deep dependency chain slows every script's startup.

## 7. Security
- **Never** hardcode a secret or `ConvertTo-SecureString -AsPlainText -Force` a literal password — both are recoverable from source control, process memory, or `Get-History`. Accept a `[pscredential]`, read from a vault/secret manager, or an env var the *caller* set.
- **Never** build a native or `Invoke-Expression` command from concatenated untrusted strings — that's arbitrary code execution, no different from `eval` elsewhere. Use an argument array or splatting.
- Execution policy is a speed bump, not a security boundary (Microsoft's own docs): `Set-ExecutionPolicy` guards against accidental double-clicks, not an attacker. Use code signing (`Set-AuthenticodeSignature`) plus `AllSigned`/a constrained language mode for a real trust boundary.
- Validate or allowlist anything reaching a file path or native-command argument, especially data from an HTTP request or a config file the deploy pipeline doesn't fully control — path traversal (`..`) and argument injection are as real here as anywhere else.
- `$PSNativeCommandArgumentPassing` defaults to `Windows` (legacy `cmd.exe`-style re-quoting), `Standard` on non-Windows — an argument with embedded quotes or `%`/`^` can be reinterpreted. Build attacker-influenced native args as an array and test the exact value.
- Log what a script did (the object, not raw secrets) — never write a password, token, or connection string to a transcript/log file.

## 8. Concurrency
- `ForEach-Object -Parallel` (PS 7+) runs a scriptblock across a thread pool (`-ThrottleLimit` caps concurrency); each iteration is its own runspace and does **not** see caller variables/functions unless passed via `$using:` (verified, order not guaranteed):
```powershell
$results = $urls | ForEach-Object -Parallel {
    $h = $using:headers
    Invoke-RestMethod -Uri $_ -Headers $h
} -ThrottleLimit 8
```
- Runspaces (`[runspacefactory]`/`RunspacePool`) are the lower-level primitive `-Parallel` is built on — use them directly only for finer control than `-Parallel` gives.
- `Start-Job`/`Start-ThreadJob` run work async, returning a job object (`Receive-Job` collects output, `Wait-Job` blocks); `Start-ThreadJob` (in-box, 7+) is far lighter than `Start-Job`'s separate process for I/O-bound work.
- Windows PowerShell 5.1 has no `ForEach-Object -Parallel` — use runspace pools or `Start-Job` there.
- Shared mutable state across parallel branches needs a `[System.Collections.Concurrent.ConcurrentDictionary[...]]` (or a lock), not a plain hashtable/array written from multiple runspaces.

## 9. Anti-patterns → fixes
| Anti-pattern | Why it hurts | Fix |
|---|---|---|
| `try { git push } catch {...}` | native failures raise nothing (default `$PSNativeCommandUseErrorActionPreference=$false`) | check `$LASTEXITCODE`, `throw` yourself |
| `Get-Item $path` in try/catch, no `-ErrorAction Stop` | most cmdlet errors are non-terminating | add `-ErrorAction Stop`, or set `$ErrorActionPreference='Stop'` deliberately |
| `iex "$exe $arg1 $arg2"` | breaks on spaces/quotes; injection hole on outside input | `& $exe @argsArray`, or splat named params |
| `Get-Users`/`Delete-Item` | unapproved verb/plural noun — fails `PSUseApprovedVerbs`/`PSUseSingularNouns` | `Get-User`/`Remove-Item` (check `Get-Verb`) |
| `Write-Host $result` as a "return value" | can't be captured/piped/asserted | emit `[pscustomobject]`; caller formats |
| trailing space after backtick continuation | silently breaks the statement | `param()` block + splatting instead |
| `ConvertTo-SecureString 'p@ss' -AsPlainText -Force` | secret recoverable from source/memory | `[pscredential]`, vault, or caller env var |
| `$results = @(); foreach (...) { $results += ... }` | O(n²) copy on every append | `$results = foreach (...) {...}`, or `List[T]`.Add() |
| `$x -eq $null` | element-wise on a collection, not identity | `$null -eq $x` |
| PS 7-only `&&`/`??`/`?:`/`?.` where 5.1 must run | parse error on Windows PowerShell 5.1 | confirm target runtime; use `if`/`-and` |
| `& "C:\Program Files\tool.exe" --flag value with space` | native call mis-splits the path/arg | quote each part; build args as an array |
| new file with no `Set-StrictMode` | undefined-variable/bad-property bugs return `$null` | `Set-StrictMode -Version Latest` at the top |

## 10. Review checklist
- [ ] Every function is `Verb-Noun` with an approved verb (`Get-Verb`), singular noun; `[CmdletBinding()]` + a typed, validated `param()` block
- [ ] Every native call checks `$LASTEXITCODE` right after; every cmdlet relied on in try/catch uses `-ErrorAction Stop` (or `$ErrorActionPreference='Stop'` is set deliberately)
- [ ] No `Invoke-Expression`/string-built native command from untrusted input; no plaintext secrets or `ConvertTo-SecureString -AsPlainText`
- [ ] No function returns via `Write-Host`; it emits an object the caller can capture, pipe, format, or assert on
- [ ] `Set-StrictMode -Version Latest` on new files; PS 7-only syntax (`&&`,`||`,`??`,`?.`,`-Parallel`) used only where the target runtime is confirmed 7+
- [ ] `Invoke-ScriptAnalyzer -Recurse` clean (or a documented, scoped suppression with a reason)
- [ ] Pester covers the happy path and at least one error path (`Should -Throw`); `Invoke-Pester -CI` passes
- [ ] Paths with spaces and native arguments are quoted/passed as arrays, not concatenated strings
- [ ] No array `+=` growth in a hot loop; splatting used once a call needs more than ~3 parameters
- [ ] Parallel work has an explicit concurrency cap and captures needed variables via `$using:`

## 11. References
- about_Preference_Variables — https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_preference_variables?view=powershell-7.6
- about_Try_Catch_Finally — https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_try_catch_finally?view=powershell-7.6
- about_Functions_Advanced_Parameters — https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_functions_advanced_parameters?view=powershell-7.6
- about_Splatting — https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_splatting?view=powershell-7.6
- Approved verbs — https://learn.microsoft.com/en-us/powershell/scripting/developer/cmdlet/approved-verbs-for-windows-powershell-commands
- about_Parsing (native args, backtick, `--%`) — https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_parsing?view=powershell-7.6
- Experimental features per version — https://learn.microsoft.com/en-us/powershell/scripting/learn/experimental-features?view=powershell-7.6
- PowerShell releases (7.6.6, 2026-09-08) — https://github.com/PowerShell/PowerShell/releases
- PSScriptAnalyzer (1.25.0, 2026-03) — https://github.com/PowerShell/PSScriptAnalyzer
- Pester docs (6.2.0, 2026-09; 5.x still widely used) — https://pester.dev/docs/quick-start
- `ForEach-Object -Parallel`/`-ThrottleLimit` — https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/foreach-object?view=powershell-7.6
- Principles: `.agents/guides/principles/error-handling.md` · `.agents/guides/principles/testing-strategy.md` · `.agents/guides/principles/security.md` · `.agents/guides/principles/simplicity.md`
