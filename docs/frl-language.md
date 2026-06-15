# FabricGuard Rule Language (FRL)
_Design document — v0.2 — 2026-06-10_

---

## Rule Structure

```
RULE <rule_id> {
    NAME:       "<human readable name>"
    VERSION:    "<semver>"
    SEVERITY:   ERROR | WARNING | INFO
    APPLIES_TO: <ObjectType> [WHERE <filter_expr>]

    [PARAMS {
        <param_name>: <type>
        ...
    }]

    CHECK <check_expr> [VIA NOTEBOOK]
    [CHECK <check_expr> [VIA NOTEBOOK]]    // multiple CHECKs = all must pass

    FINDING:     "<message template — use {property} for actual values>"
    REMEDIATION: "<what the user must do to fix this>"
}
```

---

## Object Types

APPLIES_TO accepts any Fabric item type string. The agent enumerates objects using `list_items(type=X)` — Fabric's API accepts any type string, so the language is automatically forward-compatible with new item types Microsoft introduces.

Well-known types (documented for completeness, not exhaustive):
```
Workspace
Lakehouse
Table
Notebook
SemanticModel
Warehouse
DataPipeline
Report
Ontology
```

Any type string Microsoft adds to the Fabric API is immediately valid in FRL without a language change.

---

## APPLIES_TO Filters (WHERE clause)

Narrows which objects the rule applies to within the declared type. Uses the same expression syntax as CHECK.

```
APPLIES_TO: Table WHERE SELF.LINEAGE.IS_SOURCE_FOR(MaterializedLakeView)
APPLIES_TO: Notebook WHERE SELF.displayName MATCHES "^ingest_.*"
APPLIES_TO: Workspace WHERE SELF.type = "Premium"
APPLIES_TO: Ontology WHERE SELF.domainId IS NOT EMPTY
```

---

## Object Properties

Every Fabric object has properties. FRL accesses those properties using `SELF.<path>`. The language does not define what properties an object has — the object itself does. The rule author writes the property they want to check; the agent resolves it.

**`SELF`** refers to the specific object instance being evaluated.

Properties are organized by namespace. The namespace determines the execution path.

### Top-level properties (MCP)

Any field returned by `get_item` or `get_workspace` for that object type. The set is open — if the API returns it, the rule can reference it.

Examples of well-known top-level properties:
```
SELF.displayName
SELF.description
SELF.type
SELF.state
SELF.lastUpdatedDate
SELF.createdDate
SELF.domainId
SELF.capacityId
```

New properties Microsoft adds to `get_item` responses are immediately accessible — no language update needed.

### PERMISSIONS namespace (MCP)

Special function that queries workspace role assignments. Workspace-scoped.

```
SELF.PERMISSIONS(ADMIN)
SELF.PERMISSIONS(MEMBER)
SELF.PERMISSIONS(CONTRIBUTOR)
SELF.PERMISSIONS(VIEWER)
```

Execution: `list_workspace_roles` → filter by role → agent reasons about the result.

**Principal-type qualifier and calculated suffix.** A role can be narrowed by principal type — append `.groups` (Entra security groups), `.users` (individual users), or `.serviceprincipals` (service principals) — and resolved to a value with a calculated suffix: `.count` (number of principals), `.list` (the set), or `.exists`. So `SELF.PERMISSIONS(ADMIN).groups.count` is the number of Admin-role principals that are security groups. Permission CHECKs use this dotted property form with a normal comparison operator; e.g. `CHECK SELF.PERMISSIONS(ADMIN).groups.count >= 2`.

### LINEAGE namespace (MCP + Agent Reasoning)

Lineage is derived — there is no dedicated lineage API. The agent reads item definitions and reasons about dependencies.

```
SELF.LINEAGE.IS_SOURCE_FOR(ObjectType)
SELF.LINEAGE.DEPENDS_ON(ObjectType)
SELF.LINEAGE.DEPENDENCY_COUNT
SELF.LINEAGE.HAS_CIRCULAR_REFS
```

Execution: `get_item_definition` on related objects + agent reasoning. Works for any ObjectType string, including types introduced after the language was designed.

### delta namespace (Notebook always)

Delta table properties require Spark to read. Any `SELF.delta.*` path triggers notebook execution.

