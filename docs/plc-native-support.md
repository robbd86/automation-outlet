# PLC Snapshot native support

Engine 0.4.6 adds Omron CXP/CXT source observations, Sysmac SMC2 controller/program
inventory and matching GX Works2 FX1N/FX1NC, FX2N/FX2NC and Q01 header identity.
The existing Siemens ETP and Mitsubishi Baler evidence is preserved.

Native format acceptance is not a promise of complete analysis. GX Works3,
encoded CXP containers, Sysmac logic, broader GXW instruction sets and complete
TIA V14–21 validation remain unfinished. The upload page states these limits.
TIA 21/15.1 and Omron archive suffixes can enter the secure upload flow; the worker
must still establish supported evidence from their contents.

Omron results show PARTIAL for supported CX instruction observations or LIMITED
for inventory only. There is no claimed whole-project percentage denominator.
Calls and other unperformed checks remain null; unsupported possible writers
cannot establish zero shared targets. Omron program units are not Siemens OBs.

Free projection excludes detailed addresses, source traces and arbitrary parser
fields. Controller and count evidence survives REVIEW_REQUIRED retention; owner,
worker-claim and private storage checks are unchanged. Exact physical hardware,
running firmware, safety and manufacturer lifecycle are never inferred from an
offline programming target or project age.

Validation: all 61 readable local corpus results passed raw/free schemas and
rendering checks. Five actual local projects passed the full handler/worker/store
flow over loopback. No additional private customer files were uploaded externally.
