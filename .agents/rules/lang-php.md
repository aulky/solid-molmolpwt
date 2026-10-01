---
trigger: glob
globs: "**/*.php"
description: "PHP quick card: toolchain, invariants, idioms, pitfalls (PHP 8.3-8.5). Loaded when editing .php files."
---
# PHP — quick card
Deep guide: `.agents/guides/languages/php.md` — read it before non-trivial PHP work (new module, concurrency, public API, perf).
Laravel repo (`laravel/framework` in composer.json)? Also read `.agents/rules/fw-laravel.md`. Principles: `.agents/guides/principles/security.md`, `.agents/guides/principles/error-handling.md`, `.agents/guides/principles/testing-strategy.md`.

## Toolchain (use the project's own config first)
- Target version = `require.php` in `composer.json`. Run tools on a PHP at least that new (an older CLI cannot parse newer syntax).
- Format: `vendor/bin/pint --test` (fix: `vendor/bin/pint`); if `.php-cs-fixer.dist.php` exists: `vendor/bin/php-cs-fixer check` · Lint: `php -l <file>` · Types: `vendor/bin/phpstan analyse` · Test: `vendor/bin/pest` if installed, else `vendor/bin/phpunit` (Laravel: `php artisan test`) · All: `node .agents/scripts/verify.mjs --only php`
- Deps: `composer require [--dev] <vendor/pkg>`; after adding a namespace or moving classes: `composer dump-autoload`.

## Invariants (MUST / NEVER — with reason → alternative)
1. New PHP files start with `<?php` then `declare(strict_types=1);` — without it `'42'` silently becomes `42` and `true` becomes `1`. Do not add it to an existing file as a drive-by (calls in that file may start throwing `TypeError`); never in templates (`*.blade.php`).
2. NEVER put input into SQL strings — injection. Instead PDO `prepare()` + bound params (or the framework's bindings); column/sort names come from a `match` allow-list.
3. NEVER echo untrusted data raw — XSS. Instead `htmlspecialchars($v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')` or the template's auto-escaping (Blade `{{ }}`, Twig).
4. Passwords: `password_hash($p, PASSWORD_DEFAULT)` + `password_verify()`; NEVER md5/sha1/`hash()`. Tokens: `random_bytes()`; compare secrets with `hash_equals()`. State-changing forms need a CSRF token.
5. NEVER `unserialize()`, `eval()`, `extract()` or `include` on untrusted input — code execution. Instead `json_decode($s, true, 512, JSON_THROW_ON_ERROR)` + validation.
6. Type every param, return and property; nullable is explicit `?T` (implicit `T $x = null` is deprecated since 8.4). Describe arrays in PHPDoc: `list<User>`, `array<string, int>`, `array{id: int, name: string}`.
7. NEVER swallow exceptions (`catch (Exception $e) {}`) or use `@` — failures vanish. Catch the narrowest type you can handle; rethrow a domain exception with `previous: $e`.
8. NEVER lower the PHPStan level, grow the baseline or add `@phpstan-ignore` to go green — fix the type. Never edit `vendor/` or `composer.lock` by hand.

## Idioms & pitfalls Flash models get wrong
- Check the version first: 8.1 enums, `readonly` props, `strlen(...)`; 8.2 `readonly class`; 8.3 typed class constants, `#[\Override]`, `json_validate()`; 8.4 property hooks, `public private(set)`, `new Foo()->bar()`, `array_find()`; 8.5 `|>`, `clone($obj, ['prop' => $v])`, `array_first()`, `#[\NoDiscard]`.
- Use `===` and `in_array($x, $list, true)`: loose `'1e1' == '10'` is true. `match` is strict and throws `UnhandledMatchError`; for enums list every case instead of `default` so a new case fails PHPStan.
- `Enum::from()` throws `ValueError`, `tryFrom()` returns null. Compare cases with `===`, not `->value`.
- `readonly` props cannot have defaults (≤ 8.5) or be reassigned, even inside the class: return a new instance. Hooked properties cannot be `readonly`.
- `array_filter()` keeps keys → wrap in `array_values()` before returning a `list` (else `json_encode` emits an object).
- `isset($a['k'])` is false for null values → `array_key_exists()`. `empty('0')` is true → compare explicitly.
- `strpos(...) == false` bug → `str_contains()` / `str_starts_with()`.
- Native prepares (`ATTR_EMULATE_PREPARES => false`) reject a repeated named placeholder → use distinct names.
- PSR-4: namespace mirrors the path, one class per file, file name == class name with exact case (Windows forgives, Linux does not).
- Default to `final` classes, constructor injection, `DateTimeImmutable`. No static mutable state (leaks across long-running workers and tests).

## Example — bad → good
```php
function find($pdo, $email) {
    $row = $pdo->query("SELECT * FROM users WHERE email = '$email'")->fetch();
    return $row ?: null;
}
```
```php
function findUserByEmail(PDO $pdo, string $email): ?User
{
    $stmt = $pdo->prepare('SELECT email, name FROM users WHERE email = :email');
    $stmt->execute(['email' => $email]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    return $row === false ? null : new User($row['email'], $row['name']);
}
```

## Before finishing
- [ ] `strict_types` in new files · [ ] Pint/php-cs-fixer clean · [ ] PHPStan clean, no new ignores/baseline · [ ] Pest/PHPUnit tests for new behaviour pass · [ ] no SQL concatenation, raw echo, `==`, `unserialize` or empty `catch`