```
SELF.delta.enableChangeDataFeed
SELF.delta.files.count
SELF.delta.files.averageSizeBytes
SELF.delta.log.count
SELF.delta.partitions.count
SELF.delta.partitionSkew
SELF.delta.sizeBytes
SELF.delta.version
SELF.delta.deletedFilesCount
SELF.delta.lastVacuumTimestamp
SELF.delta.lastOptimizeTimestamp
SELF.delta.lastWriteTimestamp
```

### schema namespace (Notebook always)

Schema and data inspection requires Spark. Any `SELF.schema.*` path triggers notebook execution.

```
SELF.schema.rowCount
SELF.schema.columnCount
SELF.schema.partitionColumns
SELF.schema.hasNullableKeys
SELF.schema.nullRate(columnName)
SELF.schema.duplicateKeyRate(columnName)
SELF.schema.columnExists(name)
SELF.schema.changeCount
SELF.schema.lastChanged
SELF.schema.hasColumnBeenDropped(name)
```

### access namespace (Notebook always)

Audit log access requires Spark runtime.

```
SELF.access.queryCount(days=N)
```

### spark namespace (Notebook always)

```
SELF.spark.sessionConf.*
```

### Unknown namespaces

If a property path uses a namespace not listed above (e.g., `SELF.settings.*`, `SELF.catalog.*`), the agent attempts MCP resolution first: calls `get_item` or `get_workspace` and looks for the field in the response. If the field is not present in the MCP response and cannot be inferred, the check is marked INCONCLUSIVE.

If the rule author knows a property requires notebook execution but the namespace does not signal it, they use the `VIA NOTEBOOK` qualifier on the CHECK line:

```
CHECK SELF.settings.metadataSyncEnabled = true VIA NOTEBOOK
```

---

## CHECK Expressions

### String
```
CHECK SELF.displayName MATCHES "<regex>"
CHECK SELF.displayName STARTS_WITH "<prefix>"
CHECK SELF.displayName ENDS_WITH "<suffix>"
CHECK SELF.description IS NOT EMPTY
CHECK SELF.description LENGTH >= 20
```

### Date
```
CHECK SELF.lastUpdatedDate WITHIN 90 DAYS
CHECK SELF.createdDate OLDER_THAN 365 DAYS
CHECK SELF.delta.lastVacuumTimestamp WITHIN 7 DAYS
```

### Permission
Dotted property form: `SELF.PERMISSIONS(role)[.<principal-type>].<count|list|exists> <operator> <value>`.
```
CHECK SELF.PERMISSIONS(ADMIN).groups.count >= 2
CHECK SELF.PERMISSIONS(ADMIN).serviceprincipals.count = 0
CHECK SELF.PERMISSIONS(MEMBER).count <= 10
CHECK SELF.PERMISSIONS(VIEWER).count = 0
CHECK SELF.PERMISSIONS(ADMIN).list CONTAINS_ALL $admin_groups
```

### Lineage
```
CHECK SELF.LINEAGE.IS_SOURCE_FOR(MaterializedLakeView)
CHECK SELF.LINEAGE.DEPENDENCY_COUNT <= 5
CHECK SELF.LINEAGE.HAS_NO_CIRCULAR_REFS
```

### Equality / comparison
```
CHECK SELF.delta.enableChangeDataFeed = true
CHECK SELF.schema.rowCount > 0
CHECK SELF.schema.hasNullableKeys = false
CHECK SELF.active = true
CHECK SELF.type = "Premium"
```

### Derived expressions
Properties can be combined with arithmetic before comparison. The agent retrieves all operands and computes the result.

**Operators:** `+` `-` `*` `/` — **Grouping:** `( )`  
**Size units:** `KB` `MB` `GB` `TB`  
**Time units:** `DAYS` `HOURS` `MINUTES`  
**Ratio:** plain decimal (`0.2` = 20%)

```
CHECK SELF.delta.files.averageSizeBytes >= 128MB
CHECK SELF.delta.deletedFilesCount / SELF.delta.files.count <= 0.2
CHECK (SELF.delta.sizeBytes / SELF.schema.rowCount) <= 10KB
CHECK SELF.delta.partitions.count * SELF.delta.files.averageSizeBytes <= 1GB
```

### VIA qualifier
Overrides the execution path for a single CHECK. Use only when the property namespace does not signal the correct path.

```
CHECK SELF.settings.metadataSyncEnabled = true VIA NOTEBOOK
CHECK SELF.catalog.isPublished = true VIA MCP
```

