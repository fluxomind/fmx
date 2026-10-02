# metadata — CLI 0.4.0

Generated from `fmx catalog metadata --full`. [Global options and other groups](../commands.md). Use the executable selected in SKILL.md. Read only the relevant command section.

## metadata

Read tenant object and field metadata

```sh
fmx metadata
```

## metadata list

List objects (default fields: id,apiName,label)

```sh
fmx metadata list [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--limit <count>`: Page size (1..199) Default: `100`.
- `--offset <count>`: Rows to skip Default: `0`.
- `--fields <csv>`: Explicit output fields
- `--full`: Include complete text and all fields
- `--prefix <prefix>`: Filter object API names by prefix

## metadata view

View object fields (default fields: apiName,type,isRequired)

```sh
fmx metadata view <object> [options]
```

- `--tenant <uuid>`: Tenant (default: configured tenant)
- `--limit <count>`: Page size (1..1000) Default: `100`.
- `--offset <count>`: Rows to skip Default: `0`.
- `--fields <csv>`: Explicit output fields
- `--full`: Include complete text and all fields

