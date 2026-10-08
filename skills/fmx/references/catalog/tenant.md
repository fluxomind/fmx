# tenant — CLI 0.6.0

Generated from `fmx catalog tenant --full`. [Global options and other groups](../commands.md). Use the executable selected in SKILL.md. Read only the relevant command section.

## tenant

Read authenticated tenant identity and quota

```sh
fmx tenant
```

## tenant identity

Verify remote identity; never prints tokens or cookies

```sh
fmx tenant identity [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)

## tenant quota

Read tenant quota usage; does not change limits

```sh
fmx tenant quota [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)