### Compound
Multiple CHECK lines are combined with AND — all must pass. OR is not supported in v0.1.

---

## Parameter Types

```
String
Int
Bool
List<String>
List<EntraGroup>
List<ObjectType>
```

Parameters are declared in PARAMS and referenced as `$param_name` in CHECK expressions.

---

## Execution Path

**The governing principle:** the property namespace determines execution path. The rule author writes what to check; the interpreter (agent) knows how.

| Property form | Execution |
|---|---|
| `SELF.<top-level-property>` | MCP — `get_item` / `get_workspace` |
| `SELF.PERMISSIONS(role)` | MCP — `list_workspace_roles` |
| `SELF.LINEAGE.*` | MCP — `get_item_definition` + agent reasoning |
| `SELF.delta.*` | Notebook (Spark required) |
| `SELF.schema.*` | Notebook (Spark required) |
| `SELF.access.*` | Notebook (audit log) |
| `SELF.spark.*` | Notebook |
| `SELF.<unknown-namespace>.*` | MCP first; INCONCLUSIVE if not found |
| `CHECK ... VIA NOTEBOOK` | Notebook (explicit override) |
| `CHECK ... VIA MCP` | MCP (explicit override) |

---

## Examples

### Example 1 — Workspace admin groups (with parameters)

```
RULE ws-admin-groups-001 {
    NAME:       "Workspace must have designated Entra admin groups"
    VERSION:    "1.0.0"
    SEVERITY:   ERROR
    APPLIES_TO: Workspace

    PARAMS {
        admin_groups: List<EntraGroup>
    }

    CHECK SELF.PERMISSIONS(ADMIN) CONTAINS_ALL $admin_groups

    FINDING:     "Workspace {displayName} is missing required admin groups: {missing_groups}"
    REMEDIATION: "Add the missing groups as Workspace Administrators in Fabric settings"
}
```

### Example 2 — Delta CDF on source tables

```
RULE tbl-delta-cdf-001 {
    NAME:       "Source tables for materialized lake views must have CDF enabled"
    VERSION:    "1.0.0"
    SEVERITY:   ERROR
    APPLIES_TO: Table WHERE SELF.LINEAGE.IS_SOURCE_FOR(MaterializedLakeView)

    CHECK SELF.delta.enableChangeDataFeed = true

    FINDING:     "Table {displayName} feeds a materialized lake view but Change Data Feed is disabled"
    REMEDIATION: "ALTER TABLE {displayName} SET TBLPROPERTIES ('delta.enableChangeDataFeed' = 'true')"
}
```

### Example 3 — New feature property (forward-compatible)

```
RULE ws-metadata-sync-001 {
    NAME:       "Workspaces must have metadata sync enabled"
    VERSION:    "1.0.0"
    SEVERITY:   WARNING
    APPLIES_TO: Workspace

    CHECK SELF.metadataSyncEnabled = true

    FINDING:     "Workspace {displayName} does not have metadata sync enabled"
    REMEDIATION: "Enable metadata sync in Workspace settings"
}
```

### Example 4 — New object type (forward-compatible)

```
RULE ont-domain-001 {
    NAME:       "Each domain must have exactly one Ontology"
    VERSION:    "1.0.0"
    SEVERITY:   ERROR
    APPLIES_TO: Ontology

    PARAMS {
        domain_id: String
    }

    CHECK SELF.domainId = $domain_id

    FINDING:     "Domain {domain_id} has no registered Ontology"
    REMEDIATION: "Create and publish an Ontology for this domain in Fabric"
}
```

---

## Elastic Storage Format

Rules are stored as JSON documents. The FRL source is stored verbatim in a `source` field alongside parsed metadata for indexing and filtering.

```json
{
    "rule_id": "ws-admin-groups-001",
    "name": "Workspace must have designated Entra admin groups",
    "version": "1.0.0",
    "severity": "error",
    "applies_to": "Workspace",
    "applies_to_filter": null,
    "params": [
        { "name": "admin_groups", "type": "List<EntraGroup>" }
    ],
    "active": true,
    "source": "RULE ws-admin-groups-001 { ... }",
    "created_at": "2026-06-09T...",
    "updated_at": "2026-06-09T..."
}
```

The `source` field is what the agent receives and interprets at execution time.

---

## What is NOT in v0.1

- OR conditions
- Rule composition (one rule referencing another)
- Cross-workspace checks
- Scheduled/time-triggered rules
- Auto-remediation actions