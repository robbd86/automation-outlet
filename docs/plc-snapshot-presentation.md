# Free Machine Controls Snapshot

The free result identifies controls, summarises supported observations, explains
potential maintenance implications and suggests verification. It does not provide
an engineer investigation. The stored SnapshotResult v2 and parser evidence remain
unchanged. `lib/plc-snapshot-view.mjs` derives a separate manager view and an
allowlisted customer projection. `plc-audit.js` renders that view; no generated AI
conclusions or numeric risk score are used.

## Deterministic assessment rules

| Assessment | Rule and scope |
| --- | --- |
| Overall NOT ASSESSED | No supported block inventory or supported configured CPU evidence; mock results also stay unassessed. A file/platform label alone is insufficient. |
| Overall HIGH PRIORITY | Current verified exact-part manufacturer status is DISCONTINUED. This prioritises sourcing/recovery planning, not machine failure likelihood. |
| Overall ATTENTION | Current verified exact-part PHASE_OUT status. Shared writers alone never raise overall status above REVIEW. |
| Overall REVIEW | Supported shared-write detection, or useful supported source evidence with incomplete analysis/recovery verification. Active hardware with a family notice stays REVIEW unless an independent rule triggers a higher status. |
| Logic REVIEW for shared writers | Shared writers may be intentional. Intent, execution order, actual maintainability impact and specific control consequences have not been investigated. |
| Logic REVIEW | Supported evidence exists but source analysis is incomplete. |
| Logic LOW CONCERN | Zero detected shared writes only when COMPLETE, 100% supported supplied-source coverage, VERIFIED overall evidence, explicit writer-analysis support, and no additional program limitations. This applies only to shared-write observations in that scope, not code quality. |
| Recovery REVIEW | Useful supported project evidence exists; live match, backup currency, completeness and replacement strategy remain unverified. Otherwise NOT ASSESSED. |
| Safety NOT ASSESSED | No live safety engineering assessment exists in this schema. Configured safety type or positive safety-block count can trigger a review area, never a safety conclusion. |
| Documentation REVIEW | Source information is available but wider recovery documents and backup evidence have not been established. Otherwise NOT ASSESSED. |
| Program & Controls Footprint | Scale/structure metrics only. No visible complexity classification or scoring model is applied. |

Writer confidence is the most conservative confidence among supplied writer
findings: all VERIFIED -> VERIFIED; all VERIFIED/INFERRED -> INFERRED; any UNKNOWN
or missing supporting writer findings -> UNKNOWN. A zero count is not treated as
proof of absence outside the explicitly complete writer-analysis scope.

Lifecycle verification continues to use `lib/plc-lifecycle.mjs`: exact configured
part matching, dated manufacturer sources, bounded review expiry and separate
family notices. Family dates do not automatically change exact-part status.

## Recovery evidence states

- CONFIRMED means supplied evidence exists for that particular check. It never
  means installed hardware or current backup state has been verified.
- Populated identity with VERIFIED configured-CPU evidence can be CONFIRMED;
  INFERRED or missing field-confidence metadata is PARTIAL. Missing identity fields
  are NOT VERIFIED and UNKNOWN confidence.
- Some controller/I/O, network/device or safety-related evidence is PARTIAL.
  These fields do not establish a complete hardware/network/safety project.
- HMI and drive backup presence is NOT ASSESSED by the current parser. No backup
  absence is inferred from missing fields or unsupported asset parsing.
- Optional future `backupEvidence.hmiBackup` / `driveParameterBackup` records
  require explicit `assessed: true`, `scope: ANALYSED_EVIDENCE`, VERIFIED confidence
  and non-empty evidence. PRESENT can be CONFIRMED. ABSENT can be NOT SUPPLIED
  only with `scopeComplete: true`; otherwise NOT ASSESSED. These records retain
  evidence in storage but only generic derived status/detail is sent to customers.
  Confirmation of presence does not establish currency or recoverability.
- Live PLC comparison is NOT VERIFIED. Replacement strategy is NOT ASSESSED.
- NOT APPLICABLE is never inferred from missing data.

## Commercial boundary

Customer GET/list/mock-analysis responses contain only the free projection. Raw
per-target titles, full address lists, block/network writer traces, diagnostics
containing target details and raw engineering recommendations are not delivered
through that response. CPU order number, configured identity, record/file hashes,
counts, confidence, lifecycle sources and general supported/unsupported scope
remain available. The full original worker result stays in the existing store.

The Snapshot profile cannot download a detailed private report, even if an
artifact already exists. Ownership is checked first. This change does not build a
payment or entitlement system; engineer investigations remain a separate service.
All customer result projections remain summarised regardless of a stored profile
label. An expanded technical evidence section is not an unlock mechanism.

Engineer Review / Small PLC Audit reserves specific target lists, writer
hierarchies, logic tracing, output/permissive/sequence investigation, prioritised
engineer findings and written conclusions. Full Engineering Audit reserves deeper
hardware/I/O/network analysis, recovery strategy, compatibility engineering and
modernisation planning. Deeper-review areas and the Modernisation CTA are triggered
by supplied evidence, not shown as findings without a trigger.

## Current parser limitations

The existing worker can provide configured CPU identity for supported typed native
records, program counts, source write observations, scope and evidence confidence.
It does not currently establish full configured I/O/hardware topology, complete
network configuration, native data-block count in all formats, safety-block count,
HMI backup inventory, drive backup inventory, live project match, backup currency,
replacement compatibility or machine condition. Engineering-software field
confidence is not separately supplied in SnapshotResult v2, so the recovery check
remains PARTIAL rather than being promoted to VERIFIED.

## Verification

Tests cover assessment precedence, unknown/inferred evidence, missing firmware,
zero coverage, complete-source zero-writer scope, expired lifecycle context,
mock results, evidence-triggered review areas, response allowlists, retained full
storage, customer ownership, blocked Snapshot report downloads, escaped rendering
and manager-first content. The real ETP local worker round trip verifies the API
shows the aggregate 48-target finding while retaining the original writer evidence
privately. Browser checks verify the existing protected test-preview result, source
links, collapsible evidence, CTAs and responsive layout.
