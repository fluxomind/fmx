# auth — CLI 0.4.0-alpha.5

Generated from `fmx catalog auth --full`. [Global options and other groups](../commands.md). Use the executable selected in SKILL.md. Read only the relevant command section.

## auth

Authenticate with Fluxomind Platform

```sh
fmx auth
```

## auth login

Login via browser OAuth flow (default) or device code flow

```sh
fmx auth login [options]
```

- `--tenant <uuid>`: Tenant UUID (required for --device)
- `--device`: Use device code flow (for environments without a browser)
- `--api-url <url>`: Override platform API base URL (precedence over env + config file)

## auth logout

Logout and remove stored credentials

```sh
fmx auth logout [options]
```

- `--tenant <name>`: Specific tenant to logout from
- `--all`: Logout from all tenants

## auth migrate

Migrate legacy ~/.fmx/auth.json into unified ~/.fmx/config.json (EVO-394 CA-17)

```sh
fmx auth migrate [options]
```

- `--keep-legacy`: Do not delete legacy auth.json after successful migration

## auth status

Show current authentication status

```sh
fmx auth status
```

