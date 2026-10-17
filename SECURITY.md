# Security Policy

## Reporting a vulnerability

Please report suspected vulnerabilities privately, not in a public issue. Open a
[GitHub security advisory](https://docs.github.com/en/code-security/security-advisories) on the
repository, or contact the maintainers directly. We will acknowledge a report as soon as possible
and keep you updated.

## Handling secrets

- Secrets are supplied through environment variables or AWS Secrets Manager only.
- `.env` is gitignored; `.env.example` lists every variable with a safe placeholder.
- CI runs gitleaks over the full history and `npm audit` on every push.

## Design principles

See [docs/security.md](docs/security.md) for the threat model: authentication modes, origin
validation, rate limiting, input validation, prompt-injection defense, and PII redaction in logs.
